import type { SearchArtistProfile, SearchResultItem } from './youtube-music';
import type { CatalogYouTubeMusicAdapter } from './youtube-music-catalog';

const ROOT_ID = 'ui143-artist-page';

type ArtistRef = Readonly<{
  name: string;
  browseId: string;
}>;

type OpenOptions = Readonly<{
  restoreSearch?: boolean;
  pushHistory?: boolean;
}>;

export type AlbumOpenHandler = (
  title: string,
  browseId: string,
  restoreArtist: boolean,
) => void;

const image = (item: SearchResultItem, className: string) => {
  const wrapper = document.createElement('div');
  wrapper.className = className;
  if (item.artwork) {
    const img = document.createElement('img');
    img.src = item.artwork;
    img.alt = '';
    img.loading = 'lazy';
    wrapper.append(img);
  } else {
    const fallback = document.createElement('span');
    fallback.textContent = item.kind === 'artist' ? '●' : '♪';
    wrapper.append(fallback);
  }
  return wrapper;
};

const subtitle = (item: SearchResultItem) => {
  const text = document.createElement('span');
  text.className = 'ui143-artist-subtitle';
  text.textContent = item.subtitle;
  return text;
};

export type ArtistPageController = ReturnType<typeof mountArtistPage>;

export const mountArtistPage = (
  engine: CatalogYouTubeMusicAdapter,
  onOpenAlbum?: AlbumOpenHandler,
) => {
  document.getElementById(ROOT_ID)?.remove();

  const root = document.createElement('main');
  root.id = ROOT_ID;
  root.hidden = true;
  root.setAttribute('aria-live', 'polite');
  const content = document.createElement('div');
  content.className = 'ui143-artist-page-content';
  root.append(content);
  document.body.append(root);

  let request = 0;
  let current: ArtistRef | null = null;
  let restoreSearch = false;
  const history: ArtistRef[] = [];
  let currentTrackId = engine.getState().track.id;

  const setVisible = (visible: boolean) => {
    root.hidden = !visible;
    document.documentElement.classList.toggle('ui143-artist-open', visible);
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
    state.className = 'ui143-artist-message';
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

  const openResult = (item: SearchResultItem) => {
    if (item.kind === 'artist' && item.browseId) {
      void openInternal(
        { name: item.title, browseId: item.browseId },
        { pushHistory: true },
      );
      return;
    }
    if (item.kind === 'album' && item.browseId && onOpenAlbum) {
      setVisible(false);
      onOpenAlbum(item.title, item.browseId, true);
      return;
    }
    engine.openSearchResult(item);
  };

  const resultButton = (item: SearchResultItem, className: string) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    if (item.videoId) button.dataset.videoId = item.videoId;
    button.addEventListener('click', () => openResult(item));
    return button;
  };

  const renderHero = (profile: SearchArtistProfile, fallbackName: string) => {
    const hero = document.createElement('section');
    hero.className = 'ui143-artist-hero';
    if (profile.banner) {
      const banner = document.createElement('img');
      banner.className = 'ui143-artist-hero-banner';
      banner.src = profile.banner;
      banner.alt = '';
      hero.append(banner);
    }
    const shade = document.createElement('div');
    shade.className = 'ui143-artist-hero-shade';
    const identity = document.createElement('div');
    identity.className = 'ui143-artist-hero-identity';
    if (profile.avatar) {
      const avatar = document.createElement('img');
      avatar.className = 'ui143-artist-avatar';
      avatar.src = profile.avatar;
      avatar.alt = '';
      identity.append(avatar);
    }
    const copy = document.createElement('div');
    copy.className = 'ui143-artist-hero-copy';
    const label = document.createElement('span');
    label.textContent = 'Artist';
    const title = document.createElement('h1');
    title.textContent = profile.title || fallbackName;
    const metrics = document.createElement('div');
    metrics.className = 'ui143-artist-metrics';
    for (const metric of [profile.subscribers, profile.monthlyListeners]) {
      if (!metric) continue;
      const span = document.createElement('span');
      span.textContent = metric;
      metrics.append(span);
    }
    copy.append(label, title, metrics);
    identity.append(copy);
    hero.append(shade, identity);
    return hero;
  };

  const renderTopTracks = (items: readonly SearchResultItem[]) => {
    const section = document.createElement('section');
    section.className = 'ui143-artist-section ui143-artist-top-tracks';
    const title = document.createElement('h2');
    title.textContent = 'Top tracks';
    const list = document.createElement('div');
    list.className = 'ui143-artist-track-list';
    for (const [index, item] of items.slice(0, 10).entries()) {
      const row = resultButton(item, 'ui143-artist-track');
      const number = document.createElement('span');
      number.className = 'ui143-artist-track-number';
      number.textContent = String(index + 1);
      const copy = document.createElement('div');
      copy.className = 'ui143-artist-track-copy';
      const name = document.createElement('strong');
      name.textContent = item.title;
      copy.append(name, subtitle(item));
      const nowPlaying = document.createElement('span');
      nowPlaying.className = 'ui143-artist-now-playing';
      nowPlaying.textContent = 'Now playing';
      row.append(number, image(item, 'ui143-artist-track-art'), copy, nowPlaying);
      list.append(row);
    }
    section.append(title, list);
    return section;
  };

  const renderShelf = (
    titleText: string,
    items: readonly SearchResultItem[],
    round = false,
  ) => {
    const section = document.createElement('section');
    section.className = 'ui143-artist-section ui143-artist-shelf';
    const title = document.createElement('h2');
    title.textContent = titleText;
    const shelf = document.createElement('div');
    shelf.className = 'ui143-artist-shelf-row';
    for (const item of items) {
      const card = resultButton(item, 'ui143-artist-card');
      const art = image(item, 'ui143-artist-card-art');
      if (round) art.classList.add('is-round');
      const name = document.createElement('strong');
      name.textContent = item.title;
      card.append(art, name, subtitle(item));
      shelf.append(card);
    }
    shelf.addEventListener(
      'wheel',
      (event) => {
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
        if (shelf.scrollWidth <= shelf.clientWidth) return;
        event.preventDefault();
        shelf.scrollLeft += event.deltaY;
      },
      { passive: false },
    );
    section.append(title, shelf);
    return section;
  };

  const render = async (artist: ArtistRef) => {
    const catalog = await engine.getArtistCatalog(artist.browseId, artist.name);
    content.replaceChildren();
    content.append(renderHero(catalog.profile, artist.name));
    if (catalog.topTracks.length)
      content.append(renderTopTracks(catalog.topTracks));
    if (catalog.albums.length)
      content.append(renderShelf('Albums', catalog.albums));
    if (catalog.releases.length)
      content.append(renderShelf('Latest', catalog.releases));
    if (catalog.relatedArtists.length)
      content.append(
        renderShelf('Related artists', catalog.relatedArtists.slice(0, 16), true),
      );
    syncNowPlaying();
  };

  const openInternal = async (artist: ArtistRef, options: OpenOptions = {}) => {
    if (!artist.name.trim() || !artist.browseId) return;
    if (
      options.pushHistory !== false &&
      current &&
      (current.browseId !== artist.browseId || current.name !== artist.name)
    )
      history.push(current);
    if (root.hidden && options.restoreSearch !== undefined)
      restoreSearch = options.restoreSearch;
    current = artist;
    const currentRequest = ++request;
    setVisible(true);
    message('Loading artist…');

    try {
      await render(artist);
      if (currentRequest !== request) return;
    } catch (error) {
      if (currentRequest !== request) return;
      console.error('[143 Music] Artist page failed', error);
      message('Artist unavailable', 'YouTube Music did not return artist data.');
    }
  };

  return {
    open(name: string, browseId: string, options: OpenOptions = {}) {
      return openInternal({ name, browseId }, options);
    },
    hide() {
      setVisible(false);
    },
    show() {
      if (current) setVisible(true);
    },
    back() {
      if (root.hidden) return false;
      const previous = history.pop();
      if (previous) {
        void openInternal(previous, { pushHistory: false });
        return true;
      }
      ++request;
      current = null;
      setVisible(false);
      const shouldRestoreSearch = restoreSearch;
      restoreSearch = false;
      return shouldRestoreSearch ? 'search' : true;
    },
    close() {
      ++request;
      current = null;
      history.length = 0;
      restoreSearch = false;
      setVisible(false);
    },
    isOpen: () => !root.hidden,
    dispose() {
      ++request;
      unsubscribe();
      document.documentElement.classList.remove('ui143-artist-open');
      root.remove();
    },
  };
};
