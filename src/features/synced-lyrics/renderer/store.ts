import { createMemo, runWithOwner } from 'solid-js';
import { createStore } from 'solid-js/store';

import { getSongInfo } from '@/providers/song-info-front';

import { reactiveOwner } from './reactive-root';

import {
  type ProviderName,
  ProviderNames,
  providerNames,
  type ProviderState,
} from '../providers';
import { providers } from '../providers/renderer';

import type { SongInfo } from '@/providers/song-info';

type LyricsStore = {
  provider: ProviderName;
  current: ProviderState;
  lyrics: Record<ProviderName, ProviderState>;
};

const initialData = () =>
  providerNames.reduce(
    (acc, name) => {
      acc[name] = { state: 'fetching', data: null, error: null };
      return acc;
    },
    {} as LyricsStore['lyrics'],
  );

export const [lyricsStore, setLyricsStore] = createStore<LyricsStore>({
  provider: ProviderNames.LRCLib,
  lyrics: initialData(),
  get current(): ProviderState {
    return this.lyrics[this.provider];
  },
});

export const currentLyrics = runWithOwner(reactiveOwner, () =>
  createMemo(() => lyricsStore.lyrics[ProviderNames.LRCLib]),
)!;

type VideoId = string;
type SearchCacheData = Record<ProviderName, ProviderState>;
interface SearchCache {
  state: 'loading' | 'done';
  data: SearchCacheData;
}

const searchCache = new Map<VideoId, SearchCache>();

const publishCache = (cache: SearchCache) => {
  setLyricsStore('provider', ProviderNames.LRCLib);
  setLyricsStore('lyrics', () =>
    JSON.parse(JSON.stringify(cache.data)) as typeof cache.data,
  );
};

export const fetchLyrics = (info: SongInfo) => {
  const existing = searchCache.get(info.videoId);
  if (existing) {
    if (getSongInfo().videoId === info.videoId) publishCache(existing);
    return;
  }

  const cache: SearchCache = {
    state: 'loading',
    data: initialData(),
  };
  searchCache.set(info.videoId, cache);
  if (searchCache.size > 96) {
    const oldest = searchCache.keys().next().value;
    if (oldest !== undefined) searchCache.delete(oldest);
  }

  if (getSongInfo().videoId === info.videoId) publishCache(cache);

  const providerName = ProviderNames.LRCLib;
  const provider = providers[providerName];
  const pCache = cache.data[providerName];

  void provider
    .search(info)
    .then((res) => {
      pCache.state = 'done';
      pCache.data = res;
      pCache.error = null;
      cache.state = 'done';

      if (getSongInfo().videoId === info.videoId) {
        setLyricsStore('provider', ProviderNames.LRCLib);
        setLyricsStore('lyrics', (old) => ({
          ...old,
          [providerName]: {
            state: 'done',
            data: res ? { ...res } : null,
            error: null,
          },
        }));
      }
    })
    .catch((error: Error) => {
      pCache.state = 'error';
      pCache.error = error;
      pCache.data = null;
      cache.state = 'done';
      console.error(error);

      if (getSongInfo().videoId === info.videoId) {
        setLyricsStore('provider', ProviderNames.LRCLib);
        setLyricsStore('lyrics', (old) => ({
          ...old,
          [providerName]: { state: 'error', error, data: null },
        }));
      }
    });
};

export const retrySearch = (_provider: ProviderName, info: SongInfo) => {
  const providerName = ProviderNames.LRCLib;
  setLyricsStore('provider', providerName);
  setLyricsStore('lyrics', (old) => ({
    ...old,
    [providerName]: { state: 'fetching', data: null, error: null },
  }));

  providers[providerName]
    .search(info)
    .then((res) => {
      setLyricsStore('lyrics', (old) => ({
        ...old,
        [providerName]: { state: 'done', data: res, error: null },
      }));
    })
    .catch((error: unknown) => {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      setLyricsStore('lyrics', (old) => ({
        ...old,
        [providerName]: {
          state: 'error',
          data: null,
          error: normalizedError,
        },
      }));
    });
};
