import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { Window } from 'happy-dom';
import { createYouTubeMusicAdapter } from '../src/plugins/143-ui/youtube-music';
import { mountPlayer } from '../src/plugins/143-ui/player';
import { mountPlaylistPicker } from '../src/plugins/143-ui/playlist-picker';
import { mountInteractions } from '../src/plugins/143-ui/interactions';

let dom: Window;
let engine: ReturnType<typeof createYouTubeMusicAdapter>;
let cleanup: (() => void) | undefined;
let track: { video_id: string; title: string; author: string };
let playing: number;
let volume: number;
let muted: boolean;
let time: number;
let seeks: number[];
let routes: string[];
let requests: { path: string; data: any }[];
let fetchResponse: (path: string, data: any) => Promise<unknown>;

test.beforeEach(() => {
  dom = new Window({ url: 'https://music.youtube.com/watch?v=first' });
  for (const key of [
    'window',
    'document',
    'Element',
    'HTMLElement',
    'HTMLAnchorElement',
    'HTMLFormElement',
    'HTMLInputElement',
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
  track = { video_id: 'first', title: 'First song', author: 'Artist' };
  playing = 1;
  volume = 67;
  muted = false;
  time = 12;
  seeks = [];
  routes = [];
  requests = [];
  fetchResponse = async () => ({});
  document.body.innerHTML = `<ytmusic-app></ytmusic-app><div id="movie_player"></div>
    <ytmusic-player-bar><span class="title ytmusic-player-bar">First song</span><span class="byline">Artist</span>
      <ytmusic-like-button-renderer like-status="INDIFFERENT"><button></button></ytmusic-like-button-renderer>
      <button id="shuffle-button" aria-pressed="false"></button><button id="repeat-button" repeat-mode="NONE"></button>
    </ytmusic-player-bar><div id="tabsContent"><button class="tab-header" aria-selected="true"></button><button class="tab-header" aria-selected="false"></button></div>`;
  Object.assign(document.querySelector('ytmusic-app')!, {
    navigate: (route: string) => {
      routes.push(route);
      dom.history.pushState({}, '', route);
    },
    networkManager: {
      fetch: async (path: string, data: any) => {
        requests.push({ path, data });
        return fetchResponse(path, data);
      },
    },
  });
  Object.assign(document.querySelector('#movie_player')!, {
    getVideoData: () => track,
    getPlayerResponse: () => ({
      videoDetails: { author: track.author, channelId: 'UCprimary' },
    }),
    getPlayerState: () => playing,
    getDuration: () => 200,
    getCurrentTime: () => time,
    getVolume: () => volume,
    isMuted: () => muted,
    setVolume: (value: number) => {
      volume = value;
    },
    mute: () => {
      muted = true;
    },
    unMute: () => {
      muted = false;
    },
    playVideo: () => {
      playing = 1;
    },
    pauseVideo: () => {
      playing = 2;
    },
    seekTo: (value: number) => {
      seeks.push(value);
      time = value;
    },
    nextVideo: () => {
      track = { ...track, video_id: 'next' };
    },
    previousVideo: () => {
      track = { ...track, video_id: 'previous' };
    },
  });
  engine = createYouTubeMusicAdapter();
  engine.refresh();
});

test.afterEach(async () => {
  cleanup?.();
  cleanup = undefined;
  engine.dispose();
  await dom.happyDOM.abort();
  dom.close();
});

test('search and artist navigation preserve playing track, time and media API', () => {
  const api = document.querySelector('#movie_player');
  expect(engine.search('a & b')).toBe(true);
  expect(engine.navigateArtist('UCprimary')).toBe(true);
  engine.refresh();
  expect(routes).toEqual(['/search?q=a%20%26%20b', 'UCprimary']);
  expect(engine.getState().track.id).toBe('first');
  expect(engine.getState().playing).toBe(true);
  expect(engine.getState().time).toBe(12);
  expect(document.querySelector('#movie_player')).toBe(api);
  expect(seeks).toEqual([]);
  expect(engine.navigate('https://example.com/')).toBe(false);
  document.querySelector('ytmusic-app')?.remove();
  expect(engine.search('offline')).toBe(false);
  expect(dom.location.pathname).toBe('/UCprimary');
});

test('search catalog enriches an artist and opens its browse id directly', async () => {
  fetchResponse = async (path) => {
    if (path === '/search')
      return {
        musicCardShelfRenderer: {
          title: {
            runs: [
              {
                text: 'Oxxxymiron',
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
          subtitle: { runs: [{ text: 'Artist • 2.5M monthly listeners' }] },
          thumbnail: {
            musicThumbnailRenderer: {
              thumbnail: {
                thumbnails: [
                  { url: 'avatar-small', width: 64, height: 64 },
                  { url: 'avatar-large', width: 512, height: 512 },
                ],
              },
            },
          },
        },
      };
    if (path === '/browse')
      return {
        header: {
          musicImmersiveHeaderRenderer: {
            title: { runs: [{ text: 'Oxxxymiron' }] },
            thumbnail: {
              musicThumbnailRenderer: {
                thumbnail: {
                  thumbnails: [
                    { url: 'banner', width: 1920, height: 720 },
                  ],
                },
              },
            },
            subscriptionButton: {
              subscribeButtonRenderer: {
                subscriberCountWithSubscribeText: {
                  runs: [{ text: '2.1M subscribers' }],
                },
              },
            },
          },
        },
      };
    return {};
  };

  const result = await engine.searchCatalog('Oxxxymiron');
  expect(result.featuredArtist).toMatchObject({
    title: 'Oxxxymiron',
    browseId: 'UCartist',
    avatar: 'avatar-large',
    banner: 'banner',
    subscribers: '2.1M subscribers',
    monthlyListeners: '2.5M monthly listeners',
  });
  expect(requests.map((request) => request.path)).toEqual(['/search', '/browse']);
  expect(engine.openSearchResult(result.topResult!)).toBe(true);
  expect(routes.at(-1)).toBe('UCartist');
});

test('transport, clamped seek and mute restoration use the existing player', () => {
  engine.togglePlayback();
  expect(playing).toBe(2);
  engine.togglePlayback();
  expect(playing).toBe(1);
  engine.next();
  expect(track.video_id).toBe('next');
  engine.previous();
  expect(track.video_id).toBe('previous');
  engine.seek(999);
  engine.seek(-4);
  engine.seek(NaN);
  expect(seeks).toEqual([200, 0]);
  engine.toggleMute();
  expect(muted).toBe(true);
  engine.toggleMute();
  expect(muted).toBe(false);
  expect(volume).toBe(67);
  engine.setVolume(150);
  expect(volume).toBe(100);
});

test('like, shuffle and repeat keep reconciling after both custom and native changes', () => {
  const like = document.querySelector('ytmusic-like-button-renderer')!;
  like
    .querySelector('button')!
    .addEventListener('click', () => like.setAttribute('like-status', 'LIKE'));
  engine.toggleLike();
  expect(engine.getState().liked).toBe(true);
  like.setAttribute('like-status', 'DISLIKE');
  document
    .querySelector('#shuffle-button')!
    .setAttribute('aria-pressed', 'true');
  document.querySelector('#repeat-button')!.setAttribute('repeat-mode', 'ONE');
  engine.refresh();
  expect(engine.getState()).toMatchObject({
    liked: false,
    shuffle: true,
    repeat: 2,
  });
  document.querySelector('#repeat-button')!.setAttribute('repeat-mode', 'NONE');
  engine.refresh();
  expect(engine.getState().repeat).toBe(0);
});

test('current artists follow video identity, including wrapped queue entries', () => {
  const queue = document.createElement('div');
  queue.id = 'queue';
  document.body.append(queue);
  const renderer = (id: string, name: string, selected: boolean) => ({
    videoId: id,
    selected,
    title: { runs: [{ text: name }] },
    longBylineText: {
      runs: [
        {
          text: name,
          navigationEndpoint: { browseEndpoint: { browseId: 'UC' + id } },
        },
      ],
    },
  });
  Object.assign(queue, {
    queue: {
      store: {
        store: {
          getState: () => ({
            queue: {
              items: [
                {
                  playlistPanelVideoRenderer: renderer(
                    'wrong',
                    'Wrong artist',
                    true,
                  ),
                },
                {
                  playlistPanelVideoWrapperRenderer: {
                    primaryRenderer: {
                      playlistPanelVideoRenderer: renderer(
                        'first',
                        'Correct artist',
                        false,
                      ),
                    },
                  },
                },
              ],
              shuffleEnabled: false,
              repeatMode: 'ALL',
            },
            likeStatus: { videos: { first: 'DISLIKE' } },
          }),
        },
      },
    },
  });
  engine.refresh();
  expect(engine.getState().track.artists).toEqual([
    { name: 'Correct artist', browseId: 'UCfirst' },
  ]);
  expect(engine.getState().queue).toHaveLength(2);
  expect(engine.getState().repeat).toBe(1);
});

test('late artist search cannot overwrite the next song or notify after dispose', async () => {
  let resolve!: (value: unknown) => void;
  fetchResponse = () =>
    new Promise((done) => {
      resolve = done;
    });
  track.title = 'First feat. Guest';
  engine.refresh();
  track = { video_id: 'second', title: 'Second song', author: 'Second' };
  engine.refresh();
  resolve({
    runs: [
      {
        text: 'Guest',
        navigationEndpoint: { browseEndpoint: { browseId: 'UCguest' } },
      },
    ],
  });
  await new Promise((done) => setImmediate(done));
  expect(engine.getState().track.artists.map((artist) => artist.name)).toEqual([
    'Second',
  ]);
  let calls = 0;
  engine.subscribe(() => calls++);
  engine.dispose();
  engine.refresh();
  expect(calls).toBe(1);
});

test('one seek per pointer gesture and keyboard change; player remount has one owner', () => {
  cleanup = mountPlayer(engine);
  const progress = document.querySelector<HTMLInputElement>(
    '.ui143-player-progress',
  )!;
  progress.dispatchEvent(new dom.Event('pointerdown') as unknown as Event);
  for (const value of ['100', '300', '500']) {
    progress.value = value;
    progress.dispatchEvent(new dom.Event('input') as unknown as Event);
  }
  expect(seeks).toEqual([]);
  dom.dispatchEvent(new dom.Event('pointerup'));
  progress.dispatchEvent(new dom.Event('change') as unknown as Event);
  expect(seeks).toEqual([100]);
  progress.value = '750';
  progress.dispatchEvent(new dom.Event('input') as unknown as Event);
  progress.dispatchEvent(new dom.Event('change') as unknown as Event);
  expect(seeks).toEqual([100, 150]);
  cleanup();
  cleanup = mountPlayer(engine);
  expect(document.querySelectorAll('#ui143-player')).toHaveLength(1);
});

test('playlist picker captures the intended video and ignores closed requests', async () => {
  fetchResponse = async () => ({
    musicTwoRowItemRenderer: {
      title: {
        runs: [
          {
            text: 'My playlist',
            navigationEndpoint: { browseEndpoint: { browseId: 'VLPLmine' } },
          },
        ],
      },
    },
  });
  const picker = mountPlaylistPicker(engine);
  cleanup = picker.dispose;
  await picker.open();
  track.video_id = 'second';
  engine.refresh();
  document
    .querySelector<HTMLButtonElement>('.ui143-playlist-picker-item')!
    .click();
  await new Promise((done) => setImmediate(done));
  expect(
    requests.find((request) => request.path === '/playlist/edit')?.data,
  ).toEqual({
    playlistId: 'PLmine',
    actions: [{ action: 'ACTION_ADD_VIDEO', addedVideoId: 'first' }],
  });
  let resolve!: (value: unknown) => void;
  fetchResponse = () =>
    new Promise((done) => {
      resolve = done;
    });
  const pending = picker.open();
  picker.dispose();
  resolve({});
  await pending;
  expect(document.querySelector('#ui143-playlist-picker')).toBeNull();
});

test('lyrics and queue commands reflect native tabs', () => {
  const tabs = Array.from(document.querySelectorAll('.tab-header'));
  tabs.forEach((tab) =>
    tab.addEventListener('click', () =>
      tabs.forEach((other) =>
        other.setAttribute('aria-selected', String(other === tab)),
      ),
    ),
  );
  engine.toggleLyrics();
  expect(engine.getState().lyricsActive).toBe(true);
  engine.openQueue();
  expect(engine.getState().queueActive).toBe(true);
  tabs[1].setAttribute('disabled', '');
  engine.refresh();
  expect(engine.getState().lyricsAvailable).toBe(true);
});

test('adapter handles missing and late engine nodes, start/dispose are idempotent', async () => {
  document.body.replaceChildren();
  engine.start();
  engine.start();
  expect(engine.getState().track.id).toBe('');
  engine.seek(20);
  engine.togglePlayback();
  engine.toggleLike();
  const bar = document.createElement('ytmusic-player-bar');
  bar.innerHTML = '<span class="title ytmusic-player-bar">Late song</span>';
  document.body.append(bar);
  await expect.poll(() => engine.getState().track.title).toBe('Late song');
  engine.dispose();
  engine.dispose();
});

test('UI has no engine selectors, network calls or full-page internal navigation', () => {
  for (const file of [
    'player.ts',
    'interactions.ts',
    'playlist-picker.ts',
    'settings.ts',
    'search-page.ts',
    'index.ts',
  ]) {
    const source = readFileSync(
      new URL('../src/plugins/143-ui/' + file, import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(
      /location\.(assign|replace)|location\.href\s*=|networkManager|querySelector[^;]*ytmusic-|#movie_player|#queue|FEmusic_|['"]\/(?:browse|channel|search|playlist\/edit)(?:[/'"?])/,
    );
  }
});

test('row click dispatches once and preserves native interactive children', () => {
  cleanup = mountInteractions(engine);
  const row = document.createElement('ytmusic-responsive-list-item-renderer');
  row.innerHTML =
    '<span class="copy">Song</span><ytmusic-play-button-renderer><button>Play</button></ytmusic-play-button-renderer><button class="menu">Menu</button>';
  document.body.append(row);
  let plays = 0;
  row
    .querySelector('ytmusic-play-button-renderer button')!
    .addEventListener('click', () => plays++);
  row.querySelector<HTMLElement>('.copy')!.click();
  expect(plays).toBe(1);
  row.querySelector<HTMLElement>('.menu')!.click();
  expect(plays).toBe(1);
});

test('a drag never seeks the replacement track; paused volume updates its visual', () => {
  cleanup = mountPlayer(engine);
  const progress = document.querySelector<HTMLInputElement>(
    '.ui143-player-progress',
  )!;
  progress.dispatchEvent(new dom.Event('pointerdown') as unknown as Event);
  progress.value = '500';
  progress.dispatchEvent(new dom.Event('input') as unknown as Event);
  track.video_id = 'replacement';
  engine.refresh();
  dom.dispatchEvent(new dom.Event('pointerup'));
  expect(seeks).toEqual([]);
  playing = 2;
  engine.refresh();
  const volumeInput = document.querySelector<HTMLInputElement>(
    '.ui143-player-volume',
  )!;
  volumeInput.dispatchEvent(new dom.Event('pointerdown') as unknown as Event);
  volumeInput.value = '23';
  volumeInput.dispatchEvent(new dom.Event('input') as unknown as Event);
  dom.dispatchEvent(new dom.Event('pointerup'));
  expect(volumeInput.style.getPropertyValue('--ui143-range-progress')).toBe(
    '23%',
  );
});

test('section commands preserve all six existing internal routes', () => {
  for (const section of [
    'home',
    'library',
    'playlists',
    'songs',
    'albums',
    'artists',
  ] as const)
    expect(engine.navigateSection(section)).toBe(true);
  expect(routes).toEqual([
    '/',
    '/library',
    '/library/playlists',
    '/library/songs',
    '/library/albums',
    '/library/artists',
  ]);
});
