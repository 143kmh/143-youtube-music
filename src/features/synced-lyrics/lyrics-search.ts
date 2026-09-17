import { ProviderNames, type ProviderState } from './providers';
import type { LyricProvider, LyricResult, SearchSongInfo } from './types';

export const hasLyrics = (data: LyricResult | null | undefined) => Boolean(
  data?.lyrics?.trim() || data?.lines?.some(line => line.text.trim()),
);

export const findLyrics = async (
  info: SearchSongInfo,
  sources: Record<ProviderNames.LRCLib | ProviderNames.YTMusic, LyricProvider>,
): Promise<{ provider: ProviderNames; result: ProviderState }> => {
  let plain: { provider: ProviderNames; data: LyricResult } | null = null;
  let error: Error | null = null;
  let completed = false;
  for (const provider of [ProviderNames.LRCLib, ProviderNames.YTMusic] as const) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const data = await Promise.race([
        sources[provider].search(info),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${provider} lyrics timed out`)), provider === ProviderNames.LRCLib ? 23000 : 8000);
        }),
      ]);
      completed = true;
      if (!hasLyrics(data) || !data) continue;
      if (data.lines?.some(line => line.text.trim()))
        return { provider, result: { state: 'done', data, error: null } };
      plain ??= { provider, data };
    } catch (reason) {
      error = reason instanceof Error ? reason : new Error(String(reason));
    } finally { clearTimeout(timer); }
  }
  if (plain) return { provider: plain.provider, result: { state: 'done', data: plain.data, error: null } };
  return { provider: ProviderNames.LRCLib, result: { state: completed ? 'done' : 'error', data: null, error } };
};
