import type { MusicPlayer } from '@/types/music-player';
import type { MusicPlayerAppElement } from '@/types/music-player-app-element';
import type { QueueElement } from '@/types/queue';

const sectionBrowseIds = {
  'home': 'FEmusic_home',
  'library': 'FEmusic_library_landing',
  'playlists': 'FEmusic_liked_playlists',
  'songs': 'FEmusic_liked_videos',
  'albums': 'FEmusic_liked_albums',
  'artists': 'FEmusic_library_corpus_track_artists',
} as const;
export type MusicSection = keyof typeof sectionBrowseIds;

export type ArtistEntry = {
  name: string;
  browseId: string;
};

export type PlaylistEntry = {
  title: string;
  browseId: string;
  playlistId: string;
};

export type SearchResultKind =
  | 'song'
  | 'video'
  | 'artist'
  | 'album'
  | 'playlist';

export type SearchResultItem = Readonly<{
  kind: SearchResultKind;
  title: string;
  subtitle: string;
  artwork: string;
  videoId?: string;
  browseId?: string;
}>;

export type SearchCatalog = Readonly<{
  query: string;
  topResult: SearchResultItem | null;
  songs: readonly SearchResultItem[];
  artists: readonly SearchResultItem[];
  albums: readonly SearchResultItem[];
  playlists: readonly SearchResultItem[];
  videos: readonly SearchResultItem[];
}>;

type UnknownRecord = Record<string, unknown>;

type NavigationEndpoint = {
  watchEndpoint?: {
    videoId?: string;
    watchEndpointMusicSupportedConfigs?: {
      watchEndpointMusicConfig?: {
        musicVideoType?: string;
      };
    };
  };
  browseEndpoint?: {
    browseId?: string;
    browseEndpointContextSupportedConfigs?: {
      browseEndpointContextMusicConfig?: {
        pageType?: string;
      };
    };
  };
};

type TextRun = {
  text?: string;
  navigationEndpoint?: NavigationEndpoint;
};

type NativeSearchBox = HTMLElement & {
  getSearchboxStats?: () => unknown;
};

export type RepeatMode = 0 | 1 | 2;
export type MusicState = Readonly<{
  track: Readonly<{
    id: string;
    title: string;
    byline: string;
    artwork: string;
    artists: readonly ArtistEntry[];
  }>;
  playing: boolean;
  time: number;
  duration: number;
  volume: number;
  muted: boolean;
  liked: boolean | null;
  shuffle: boolean | null;
  repeat: RepeatMode | null;
  queue: readonly Readonly<{ id: string; title: string; selected: boolean }>[];
  queueActive: boolean;
  lyricsAvailable: boolean;
  lyricsActive: boolean;
}>;

