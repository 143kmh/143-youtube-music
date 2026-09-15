import { test, expect } from '@playwright/test';
import { Window } from 'happy-dom';
import { createYouTubeMusicAdapter } from '../src/plugins/143-ui/youtube-music';
import { installBrowseCatalog } from '../src/plugins/143-ui/youtube-music-catalog';
import { installPlaylistCatalog } from '../src/plugins/143-ui/youtube-music-playlist';
import { installPlaybackContext } from '../src/plugins/143-ui/playback-context';
import { mountPlayer } from '../src/plugins/143-ui/player';
import { mountInteractions } from '../src/plugins/143-ui/interactions';
import {
  playlistEditPayload,
  validatePlaylistEdit,
  PlaylistEditUnconfirmedError,
} from '../src/plugins/143-ui/native-player';

let dom: Window;
let engine: ReturnType<typeof installPlaybackContext>;
let videoId: string, responseId: string, duration: number, time: number;
let loads: string[],
  seeks: number[],
  nativeEnds: number,
  nativeProgress: number;
let state: any, controller: any;
let fetcher: (path: string, data: any) => Promise<any>;
let cleanups: (() => void)[];
const song = (videoId: string) => ({
  kind: 'song' as const,
  videoId,
  title: videoId,
  subtitle: 'Artist',
  artwork: videoId + '-art',
});
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const ack = (id = loads.at(-1)!, length = 200) => {
  videoId = responseId = id;
  duration = length;
  time = 0;
  engine.refresh();
};
const ended = () => {
  time = duration;
  engine.refresh();
  document
    .querySelector('video')!
    .dispatchEvent(new dom.Event('ended') as unknown as Event);
};
const begin = (ids = ['a', 'b', 'c']) => {
  engine.playContext(ids.map(song), 0, { kind: 'search', title: 'Search' });
  ack();
};
const tabsResponse = () => ({
  contents: {
    singleColumnMusicWatchNextResultsRenderer: {
      tabbedRenderer: {
        watchNextTabbedResultsRenderer: {
          tabs: [
            { tabRenderer: { content: { musicQueueRenderer: { content: { playlistPanelRenderer: { contents: [{ playlistPanelVideoRenderer: { videoId: 'a', navigationEndpoint: { watchEndpoint: { videoId: 'a' } } } }] } } } } } },
            {
              tabRenderer: {
                endpoint: { browseEndpoint: { browseId: 'lyrics' } },
              },
            },
          ],
        },
      },
    },
  },
});

