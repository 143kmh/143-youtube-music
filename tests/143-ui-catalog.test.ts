import { expect, test } from '@playwright/test';
import { Window } from 'happy-dom';

import { createYouTubeMusicAdapter } from '../src/plugins/143-ui/youtube-music';
import { installBrowseCatalog } from '../src/plugins/143-ui/youtube-music-catalog';

let dom: Window;
let requests: { path: string; data: any }[];
let fetchResponse: (path: string, data: any) => Promise<unknown>;

const browseEndpoint = (browseId: string, pageType: string) => ({
  browseEndpoint: {
    browseId,
    browseEndpointContextSupportedConfigs: {
      browseEndpointContextMusicConfig: { pageType },
    },
  },
});

const song = (index: number) => ({
  musicResponsiveListItemRenderer: {
    flexColumns: [
      {
        musicResponsiveListItemFlexColumnRenderer: {
          text: { runs: [{ text: `Song ${index}` }] },
        },
      },
      {
        musicResponsiveListItemFlexColumnRenderer: {
          text: { runs: [{ text: `Artist • ${100 - index}M plays` }] },
        },
      },
    ],
    navigationEndpoint: {
      watchEndpoint: {
        videoId: `video-${index}`,
        watchEndpointMusicSupportedConfigs: {
          watchEndpointMusicConfig: { musicVideoType: 'MUSIC_VIDEO_TYPE_ATV' },
        },
      },
    },
    thumbnail: {
      musicThumbnailRenderer: {
        thumbnail: {
          thumbnails: [{ url: `song-${index}`, width: 120, height: 120 }],
        },
      },
    },
  },
});

const album = (title: string, browseId: string, year: number, artist = 'Artist') => ({
  musicTwoRowItemRenderer: {
    title: {
      runs: [
        {
          text: title,
          navigationEndpoint: browseEndpoint(browseId, 'MUSIC_PAGE_TYPE_ALBUM'),
        },
      ],
    },
    subtitle: { runs: [{ text: `Album • ${artist} • ${year}` }] },
    thumbnailRenderer: {
      musicThumbnailRenderer: {
        thumbnail: {
          thumbnails: [{ url: `${browseId}-art`, width: 400, height: 400 }],
        },
      },
    },
  },
});

