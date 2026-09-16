import {
  getAlbumLibraryState,
  setAlbumLibraryState,
} from './library-favorites';

import type { AlbumLibraryState } from './library-favorites';
import type { SearchResultItem } from './youtube-music';
import type { AlbumCatalog } from './youtube-music-catalog';
import type {
  PlaybackContextAdapter,
  PlaybackContextSource,
} from './playback-context';
import type { PlaylistCatalog } from './youtube-music-playlist';

const ROOT_ID = 'ui143-album-page';

type PageKind = 'album' | 'playlist';

type PageRef = Readonly<{
  kind: PageKind;
  title: string;
  browseId: string;
}>;

type OpenOptions = Readonly<{
  restoreSearch?: boolean;
  restoreArtist?: boolean;
}>;

type PageCatalog = AlbumCatalog | PlaylistCatalog;

export type AlbumPageController = ReturnType<typeof mountAlbumPage>;

export const mountAlbumPage = (engine: PlaybackContextAdapter) => {
  document.getElementById(ROOT_ID)?.remove();

  const root = document.createElement('main');
  root.id = ROOT_ID;
  root.hidden = true;
  root.setAttribute('aria-live', 'polite');

  const content = document.createElement('div');
  content.className = 'ui143-album-page-content';
  root.append(content);
  document.body.append(root);

  let request = 0;
  let restoreSearch = false;
  let restoreArtist = false;
  let currentTrackId = engine.getState().track.id;
  let currentPage: PageRef | null = null;

  const setVisible = (visible: boolean) => {
    root.hidden = !visible;
    if (visible) syncNowPlaying();
    document.documentElement.classList.toggle('ui143-album-open', visible);
  };

  const syncNowPlaying = () => {
    if (root.hidden) return;
    for (const row of root.querySelectorAll<HTMLButtonElement>(
      'button[data-video-id]',
    )) {
      const active = Boolean(
        currentTrackId && row.dataset.videoId === currentTrackId,
      );
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
    content.replaceChildren();
    const state = document.createElement('div');
    state.className = 'ui143-album-message';
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

  const sourceFor = (page: PageRef): PlaybackContextSource => ({
    kind: page.kind,
    title: page.title,
    browseId: page.browseId,
  });

  const playTrack = (
    tracks: readonly SearchResultItem[],
    index: number,
    page: PageRef,
  ) => engine.playContext(tracks, index, sourceFor(page));

  const albumLibraryButton = (page: PageRef) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ui143-album-secondary-action ui143-album-library-action';
    button.textContent = 'Add to library';
    button.disabled = true;
    button.hidden = page.kind !== 'album';
    if (page.kind !== 'album') return button;

    let state: AlbumLibraryState | null = null;
    let busy = false;
    const pageId = page.browseId;

    const renderState = () => {
      if (!state) {
        button.textContent = 'Add to library';
        button.disabled = true;
        button.classList.remove('is-saved');
        return;
      }
      button.textContent = state.saved ? '✓ In library' : '+ Add to library';
      button.disabled = busy;
      button.classList.toggle('is-saved', state.saved);
      button.setAttribute('aria-pressed', String(state.saved));
    };

    void getAlbumLibraryState(page.browseId)
      .then((next) => {
        if (currentPage?.browseId !== pageId) return;
        state = next;
        renderState();
      })
      .catch((error) => {
        console.warn('[143 Music] Could not read album library state', error);
        if (currentPage?.browseId !== pageId) return;
        button.textContent = '+ Add to library';
        button.disabled = false;
      });

    button.addEventListener('click', async () => {
      if (busy) return;
      try {
        if (!state) state = await getAlbumLibraryState(page.browseId);
        if (currentPage?.browseId !== pageId) return;
        busy = true;
        renderState();
        const desired = !state.saved;
        await setAlbumLibraryState(state, desired);
        if (currentPage?.browseId !== pageId) return;
        state = { ...state, saved: desired };
      } catch (error) {
        console.error('[143 Music] Could not update album library state', error);
      } finally {
        busy = false;
        if (currentPage?.browseId === pageId) renderState();
      }
    });

    return button;
  };

  const renderHero = (catalog: PageCatalog, page: PageRef) => {
    const hero = document.createElement('section');
    hero.className = 'ui143-album-hero';

    const artwork = document.createElement('div');
    artwork.className = 'ui143-album-artwork';
    if (catalog.artwork) {
      const image = document.createElement('img');
      image.src = catalog.artwork;
      image.alt = '';
      artwork.append(image);
    } else {
      const fallback = document.createElement('span');
      fallback.textContent = '♪';
      artwork.append(fallback);
    }

    const copy = document.createElement('div');
    copy.className = 'ui143-album-copy';
    const label = document.createElement('span');
    label.className = 'ui143-album-label';
    label.textContent = page.kind === 'playlist' ? 'Playlist' : 'Album';
    const title = document.createElement('h1');
    title.textContent = catalog.title || page.title;

    const meta = document.createElement('div');
    meta.className = 'ui143-album-meta';
    if (page.kind === 'album') {
      const album = catalog as AlbumCatalog;
      const artistNames = album.artists.map((artist) => artist.name).filter(Boolean);
      for (const value of [artistNames.join(', '), album.year]) {
        if (!value) continue;
        const span = document.createElement('span');
        span.textContent = value;
        meta.append(span);
      }
    } else {
      const playlist = catalog as PlaylistCatalog;
      for (const value of [playlist.subtitle, `${playlist.tracks.length} tracks`]) {
        if (!value) continue;
        const span = document.createElement('span');
        span.textContent = value;
        meta.append(span);
      }
    }
    if (!meta.childElementCount && catalog.subtitle) {
      const span = document.createElement('span');
      span.textContent = catalog.subtitle;
      meta.append(span);
    }

    const actions = document.createElement('div');
    actions.className = 'ui143-album-actions';
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'ui143-album-primary-action';
    play.textContent = 'Play';
    play.disabled = catalog.tracks.length === 0;
    play.addEventListener('click', () => {
      if (!catalog.tracks.length) return;
      engine.playContext(catalog.tracks, 0, sourceFor(page));
    });

    const shuffle = document.createElement('button');
    shuffle.type = 'button';
    shuffle.className = 'ui143-album-secondary-action';
    shuffle.textContent = 'Shuffle';
    shuffle.disabled = catalog.tracks.length === 0;
    shuffle.addEventListener('click', () => {
      if (!catalog.tracks.length) return;
      const index = Math.floor(Math.random() * catalog.tracks.length);
      engine.playContext(catalog.tracks, index, sourceFor(page), { shuffle: true });
    });

    actions.append(play, shuffle, albumLibraryButton(page));
    copy.append(label, title, meta, actions);
    hero.append(artwork, copy);
    return hero;
  };

  const renderTracks = (
    tracks: readonly SearchResultItem[],
    page: PageRef,
  ) => {
    const section = document.createElement('section');
    section.className = 'ui143-album-tracks';
    const heading = document.createElement('div');
    heading.className = 'ui143-album-track-header';
    const number = document.createElement('span');
    number.textContent = '#';
    const title = document.createElement('span');
    title.textContent = 'Title';
    heading.append(number, title);

    const list = document.createElement('div');
    list.className = 'ui143-album-track-list';
    for (const [index, item] of tracks.entries()) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ui143-album-track';
      if (item.videoId) row.dataset.videoId = item.videoId;
      row.dataset.trackTitle = item.title;
      row.dataset.trackSubtitle = item.subtitle;
      row.addEventListener('click', () => playTrack(tracks, index, page));

      const trackNumber = document.createElement('span');
      trackNumber.className = 'ui143-album-track-number';
      trackNumber.textContent = String(index + 1);
      const copy = document.createElement('div');
      copy.className = 'ui143-album-track-copy';
      const name = document.createElement('strong');
      name.textContent = item.title;
      const subtitle = document.createElement('span');
      subtitle.textContent = item.subtitle;
      copy.append(name, subtitle);
      const nowPlaying = document.createElement('span');
      nowPlaying.className = 'ui143-album-now-playing';
      nowPlaying.textContent = 'Now playing';
      row.append(trackNumber, copy, nowPlaying);
      list.append(row);
    }

    section.append(heading, list);
    return section;
  };

  const render = (catalog: PageCatalog, page: PageRef) => {
    content.replaceChildren(renderHero(catalog, page));
    if (catalog.tracks.length) content.append(renderTracks(catalog.tracks, page));
    else
      message(
        'No tracks found',
        `YouTube Music did not return a ${page.kind} track list.`,
      );
    syncNowPlaying();
  };

  const openInternal = async (page: PageRef, options: OpenOptions = {}) => {
    if (!page.browseId) return;
    restoreSearch = options.restoreSearch === true;
    restoreArtist = options.restoreArtist === true;
    currentPage = page;
    const currentRequest = ++request;
    setVisible(true);
    message(page.kind === 'playlist' ? 'Loading playlist…' : 'Loading album…');

    try {
      const catalog =
        page.kind === 'playlist'
          ? await engine.getPlaylistCatalog(page.browseId, page.title)
          : await engine.getAlbumCatalog(page.browseId, page.title);
      if (currentRequest !== request || currentPage?.browseId !== page.browseId) return;
      render(catalog, page);
    } catch (error) {
      if (currentRequest !== request) return;
      console.error(`[143 Music] ${page.kind} page failed`, error);
      message(
        page.kind === 'playlist' ? 'Playlist unavailable' : 'Album unavailable',
        `YouTube Music did not return ${page.kind} data.`,
      );
    }
  };

  return {
    open(title: string, browseId: string, options: OpenOptions = {}) {
      return openInternal({ kind: 'album', title, browseId }, options);
    },
    openPlaylist(title: string, browseId: string, options: OpenOptions = {}) {
      return openInternal({ kind: 'playlist', title, browseId }, options);
    },
    back() {
      if (root.hidden) return false;
      ++request;
      currentPage = null;
      setVisible(false);
      if (restoreArtist) {
        restoreArtist = false;
        restoreSearch = false;
        return 'artist' as const;
      }
      if (restoreSearch) {
        restoreSearch = false;
        return 'search' as const;
      }
      return true;
    },
    close() {
      ++request;
      currentPage = null;
      restoreSearch = false;
      restoreArtist = false;
      setVisible(false);
    },
    isOpen: () => !root.hidden,
    dispose() {
      ++request;
      unsubscribe();
      document.documentElement.classList.remove('ui143-album-open');
      root.remove();
    },
  };
};