test.beforeEach(() => {
  dom = new Window({ url: 'https://music.youtube.com/search?q=artist' });
  for (const key of [
    'window',
    'document',
    'Node',
    'Element',
    'HTMLElement',
    'HTMLInputElement',
  ])
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value:
        key === 'window'
          ? dom
          : key === 'document'
            ? dom.document
            : (dom as any)[key],
    });
  videoId = responseId = 'old';
  duration = 300;
  time = 12;
  loads = [];
  seeks = [];
  nativeEnds = 0;
  nativeProgress = 0;
  cleanups = [];
  state = {
    queue: {
      items: [],
      autoplay: true,
      repeatMode: 'NONE',
      shuffleEnabled: false,
    },
    playerPage: {},
    navigation: { playerPageInfo: { open: false } },
  };
  controller = {
    onPlayerStateChange: (s: number) => {
      if (s === 0) nativeEnds++;
    },
    playEndpoint: () => { throw new Error('Surface preparation must not reload playback'); },
    onVideoProgress: () => {
      nativeProgress++;
    },
  };
  document.body.innerHTML =
    '<ytmusic-app></ytmusic-app><div id="movie_player"><video></video></div><div id="queue"></div><ytmusic-player-bar></ytmusic-player-bar><ytmusic-player-page><div id="tabsContent"><button class="tab-header"></button><button class="tab-header"></button></div><div id="tab-renderer" page-type="MUSIC_PAGE_TYPE_TRACK_LYRICS"></div></ytmusic-player-page>';
  const store = {
    getState: () => state,
    dispatch: ({ type, payload }: any) => {
      const keys: Record<string, string> = {
        SET_AUTOPLAY_ENABLED: 'autoplay',
        SET_REPEAT: 'repeatMode',
        SET_SHUFFLE_ENABLED: 'shuffleEnabled',
      };
      if (keys[type]) state.queue[keys[type]] = payload;
      if (type === 'RESET_ITEMS') { state.queue.items = payload; controller.playEndpoint({ data: { videoId: payload[0].playlistPanelVideoRenderer.videoId } }); }
      if (type === 'SET_PLAYER_PAGE_TABS')
        state.playerPage.playerPageTabs = payload;
      if (type === 'SET_PLAYER_PAGE_INFO')
        state.navigation.playerPageInfo = payload;
      if (type === 'SET_PLAYER_UI_STATE')
        state.navigation.playerUiState = payload;
    },
  };
  Object.assign(document.querySelector('#queue')!, {
    queue: { store: { store } },
  });
  Object.assign(document.querySelector('ytmusic-player-bar')!, {
    playerController: controller,
  });
  document.querySelectorAll('.tab-header').forEach((tab) =>
    tab.addEventListener('click', () => {
      document
        .querySelectorAll('.tab-header')
        .forEach((other) =>
          other.setAttribute('aria-selected', String(other === tab)),
        );
    }),
  );
  fetcher = async () => ({});
  Object.assign(document.querySelector('ytmusic-app')!, {
    networkManager: { fetch: (path: string, data: any) => fetcher(path, data) },
  });
  Object.assign(document.querySelector('#movie_player')!, {
    getVideoData: () => ({
      video_id: videoId,
      title: videoId,
      author: 'Artist',
    }),
    getPlayerResponse: () => ({
      videoDetails: {
        videoId: responseId,
        lengthSeconds: String(duration),
        thumbnail: {
          thumbnails: [
            { url: responseId + '-response-art', width: 200, height: 200 },
          ],
        },
      },
    }),
    getDuration: () => 999,
    getCurrentTime: () => time,
    getPlayerState: () => 1,
    getVolume: () => 100,
    isMuted: () => false,
    setAutonav: () => {},
    clearQueue: () => {},
    loadVideoById: (id: string) => {
      loads.push(id);
    },
    seekTo: (value: number) => {
      seeks.push(value);
      time = value;
    },
    pauseVideo: () => {},
  });
  engine = installPlaybackContext(
    installPlaylistCatalog(installBrowseCatalog(createYouTubeMusicAdapter())),
  );
  engine.refresh();
});
test.afterEach(async () => {
  cleanups.reverse().forEach((fn) => fn());
  engine.dispose();
  await dom.happyDOM.abort();
  dom.close();
});

for (const trigger of ['manual', 'natural', 'seek'] as const)
  test(`${trigger} uses the same next item and keeps queue open`, () => {
    begin();
    engine.openQueue();
    if (trigger === 'manual') engine.next();
    else if (trigger === 'natural') ended();
    else engine.seek(200);
    expect(loads).toEqual(['a', 'b']);
    expect(engine.getPlaybackContext()?.queueOpen).toBe(true);
    expect(engine.getState().duration).toBe(0);
    ack();
    engine.openQueue();
    engine.openQueue();
    expect(engine.getPlaybackContext()?.queueOpen).toBe(true);
    expect(engine.getPlaybackContext()?.index).toBe(1);
    expect(seeks).toEqual([]);
  });
for (const order of ['api-first', 'dom-first'])
  test(`native end and DOM end coalesce (${order})`, () => {
    begin();
    time = duration;
    engine.refresh();
    if (order === 'api-first') {
      controller.onPlayerStateChange(0);
      ended();
    } else {
      ended();
      controller.onPlayerStateChange(0);
    }
    controller.onVideoProgress(195);
    expect(loads).toEqual(['a', 'b']);
    expect(nativeEnds).toBe(0);
    expect(nativeProgress).toBe(0);
    engine.clearPlaybackContext();
    controller.onPlayerStateChange(0);
    controller.onVideoProgress(195);
    expect(nativeEnds).toBe(1);
    expect(nativeProgress).toBe(1);
    expect(state.queue.autoplay).toBe(true);
  });