const artistCard = (title: string, browseId: string) => ({
  musicTwoRowItemRenderer: {
    title: {
      runs: [
        {
          text: title,
          navigationEndpoint: browseEndpoint(browseId, 'MUSIC_PAGE_TYPE_ARTIST'),
        },
      ],
    },
    thumbnailRenderer: {
      musicThumbnailRenderer: {
        thumbnail: {
          thumbnails: [{ url: `${browseId}-avatar`, width: 400, height: 400 }],
        },
      },
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
  requests = [];
  fetchResponse = async () => ({});
  document.body.innerHTML = '<ytmusic-app></ytmusic-app><div id="movie_player"></div>';
  Object.assign(document.querySelector('ytmusic-app')!, {
    networkManager: {
      fetch: async (path: string, data: any) => {
        requests.push({ path, data });
        return fetchResponse(path, data);
      },
    },
    navigate: () => {},
  });
  Object.assign(document.querySelector('#movie_player')!, {
    getVideoData: () => ({ video_id: '', title: '', author: '' }),
    getPlayerState: () => 2,
    getDuration: () => 0,
    getCurrentTime: () => 0,
    getVolume: () => 100,
    isMuted: () => false,
  });
});

test.afterEach(async () => {
  await dom.happyDOM.abort();
  dom.close();
});

test('artist catalog comes from the artist browse id and keeps releases scoped to it', async () => {
  fetchResponse = async (path, data) => {
    expect(path).toBe('/browse');
    expect(data).toEqual({ browseId: 'UCartist' });
    return {
      header: {
        musicImmersiveHeaderRenderer: {
          title: { runs: [{ text: 'Artist' }] },
          subscriptionButton: {
            subscribeButtonRenderer: {
              subscriberCountWithSubscribeText: {
                runs: [{ text: '2M subscribers' }],
              },
            },
          },
          description: { runs: [{ text: '3M monthly listeners' }] },
          thumbnail: {
            musicThumbnailRenderer: {
              thumbnail: {
                thumbnails: [
                  { url: 'avatar', width: 512, height: 512 },
                  { url: 'banner', width: 1920, height: 720 },
                ],
              },
            },
          },
        },
      },
      contents: {
        sectionListRenderer: {
          contents: [
            {
              musicShelfRenderer: {
                title: { runs: [{ text: 'Top songs' }] },
                contents: Array.from({ length: 10 }, (_, index) => song(index + 1)),
              },
            },
            {
              musicCarouselShelfRenderer: {
                header: {
                  musicCarouselShelfBasicHeaderRenderer: {
                    title: { runs: [{ text: 'Albums' }] },
                  },
                },
                contents: [
                  album('Newest', 'MPREnew', 2025),
                  album('Older', 'MPREold', 2019),
                ],
              },
            },
            {
              musicCarouselShelfRenderer: {
                header: {
                  musicCarouselShelfBasicHeaderRenderer: {
                    title: { runs: [{ text: 'Singles & releases' }] },
                  },
                },
                contents: [album('Single', 'MPREsingle', 2026)],
              },
            },
            {
              musicCarouselShelfRenderer: {
                header: {
                  musicCarouselShelfBasicHeaderRenderer: {
                    title: { runs: [{ text: 'Fans might also like' }] },
                  },
                },
                contents: [artistCard('Related', 'UCrelated')],
              },
            },
          ],
        },
      },
    };
  };

  const engine = installBrowseCatalog(createYouTubeMusicAdapter());
  const result = await engine.getArtistCatalog('UCartist', 'Fallback');
  expect(result.profile).toMatchObject({
    title: 'Artist',
    browseId: 'UCartist',
    avatar: 'avatar',
    banner: 'banner',
    subscribers: '2M subscribers',
    monthlyListeners: '3M monthly listeners',
  });
  expect(result.topTracks.map((item) => item.videoId)).toEqual(
    Array.from({ length: 10 }, (_, index) => `video-${index + 1}`),
  );
  expect(result.albums.map((item) => item.title)).toEqual(['Newest', 'Older']);
  expect(result.releases.map((item) => item.title)).toEqual([
    'Single',
    'Newest',
    'Older',
  ]);
  expect(result.relatedArtists[0]).toMatchObject({
    title: 'Related',
    browseId: 'UCrelated',
  });
  expect(requests).toHaveLength(1);
  engine.dispose();
});

test('album catalog uses browse metadata and only its own track shelf', async () => {
  fetchResponse = async (path, data) => {
    expect(path).toBe('/browse');
    expect(data).toEqual({ browseId: 'MPREalbum' });
    return {
      header: {
        musicDetailHeaderRenderer: {
          title: { runs: [{ text: 'Album title' }] },
          subtitle: {
            runs: [
              {
                text: 'Artist',
                navigationEndpoint: browseEndpoint('UCartist', 'MUSIC_PAGE_TYPE_ARTIST'),
              },
              { text: ' • 2024' },
            ],
          },
          thumbnail: {
            musicThumbnailRenderer: {
              thumbnail: {
                thumbnails: [{ url: 'album-art', width: 800, height: 800 }],
              },
            },
          },
        },
      },
      contents: {
        sectionListRenderer: {
          contents: [
            {
              musicShelfRenderer: {
                contents: [song(1), song(2), song(3)],
              },
            },
            {
              musicCarouselShelfRenderer: {
                header: {
                  musicCarouselShelfBasicHeaderRenderer: {
                    title: { runs: [{ text: 'You might also like' }] },
                  },
                },
                contents: [album('Other album', 'MPREother', 2023, 'Other')],
              },
            },
          ],
        },
      },
    };
  };

  const engine = installBrowseCatalog(createYouTubeMusicAdapter());
  const result = await engine.getAlbumCatalog('MPREalbum');
  expect(result).toMatchObject({
    browseId: 'MPREalbum',
    title: 'Album title',
    artwork: 'album-art',
    year: '2024',
  });
  expect(result.artists).toEqual([{ name: 'Artist', browseId: 'UCartist' }]);
  expect(result.tracks.map((item) => item.title)).toEqual([
    'Song 1',
    'Song 2',
    'Song 3',
  ]);
  expect(requests).toHaveLength(1);
  engine.dispose();
});