/** The sole YouTube Music DOM/API boundary for the 143 shell. No stream selection here. */
export const createYouTubeMusicAdapter = (lyricsBridge?: {
  attach: (api: MusicPlayer) => Promise<void>;
  stop: () => void;
}) => {
  const isRecord = (value: unknown): value is UnknownRecord =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

  const app = () =>
    document.querySelector<MusicPlayerAppElement>('ytmusic-app');
  const nativeSearchBox = () =>
    document.querySelector<NativeSearchBox>('ytmusic-search-box');

  const submitNativeSearch = (query: string) => {
    const searchBox = nativeSearchBox();
    const input = searchBox?.querySelector<HTMLInputElement>('#input, input');
    if (!input) return false;

    input.focus();
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    if (valueSetter) valueSetter.call(input, query);
    else input.value = query;

    input.dispatchEvent(
      new Event('input', { bubbles: true, cancelable: false, composed: true }),
    );
    input.dispatchEvent(
      new Event('change', { bubbles: true, cancelable: false, composed: true }),
    );

    const enter = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    Object.defineProperty(enter, 'keyCode', { get: () => 13 });
    Object.defineProperty(enter, 'which', { get: () => 13 });
    input.dispatchEvent(enter);
    return true;
  };

  const normalizeArtistName = (value: string) =>
    value
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/[\p{P}\p{S}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const artistFromRun = (run: TextRun): ArtistEntry | null => {
    const browse = run.navigationEndpoint?.browseEndpoint;
    const browseId = browse?.browseId;
    const name = run.text?.replaceAll(/\s+/g, ' ').trim();
    const pageType =
      browse?.browseEndpointContextSupportedConfigs
        ?.browseEndpointContextMusicConfig?.pageType;

    if (!name || !browseId) return null;
    if (pageType !== 'MUSIC_PAGE_TYPE_ARTIST' && !browseId.startsWith('UC')) {
      return null;
    }
    return { name, browseId };
  };

  const currentQueueRenderer = () => {
    const queue = document.querySelector<QueueElement>('#queue');
    const items = queue?.queue?.store?.store?.getState?.()?.queue?.items ?? [];

    for (const item of items) {
      const renderer =
        item.playlistPanelVideoRenderer ??
        item.playlistPanelVideoWrapperRenderer?.primaryRenderer
          ?.playlistPanelVideoRenderer;
      if (
        renderer?.videoId &&
        renderer.videoId === playerApi()?.getVideoData?.()?.video_id
      )
        return renderer;
    }

    return null;
  };

  const currentArtists = (): ArtistEntry[] => {
    const renderer = currentQueueRenderer();
    const result: ArtistEntry[] = [];
    const seen = new Set<string>();

    for (const run of renderer?.longBylineText?.runs ?? []) {
      const artist = artistFromRun(run);
      if (!artist || seen.has(artist.browseId)) continue;
      seen.add(artist.browseId);
      result.push(artist);
    }

    if (result.length > 0) return result;

    const response = playerApi()?.getPlayerResponse?.() as unknown as
      | { videoDetails?: { author?: string; channelId?: string } }
      | undefined;
    const name = response?.videoDetails?.author?.trim();
    const browseId = response?.videoDetails?.channelId;
    if (name && browseId) return [{ name, browseId }];
    for (const link of nativeBar()?.querySelectorAll<HTMLAnchorElement>(
      'a[href]',
    ) ?? []) {
      const match = new URL(link.href, window.location.origin).pathname.match(
        /^\/(?:channel|browse)\/(UC[\w-]+)/,
      );
      const name = link.textContent?.trim();
      if (match && name && !seen.has(match[1])) {
        seen.add(match[1]);
        result.push({ name, browseId: match[1] });
      }
    }
    return result;
  };

  const currentTrackTitle = () => {
    const data = playerApi()?.getVideoData?.();
    if (data?.title?.trim()) return data.title.trim();
    return (
      document
        .querySelector<HTMLElement>(
          'ytmusic-player-bar .title.ytmusic-player-bar',
        )
        ?.textContent?.trim() ?? ''
    );
  };

  const featuredArtistNames = (title: string) => {
    const names: string[] = [];
    const seen = new Set<string>();
    const featurePattern =
      /(?:\bfeat(?:uring)?\.?|\bft\.?|\bwith)\s+([^\])}|–—]+)/giu;

    for (const match of title.matchAll(featurePattern)) {
      const captured = match[1]?.trim();
      if (!captured) continue;
      for (const piece of captured.split(/\s*(?:,|&|\+|;|\bx\b)\s*/giu)) {
        const name = piece.replace(/[\])}]+$/g, '').trim();
        const key = normalizeArtistName(name);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        names.push(name);
      }
    }

    return names;
  };

  const readRuns = (value: unknown): TextRun[] => {
    if (!isRecord(value) || !Array.isArray(value.runs)) return [];
    return value.runs.filter(isRecord) as TextRun[];
  };

  const textFromRuns = (runs: readonly TextRun[]) =>
    runs
      .map((run) => run.text ?? '')
      .join('')
      .replaceAll(/\s+/g, ' ')
      .trim();

  const collectArtistRuns = (root: unknown): ArtistEntry[] => {
    const result: ArtistEntry[] = [];
    const seen = new Set<string>();

    const visit = (value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!isRecord(value)) return;

      for (const run of readRuns(value)) {
        const artist = artistFromRun(run);
        if (!artist || seen.has(artist.browseId)) continue;
        seen.add(artist.browseId);
        result.push(artist);
      }
      Object.values(value).forEach(visit);
    };

    visit(root);
    return result;
  };

  const artistSearchCache = new Map<string, Promise<ArtistEntry | null>>();

  const resolveArtist = (name: string) => {
    const cacheKey = normalizeArtistName(name);
    const cached = artistSearchCache.get(cacheKey);
    if (cached) return cached;

    const request = (async () => {
      const musicApp = app();
      if (!musicApp) return null;

      const searchBox = nativeSearchBox();

      try {
        const response = await musicApp.networkManager.fetch<
          unknown,
          { query: string; suggestStats?: unknown }
        >('/search', {
          query: name,
          suggestStats: searchBox?.getSearchboxStats?.(),
        });
        const candidates = collectArtistRuns(response);
        if (candidates.length === 0) return null;

        const exact = candidates.find(
          (candidate) => normalizeArtistName(candidate.name) === cacheKey,
        );
        if (exact) return exact;

        const startsWith = candidates.find((candidate) => {
          const candidateName = normalizeArtistName(candidate.name);
          return (
            candidateName.startsWith(cacheKey) ||
            cacheKey.startsWith(candidateName)
          );
        });
        return startsWith ?? null;
      } catch (error) {
        console.warn(
          `[143 Music] Could not resolve featured artist ${name}`,
          error,
        );
        return null;
      }
    })();

    artistSearchCache.set(cacheKey, request);
    return request;
  };

  const flexRunGroups = (candidate: UnknownRecord) => {
    const groups: TextRun[][] = [];
    const flexColumns = candidate.flexColumns;
    if (!Array.isArray(flexColumns)) return groups;

    for (const column of flexColumns) {
      if (!isRecord(column)) continue;
      const renderer = column.musicResponsiveListItemFlexColumnRenderer;
      if (!isRecord(renderer)) continue;
      const runs = readRuns(renderer.text);
      if (runs.length) groups.push(runs);
    }
    return groups;
  };

  const candidateRuns = (candidate: UnknownRecord): TextRun[] => {
    const runs = [...readRuns(candidate.title)];
    for (const group of flexRunGroups(candidate)) runs.push(...group);
    return runs;
  };

  const playlistFromCandidate = (
    candidate: UnknownRecord,
  ): PlaylistEntry | null => {
    const runs = candidateRuns(candidate);
    const playlistRun = runs.find((run) => {
      const browseId = run.navigationEndpoint?.browseEndpoint?.browseId;
      return typeof browseId === 'string' && browseId.startsWith('VLPL');
    });
    const browseId = playlistRun?.navigationEndpoint?.browseEndpoint?.browseId;
    if (!browseId) return null;

    const title =
      readRuns(candidate.title)
        .map((run) => run.text?.trim() ?? '')
        .find(Boolean) ??
      runs.map((run) => run.text?.trim() ?? '').find(Boolean);
    if (!title) return null;

    return {
      title,
      browseId,
      playlistId: browseId.slice(2),
    };
  };

  const collectPlaylists = (root: unknown): PlaylistEntry[] => {
    const result: PlaylistEntry[] = [];
    const seen = new Set<string>();

    const addCandidate = (candidate: unknown) => {
      if (!isRecord(candidate)) return;
      const playlist = playlistFromCandidate(candidate);
      if (!playlist || seen.has(playlist.playlistId)) return;
      seen.add(playlist.playlistId);
      result.push(playlist);
    };

    const visit = (value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!isRecord(value)) return;

      addCandidate(value.musicTwoRowItemRenderer);
      addCandidate(value.musicResponsiveListItemRenderer);
      Object.values(value).forEach(visit);
    };

    visit(root);
    return result;
  };

  const endpointFrom = (value: unknown): NavigationEndpoint | null => {
    if (!isRecord(value)) return null;
    if (isRecord(value.watchEndpoint) || isRecord(value.browseEndpoint))
      return value as NavigationEndpoint;
    return null;
  };

  const endpointPageType = (endpoint: NavigationEndpoint | null) =>
    endpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs
      ?.browseEndpointContextMusicConfig?.pageType ?? '';

  const endpointVideoType = (endpoint: NavigationEndpoint | null) =>
    endpoint?.watchEndpoint?.watchEndpointMusicSupportedConfigs
      ?.watchEndpointMusicConfig?.musicVideoType ?? '';

  const deepEndpoint = (root: unknown): NavigationEndpoint | null => {
    let found: NavigationEndpoint | null = null;
    const visit = (value: unknown) => {
      if (found) return;
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!isRecord(value)) return;
      const direct = endpointFrom(value);
      if (direct) {
        found = direct;
        return;
      }
      Object.values(value).forEach(visit);
    };
    visit(root);
    return found;
  };

  const bestThumbnail = (root: unknown) => {
    let best = '';
    let bestArea = -1;
    const visit = (value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!isRecord(value)) return;
      if (Array.isArray(value.thumbnails)) {
        for (const thumbnail of value.thumbnails) {
          if (!isRecord(thumbnail) || typeof thumbnail.url !== 'string') continue;
          const width = typeof thumbnail.width === 'number' ? thumbnail.width : 0;
          const height = typeof thumbnail.height === 'number' ? thumbnail.height : 0;
          const area = width * height;
          if (!best || area >= bestArea) {
            best = thumbnail.url;
            bestArea = area;
          }
        }
      }
      Object.values(value).forEach(visit);
    };
    visit(root);
    return best;
  };

  const searchItemFromCandidate = (
    candidate: UnknownRecord,
  ): SearchResultItem | null => {
    const titleRuns = readRuns(candidate.title);
    const flexGroups = flexRunGroups(candidate);
    const effectiveTitleRuns = titleRuns.length ? titleRuns : (flexGroups[0] ?? []);
    const title =
      textFromRuns(effectiveTitleRuns) ||
      textFromRuns(candidateRuns(candidate));
    if (!title) return null;

    const explicitSubtitle = textFromRuns(readRuns(candidate.subtitle));
    const subtitleGroups = titleRuns.length ? flexGroups : flexGroups.slice(1);
    const subtitle =
      explicitSubtitle ||
      subtitleGroups
        .map(textFromRuns)
        .filter(Boolean)
        .join(' • ');

    const runEndpoint = effectiveTitleRuns
      .map((run) => run.navigationEndpoint ?? null)
      .find(Boolean) ?? null;
    const candidateEndpoint =
      endpointFrom(candidate.navigationEndpoint) ??
      endpointFrom(candidate.onTap) ??
      runEndpoint ??
      deepEndpoint(candidate);

    const playlistData = isRecord(candidate.playlistItemData)
      ? candidate.playlistItemData
      : null;
    const videoId =
      candidateEndpoint?.watchEndpoint?.videoId ??
      (typeof playlistData?.videoId === 'string' ? playlistData.videoId : undefined);
    const browseId = candidateEndpoint?.browseEndpoint?.browseId;
    const pageType = endpointPageType(candidateEndpoint);
    const videoType = endpointVideoType(candidateEndpoint);

    let kind: SearchResultKind | null = null;
    if (pageType === 'MUSIC_PAGE_TYPE_ARTIST') kind = 'artist';
    else if (pageType === 'MUSIC_PAGE_TYPE_ALBUM') kind = 'album';
    else if (pageType === 'MUSIC_PAGE_TYPE_PLAYLIST') kind = 'playlist';
    else if (videoId)
      kind = /OMV|UGC/i.test(videoType) ? 'video' : 'song';
    else if (browseId?.startsWith('UC')) kind = 'artist';
    else if (browseId?.startsWith('VL')) kind = 'playlist';
    if (!kind) return null;

    return {
      kind,
      title,
      subtitle,
      artwork: bestThumbnail(candidate),
      ...(videoId ? { videoId } : {}),
      ...(browseId ? { browseId } : {}),
    };
  };

  const collectSearchCatalog = (root: unknown, query: string): SearchCatalog => {
    let topResult: SearchResultItem | null = null;
    const songs: SearchResultItem[] = [];
    const artists: SearchResultItem[] = [];
    const albums: SearchResultItem[] = [];
    const playlists: SearchResultItem[] = [];
    const videos: SearchResultItem[] = [];
    const seen = new Set<string>();

    const add = (candidate: unknown, top = false) => {
      if (!isRecord(candidate)) return;
      const item = searchItemFromCandidate(candidate);
      if (!item) return;
      const key = `${item.kind}:${item.videoId ?? item.browseId ?? item.title}`;
      if (top) {
        topResult ??= item;
        return;
      }
      if (seen.has(key)) return;
      seen.add(key);
      if (item.kind === 'song') songs.push(item);
      else if (item.kind === 'artist') artists.push(item);
      else if (item.kind === 'album') albums.push(item);
      else if (item.kind === 'playlist') playlists.push(item);
      else videos.push(item);
    };

    const visit = (value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!isRecord(value)) return;
      add(value.musicCardShelfRenderer, true);
      add(value.musicResponsiveListItemRenderer);
      add(value.musicTwoRowItemRenderer);
      Object.values(value).forEach(visit);
    };
    visit(root);

    return { query, topResult, songs, artists, albums, playlists, videos };
  };

  type StatefulElement = HTMLElement & {
    likeStatus?: string;
    repeatMode?: number | string;
  };

  const nativeBar = () =>
    document.querySelector<HTMLElement>('ytmusic-player-bar');
  const media = () => document.querySelector<HTMLVideoElement>('video');
  const playerApi = () =>
    document.querySelector<HTMLElement & MusicPlayer>('#movie_player');

  const nativeElement = (...selectors: string[]) => {
    const bar = nativeBar();
    for (const selector of selectors) {
      const target = bar?.querySelector<HTMLElement>(selector);
      if (target) return target;
    }
    return null;
  };

  const nativeClick = (...selectors: string[]) => {
    const target = nativeElement(...selectors);
    if (!target) return false;
    target.click();
    return true;
  };

  const readPressed = (target: HTMLElement | null): boolean | null => {
    if (!target) return null;
    for (const element of [
      target,
      target.closest<HTMLElement>('[aria-pressed], [aria-checked]'),
    ]) {
      if (!element) continue;
      const pressed = element.getAttribute('aria-pressed');
      if (pressed === 'true') return true;
      if (pressed === 'false') return false;
      const checked = element.getAttribute('aria-checked');
      if (checked === 'true') return true;
      if (checked === 'false') return false;
    }
    return null;
  };

  const getLikeButton = () => {
    const renderer = nativeBar()?.querySelector<HTMLElement>(
      'ytmusic-like-button-renderer',
    );
    return (
      renderer?.querySelector<HTMLElement>('#button-shape-like button') ??
      renderer?.querySelector<HTMLElement>('#like-button button') ??
      renderer?.querySelector<HTMLElement>('button') ??
      renderer?.querySelector<HTMLElement>('tp-yt-paper-icon-button') ??
      null
    );
  };

  const readLikeState = (): boolean | null => {
    const renderer = nativeBar()?.querySelector<StatefulElement>(
      'ytmusic-like-button-renderer',
    );
    const raw = String(
      renderer?.likeStatus ??
        renderer?.getAttribute('like-status') ??
        renderer?.getAttribute('likestatus') ??
        '',
    ).toUpperCase();

    if (raw === 'LIKE') return true;
    if (raw.includes('INDIFFERENT') || raw.includes('DISLIKE')) return false;
    return readPressed(getLikeButton());
  };

  const tabHeader = (index: number) =>
    document.querySelector<HTMLElement>(
      `#tabsContent > .tab-header:nth-of-type(${index})`,
    );
  const queueTab = () => tabHeader(1);
  const lyricsTab = () => tabHeader(2);
  const defaultPlayerTab = () => tabHeader(1);
  const lyricsRenderer = () =>
    document.querySelector<HTMLElement>(
      '#tab-renderer[page-type="MUSIC_PAGE_TYPE_TRACK_LYRICS"]',
    );
  const isNowPlayingRoute = () => window.location.pathname === '/watch';
  const lyricsActuallyActive = () =>
    Boolean(
      isNowPlayingRoute() &&
        lyricsRenderer() &&
        lyricsTab()?.getAttribute('aria-selected') === 'true',
    );

  let disposed = false;
  let timer: number | undefined;
  let lastNonZeroVolume = 100;
  let sourceKey = '';
  let generation = 0;
  let lyricsRequest = 0;
  let resolvedArtists: ArtistEntry[] = [];
  const listeners = new Set<(state: MusicState) => void>();
  let state: MusicState = {
    track: { id: '', title: '', byline: '', artwork: '', artists: [] },
    playing: false,
    time: 0,
    duration: 0,
    volume: 100,
    muted: false,
    liked: null,
    shuffle: null,
    repeat: null,
    queue: [],
    queueActive: false,
    lyricsAvailable: false,
    lyricsActive: false,
  };
  const finite = (value: number | undefined, fallback = 0) =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.max(0, value)
      : fallback;
  const emit = (next: MusicState) => {
    if (disposed || JSON.stringify(next) === JSON.stringify(state)) return;
    state = next;
    for (const listener of listeners) listener(state);
  };
  const readRepeat = (value: unknown): RepeatMode | null => {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const raw = String(value).toLowerCase();
    if (raw === '0' || raw.includes('none') || raw.includes('off')) return 0;
    if (raw === '2' || raw.includes('one')) return 2;
    if (raw === '1' || raw.includes('all')) return 1;
    return null;
  };
  const refresh = () => {
    if (disposed) return;
    const api = playerApi();
    const video = media();
    const data = api?.getVideoData?.();
    const bar = nativeBar();
    const title = currentTrackTitle();
    const id = data?.video_id ?? '';
    const baseArtists = currentArtists();
    const key = JSON.stringify([id, title, baseArtists]);
    if (key !== sourceKey) {
      sourceKey = key;
      const requestGeneration = ++generation;
      resolvedArtists = baseArtists;
      const known = new Set(
        baseArtists.map(({ name }) => normalizeArtistName(name)),
      );
      const missing = featuredArtistNames(title).filter(
        (name) => !known.has(normalizeArtistName(name)),
      );
      if (missing.length)
        Promise.all(missing.map(resolveArtist)).then((artists) => {
          if (disposed || requestGeneration !== generation) return;
          const seen = new Set(baseArtists.map((artist) => artist.browseId));
          resolvedArtists = [...baseArtists];
          for (const artist of artists) {
            if (!artist || seen.has(artist.browseId)) continue;
            seen.add(artist.browseId);
            resolvedArtists.push(artist);
          }
          refresh();
        });
    }
    const store = document
      .querySelector<QueueElement>('#queue')
      ?.queue?.store?.store?.getState?.();
    const queue = (store?.queue?.items ?? []).flatMap((item) => {
      const row =
        item.playlistPanelVideoRenderer ??
        item.playlistPanelVideoWrapperRenderer?.primaryRenderer
          ?.playlistPanelVideoRenderer;
      return row
        ? [
            {
              id: row.videoId,
              title: row.title?.runs?.map((run) => run.text).join('') ?? '',
              selected: row.selected,
            },
          ]
        : [];
    });
    const volume = Math.min(
      100,
      finite(api?.getVolume?.() ?? (video ? video.volume * 100 : 100), 100),
    );
    if (volume > 0) lastNonZeroVolume = volume;
    const nativeRepeat = nativeElement(
      '#repeat-button',
      '.repeat',
    ) as StatefulElement | null;
    const likeStatus = store?.likeStatus?.videos?.[id];
    emit({
      track: {
        id,
        title,
        byline:
          data?.author ??
          bar?.querySelector('.byline')?.textContent?.trim() ??
          '',
        artwork:
          bar?.querySelector<HTMLImageElement>(
            '.thumbnail-image-wrapper img, yt-img-shadow img, img',
          )?.src ?? '',
        artists: resolvedArtists,
      },
      playing: api?.getPlayerState
        ? api.getPlayerState() === 1
        : Boolean(video && !video.paused),
      time: finite(api?.getCurrentTime?.() ?? video?.currentTime),
      duration: finite(api?.getDuration?.() ?? video?.duration),
      volume,
      muted: api?.isMuted?.() ?? video?.muted ?? false,
      liked: likeStatus ? String(likeStatus) === 'LIKE' : readLikeState(),
      shuffle:
        store?.queue?.shuffleEnabled ??
        readPressed(nativeElement('#shuffle-button', '.shuffle')),
      repeat: readRepeat(
        store?.queue?.repeatMode ??
          nativeRepeat?.repeatMode ??
          nativeRepeat?.getAttribute('repeat-mode'),
      ),
      queue,
      queueActive: queueTab()?.getAttribute('aria-selected') === 'true',
      lyricsAvailable: Boolean(id),
      lyricsActive: lyricsActuallyActive(),
    });
  };
  const navigate = (destination: string) => {
    if (disposed) return false;
    const routes: Record<string, string> = {
      FEmusic_home: '/',
      FEmusic_library_landing: '/library',
      FEmusic_liked_playlists: '/library/playlists',
      FEmusic_liked_videos: '/library/songs',
      FEmusic_liked_albums: '/library/albums',
      FEmusic_library_corpus_track_artists: '/library/artists',
    };
    const url = new URL(
      routes[destination] ?? destination,
      window.location.origin,
    );
    if (url.origin !== window.location.origin) return false;
    const musicApp = app();
    if (typeof musicApp?.navigate !== 'function') return false;
    musicApp.navigate(url.pathname + url.search);
    return true;
  };
  const setVolume = (value: number) => {
    if (disposed || !Number.isFinite(value)) return;
    const clamped = Math.max(0, Math.min(100, Math.round(value)));
    const api = playerApi();
    if (api) {
      if (clamped === 0) api.mute();
      else {
        api.setVolume(clamped);
        api.unMute();
      }
    } else {
      const video = media();
      if (video) {
        video.volume = clamped / 100;
        video.muted = clamped === 0;
      }
    }
    if (clamped > 0) lastNonZeroVolume = clamped;
    refresh();
  };
  const requireApp = () => {
    const musicApp = app();
    if (disposed || !musicApp?.networkManager?.fetch)
      throw new Error('YouTube Music is not ready');
    return musicApp;
  };
  return {
    getState: () => state,
    refresh,
    async attachPlayer(api: MusicPlayer) {
      if (disposed) return;
      refresh();
      await lyricsBridge?.attach(api);
    },
    start() {
      if (disposed || timer !== undefined) return;
      refresh();
      timer = window.setInterval(refresh, 100);
    },
    subscribe(listener: (state: MusicState) => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      ++generation;
      ++lyricsRequest;
      window.clearInterval(timer);
      timer = undefined;
      listeners.clear();
      artistSearchCache.clear();
      lyricsBridge?.stop();
    },
    navigate,
    navigateSection(section: MusicSection) {
      return navigate(sectionBrowseIds[section]);
    },
    search(query: string) {
      const value = query.trim();
      if (!value) return false;
      if (submitNativeSearch(value)) return true;
      return navigate('/search?q=' + encodeURIComponent(value));
    },
    async searchCatalog(query: string): Promise<SearchCatalog> {
      const value = query.trim();
      if (!value)
        return {
          query: '',
          topResult: null,
          songs: [],
          artists: [],
          albums: [],
          playlists: [],
          videos: [],
        };
      const response = await requireApp().networkManager.fetch<
        unknown,
        { query: string; suggestStats?: unknown }
      >('/search', {
        query: value,
        suggestStats: nativeSearchBox()?.getSearchboxStats?.(),
      });
      return collectSearchCatalog(response, value);
    },
    openSearchResult(item: SearchResultItem) {
      if (item.videoId)
        return navigate('/watch?v=' + encodeURIComponent(item.videoId));
      if (!item.browseId) return false;
      if (item.kind === 'artist' || item.browseId.startsWith('UC'))
        return navigate(
          (item.browseId.startsWith('UC') ? '/channel/' : '/browse/') +
            encodeURIComponent(item.browseId),
        );
      if (item.kind === 'playlist') {
        const playlistId = item.browseId.startsWith('VL')
          ? item.browseId.slice(2)
          : item.browseId;
        return navigate('/playlist?list=' + encodeURIComponent(playlistId));
      }
      return navigate('/browse/' + encodeURIComponent(item.browseId));
    },
    navigateArtist(browseId: string) {
      return navigate(
        (browseId.startsWith('UC') ? '/channel/' : '/browse/') +
          encodeURIComponent(browseId),
      );
    },
    history(direction: 'back' | 'forward') {
      if (!disposed) window.history[direction]();
    },
    togglePlayback() {
      if (disposed) return;
      const api = playerApi();
      const video = media();
      if (api) {
        if (api.getPlayerState() === 1) api.pauseVideo();
        else api.playVideo();
      } else if (video) {
        if (video.paused) video.play().catch(() => refresh());
        else video.pause();
      }
      refresh();
    },
    previous() {
      if (!disposed) {
        const api = playerApi();
        if (api) api.previousVideo();
        else nativeClick('#previous-button', '.previous-button');
      }
    },
    next() {
      if (!disposed) {
        const api = playerApi();
        if (api) api.nextVideo();
        else nativeClick('#next-button', '.next-button');
      }
    },
    seek(seconds: number) {
      if (disposed || !Number.isFinite(seconds)) return;
      refresh();
      if (state.duration <= 0) return;
      const time = Math.max(0, Math.min(state.duration, seconds));
      const api = playerApi();
      const video = media();
      if (api) api.seekTo(time);
      else if (video) video.currentTime = time;
      refresh();
    },
    setVolume,
    toggleMute() {
      refresh();
      setVolume(state.muted || state.volume === 0 ? lastNonZeroVolume : 0);
    },
    toggleLike() {
      if (!disposed) {
        getLikeButton()?.click();
        refresh();
      }
    },
    toggleShuffle() {
      if (!disposed) {
        nativeClick('#shuffle-button', '.shuffle');
        refresh();
      }
    },
    cycleRepeat() {
      if (!disposed) {
        nativeClick('#repeat-button', '.repeat');
        refresh();
      }
    },
    openQueue() {
      if (!disposed) {
        ++lyricsRequest;
        queueTab()?.click();
        refresh();
      }
    },
    toggleLyrics() {
      if (disposed || !state.track.id) return;
      refresh();
      if (state.lyricsActive) {
        ++lyricsRequest;
        defaultPlayerTab()?.click();
        refresh();
        return;
      }

      const request = ++lyricsRequest;
      if (!isNowPlayingRoute() || !lyricsRenderer())
        nativeClick('.thumbnail-image-wrapper', '#thumbnail', '.thumbnail');

      const selectLyrics = (attempt = 0) => {
        if (disposed || request !== lyricsRequest) return;
        const tab = lyricsTab();
        if (tab) {
          tab.removeAttribute('disabled');
          tab.removeAttribute('aria-disabled');
          tab.click();
          refresh();
          if (lyricsActuallyActive()) return;
        }
        if (attempt < 30)
          window.setTimeout(() => selectLyrics(attempt + 1), 50);
      };
      window.setTimeout(selectLyrics, 0);
    },
    openNowPlaying() {
      if (!disposed)
        nativeClick('.thumbnail-image-wrapper', '#thumbnail', '.thumbnail');
    },
    handleTrackClick(event: MouseEvent) {
      if (disposed || !(event.target instanceof Element)) return;
      const target = event.target;
      const row = target.closest<HTMLElement>(
        'ytmusic-responsive-list-item-renderer, ytmusic-player-queue-item',
      );
      if (!row) return;
      const interactive = target.closest(
        'a, button, input, textarea, select, [role="button"], tp-yt-paper-icon-button, yt-icon-button, ytmusic-play-button-renderer, ytmusic-menu-renderer, ytmusic-like-button-renderer',
      );
      if (interactive && row.contains(interactive)) return;
      const play =
        row.querySelector<HTMLElement>('ytmusic-play-button-renderer button') ??
        row.querySelector<HTMLElement>('ytmusic-play-button-renderer') ??
        row.querySelector<HTMLElement>('[data-id="play-button"]');
      const link = row.querySelector<HTMLAnchorElement>('a[href*="/watch"]');
      if (!play && !link) return;
      event.preventDefault();
      event.stopPropagation();
      if (play) play.click();
      else if (link) navigate(link.href);
    },
    async getPlaylists() {
      const response = await requireApp().networkManager.fetch<
        unknown,
        { browseId: string }
      >('/browse', { browseId: 'FEmusic_liked_playlists' });
      return collectPlaylists(response);
    },
    async addToPlaylist(playlistId: string, videoId: string) {
      if (!playlistId || !videoId)
        throw new Error('A playlist and track are required');
      const response = await requireApp().networkManager.fetch<
        unknown,
        {
          playlistId: string;
          actions: { action: string; addedVideoId: string }[];
        }
      >('/playlist/edit', {
        playlistId,
        actions: [{ action: 'ACTION_ADD_VIDEO', addedVideoId: videoId }],
      });
      if (
        isRecord(response) &&
        (response.error ||
          (typeof response.status === 'string' &&
            response.status !== 'STATUS_SUCCEEDED'))
      )
        throw new Error('Playlist edit failed');
    },
  };
};
export type YouTubeMusicAdapter = ReturnType<typeof createYouTubeMusicAdapter>;