test('stale duration is never exposed or used to seek a loading track', () => {
  begin();
  engine.next();
  videoId = 'b';
  responseId = 'a';
  duration = 50;
  engine.refresh();
  expect(engine.getState().duration).toBe(0);
  engine.seek(49.9);
  expect(loads).toEqual(['a', 'b']);
  expect(seeks).toEqual([]);
  ack('b', 300);
  engine.seek(150);
  engine.seek(250);
  engine.seek(20);
  expect(seeks).toEqual([150, 250, 20]);
  expect(loads).toEqual(['a', 'b']);
});
test('pending Next/seek/end cannot skip the requested item', () => {
  begin();
  engine.seek(200);
  engine.next();
  engine.seek(200);
  ended();
  expect(loads).toEqual(['a', 'b']);
  ack();
  engine.next();
  expect(loads).toEqual(['a', 'b', 'c']);
});
test('native substitution requires an explicit paired renderer and keeps the queue position', () => {
  begin();
  engine.next();
  state.queue.items = [
    {
      playlistPanelVideoWrapperRenderer: {
        primaryRenderer: { playlistPanelVideoRenderer: { videoId: 'b' } },
        counterpart: [
          {
            counterpartRenderer: {
              playlistPanelVideoRenderer: { videoId: 'b-audio' },
            },
          },
        ],
      },
    },
  ];
  ack('b-audio');
  expect(engine.getPlaybackContext()?.index).toBe(1);
  expect(engine.getPlaybackContext()?.items.map((x) => x.videoId)).toEqual([
    'a',
    'b',
    'c',
  ]);
  engine.next();
  expect(loads.at(-1)).toBe('c');
});
test('unrelated native video is never adopted even after many refreshes', () => {
  begin();
  ack('random');
  for (let i = 0; i < 40; i++) {
    time++;
    engine.refresh();
  }
  expect(engine.getPlaybackContext()?.index).toBe(0);
  expect(engine.getPlaybackContext()?.items).toHaveLength(3);
  expect(engine.getState().track.id).toBe('a');
  expect(loads).toEqual(['a', 'a']);
});
test('Automix shares in-flight extension with end transition and deduplicates', async () => {
  let resolve!: (items: any[]) => void;
  engine.getAutoplayItems = () =>
    new Promise((done) => {
      resolve = done;
    });
  begin(['a']);
  engine.openQueue();
  ended();
  engine.next();
  resolve([song('a'), song('b'), song('b'), song('c')]);
  await flush();
  expect(loads).toEqual(['a', 'b']);
  expect(engine.getPlaybackContext()?.items.map((x) => x.videoId)).toEqual([
    'a',
    'b',
    'c',
  ]);
  expect(engine.getPlaybackContext()?.queueOpen).toBe(true);
});
test('Automix extends across successive tails and stale requests cannot alter a new context', async () => {
  let count = 0;
  engine.getAutoplayItems = async (id) => [song(id), song('more-' + ++count)];
  begin(['a']);
  await flush();
  for (let i = 0; i < 12; i++) {
    engine.next();
    ack();
    await flush();
  }
  expect(engine.getPlaybackContext()!.items.length).toBeGreaterThan(12);
  expect(
    new Set(engine.getPlaybackContext()!.items.map((x) => x.videoId)).size,
  ).toBe(engine.getPlaybackContext()!.items.length);
  let resolve!: (items: any[]) => void;
  engine.getAutoplayItems = () =>
    new Promise((done) => {
      resolve = done;
    });
  begin(['old-context']);
  engine.clearPlaybackContext();
  resolve([song('leak')]);
  await flush();
  expect(engine.getPlaybackContext()).toBeNull();
});
test('repeat one restarts automatically but manual Next advances; repeat all wraps without Automix', () => {
  begin();
  engine.cycleRepeat();
  engine.cycleRepeat();
  ended();
  expect(loads).toEqual(['a', 'a']);
  ack();
  engine.next();
  expect(loads.at(-1)).toBe('b');
  ack();
  engine.cycleRepeat();
  engine.cycleRepeat();
  engine.playContextIndex(2);
  ack();
  ended();
  expect(loads.at(-1)).toBe('a');
});
test('shuffle visits each item before repeat all and previous follows history', () => {
  begin(['a', 'b', 'c', 'd']);
  engine.cycleRepeat();
  engine.toggleShuffle();
  for (let i = 0; i < 3; i++) {
    engine.next();
    ack();
  }
  expect(new Set(loads).size).toBe(4);
  const previous = loads.at(-2);
  engine.previous();
  expect(loads.at(-1)).toBe(previous);
});
test('cancelled pointer gesture and changed track do not seek; one release commits once', () => {
  begin();
  cleanups.push(mountPlayer(engine));
  const range = document.querySelector<HTMLInputElement>(
    '.ui143-player-progress',
  )!;
  range.dispatchEvent(new dom.Event('pointerdown') as any);
  range.value = '500';
  range.dispatchEvent(new dom.Event('input') as any);
  dom.dispatchEvent(new dom.Event('pointerup'));
  range.dispatchEvent(new dom.Event('change') as any);
  expect(seeks).toEqual([100]);
  range.dispatchEvent(new dom.Event('pointerdown') as any);
  range.value = '250';
  range.dispatchEvent(new dom.Event('input') as any);
  dom.dispatchEvent(new dom.Event('pointercancel'));
  range.dispatchEvent(new dom.Event('change') as any);
  expect(seeks).toEqual([100]);
});
for (const kind of ['search', 'artist', 'album', 'playlist'])
  test(`Now Playing and Karaoke from ${kind} prepare native state without loading playback`, async () => {
    begin();
    fetcher = async () => ({ data: tabsResponse() });
    cleanups.push(mountPlayer(engine), mountInteractions(engine));
    const page = document.createElement('div');
    page.id = kind === 'playlist' ? 'ui143-album-page' : `ui143-${kind}-page`;
    document.body.append(page);
    document.querySelector<HTMLElement>('.ui143-player-art')!.click();
    await flush();
    expect(page.hidden).toBe(true);
    expect(loads).toEqual(['a']);
    expect(seeks).toEqual([]);
    expect(dom.location.pathname).toBe('/search');
    page.hidden = false;
    document
      .querySelector<HTMLButtonElement>('[aria-label="Karaoke"]')!
      .click();
    await flush();
    expect(page.hidden).toBe(true);
    expect(engine.getState().lyricsActive).toBe(true);
    expect(loads).toEqual(['a']);
  });
