import { expect, test } from '@playwright/test';
import { Window } from 'happy-dom';

import {
  createYouTubeMusicAdapter,
  type SearchCatalog,
} from '../src/features/143-ui/youtube-music';
import { installCatalogPolish } from '../src/features/143-ui/catalog-polish';
import { installBrowseCatalog } from '../src/features/143-ui/youtube-music-catalog';
import { installPlaylistCatalog } from '../src/features/143-ui/youtube-music-playlist';
import { installCatalogCache } from '../src/features/143-ui/catalog-cache';
import { createCatalogRequestCache } from '../src/features/143-ui/catalog-request-cache';
import { mountSearchPage } from '../src/features/143-ui/search-page';
import { resolveSearchFocus } from '../src/features/143-ui/search-intent';

let dom: Window;
let calls: { path: string; data: any }[];
let respond: (path: string, data: any) => Promise<unknown>;
let cleanups: (() => void)[];
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const artistResult = {
  musicCardShelfRenderer: {
    title: {
      runs: [
        {
          text: 'Artist',
          navigationEndpoint: {
            browseEndpoint: {
              browseId: 'UCartist',
              browseEndpointContextSupportedConfigs: {
                browseEndpointContextMusicConfig: {
                  pageType: 'MUSIC_PAGE_TYPE_ARTIST',
                },
              },
            },
          },
        },
      ],
    },
    subtitle: { runs: [{ text: 'Artist • 2M monthly listeners' }] },
    thumbnail: {
      thumbnails: [{ url: 'canonical-avatar', width: 400, height: 400 }],
    },
  },
};
const artistBrowse = {
  header: {
    musicImmersiveHeaderRenderer: {
      title: { runs: [{ text: 'Artist' }] },
      thumbnail: {
        thumbnails: [{ url: 'wide-banner', width: 1200, height: 400 }],
      },
      subscriberCountText: { simpleText: '1M subscribers' },
    },
  },
};

test.beforeEach(() => {
  dom = new Window({ url: 'https://music.youtube.com/' });
  for (const key of [
    'window',
    'document',
    'Element',
    'HTMLElement',
    'IntersectionObserver',
  ]) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value:
        key === 'window'
          ? dom
          : key === 'document'
            ? dom.document
            : (dom as any)[key],
    });
  }
  calls = [];
  cleanups = [];
  respond = async (path) => (path === '/search' ? artistResult : artistBrowse);
  document.body.innerHTML = '<ytmusic-app></ytmusic-app>';
  Object.assign(document.querySelector('ytmusic-app')!, {
    networkManager: {
      fetch: async (path: string, data: any) => {
        calls.push({ path, data });
        return respond(path, data);
      },
    },
  });
});
test.afterEach(async () => {
  for (const cleanup of cleanups.reverse()) cleanup();
  await dom.happyDOM.abort();
  dom.close();
});
const fullEngine = () => {
  const base = createYouTubeMusicAdapter();
  cleanups.push(() => base.dispose());
  installCatalogPolish(base);
  const engine = installPlaylistCatalog(installBrowseCatalog(base));
  cleanups.push(installCatalogCache(engine as any));
  return engine;
};

test('cold first results use one request; enrichment reuses it and browses an artist once', async () => {
  const engine = fullEngine();
  const first = await engine.searchCatalog('Artist', { basic: true });
  expect(first.topResult?.title).toBe('Artist');
  expect(first.featuredArtist?.avatar).toBe('canonical-avatar');
  expect(calls.map((x) => x.path)).toEqual(['/search']);
  const enriched = await engine.searchCatalog('Artist');
  expect(enriched.featuredArtist).toMatchObject({
    avatar: 'canonical-avatar',
    banner: 'wide-banner',
    subscribers: '1M subscribers',
  });
  expect(
    calls.filter((x) => x.path === '/search').map((x) => x.data.query),
  ).toEqual([
    'Artist',
    'Artist songs',
    'Artist треки',
    'Artist album',
    'Artist альбом',
  ]);
  expect(calls.filter((x) => x.path === '/browse')).toHaveLength(1);
  await engine.searchCatalog('Artist');
  await engine.searchCatalog('Artist', { basic: true });
  expect(calls).toHaveLength(6);
});

