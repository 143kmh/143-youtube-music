import { expect, test } from '@playwright/test';
import { Window } from 'happy-dom';

import { installCatalogCache } from '../src/plugins/143-ui/catalog-cache';
import { installPlaylistIsolation } from '../src/plugins/143-ui/playlist-isolation';

let dom: Window;
let cleanup: (() => void) | undefined;

const track = (title: string, videoId: string) => ({
  musicResponsiveListItemRenderer: {
    flexColumns: [
      {
        musicResponsiveListItemFlexColumnRenderer: {
          text: { runs: [{ text: title }] },
        },
      },
    ],
    playlistItemData: { videoId },
  },
});

const continuation = (token: string) => ({
  continuationItemRenderer: {
    continuationEndpoint: {
      continuationCommand: { token },
    },
  },
});

test.beforeEach(() => {
  dom = new Window({ url: 'https://music.youtube.com/' });
  for (const key of ['window', 'document', 'Element', 'HTMLElement']) {
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
  document.body.innerHTML = '<ytmusic-app></ytmusic-app>';
});

test.afterEach(async () => {
  cleanup?.();
  cleanup = undefined;
  await dom.happyDOM.abort();
  dom.close();
});

test('playlist browse keeps only the real playlist shelf and stops before recommendations', async () => {
  const app = document.querySelector('ytmusic-app')! as any;
  app.networkManager = {
    fetch: async (_path: string, data: any) => {
      if (data.browseId === 'VLPLmine') {
        return {
          contents: {
            musicPlaylistShelfRenderer: {
              contents: [track('Owned one', 'owned-1'), continuation('next-real')],
            },
          },
          related: {
            musicCarouselShelfRenderer: {
              contents: [track('Recommendation', 'rec-1')],
            },
            continuationItemRenderer: continuation('next-related')
              .continuationItemRenderer,
          },
        };
      }
      if (data.continuation === 'next-real') {
        return {
          continuationContents: {
            musicPlaylistShelfContinuation: {
              contents: [track('Owned two', 'owned-2'), continuation('last-real')],
            },
          },
          related: track('Another recommendation', 'rec-2'),
        };
      }
      if (data.continuation === 'last-real') {
        return {
          related: {
            musicCarouselShelfRenderer: {
              contents: [track('Only recommendation', 'rec-3')],
            },
          },
        };
      }
      return {};
    },
  };

  cleanup = installPlaylistIsolation();

  const first = await app.networkManager.fetch('/browse', {
    browseId: 'VLPLmine',
  });
  expect(JSON.stringify(first)).toContain('Owned one');
  expect(JSON.stringify(first)).not.toContain('Recommendation');
  expect(JSON.stringify(first)).not.toContain('next-related');

  const second = await app.networkManager.fetch('/browse', {
    continuation: 'next-real',
  });
  expect(JSON.stringify(second)).toContain('Owned two');
  expect(JSON.stringify(second)).not.toContain('Another recommendation');

  const end = await app.networkManager.fetch('/browse', {
    continuation: 'last-real',
  });
  expect(end).toEqual({});
});

test('catalog cache deduplicates repeated in-flight and recent lookups', async () => {
  let searches = 0;
  let artists = 0;
  let albums = 0;
  let autoplay = 0;
  const engine = {
    searchCatalog: async (query: string) => {
      searches++;
      return { query };
    },
    getArtistCatalog: async (browseId: string) => {
      artists++;
      return { browseId };
    },
    getAlbumCatalog: async (browseId: string) => {
      albums++;
      return { browseId };
    },
    getAutoplayItems: async (videoId: string) => {
      autoplay++;
      return [{ videoId }];
    },
  } as any;

  const restore = installCatalogCache(engine);
  await Promise.all([
    engine.searchCatalog('  Jay-Z  '),
    engine.searchCatalog('jay z'),
  ]);
  await Promise.all([
    engine.getArtistCatalog('UCartist'),
    engine.getArtistCatalog('UCartist'),
    engine.getAlbumCatalog('MPREalbum'),
    engine.getAlbumCatalog('MPREalbum'),
    engine.getAutoplayItems('video-1'),
    engine.getAutoplayItems('video-1'),
  ]);

  expect({ searches, artists, albums, autoplay }).toEqual({
    searches: 1,
    artists: 1,
    albums: 1,
    autoplay: 1,
  });

  restore();
  await engine.searchCatalog('jay z');
  expect(searches).toBe(2);
});