test('failed/stale native preparation does not reveal a blank page', async () => {
  begin();
  fetcher = async () => ({});
  expect(await engine.openNowPlaying()).toBe(false);
  let resolve!: (value: any) => void;
  fetcher = () =>
    new Promise((done) => {
      resolve = done;
    });
  const opening = engine.toggleLyrics();
  engine.next();
  ack();
  resolve(tabsResponse());
  expect(await opening).toBe(false);
  expect(state.navigation.playerPageInfo.open).toBe(false);
});
test('playlist payload normalizes only VL prefix and validates wrapped actual status', async () => {
  expect(playlistEditPayload('VLPL123', 'a')).toEqual({
    playlistId: 'PL123',
    actions: [
      {
        action: 'ACTION_ADD_VIDEO',
        addedVideoId: 'a',
        dedupeOption: 'DEDUPE_OPTION_SKIP',
      },
    ],
  });
  expect(playlistEditPayload('PLVL123', 'a').playlistId).toBe('PLVL123');
  expect(() => playlistEditPayload('VL', 'a')).toThrow();
  for (const raw of [
    { status: 'STATUS_SUCCEEDED' },
    { data: { status: 'STATUS_SUCCEEDED' } },
  ])
    expect(() => validatePlaylistEdit(raw)).not.toThrow();
  for (const raw of [
    { status: 'STATUS_FAILED' },
    { data: { error: { code: 403 } } },
    { status: 403, data: {} },
  ])
    expect(() => validatePlaylistEdit(raw)).toThrow();
  for (const raw of [undefined, {}, { data: {} }])
    expect(() => validatePlaylistEdit(raw)).toThrow(
      PlaylistEditUnconfirmedError,
    );
  let payload: any;
  fetcher = async (path, data) => {
    expect(path).toBe('/browse/edit_playlist');
    payload = data;
    return { data: { status: 'STATUS_SUCCEEDED' } };
  };
  await engine.addToPlaylist('VLPL123', 'a');
  expect(payload).toEqual(playlistEditPayload('VLPL123', 'a'));
});
test('player artwork cannot fall back to a stale native bar image', () => {
  begin();
  document.querySelector('ytmusic-player-bar')!.innerHTML =
    '<img src="old-art">';
  engine.next();
  videoId = 'b';
  responseId = 'a';
  engine.refresh();
  expect(engine.getState().track.artwork).toBe('b-art');
  ack('b');
  expect(engine.getState().track.artwork).toBe('b-response-art');
  responseId = 'a';
  time++;
  engine.refresh();
  expect(engine.getState().track.artwork).toBe('b-response-art');
});

