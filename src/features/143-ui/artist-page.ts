import {
  getArtistLibraryState,
  setArtistLibraryState,
} from './library-favorites';

import type { ArtistLibraryState } from './library-favorites';
import type { PlaybackContextAdapter } from './playback-context';
import type { SearchArtistProfile, SearchResultItem } from './youtube-music';
import type { ArtistCatalog } from './youtube-music-catalog';

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

const normalizeArtistName = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

export type ArtistPageController = ReturnType<typeof mountArtistPage>;

export const mountArtistPage = (
  engine: PlaybackContextAdapter,
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
  const artistResolveCache = new Map<string, Promise<ArtistRef | null>>();

  const setVisible = (visible: boolean) => {
    root.hidden = !visible;
    if (visible) syncNowPlaying();
    document.documentElement.classList.toggle('ui143-artist-open', visible);
  };

  const syncNowPlaying = () => {
    if (root.hidden) return;
    for (const row of root.querySelectorAll<HTMLButtonElement>(
      'button[data-video-id]',
    )) {
      const active = Boolean(
        currentTrackId && row.dataset.videoId === currentTrackId,
      );
      if (row.classList.contains('is-now-playing') !== active)
        row.classList.toggle('is-now-playing', active);
      if (active) {
        if (row.getAttribute('aria-current') !== 'true')
          row.setAttribute('aria-current', 'true');
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
      openInternal(
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

  const artistLibraryButton = (artist: ArtistRef) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ui143-artist-library-action';
    button.textContent = 'Follow';
    button.disabled = true;

    let state: ArtistLibraryState | null = null;
    let busy = false;
    const pageId = artist.browseId;

    const renderState = () => {
      if (!state) {
        button.textContent = 'Follow';
        button.disabled = true;
        button.classList.remove('is-saved');
        return;
      }
      button.textContent = state.saved ? '✓ Following' : '+ Follow';
      button.disabled = busy;
      button.classList.toggle('is-saved', state.saved);
      button.setAttribute('aria-pressed', String(state.saved));
    };

    void getArtistLibraryState(artist.browseId)
      .then((next) => {
        if (!button.isConnected && current?.browseId !== pageId) return;
        state = next;
        renderState();
      })
      .catch((error) => {
        console.warn('[143 Music] Could not read artist library state', error);
        if (!button.isConnected && current?.browseId !== pageId) return;
        button.textContent = '+ Follow';
        button.disabled = false;
      });

    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (busy) return;
      try {
        if (!state) state = await getArtistLibraryState(artist.browseId);
        busy = true;
        renderState();
        const desired = !state.saved;
        await setArtistLibraryState(state, desired);
        state = { ...state, saved: desired };
      } catch (error) {
        console.error('[143 Music] Could not update artist library state', error);
      } finally {
        busy = false;
        if (button.isConnected) renderState();
      }
    });

    return button;
  };

  const playableArtistTracks = (items: readonly SearchResultItem[]) => {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (item.kind !== 'song' || !item.videoId || seen.has(item.videoId))
        return false;
      seen.add(item.videoId);
      return true;
    });
  };

  const startArtistRadio = async (
    artist: ArtistRef,
    knownTracks?: readonly SearchResultItem[],
  ) => {
    const tracks = playableArtistTracks(
      knownTracks?.length
        ? knownTracks
        : (await engine.getArtistCatalog(artist.browseId, artist.name)).topTracks,
    );
    if (!tracks.length) return false;
    const startIndex = Math.floor(Math.random() * tracks.length);
    return engine.playContext(
      tracks,
      startIndex,
      {
        kind: 'artist',
        title: `Artist Radio · ${artist.name}`,
        browseId: artist.browseId,
      },
      { shuffle: true },
    );
  };

  const artistRadioButton = (
    artist: ArtistRef,
    knownTracks?: readonly SearchResultItem[],
  ) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ui143-artist-library-action ui143-artist-radio-action';
    button.textContent = 'Artist Radio';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) return;
      button.disabled = true;
      const previous = button.textContent;
      button.textContent = 'Starting…';
      void startArtistRadio(artist, knownTracks)
        .catch((error) => {
          console.error('[143 Music] Artist radio failed', error);
        })
        .finally(() => {
          if (!button.isConnected) return;
          button.disabled = false;
          button.textContent = previous;
        });
    });
    return button;
  };

  const resolveArtist = (name: string) => {
    const key = normalizeArtistName(name);
    if (!key) return Promise.resolve(null);
    const cached = artistResolveCache.get(key);
    if (cached) return cached;
    const request = engine
      .searchCatalog(name)
      .then((catalog) => {
        const candidates: ArtistRef[] = [];
        const featured = catalog.featuredArtist;
        if (featured?.browseId)
          candidates.push({ name: featured.title || name, browseId: featured.browseId });
        for (const item of catalog.artists) {
          if (item.browseId)
            candidates.push({ name: item.title || name, browseId: item.browseId });
        }
        return (
          candidates.find(
            (candidate) => normalizeArtistName(candidate.name) === key,
          ) ??
          candidates[0] ??
          null
        );
      })
      .catch((error) => {
        console.warn('[143 Music] Could not resolve artist search action', error);
        artistResolveCache.delete(key);
        return null;
      });
    artistResolveCache.set(key, request);
    return request;
  };

  const makeSearchActions = (name: string) => {
    const actions = document.createElement('div');
    actions.dataset.ui143ArtistActions = '';
    actions.style.display = 'flex';
    actions.style.alignItems = 'center';
    actions.style.gap = '7px';
    actions.style.zIndex = '4';

    const follow = document.createElement('button');
    follow.type = 'button';
    follow.className = 'ui143-artist-library-action';
    follow.textContent = '+ Follow';
    follow.disabled = true;

    const radio = document.createElement('button');
    radio.type = 'button';
    radio.className = 'ui143-artist-library-action ui143-artist-radio-action';
    radio.textContent = 'Artist Radio';
    radio.disabled = true;

    let artist: ArtistRef | null = null;
    let libraryState: ArtistLibraryState | null = null;
    let busy = false;

    const renderFollow = () => {
      if (!libraryState) {
        follow.textContent = '+ Follow';
        follow.disabled = !artist || busy;
        follow.classList.remove('is-saved');
        return;
      }
      follow.textContent = libraryState.saved ? '✓ Following' : '+ Follow';
      follow.disabled = busy;
      follow.classList.toggle('is-saved', libraryState.saved);
    };

    void resolveArtist(name).then(async (resolved) => {
      if (!actions.isConnected || !resolved) return;
      artist = resolved;
      radio.disabled = false;
      try {
        libraryState = await getArtistLibraryState(resolved.browseId);
      } catch {
        libraryState = null;
      }
      if (actions.isConnected) renderFollow();
    });

    follow.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!artist || busy) return;
      busy = true;
      renderFollow();
      try {
        if (!libraryState)
          libraryState = await getArtistLibraryState(artist.browseId);
        const desired = !libraryState.saved;
        await setArtistLibraryState(libraryState, desired);
        libraryState = { ...libraryState, saved: desired };
      } catch (error) {
        console.error('[143 Music] Search artist follow failed', error);
      } finally {
        busy = false;
        if (actions.isConnected) renderFollow();
      }
    });

    radio.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!artist || radio.disabled) return;
      radio.disabled = true;
      radio.textContent = 'Starting…';
      void startArtistRadio(artist)
        .catch((error) => {
          console.error('[143 Music] Search artist radio failed', error);
        })
        .finally(() => {
          if (!actions.isConnected) return;
          radio.disabled = false;
          radio.textContent = 'Artist Radio';
        });
    });

    actions.append(follow, radio);
    return actions;
  };

  const mountSearchArtistActions = () => {
    const searchRoot = document.getElementById('ui143-search-page');
    if (!searchRoot || searchRoot.hidden) return;

    const featured = searchRoot.querySelector<HTMLElement>(
      '.ui143-search-featured-artist',
    );
    const featuredCard = featured?.querySelector<HTMLElement>(
      '.ui143-search-featured-artist-card',
    );
    if (
      featured &&
      featuredCard &&
      !featured.querySelector('[data-ui143-artist-actions]')
    ) {
      const name = featuredCard
        .querySelector<HTMLElement>('.ui143-search-artist-copy > strong')
        ?.textContent?.trim();
      if (name) {
        featured.style.position = 'relative';
        const actions = makeSearchActions(name);
        actions.style.position = 'absolute';
        actions.style.right = '18px';
        actions.style.bottom = '18px';
        featured.append(actions);
      }
    }

    for (const section of searchRoot.querySelectorAll<HTMLElement>(
      '.ui143-search-section',
    )) {
      const heading = section.querySelector('h2')?.textContent?.trim() ?? '';
      if (!/^artists\b/iu.test(heading)) continue;
      for (const card of section.querySelectorAll<HTMLElement>(
        '.ui143-search-card',
      )) {
        if (card.closest('[data-ui143-artist-card-wrap]')) continue;
        const name = card.querySelector<HTMLElement>('strong')?.textContent?.trim();
        if (!name) continue;
        const wrap = document.createElement('div');
        wrap.dataset.ui143ArtistCardWrap = '';
        wrap.style.minWidth = '0';
        wrap.style.position = 'relative';
        card.replaceWith(wrap);
        card.style.width = '100%';
        const actions = makeSearchActions(name);
        actions.style.marginTop = '8px';
        actions.style.flexWrap = 'wrap';
        wrap.append(card, actions);
      }
    }
  };

  const searchActionsTimer = window.setInterval(mountSearchArtistActions, 700);
  mountSearchArtistActions();

  const renderHero = (
    profile: SearchArtistProfile,
    artist: ArtistRef,
    tracks: readonly SearchResultItem[],
  ) => {
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
    title.textContent = profile.title || artist.name;
    const metrics = document.createElement('div');
    metrics.className = 'ui143-artist-metrics';
    for (const metric of [profile.subscribers, profile.monthlyListeners]) {
      if (!metric) continue;
      const span = document.createElement('span');
      span.textContent = metric;
      metrics.append(span);
    }
    const actions = document.createElement('div');
    actions.className = 'ui143-artist-hero-actions';
    actions.append(
      artistLibraryButton(artist),
      artistRadioButton(artist, tracks),
    );
    copy.append(label, title, metrics, actions);
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
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ui143-artist-track';
      if (item.videoId) row.dataset.videoId = item.videoId;
      row.dataset.trackTitle = item.title;
      row.dataset.trackSubtitle = item.subtitle;
      row.addEventListener('click', () => {
        if (!current) return;
        engine.playContext(items, index, {
          kind: 'artist',
          title: current.name,
          browseId: current.browseId,
        });
      });
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
      row.append(
        number,
        image(item, 'ui143-artist-track-art'),
        copy,
        nowPlaying,
      );
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
    section.append(title, shelf);
    return section;
  };

  const render = (artist: ArtistRef, catalog: ArtistCatalog) => {
    content.replaceChildren();
    content.append(renderHero(catalog.profile, artist, catalog.topTracks));
    if (catalog.topTracks.length)
      content.append(renderTopTracks(catalog.topTracks));
    if (catalog.albums.length)
      content.append(renderShelf('Albums', catalog.albums));
    if (catalog.releases.length)
      content.append(renderShelf('Latest', catalog.releases));
    if (catalog.relatedArtists.length)
      content.append(
        renderShelf(
          'Related artists',
          catalog.relatedArtists.slice(0, 16),
          true,
        ),
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
    if (root.hidden) restoreSearch = options.restoreSearch === true;
    current = artist;
    const currentRequest = ++request;
    setVisible(true);
    message('Loading artist…');

    try {
      const catalog = await engine.getArtistCatalog(
        artist.browseId,
        artist.name,
      );
      if (currentRequest !== request) return;
      render(artist, catalog);
    } catch (error) {
      if (currentRequest !== request) return;
      console.error('[143 Music] Artist page failed', error);
      message(
        'Artist unavailable',
        'YouTube Music did not return artist data.',
      );
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
        openInternal(previous, { pushHistory: false });
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
      window.clearInterval(searchActionsTimer);
      unsubscribe();
      document.documentElement.classList.remove('ui143-artist-open');
      root.remove();
    },
  };
};
