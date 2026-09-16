import libraryPageStyle from './library-page.css?inline';

import type { PlaybackContextAdapter } from './playback-context';
import type { SearchResultItem } from './youtube-music';
import type { MusicPlayerAppElement } from '@/types/music-player-app-element';

type UnknownRecord = Record<string, unknown>;
type LibraryMode = 'landing' | 'playlists' | 'songs' | 'playlist-detail';
type LibraryBrowseMode = Exclude<LibraryMode, 'playlist-detail'>;

type NavigationEndpoint = {
  watchEndpoint?: { videoId?: string };
  browseEndpoint?: {
    browseId?: string;
    browseEndpointContextSupportedConfigs?: {
      browseEndpointContextMusicConfig?: { pageType?: string };
    };
  };
};

type TextRun = {
  text?: string;
  navigationEndpoint?: NavigationEndpoint;
};

type LibraryPlaylist = Readonly<{
  title: string;
  subtitle: string;
  artwork: string;
  browseId: string;
}>;

const ROOT_ID = 'ui143-library-page';
const LIKED_BROWSE_ID = 'VLLM';
const PLAYLISTS_BROWSE_ID = 'FEmusic_liked_playlists';

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readRuns = (value: unknown): TextRun[] =>
  isRecord(value) && Array.isArray(value.runs)
    ? (value.runs.filter(isRecord) as TextRun[])
    : [];

const textFromRuns = (runs: readonly TextRun[]) =>
  runs
    .map((run) => run.text ?? '')
    .join('')
    .replaceAll(/\s+/g, ' ')
    .trim();

const textFromValue = (value: unknown): string => {
  if (typeof value === 'string') return value.replaceAll(/\s+/g, ' ').trim();
  if (!isRecord(value)) return '';
  if (typeof value.simpleText === 'string')
    return value.simpleText.replaceAll(/\s+/g, ' ').trim();
  return textFromRuns(readRuns(value));
};

const endpointFrom = (value: unknown): NavigationEndpoint | null => {
  if (!isRecord(value)) return null;
  if (isRecord(value.watchEndpoint) || isRecord(value.browseEndpoint))
    return value as NavigationEndpoint;
  return null;
};

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

const flexGroups = (candidate: UnknownRecord) => {
  const groups: TextRun[][] = [];
  if (!Array.isArray(candidate.flexColumns)) return groups;
  for (const column of candidate.flexColumns) {
    if (!isRecord(column)) continue;
    const renderer = column.musicResponsiveListItemFlexColumnRenderer;
    if (!isRecord(renderer)) continue;
    const runs = readRuns(renderer.text);
    if (runs.length) groups.push(runs);
  }
  return groups;
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
      for (const raw of value.thumbnails) {
        if (!isRecord(raw) || typeof raw.url !== 'string') continue;
        const width = typeof raw.width === 'number' ? raw.width : 0;
        const height = typeof raw.height === 'number' ? raw.height : 0;
        const area = width * height;
        if (!best || area >= bestArea) {
          best = raw.url;
          bestArea = area;
        }
      }
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return best;
};

const isEpisodeLike = (title: string, subtitle: string) =>
  /\b(?:podcast|episode|interview)\b/iu.test(`${title} ${subtitle}`) ||
  /(?:^|[\s•·—–-])(?:подкаст|эпизод|епізод|выпуск|випуск|интервью)(?=$|[\s•·—–-])/iu.test(
    `${title} ${subtitle}`,
  );