test('canonical artist avatar is shared across search/browse and excludes banners and same-name artists', async () => {
  const profile = {
    browseId: 'UCartist',
    title: 'Artist',
    avatar: 'untrusted-track-art',
    banner: 'wide-fallback',
    subtitle: '',
    description: '',
  };
  const fake = Object.assign(engine, {
    getArtistCatalog: async () => ({
      profile,
      topTracks: [],
      albums: [],
      releases: [],
      relatedArtists: [],
    }),
    searchCatalog: async () => ({
      query: 'Artist',
      featuredArtist: profile,
      topResult: null,
      artists: [
        {
          kind: 'artist',
          title: 'Artist',
          browseId: 'UCwrong',
          artwork: 'wrong-avatar',
        },
      ],
      songs: [],
      albums: [],
      playlists: [],
      videos: [],
    }),
  });
  fetcher = async () => ({
    musicImmersiveHeaderRenderer: {
      thumbnail: { thumbnails: [{ url: 'banner', width: 1600, height: 600 }] },
      avatar: { thumbnails: [{ url: 'canonical', width: 400, height: 400 }] },
    },
  });
  const catalog = installPlaylistCatalog(fake as any);
  const [search, artist] = await Promise.all([
    catalog.searchCatalog('Artist'),
    catalog.getArtistCatalog('UCartist'),
  ]);
  expect(search.featuredArtist).toBe(artist.profile);
  expect(artist.profile.avatar).toBe('canonical');
  fetcher = async () => ({
    musicImmersiveHeaderRenderer: {
      avatar: { thumbnails: [{ url: 'different', width: 600, height: 600 }] },
    },
  });
  expect((await catalog.getArtistCatalog('UCartist')).profile).toBe(
    artist.profile,
  );
});
test('artist profile without an identified square avatar stays empty, not track/banner artwork', async () => {
  const profile = {
    browseId: 'UCartist',
    title: 'Artist',
    avatar: 'track',
    banner: 'banner',
  };
  const fake = Object.assign(engine, {
    getArtistCatalog: async () => ({
      profile,
      topTracks: [],
      albums: [],
      releases: [],
      relatedArtists: [],
    }),
    searchCatalog: async () => ({ topResult: null, artists: [] }),
  });
  fetcher = async () => ({
    musicImmersiveHeaderRenderer: {
      thumbnail: { thumbnails: [{ url: 'wide', width: 1800, height: 600 }] },
    },
  });
  expect(
    (await installPlaylistCatalog(fake as any).getArtistCatalog('UCartist'))
      .profile.avatar,
  ).toBe('');
});
test('album shelf excludes singles and EPs and keeps them in Latest', async () => {
  const release = (title: string, type: string) => ({
    kind: 'album' as const,
    browseId: 'MPRE' + title,
    title,
    subtitle: type,
    artwork: '',
  });
  const albums = [
    release('Album', 'Album • 2025'),
    release('Single', 'Single • 2026'),
    release('EP', 'EP • 2026'),
  ];
  const fake = Object.assign(engine, {
    getArtistCatalog: async () => ({
      profile: { browseId: 'UCartist', title: 'Artist' },
      topTracks: [],
      albums,
      releases: albums,
      relatedArtists: [],
    }),
    searchCatalog: async () => ({ topResult: null, artists: [] }),
  });
  fetcher = async () => ({});
  const result = await installPlaylistCatalog(fake as any).getArtistCatalog(
    'UCartist',
  );
  expect(result.albums.map((x) => x.title)).toEqual(['Album']);
  expect(result.releases.map((x) => x.title)).toEqual([
    'Album',
    'Single',
    'EP',
  ]);
});
test('shelf wheel yields page scroll at both edges and drag suppresses only its click', () => {
  cleanups.push(mountInteractions(engine));
  const shelf = document.createElement('div');
  shelf.className = 'ui143-artist-shelf-row';
  shelf.innerHTML = '<button class="ui143-artist-card">Album</button>';
  document.body.append(shelf);
  Object.defineProperties(shelf, {
    scrollWidth: { value: 1000 },
    clientWidth: { value: 400 },
  });
  const wheel = (deltaY: number) => {
    const event = new dom.WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY,
    });
    shelf.dispatchEvent(event as any);
    return event.defaultPrevented;
  };
  expect(wheel(-100)).toBe(false);
  expect(wheel(100)).toBe(true);
  expect(shelf.scrollLeft).toBe(100);
  shelf.scrollLeft = 600;
  expect(wheel(100)).toBe(false);
  const card = shelf.firstElementChild!;
  let clicks = 0;
  card.addEventListener('click', () => clicks++);
  card.dispatchEvent(
    new dom.PointerEvent('pointerdown', {
      bubbles: true,
      pointerId: 1,
      button: 0,
      clientX: 200,
      clientY: 0,
    }) as any,
  );
  card.dispatchEvent(
    new dom.PointerEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      clientX: 250,
      clientY: 0,
    }) as any,
  );
  card.dispatchEvent(
    new dom.PointerEvent('pointerup', {
      bubbles: true,
      pointerId: 1,
      clientX: 250,
      clientY: 0,
    }) as any,
  );
  (card as HTMLElement).click();
  expect(clicks).toBe(0);
  (card as HTMLElement).click();
  expect(clicks).toBe(1);
});
