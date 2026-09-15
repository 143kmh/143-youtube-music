import type { SearchResultItem } from './youtube-music';
import type {
  AlbumCatalog,
  CatalogYouTubeMusicAdapter,
} from './youtube-music-catalog';

const ROOT_ID = 'ui143-album-page';

type AlbumRef = Readonly<{
  title: string;
  browseId: string;
}>;

type OpenOptions = Readonly<{
  restoreSearch?: boolean;
  restoreArtist?: boolean;
}>;

export type AlbumPageController = ReturnType<typeof mountAlbumPage>;

export const mountAlbumPage = (engine: CatalogYouTubeMusicAdapter) => {
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

  const setVisible = (visible: boolean) => {
    root.hidden = !visible;
    document.documentElement.classList.toggle('ui143-album-open', visible);
  };

  const syncNowPlaying = () => {
    for (const row of root.querySelectorAll<HTMLButtonElement>(
      'button[data-video-id]',
    )) {
      const active = Boolean(
        currentTrackId && row.dataset.videoId === currentTrackId,
      );
      row.classList.toggle('is-now-playing', active);
      if (active) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
    }
  };

  const unsubscribe = engine.subscribe((state) => {
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

  const playTrack = (item: SearchResultItem) => {
    if (item.kind !== 'song' || !item.videoId) return;
    engine.openSearchResult(item);
  };

  const renderHero = (catalog: AlbumCatalog) => {
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
    label.textContent = 'Album';
    const title = document.createElement('h1');
    title.textContent = catalog.title;

    const meta = document.createElement('div');
    meta.className = 'ui143-album-meta';
    const artistNames = catalog.artists.map((artist) => artist.name).filter(Boolean);
    for (const value of [artistNames.join(', '), catalog.year]) {
      if (!value) continue;
      const span = document.createElement('span');
      span.textContent = value;
      meta.append(span);
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
      const first = catalog.tracks[0];
      if (first) playTrack(first);
    });

    const shuffle = document.createElement('button');
    shuffle.type = 'button';
    shuffle.className = 'ui143-album-secondary-action';
    shuffle.textContent = 'Shuffle';
    shuffle.disabled = catalog.tracks.length === 0;
    shuffle.addEventListener('click', () => {
      if (!catalog.tracks.length) return;
      const item = catalog.tracks[Math.floor(Math.random() * catalog.tracks.length)];
      if (item) playTrack(item);
    });

    actions.append(play, shuffle);
    copy.append(label, title, meta, actions);
    hero.append(artwork, copy);
    return hero;
  };

  const renderTracks = (tracks: readonly SearchResultItem[]) => {
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
      row.addEventListener('click', () => playTrack(item));

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

  const render = (catalog: AlbumCatalog) => {
    content.replaceChildren(renderHero(catalog));
    if (catalog.tracks.length) content.append(renderTracks(catalog.tracks));
    else message('No tracks found', 'YouTube Music did not return an album track list.');
    syncNowPlaying();
  };

  const openInternal = async (album: AlbumRef, options: OpenOptions = {}) => {
    if (!album.browseId) return;
    restoreSearch = options.restoreSearch === true;
    restoreArtist = options.restoreArtist === true;
    const currentRequest = ++request;
    setVisible(true);
    message('Loading album…');

    try {
      const catalog = await engine.getAlbumCatalog(album.browseId, album.title);
      if (currentRequest !== request) return;
      render(catalog);
    } catch (error) {
      if (currentRequest !== request) return;
      console.error('[143 Music] Album page failed', error);
      message('Album unavailable', 'YouTube Music did not return album data.');
    }
  };

  return {
    open(title: string, browseId: string, options: OpenOptions = {}) {
      return openInternal({ title, browseId }, options);
    },
    back() {
      if (root.hidden) return false;
      ++request;
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