test('concurrent basic and enriched consumers share requests without losing details', async () => {
  const engine = fullEngine();
  const [basic, enriched] = await Promise.all([
    engine.searchCatalog('Artist', { basic: true }),
    engine.searchCatalog('Artist'),
  ]);
  expect(basic.featuredArtist?.subscribers).toBe('');
  expect(enriched.featuredArtist?.subscribers).toBe('1M subscribers');
  expect(calls).toHaveLength(6);
});

test('artist page consumers reuse the same browse response', async () => {
  const engine = fullEngine();
  await engine.getArtistCatalog('UCartist', 'Artist');
  expect(
    calls.filter((x) => x.path === '/browse' && x.data.browseId === 'UCartist'),
  ).toHaveLength(1);
});

test('obsolete search does not launch enrichment after its first response', async () => {
  const engine = fullEngine();
  const response = deferred<unknown>();
  respond = () => response.promise;
  let current = true;
  const search = engine.searchCatalog('Artist', { isCurrent: () => current });
  current = false;
  response.resolve(artistResult);
  await search;
  expect(calls).toHaveLength(1);
  respond = async (path) => (path === '/search' ? artistResult : artistBrowse);
  const later = await engine.searchCatalog('Artist');
  expect(later.featuredArtist?.subscribers).toBe('1M subscribers');
  expect(calls).toHaveLength(6);
});

test('failed base requests are evicted and retry succeeds', async () => {
  const engine = fullEngine();
  respond = async () => {
    throw new Error('offline');
  };
  await expect(engine.searchCatalog('Artist', { basic: true })).rejects.toThrow(
    'offline',
  );
  respond = async () => artistResult;
  expect(
    (await engine.searchCatalog('Artist', { basic: true })).topResult?.title,
  ).toBe('Artist');
  expect(calls).toHaveLength(2);
});

test('slowed videos are playable in the first result without waiting for variant searches', async () => {
  const engine = fullEngine();
  respond = async () => ({
    musicResponsiveListItemRenderer: {
      flexColumns: [
        {
          musicResponsiveListItemFlexColumnRenderer: {
            text: { runs: [{ text: 'Track slowed reverb' }] },
          },
        },
      ],
      navigationEndpoint: {
        watchEndpoint: {
          videoId: 'slowed-video',
          watchEndpointMusicSupportedConfigs: {
            watchEndpointMusicConfig: {
              musicVideoType: 'MUSIC_VIDEO_TYPE_UGC',
            },
          },
        },
      },
    },
  });
  const result = await engine.searchCatalog('Track slowed', { basic: true });
  expect(result.songs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ videoId: 'slowed-video', kind: 'song' }),
    ]),
  );
  expect(calls).toHaveLength(1);
  const enriched = await engine.searchCatalog('Track slowed');
  expect(enriched.songs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ videoId: 'slowed-video' }),
    ]),
  );
  expect(calls.length).toBeGreaterThan(1);
});

const catalog = (query: string): SearchCatalog => ({
  query,
  featuredArtist: null,
  topResult: null,
  artists: [],
  albums: [],
  playlists: [],
  videos: [],
  songs: [
    {
      kind: 'song',
      title: 'Playable track',
      subtitle: '',
      artwork: '',
      videoId: query,
    },
  ],
});
const uiEngine = (searchCatalog: any) =>
  ({
    searchCatalog,
    getState: () => ({ track: { id: '' } }),
    subscribe: () => () => {},
    playContext: () => true,
    openSearchResult: () => true,
  }) as any;
const mount = (engine: any) => {
  const page = mountSearchPage(engine);
  cleanups.push(() => page.dispose());
  return page;
};

