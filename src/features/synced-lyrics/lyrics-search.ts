import { ProviderNames, type ProviderState } from './providers';
import type { LyricProvider, LyricResult, SearchSongInfo } from './types';

export const hasLyrics = (data: LyricResult | null | undefined) =>
  Boolean(data?.lyrics?.trim() || data?.lines?.some((line) => line.text.trim()));

const hasSyncedLines = (data: LyricResult | null | undefined) =>
  Boolean(data?.lines?.some((line) => line.text.trim()));

export const hasWordTiming = (data: LyricResult | null | undefined) =>
  Boolean(
    data?.lines?.some((line) =>
      line.words?.some(
        ({ word, timeInMs }) =>
          word.trim().length > 0 && Number.isFinite(timeInMs),
      ),
    ),
  );

const delay = (milliseconds: number) =>
  new Promise<null>((resolve) => setTimeout(() => resolve(null), milliseconds));

const withTimeout = async <T>(
  promise: Promise<T>,
  provider: ProviderNames,
  timeoutMs: number,
) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${provider} lyrics timed out`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

type WordResult = {
  provider: ProviderNames.MusixMatch | ProviderNames.NetEase;
  data: LyricResult;
};

const done = (provider: ProviderNames, data: LyricResult) => ({
  provider,
  result: { state: 'done' as const, data, error: null },
});

export const findLyrics = async (
  info: SearchSongInfo,
  sources: Record<
    | ProviderNames.MusixMatch
    | ProviderNames.NetEase
    | ProviderNames.LRCLib
    | ProviderNames.YTMusic,
    LyricProvider
  >,
): Promise<{ provider: ProviderNames; result: ProviderState }> => {
  let error: Error | null = null;
  let completed = false;

  const search = async (provider: ProviderNames, timeoutMs: number) => {
    try {
      const data = await withTimeout(sources[provider].search(info), provider, timeoutMs);
      completed = true;
      return data;
    } catch (reason) {
      error = reason instanceof Error ? reason : new Error(String(reason));
      return null;
    }
  };

  // Start both optional karaoke sources and the normal line-level fallback in
  // parallel. A ready LRCLib result only waits for a short karaoke grace period,
  // so word timing can upgrade the result without adding a fixed multi-second
  // delay to every Lyrics tab open.
  const musixMatch = search(ProviderNames.MusixMatch, 6000);
  const netEase = search(ProviderNames.NetEase, 6000);
  const lrcLib = search(ProviderNames.LRCLib, 23000);

  const requireWordTiming = async (
    provider: ProviderNames.MusixMatch | ProviderNames.NetEase,
    promise: Promise<LyricResult | null>,
  ): Promise<WordResult> => {
    const data = await promise;
    if (!data || !hasLyrics(data) || !hasWordTiming(data))
      throw new Error(`${provider} has no word-timed lyrics`);
    return { provider, data };
  };

  const wordResult = Promise.any([
    requireWordTiming(ProviderNames.MusixMatch, musixMatch),
    requireWordTiming(ProviderNames.NetEase, netEase),
  ]).catch(() => null);

  const first = await Promise.race([
    wordResult.then((value) => ({ kind: 'word' as const, value })),
    lrcLib.then((value) => ({ kind: 'lrc' as const, value })),
  ]);

  let lrcData: LyricResult | null = null;
  if (first.kind === 'word') {
    if (first.value) return done(first.value.provider, first.value.data);
    lrcData = await lrcLib;
  } else {
    lrcData = first.value;

    if (hasSyncedLines(lrcData) && lrcData) {
      const upgrade = await Promise.race([wordResult, delay(900)]);
      if (upgrade) return done(upgrade.provider, upgrade.data);
      return done(ProviderNames.LRCLib, lrcData);
    }
  }

  // Plain LRCLib is useful as a last fallback, but do not let it hide synced
  // YouTube Music lyrics like the original search order correctly avoided.
  const plainLrc = hasLyrics(lrcData) && lrcData ? lrcData : null;

  // If LRCLib had no synced result, give real word timing a little more room
  // before falling through to YouTube Music. This still keeps the slow optional
  // providers off the critical path.
  const lateWord = await Promise.race([wordResult, delay(1600)]);
  if (lateWord) return done(lateWord.provider, lateWord.data);

  const youtubeData = await search(ProviderNames.YTMusic, 8000);
  if (hasSyncedLines(youtubeData) && youtubeData)
    return done(ProviderNames.YTMusic, youtubeData);

  if (plainLrc) return done(ProviderNames.LRCLib, plainLrc);
  if (hasLyrics(youtubeData) && youtubeData)
    return done(ProviderNames.YTMusic, youtubeData);

  return {
    provider: ProviderNames.LRCLib,
    result: { state: completed ? 'done' : 'error', data: null, error },
  };
};