const trackFromCandidate = (candidate: UnknownRecord): SearchResultItem | null => {
  const titleRuns = readRuns(candidate.title);
  const groups = flexGroups(candidate);
  const title =
    textFromRuns(titleRuns.length ? titleRuns : (groups[0] ?? [])) ||
    textFromValue(candidate.title);
  if (!title) return null;
  const subtitle =
    textFromValue(candidate.subtitle) ||
    (titleRuns.length ? groups : groups.slice(1))
      .map(textFromRuns)
      .filter(Boolean)
      .join(' • ');
  if (isEpisodeLike(title, subtitle)) return null;

  const endpoint =
    endpointFrom(candidate.navigationEndpoint) ??
    endpointFrom(candidate.onTap) ??
    deepEndpoint(candidate);
  const playlistData = isRecord(candidate.playlistItemData)
    ? candidate.playlistItemData
    : null;
  const videoId =
    (typeof candidate.videoId === 'string' ? candidate.videoId : '') ||
    endpoint?.watchEndpoint?.videoId ||
    (typeof playlistData?.videoId === 'string' ? playlistData.videoId : '');
  if (!videoId) return null;

  return {
    kind: 'song',
    title,
    subtitle,
    artwork: bestThumbnail(candidate),
    videoId,
  };
};

const collectTracks = (root: unknown) => {
  const result: SearchResultItem[] = [];
  const seen = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    for (const key of [
      'musicResponsiveListItemRenderer',
      'musicTwoRowItemRenderer',
      'musicMultiRowListItemRenderer',
    ]) {
      const candidate = value[key];
      if (!isRecord(candidate)) continue;
      const track = trackFromCandidate(candidate);
      if (track?.videoId && !seen.has(track.videoId)) {
        seen.add(track.videoId);
        result.push(track);
      }
      return;
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return result;
};

const playlistFromCandidate = (candidate: UnknownRecord): LibraryPlaylist | null => {
  const titleRuns = readRuns(candidate.title);
  const groups = flexGroups(candidate);
  const effectiveTitle = titleRuns.length ? titleRuns : (groups[0] ?? []);
  const title = textFromRuns(effectiveTitle) || textFromValue(candidate.title);
  if (!title) return null;

  const endpoint =
    endpointFrom(candidate.navigationEndpoint) ??
    endpointFrom(candidate.onTap) ??
    effectiveTitle.map((run) => run.navigationEndpoint ?? null).find(Boolean) ??
    deepEndpoint(candidate);
  const browseId = endpoint?.browseEndpoint?.browseId ?? '';
  const pageType =
    endpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs
      ?.browseEndpointContextMusicConfig?.pageType ?? '';
  if (
    !browseId ||
    (pageType !== 'MUSIC_PAGE_TYPE_PLAYLIST' && !browseId.startsWith('VL'))
  )
    return null;

  const subtitle =
    textFromValue(candidate.subtitle) ||
    (titleRuns.length ? groups : groups.slice(1))
      .map(textFromRuns)
      .filter(Boolean)
      .join(' • ');
  return {
    title,
    subtitle,
    artwork: bestThumbnail(candidate),
    browseId,
  };
};

const collectPlaylists = (root: unknown) => {
  const result: LibraryPlaylist[] = [];
  const seen = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    for (const key of [
      'musicTwoRowItemRenderer',
      'musicResponsiveListItemRenderer',
      'musicMultiRowListItemRenderer',
    ]) {
      const candidate = value[key];
      if (!isRecord(candidate)) continue;
      const playlist = playlistFromCandidate(candidate);
      if (playlist && !seen.has(playlist.browseId)) {
        seen.add(playlist.browseId);
        result.push(playlist);
      }
      return;
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return result;
};

const continuationToken = (root: unknown) => {
  let token = '';
  const visit = (value: unknown) => {
    if (token) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;

    const continuationItem = isRecord(value.continuationItemRenderer)
      ? value.continuationItemRenderer
      : null;
    const continuationEndpoint = continuationItem && isRecord(continuationItem.continuationEndpoint)
      ? continuationItem.continuationEndpoint
      : null;
    const command = continuationEndpoint && isRecord(continuationEndpoint.continuationCommand)
      ? continuationEndpoint.continuationCommand
      : null;
    if (typeof command?.token === 'string' && command.token) {
      token = command.token;
      return;
    }

    for (const key of ['nextContinuationData', 'reloadContinuationData']) {
      const data = isRecord(value[key]) ? value[key] : null;
      if (typeof data?.continuation === 'string' && data.continuation) {
        token = data.continuation;
        return;
      }
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return token;
};

export type LibraryPageController = ReturnType<typeof mountLibraryPage>;

export const mountLibraryPage = (engine: PlaybackContextAdapter) => {
  document.getElementById(ROOT_ID)?.remove();
  const sheet = new CSSStyleSheet();
  void sheet.replace(libraryPageStyle);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

  const root = document.createElement('main');
  root.id = ROOT_ID;
  root.hidden = true;
  root.setAttribute('aria-live', 'polite');
  const content = document.createElement('div');
  content.className = 'ui143-library-content';
  root.append(content);
  document.body.append(root);

  let disposed = false;
  let request = 0;
  let mode: LibraryMode = 'landing';
  let filter = '';
  let playlists: LibraryPlaylist[] | null = null;
  let likedSongs: SearchResultItem[] = [];
  let likedLoaded = false;
  let likedContinuation = '';
  let likedLoading = false;
  let observer: IntersectionObserver | null = null;
  let currentTrackId = engine.getState().track.id;

  const app = () => document.querySelector<MusicPlayerAppElement>('ytmusic-app');
  const requireApp = () => {
    const musicApp = app();
    if (!musicApp?.networkManager?.fetch)
      throw new Error('YouTube Music is not ready');
    return musicApp;
  };

  const fetchBrowse = (browseId: string) =>
    requireApp().networkManager.fetch<unknown, { browseId: string }>('/browse', {
      browseId,
    });
  const fetchContinuation = (continuation: string) =>
    requireApp().networkManager.fetch<unknown, { continuation: string }>('/browse', {
      continuation,
    });

  const setVisible = (visible: boolean) => {
    root.hidden = !visible;
    if (visible) syncNowPlaying();
    document.documentElement.classList.toggle('ui143-library-open', visible);
  };

  const syncNowPlaying = () => {
    if (root.hidden) return;
    for (const row of root.querySelectorAll<HTMLElement>('[data-video-id]')) {
      const active = Boolean(currentTrackId && row.dataset.videoId === currentTrackId);
      if (row.classList.contains('is-now-playing') !== active) row.classList.toggle('is-now-playing', active);
      if (active) {
        if (row.getAttribute('aria-current') !== 'true') row.setAttribute('aria-current', 'true');
      } else if (row.hasAttribute('aria-current')) row.removeAttribute('aria-current');
    }
  };

  const unsubscribe = engine.subscribe((state) => {
    if (currentTrackId === state.track.id) return;
    currentTrackId = state.track.id;
    syncNowPlaying();
  });

  const message = (title: string, detail = '') => {
    observer?.disconnect();
    content.replaceChildren();
    const state = document.createElement('div');
    state.className = 'ui143-library-message';
    const heading = document.createElement('strong');
    heading.textContent = title;
    state.append(heading);
    if (detail) {
      const copy = document.createElement('span');
      copy.textContent = detail;
      state.append(copy);
    }
    content.append(state);
  };

  const uniqueTracks = (items: readonly SearchResultItem[]) => {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (!item.videoId || seen.has(item.videoId)) return false;
      seen.add(item.videoId);
      return true;
    });
  };

  const loadPlaylists = async () => {
    if (playlists) return playlists;
    const response = await fetchBrowse(PLAYLISTS_BROWSE_ID);
    playlists = collectPlaylists(response);
    return playlists;
  };

  const loadLikedFirstPage = async () => {
    if (likedLoaded) return;
    likedLoaded = true;
    const response = await fetchBrowse(LIKED_BROWSE_ID);
    likedSongs = uniqueTracks(collectTracks(response));
    likedContinuation = continuationToken(response);
  };

  const loadMoreLiked = async () => {
    if (likedLoading || !likedContinuation || disposed) return;
    likedLoading = true;
    const token = likedContinuation;
    try {
      const response = await fetchContinuation(token);
      if (disposed || token !== likedContinuation) return;
      const known = new Set(likedSongs.map((item) => item.videoId));
      const additions = collectTracks(response).filter(
        (item) => item.videoId && !known.has(item.videoId),
      );
      likedSongs = [...likedSongs, ...additions];
      likedContinuation = continuationToken(response);
      if (mode === 'songs') renderSongsPage();
    } catch (error) {
      console.warn('[143 Music] Could not continue liked songs', error);
    } finally {
      likedLoading = false;
    }
  };

  const matchesFilter = (title: string, subtitle = '') => {
    const key = filter.trim().toLocaleLowerCase();
    return !key || `${title} ${subtitle}`.toLocaleLowerCase().includes(key);
  };

  const header = (title: string, eyebrow = 'Your Library') => {
    const block = document.createElement('header');
    block.className = 'ui143-library-header';
    const copy = document.createElement('div');
    copy.className = 'ui143-library-title-copy';
    const label = document.createElement('span');
    label.textContent = eyebrow;
    const heading = document.createElement('h1');
    heading.textContent = title;
    copy.append(label, heading);

    const actions = document.createElement('div');
    actions.className = 'ui143-library-header-actions';
    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'ui143-library-filter';
    input.placeholder = 'Filter your library';
    input.value = filter;
    input.addEventListener('input', () => {
      filter = input.value;
      if (mode === 'landing') renderLanding();
      else if (mode === 'playlists') renderPlaylistsPage();
      else if (mode === 'songs') renderSongsPage();
    });
    actions.append(input);
    block.append(copy, actions);
    return block;
  };

  const tabs = () => {
    const bar = document.createElement('nav');
    bar.className = 'ui143-library-tabs';
    for (const [label, target] of [
      ['All', 'landing'],
      ['Playlists', 'playlists'],
      ['Liked songs', 'songs'],
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ui143-library-tab';
      button.classList.toggle('is-active', mode === target);
      button.textContent = label;
      button.addEventListener('click', () => void open(target));
      bar.append(button);
    }
    return bar;
  };

  const playlistGrid = (items: readonly LibraryPlaylist[], limit?: number) => {
    const grid = document.createElement('div');
    grid.className = 'ui143-library-playlist-grid';
    const visible = items
      .filter((item) => matchesFilter(item.title, item.subtitle))
      .slice(0, limit ?? items.length);
    for (const playlist of visible) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'ui143-library-playlist';
      const art = document.createElement('div');
      art.className = 'ui143-library-playlist-art';
      if (playlist.artwork) {
        const image = document.createElement('img');
        image.src = playlist.artwork;
        image.alt = '';
        image.loading = 'lazy';
        art.append(image);
      } else art.textContent = '♫';
      const name = document.createElement('strong');
      name.textContent = playlist.title;
      const meta = document.createElement('span');
      meta.textContent = playlist.subtitle || 'Playlist';
      card.append(art, name, meta);
      card.addEventListener('click', () => void openPlaylist(playlist));
      grid.append(card);
    }
    return grid;
  };

  const songList = (items: readonly SearchResultItem[], limit?: number) => {
    const list = document.createElement('div');
    list.className = 'ui143-library-song-list';
    const visible = items
      .filter((item) => matchesFilter(item.title, item.subtitle))
      .slice(0, limit ?? items.length);
    for (const item of visible) {
      const originalIndex = likedSongs.findIndex(
        (candidate) => candidate.videoId === item.videoId,
      );
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ui143-library-song';
      if (item.videoId) row.dataset.videoId = item.videoId;
      const index = document.createElement('span');
      index.className = 'ui143-library-song-index';
      index.textContent = String(Math.max(0, originalIndex) + 1);
      const art = document.createElement('div');
      art.className = 'ui143-library-song-art';
      if (item.artwork) {
        const image = document.createElement('img');
        image.src = item.artwork;
        image.alt = '';
        image.loading = 'lazy';
        art.append(image);
      } else art.textContent = '♪';
      const copy = document.createElement('div');
      copy.className = 'ui143-library-song-copy';
      const name = document.createElement('strong');
      name.textContent = item.title;
      const meta = document.createElement('span');
      meta.textContent = item.subtitle;
      copy.append(name, meta);
      const now = document.createElement('span');
      now.className = 'ui143-library-song-now';
      now.textContent = 'Now playing';
      row.append(index, art, copy, now);
      row.addEventListener('click', () => {
        const playable = likedSongs.filter((candidate) => candidate.videoId);
        const start = playable.findIndex((candidate) => candidate.videoId === item.videoId);
        if (start >= 0)
          engine.playContext(playable, start, {
            kind: 'playlist',
            title: 'Liked songs',
            browseId: LIKED_BROWSE_ID,
          });
      });
      list.append(row);
    }
    return list;
  };

  const section = (
    title: string,
    body: HTMLElement,
    seeAll?: LibraryBrowseMode,
  ) => {
    const block = document.createElement('section');
    block.className = 'ui143-library-section';
    const head = document.createElement('div');
    head.className = 'ui143-library-section-head';
    const heading = document.createElement('h2');
    heading.textContent = title;
    head.append(heading);
    if (seeAll) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'ui143-library-see-all';
      more.textContent = 'See all';
      more.addEventListener('click', () => void open(seeAll));
      head.append(more);
    }
    block.append(head, body);
    return block;
  };

  const renderLanding = () => {
    observer?.disconnect();
    content.replaceChildren(header('Your Library'), tabs());
    if (playlists?.length)
      content.append(section('Playlists', playlistGrid(playlists, 8), 'playlists'));
    if (likedSongs.length)
      content.append(section('Liked songs', songList(likedSongs, 10), 'songs'));
    if (!playlists?.length && !likedSongs.length)
      content.append(section('Library', (() => {
        const empty = document.createElement('div');
        empty.className = 'ui143-library-message';
        empty.textContent = 'Your saved music will appear here.';
        return empty;
      })()));
    syncNowPlaying();
  };

  const renderPlaylistsPage = () => {
    observer?.disconnect();
    content.replaceChildren(header('Playlists'), tabs());
    if (playlists?.length) content.append(playlistGrid(playlists));
    else message('No playlists yet');
  };

  const renderSongsPage = () => {
    observer?.disconnect();
    content.replaceChildren(header('Liked songs'), tabs());
    if (!likedSongs.length) {
      message('No liked songs yet');
      return;
    }
    const actions = document.createElement('div');
    actions.className = 'ui143-library-hero-actions';
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'ui143-library-action';
    play.textContent = 'Play';
    play.addEventListener('click', () => {
      if (likedSongs.length)
        engine.playContext(likedSongs, 0, {
          kind: 'playlist',
          title: 'Liked songs',
          browseId: LIKED_BROWSE_ID,
        });
    });
    const shuffle = document.createElement('button');
    shuffle.type = 'button';
    shuffle.className = 'ui143-library-action secondary';
    shuffle.textContent = 'Shuffle';
    shuffle.addEventListener('click', () => {
      if (!likedSongs.length) return;
      engine.playContext(
        likedSongs,
        Math.floor(Math.random() * likedSongs.length),
        { kind: 'playlist', title: 'Liked songs', browseId: LIKED_BROWSE_ID },
        { shuffle: true },
      );
    });
    actions.append(play, shuffle);
    content.append(actions, songList(likedSongs));

    const sentinel = document.createElement('div');
    sentinel.className = 'ui143-library-sentinel';
    sentinel.textContent = likedContinuation ? 'Loading more as you scroll…' : 'End of liked songs';
    content.append(sentinel);
    if (likedContinuation) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) void loadMoreLiked();
        },
        { root, rootMargin: '420px 0px' },
      );
      observer.observe(sentinel);
    }
    syncNowPlaying();
  };

  const renderPlaylistDetail = (
    playlist: LibraryPlaylist,
    tracks: readonly SearchResultItem[],
  ) => {
    observer?.disconnect();
    content.replaceChildren();
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'ui143-library-back';
    back.textContent = '← Back to playlists';
    back.addEventListener('click', () => void open('playlists'));
    content.append(back, header(playlist.title, 'Playlist'));

    const actions = document.createElement('div');
    actions.className = 'ui143-library-hero-actions';
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'ui143-library-action';
    play.textContent = 'Play';
    play.disabled = tracks.length === 0;
    play.addEventListener('click', () => {
      if (tracks.length)
        engine.playContext(tracks, 0, {
          kind: 'playlist',
          title: playlist.title,
          browseId: playlist.browseId,
        });
    });
    const shuffle = document.createElement('button');
    shuffle.type = 'button';
    shuffle.className = 'ui143-library-action secondary';
    shuffle.textContent = 'Shuffle';
    shuffle.disabled = tracks.length === 0;
    shuffle.addEventListener('click', () => {
      if (!tracks.length) return;
      engine.playContext(
        tracks,
        Math.floor(Math.random() * tracks.length),
        { kind: 'playlist', title: playlist.title, browseId: playlist.browseId },
        { shuffle: true },
      );
    });
    actions.append(play, shuffle);
    content.append(actions);

    const list = document.createElement('div');
    list.className = 'ui143-library-song-list';
    for (const [trackIndex, item] of tracks.entries()) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ui143-library-song';
      if (item.videoId) row.dataset.videoId = item.videoId;
      const index = document.createElement('span');
      index.className = 'ui143-library-song-index';
      index.textContent = String(trackIndex + 1);
      const art = document.createElement('div');
      art.className = 'ui143-library-song-art';
      if (item.artwork) {
        const image = document.createElement('img');
        image.src = item.artwork;
        image.alt = '';
        art.append(image);
      } else art.textContent = '♪';
      const copy = document.createElement('div');
      copy.className = 'ui143-library-song-copy';
      const name = document.createElement('strong');
      name.textContent = item.title;
      const meta = document.createElement('span');
      meta.textContent = item.subtitle;
      copy.append(name, meta);
      const now = document.createElement('span');
      now.className = 'ui143-library-song-now';
      now.textContent = 'Now playing';
      row.append(index, art, copy, now);
      row.addEventListener('click', () =>
        engine.playContext(tracks, trackIndex, {
          kind: 'playlist',
          title: playlist.title,
          browseId: playlist.browseId,
        }),
      );
      list.append(row);
    }
    content.append(list);
    syncNowPlaying();
  };

  const openPlaylist = async (playlist: LibraryPlaylist) => {
    mode = 'playlist-detail';
    filter = '';
    const token = ++request;
    setVisible(true);
    message('Loading playlist…');
    try {
      const catalog = await engine.getPlaylistCatalog(playlist.browseId, playlist.title);
      if (disposed || token !== request) return;
      renderPlaylistDetail(
        { ...playlist, title: catalog.title || playlist.title, artwork: catalog.artwork || playlist.artwork },
        catalog.tracks,
      );
    } catch (error) {
      if (token !== request) return;
      console.error('[143 Music] Library playlist failed', error);
      message('Playlist unavailable', 'YouTube Music did not return this playlist.');
    }
  };

  const open = async (target: LibraryBrowseMode = 'landing') => {
    mode = target;
    filter = '';
    const token = ++request;
    setVisible(true);
    message(target === 'songs' ? 'Loading liked songs…' : 'Loading your library…');
    try {
      if (target === 'playlists') await loadPlaylists();
      else if (target === 'songs') await loadLikedFirstPage();
      else await Promise.all([loadPlaylists(), loadLikedFirstPage()]);
      if (disposed || token !== request) return;
      if (mode === 'landing') renderLanding();
      else if (mode === 'playlists') renderPlaylistsPage();
      else renderSongsPage();
    } catch (error) {
      if (token !== request) return;
      console.error('[143 Music] Library failed', error);
      message('Library unavailable', 'YouTube Music did not return your library.');
    }
  };

  return {
    open,
    close() {
      ++request;
      observer?.disconnect();
      setVisible(false);
    },
    isOpen: () => !root.hidden,
    dispose() {
      disposed = true;
      ++request;
      observer?.disconnect();
      unsubscribe();
      document.documentElement.classList.remove('ui143-library-open');
      root.remove();
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
        (entry) => entry !== sheet,
      );
    },
  };
};