test('first result remains playable while optional enrichment is pending and after failure', async () => {
  const details = deferred<SearchCatalog>();
  let played = '';
  const engine = uiEngine(async (query: string, options: any) =>
    options.basic ? catalog(query) : details.promise,
  );
  engine.playContext = (items: any[], index: number) => {
    played = items[index].videoId;
    return true;
  };
  const page = mount(engine);
  const pending = page.search('first');
  await flush();
  const row = document.querySelector<HTMLButtonElement>(
    '[data-video-id="first"]',
  )!;
  expect(row).not.toBeNull();
  row.click();
  expect(played).toBe('first');
  details.reject(new Error('optional details offline'));
  await pending;
  expect(row.isConnected).toBe(true);
  expect(document.body.textContent).not.toContain('Search unavailable');
});

test('late search response cannot overwrite a newer result or reopen a closed page', async () => {
  const old = deferred<SearchCatalog>();
  const page = mount(
    uiEngine(async (query: string) =>
      query === 'old' ? old.promise : catalog(query),
    ),
  );
  const pending = page.search('old');
  await page.search('new');
  old.resolve(catalog('old'));
  await pending;
  expect(document.querySelector('[data-video-id="new"]')).not.toBeNull();
  expect(document.querySelector('[data-video-id="old"]')).toBeNull();
  page.close();
  expect(page.isOpen()).toBe(false);
});

test('background enrichment does not replace rows after interaction', async () => {
  const details = deferred<SearchCatalog>();
  const page = mount(
    uiEngine(async (query: string, options: any) =>
      options.basic ? catalog(query) : details.promise,
    ),
  );
  const pending = page.search('first');
  await flush();
  const row = document.querySelector<HTMLButtonElement>(
    '[data-video-id="first"]',
  )!;
  row.click();
  details.resolve(catalog('replacement'));
  await pending;
  expect(row.isConnected).toBe(true);
  expect(document.querySelector('[data-video-id="replacement"]')).toBeNull();
});

test('closing a page during enrichment leaves it closed', async () => {
  const details = deferred<SearchCatalog>();
  const page = mount(
    uiEngine(async (query: string, options: any) =>
      options.basic ? catalog(query) : details.promise,
    ),
  );
  const pending = page.search('first');
  await flush();
  page.close();
  details.resolve(catalog('replacement'));
  await pending;
  expect(page.isOpen()).toBe(false);
  expect(document.querySelector('[data-video-id="replacement"]')).toBeNull();
});

test('obsolete song context stops before launching album lookup', async () => {
  const artist = deferred<any>();
  let current = true;
  let albumLookups = 0;
  const initial = {
    ...catalog('Playable track'),
    artists: [
      {
        kind: 'artist' as const,
        title: 'Artist',
        browseId: 'UC',
        subtitle: '',
        artwork: '',
      },
    ],
  };
  const pending = resolveSearchFocus(
    {
      getArtistCatalog: () => artist.promise,
      searchCatalog: async () => {
        albumLookups++;
        return catalog('album');
      },
      getAlbumCatalog: async () => {
        albumLookups++;
        return {};
      },
    } as any,
    initial,
    () => current,
  );
  current = false;
  artist.resolve({ profile: { title: 'Artist', browseId: 'UC' } });
  expect(await pending).toBeNull();
  expect(albumLookups).toBe(0);
});

test('raw response cache is bounded, retries failures and clears on disposal', async () => {
  const cache = createCatalogRequestCache();
  let count = 0;
  const load = (key: string) => cache.load(key, 60_000, async () => ++count);
  for (let index = 0; index < 64; index++) await load(String(index));
  await load('0'); // keep this recently used entry
  await load('64');
  await load('0');
  expect(count).toBe(65);
  await load('1'); // oldest entry was evicted
  expect(count).toBe(66);
  cache.clear();
  await load('0');
  expect(count).toBe(67);
});
