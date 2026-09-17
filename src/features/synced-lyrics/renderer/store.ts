import { createStore } from 'solid-js/store';
import { getSongInfo } from '@/providers/song-info-front';
import { type ProviderName, ProviderNames, providerNames, type ProviderState } from '../providers';
import { providers } from '../providers/renderer';
import { findLyrics, hasLyrics } from '../lyrics-search';
import type { SongInfo } from '@/providers/song-info';

type LyricsStore = {
  videoId: string;
  provider: ProviderName;
  current: ProviderState;
  lyrics: Record<ProviderName, ProviderState>;
};
const initialData = () => Object.fromEntries(providerNames.map(name =>
  [name, { state: 'fetching', data: null, error: null }])) as LyricsStore['lyrics'];
export const [lyricsStore, setLyricsStore] = createStore<LyricsStore>({
  videoId: '',
  provider: ProviderNames.LRCLib,
  lyrics: initialData(),
  get current(): ProviderState { return this.lyrics[this.provider]; },
});
export const currentLyrics = () => lyricsStore.lyrics[lyricsStore.provider];
export const lyricsAvailableFor = (videoId: string) => Boolean(videoId && lyricsStore.videoId === videoId &&
  currentLyrics().state === 'done' && hasLyrics(currentLyrics().data));
const listeners = new Set<() => void>();
export const subscribeLyrics = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

type SearchCache = {
  provider: ProviderName;
  result: ProviderState;
  expires: number;
};
const searchCache = new Map<string, SearchCache>();
const publish = (videoId: string, cache: SearchCache) => {
  if (getSongInfo().videoId !== videoId || searchCache.get(videoId) !== cache) return;
  setLyricsStore({ videoId, provider: cache.provider, lyrics: {
    ...initialData(), [cache.provider]: cache.result,
  } });
  for (const listener of listeners) listener();
};
export const fetchLyrics = (info: SongInfo) => {
  if (!info.videoId) return;
  const existing = searchCache.get(info.videoId);
  if (existing && existing.expires > Date.now()) {
    publish(info.videoId, existing);
    return;
  }
  const cache: SearchCache = {
    provider: ProviderNames.LRCLib,
    result: { state: 'fetching', data: null, error: null },
    expires: Infinity,
  };
  searchCache.set(info.videoId, cache);
  if (searchCache.size > 96) searchCache.delete(searchCache.keys().next().value!);
  publish(info.videoId, cache);
  void findLyrics(info, providers).then(({ provider, result }) => {
    cache.provider = provider;
    cache.result = result;
    cache.expires = Date.now() + (hasLyrics(result.data) ? 30 * 60_000 : 30_000);
    publish(info.videoId, cache);
  });
};
export const retrySearch = (_provider: ProviderName, info: SongInfo) => {
  searchCache.delete(info.videoId);
  fetchLyrics(info);
};
