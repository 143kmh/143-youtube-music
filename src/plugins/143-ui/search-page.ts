import type {
  SearchArtistProfile,
  SearchCatalog,
  SearchResultItem,
} from './youtube-music';
import type { CatalogYouTubeMusicAdapter } from './youtube-music-catalog';
import { resolveSearchFocus, type SearchFocus } from './search-intent';

const ROOT_ID = 'ui143-search-page';

export type ArtistOpenHandler = (
  name: string,
  browseId: string,
  restoreSearch: boolean,
) => void;

export type AlbumOpenHandler = (
  title: string,
  browseId: string,
  restoreSearch: boolean,
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
  const text = document.createElement('div');
  text.className = 'ui143-search-result-subtitle';
  text.textContent =
    item.subtitle || item.kind[0].toUpperCase() + item.kind.slice(1);
  return text;
};

const normalizeLabel = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isEpisodeLike = (item: SearchResultItem) => {
  const value = `${item.title} ${item.subtitle}`;
  return (
    /\b(?:podcast|episode|interview)\b/iu.test(value) ||
    /(?:^|[\s•·—–-])(?:подкаст|эпизод|епізод|выпуск|випуск|интервью)(?=$|[\s•·—–-])/iu.test(
      value,
    )
  );
};

const playCount = (item: SearchResultItem) => {
  const text = item.subtitle.toLocaleLowerCase().replaceAll('\u00a0', ' ');
  const pattern =
    /(\d+(?:[.,]\d+)?)\s*(млрд|млн|тыс\.?|b|m|k)?\s*(?:прослушиван\p{L}*|прослуховуван\p{L}*|plays?|views?)/giu;
  let best = -1;

  for (const match of text.matchAll(pattern)) {
    const amount = Number(match[1]?.replace(',', '.'));
    if (!Number.isFinite(amount)) continue;
    const suffix = match[2]?.replace('.', '').toLocaleLowerCase() ?? '';
    const multiplier =
      suffix === 'млрд' || suffix === 'b'
        ? 1_000_000_000
        : suffix === 'млн' || suffix === 'm'
          ? 1_000_000
          : suffix === 'тыс' || suffix === 'k'
            ? 1_000
            : 1;
    best = Math.max(best, amount * multiplier);
  }

  return best;
};

const rankTracks = (items: readonly SearchResultItem[]) =>
  items
    .filter((item) => item.kind === 'song' && !isEpisodeLike(item))
    .map((item, index) => ({ item, index, plays: playCount(item) }))
    .sort((left, right) => right.plays - left.plays || left.index - right.index)
    .map(({ item }) => item);

const albumYear = (item: SearchResultItem) => {
  const years = `${item.subtitle} ${item.title}`
    .match(/(?:19|20)\d{2}/gu)
    ?.map(Number)
    .filter((year) => year >= 1900 && year <= 2100);
  return years?.length ? Math.max(...years) : -1;
};

const rankAlbums = (items: readonly SearchResultItem[]) =>
  items
    .map((item, index) => ({ item, index, year: albumYear(item) }))
    .sort((left, right) => right.year - left.year || left.index - right.index)
    .map(({ item }) => item);

const belongsToArtist = (item: SearchResultItem, artist: string) => {
  const key = normalizeLabel(artist);
  if (!key) return true;
  return normalizeLabel(item.subtitle).includes(key);
};

const mergeAlbums = (
  artist: string,
  ...groups: readonly SearchResultItem[][]
) => {
  const result: SearchResultItem[] = [];
  const seen = new Set<string>();
  for (const items of groups) {
    for (const item of items) {
      if (item.kind !== 'album' || !belongsToArtist(item, artist)) continue;
      const key = item.browseId ?? `${item.title}\u0000${item.subtitle}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(item);
    }
  }
  return rankAlbums(result);
};

export type SearchPageController = ReturnType<typeof mountSearchPage>;

export const mountSearchPage = (
  engine: CatalogYouTubeMusicAdapter,
  onOpenArtist?: ArtistOpenHandler,
  onOpenAlbum?: AlbumOpenHandler,
) => {
  document.getElementById(ROOT_ID)?.remove();

  const root = document.createElement('main');
  root.id = ROOT_ID;
  root.className = 'ui143-search-page';
  root.hidden = true;
  root.setAttribute('aria-live', 'polite');

  const content = document.createElement('div');
  content.className = 'ui143-search-page-content';
  root.append(content);
  document.body.append(root);

  let request = 0;
  let lastQuery = '';
  let hasResults = false;
  let currentTrackId = engine.getState().track.id;

  const syncNowPlaying = () => {
    for (const button of root.querySelectorAll<HTMLButtonElement>(
      'button[data-video-id]',
    )) {
      const active = Boolean(
        currentTrackId && button.dataset.videoId === currentTrackId,
      );
      button.classList.toggle('is-now-playing', active);
      if (active) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    }
  };

  const unsubscribeState = engine.subscribe((state) => {
    currentTrackId = state.track.id;
    syncNowPlaying();
  });

  const setVisible = (visible: boolean) => {
    root.hidden = !visible;
    document.documentElement.classList.toggle('ui143-search-open', visible);
  };

  const clear = () => content.replaceChildren();

  const message = (title: string, detail = '') => {
    clear();
    const state = document.createElement('div');
    state.className = 'ui143-search-message';
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

  const openItem = (item: SearchResultItem) => {
    if (item.kind === 'artist' && item.browseId && onOpenArtist) {
      setVisible(false);
      onOpenArtist(item.title, item.browseId, true);
      return;
    }
    if (item.kind === 'album' && item.browseId && onOpenAlbum) {
      setVisible(false);
      onOpenAlbum(item.title, item.browseId, true);
      return;
    }
    if (!engine.openSearchResult(item)) return;
    if (!item.videoId) setVisible(false);
  };

  const resultButton = (item: SearchResultItem, className: string) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    if (item.videoId) button.dataset.videoId = item.videoId;
    button.addEventListener('click', () => openItem(item));
    return button;
  };

  const artistItem = (profile: SearchArtistProfile): SearchResultItem => ({
    kind: 'artist',
    title: profile.title,
    subtitle: profile.monthlyListeners || profile.subscribers,
    artwork: profile.avatar,
    browseId: profile.browseId,
  });

  const renderArtistProfile = (profile: SearchArtistProfile) => {
    const section = document.createElement('section');
    section.className = 'ui143-search-featured-artist';

    const card = resultButton(
      artistItem(profile),
      'ui143-search-featured-artist-card',
    );

    const banner = document.createElement('div');
    banner.className = 'ui143-search-artist-banner';
    if (profile.banner) {
      const bannerImage = document.createElement('img');
      bannerImage.src = profile.banner;
      bannerImage.alt = '';
      bannerImage.loading = 'lazy';
      banner.append(bannerImage);
    }

    const identity = document.createElement('div');
    identity.className = 'ui143-search-artist-identity';

    const avatar = document.createElement('div');
    avatar.className = 'ui143-search-artist-avatar';
    const avatarSource = profile.avatar || profile.banner;
    if (avatarSource) {
      const avatarImage = document.createElement('img');
      avatarImage.src = avatarSource;
      avatarImage.alt = '';
      avatarImage.loading = 'lazy';
      avatar.append(avatarImage);
    } else {
      const fallback = document.createElement('span');
      fallback.textContent = '●';
      avatar.append(fallback);
    }

    const copy = document.createElement('div');
    copy.className = 'ui143-search-artist-copy';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'ui143-search-artist-label';
    eyebrow.textContent = 'Artist';
    const title = document.createElement('strong');
    title.textContent = profile.title;

    const metrics = document.createElement('div');
    metrics.className = 'ui143-search-artist-metrics';
    const metricValues: [string, 'subscribers' | 'listeners'][] = [
      [profile.subscribers, 'subscribers'],
      [profile.monthlyListeners, 'listeners'],
    ];
    for (const [value, kind] of metricValues) {
      if (!value) continue;
      const metric = document.createElement('span');
      metric.textContent =
        kind === 'subscribers' &&
        !/subscriber|подпис|підпис/iu.test(value)
          ? `${value} subscribers`
          : value;
      metrics.append(metric);
    }

    copy.append(eyebrow, title, metrics);
    identity.append(avatar, copy);
    card.append(banner, identity);
    section.append(card);
    return section;
  };

  const renderTopFallback = (item: SearchResultItem) => {
    const section = document.createElement('section');
    section.className = 'ui143-search-featured-artist';
    const card = resultButton(item, 'ui143-search-featured-artist-card is-fallback');
    const identity = document.createElement('div');
    identity.className =
      'ui143-search-artist-identity ui143-search-artist-identity-fallback';
    identity.append(image(item, 'ui143-search-artist-avatar'));
    const copy = document.createElement('div');
    copy.className = 'ui143-search-artist-copy';
    const label = document.createElement('span');
    label.className = 'ui143-search-artist-label';
    label.textContent = 'Top result';
    const title = document.createElement('strong');
    title.textContent = item.title;
    copy.append(label, title, subtitle(item));
    identity.append(copy);
    card.append(identity);
    section.append(card);
    return section;
  };

  const renderTopTracks = (items: readonly SearchResultItem[]) => {
    const section = document.createElement('section');
    section.className = 'ui143-search-top-tracks';
    const heading = document.createElement('div');
    heading.className = 'ui143-search-section-heading';
    const title = document.createElement('h2');
    title.textContent = 'Top tracks';
    heading.append(title);

    const list = document.createElement('div');
    list.className = 'ui143-search-top-track-list';
    for (const [index, item] of items.slice(0, 10).entries()) {
      const row = resultButton(item, 'ui143-search-top-track');
      const number = document.createElement('span');
      number.className = 'ui143-search-track-number';
      number.textContent = String(index + 1);
      row.append(number, image(item, 'ui143-search-song-art'));
      const copy = document.createElement('div');
      copy.className = 'ui143-search-song-copy';
      const name = document.createElement('strong');
      name.textContent = item.title;
      copy.append(name, subtitle(item));
      const nowPlaying = document.createElement('span');
      nowPlaying.className = 'ui143-search-now-playing';
      nowPlaying.textContent = 'Now playing';
      row.append(copy, nowPlaying);
      list.append(row);
    }
    section.append(heading, list);
    return section;
  };

  const renderSongs = (
    titleText: string,
    items: readonly SearchResultItem[],
    limit = 10,
  ) => {
    const section = document.createElement('section');
    section.className = 'ui143-search-section ui143-search-more-songs';
    const heading = document.createElement('h2');
    heading.textContent = titleText;
    const list = document.createElement('div');
    list.className = 'ui143-search-song-list';
    for (const item of items.filter((entry) => !isEpisodeLike(entry)).slice(0, limit)) {
      const row = resultButton(item, 'ui143-search-song');
      row.append(image(item, 'ui143-search-song-art'));
      const copy = document.createElement('div');
      copy.className = 'ui143-search-song-copy';
      const title = document.createElement('strong');
      title.textContent = item.title;
      copy.append(title, subtitle(item));
      row.append(copy);
      list.append(row);
    }
    section.append(heading, list);
    return section;
  };

  const renderCards = (
    titleText: string,
    items: readonly SearchResultItem[],
    options: { round?: boolean; className?: string; limit?: number } = {},
  ) => {
    const section = document.createElement('section');
    section.className = `ui143-search-section ${options.className ?? ''}`.trim();
    const heading = document.createElement('h2');
    heading.textContent = titleText;
    const grid = document.createElement('div');
    grid.className = 'ui143-search-card-grid';
    const limit = options.limit ?? 8;
    for (const item of items.filter((entry) => !isEpisodeLike(entry)).slice(0, limit)) {
      const card = resultButton(item, 'ui143-search-card');
      const art = image(item, 'ui143-search-card-art');
      if (options.round) art.classList.add('is-round');
      const name = document.createElement('strong');
      name.textContent = item.title;
      card.append(art, name, subtitle(item));
      grid.append(card);
    }
    if (options.className === 'ui143-search-albums') {
      grid.addEventListener(
        'wheel',
        (event) => {
          if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
          if (grid.scrollWidth <= grid.clientWidth) return;
          event.preventDefault();
          grid.scrollLeft += event.deltaY;
        },
        { passive: false },
      );
    }
    section.append(heading, grid);
    return section;
  };

  const appendHeading = (query: string) => {
    const heading = document.createElement('div');
    heading.className = 'ui143-search-heading';
    const eyebrow = document.createElement('span');
    eyebrow.textContent = 'Search results';
    const title = document.createElement('h1');
    title.textContent = query;
    heading.append(eyebrow, title);
    content.append(heading);
  };

  const renderFocusCard = (
    labelText: string,
    item: SearchResultItem,
    round = false,
  ) => {
    const card = resultButton(item, 'ui143-search-focus-card');
    const art = image(item, 'ui143-search-focus-art');
    if (round) art.classList.add('is-round');
    const copy = document.createElement('div');
    copy.className = 'ui143-search-focus-copy';
    const label = document.createElement('span');
    label.className = 'ui143-search-focus-label';
    label.textContent = labelText;
    const title = document.createElement('strong');
    title.textContent = item.title;
    const nowPlaying = document.createElement('span');
    nowPlaying.className = 'ui143-search-now-playing';
    nowPlaying.textContent = 'Now playing';
    copy.append(label, title, subtitle(item), nowPlaying);
    card.append(art, copy);
    return card;
  };

  const renderFocusArtist = (profile: SearchArtistProfile) =>
    renderFocusCard('Artist', artistItem(profile), true);

  const renderFocus = (results: SearchCatalog, focus: Exclude<SearchFocus, null>) => {
    clear();
    hasResults = true;
    appendHeading(results.query);

    const grid = document.createElement('div');
    grid.className = `ui143-search-focus-grid is-${focus.kind}`;

    if (focus.kind === 'song') {
      grid.append(renderFocusCard('Track', focus.song));
      if (focus.album) grid.append(renderFocusCard('Album', focus.album));
      if (focus.artist) grid.append(renderFocusArtist(focus.artist));
      content.append(grid);

      const moreSongs = rankTracks(results.songs).filter(
        (item) => item.videoId !== focus.song.videoId,
      );
      if (moreSongs.length)
        content.append(renderSongs('More matching tracks', moreSongs, 10));
    } else {
      grid.append(renderFocusCard('Album', focus.album));
      if (focus.artist) grid.append(renderFocusArtist(focus.artist));
      if (focus.tracks.length) grid.append(renderTopTracks(focus.tracks));
      content.append(grid);

      const otherAlbums = results.albums.filter(
        (item) => item.browseId !== focus.album.browseId,
      );
      if (otherAlbums.length)
        content.append(
          renderCards('More albums', rankAlbums(otherAlbums), {
            className: 'ui143-search-albums',
            limit: otherAlbums.length,
          }),
        );
    }

    syncNowPlaying();
  };

  const render = (results: SearchCatalog) => {
    clear();
    const rankedSongs = rankTracks(results.songs);
    const cleanPlaylists = results.playlists.filter((item) => !isEpisodeLike(item));
    const artist = results.featuredArtist?.title ?? '';
    const artistAlbums = artist
      ? mergeAlbums(artist, [...results.albums])
      : rankAlbums(results.albums);

    hasResults = Boolean(
      results.topResult ||
        rankedSongs.length ||
        results.artists.length ||
        artistAlbums.length ||
        cleanPlaylists.length,
    );
    if (!hasResults) {
      message('Nothing found', `No results for “${results.query}”.`);
      return;
    }

    appendHeading(results.query);

    const hero = document.createElement('div');
    hero.className = 'ui143-search-hero-grid';
    if (results.featuredArtist) hero.append(renderArtistProfile(results.featuredArtist));
    else if (results.topResult && !isEpisodeLike(results.topResult))
      hero.append(renderTopFallback(results.topResult));
    if (rankedSongs.length) hero.append(renderTopTracks(rankedSongs));
    content.append(hero);

    if (artistAlbums.length)
      content.append(
        renderCards('Albums', artistAlbums, {
          className: 'ui143-search-albums',
          limit: artistAlbums.length,
        }),
      );

    const moreSongs = rankedSongs.slice(10);
    if (moreSongs.length) content.append(renderSongs('More tracks', moreSongs));

    if (results.artists.length)
      content.append(
        renderCards('Artists you may like', results.artists, { round: true }),
      );
    if (cleanPlaylists.length)
      content.append(renderCards('Playlists', cleanPlaylists));

    syncNowPlaying();
  };

  const enrichAlbums = async (results: SearchCatalog, current: number) => {
    const artist = results.featuredArtist?.title.trim();
    if (!artist) return results;

    const queries = [`${artist} album`, `${artist} альбом`];
    const settled = await Promise.allSettled(
      queries.map((query) => engine.searchCatalog(query)),
    );
    if (current !== request) return results;

    const extraAlbums = settled.flatMap((entry) =>
      entry.status === 'fulfilled' ? [...entry.value.albums] : [],
    );
    const albums = mergeAlbums(artist, [...results.albums], extraAlbums);
    const currentAlbums = mergeAlbums(artist, [...results.albums]);
    return albums.length === currentAlbums.length
      ? { ...results, albums: currentAlbums }
      : { ...results, albums };
  };

  return {
    async search(query: string) {
      const value = query.trim();
      if (!value) return;
      lastQuery = value;
      const current = ++request;
      setVisible(true);
      message('Searching…');
      try {
        const initial = await engine.searchCatalog(value);
        if (current !== request) return;

        const focus = await resolveSearchFocus(engine, initial);
        if (current !== request) return;
        if (focus) {
          renderFocus(initial, focus);
          return;
        }

        render(initial);
        const enriched = await enrichAlbums(initial, current);
        if (current !== request) return;
        render(enriched);
      } catch (error) {
        if (current !== request) return;
        console.error('[143 Music] Search failed', error);
        message(
          'Search unavailable',
          'YouTube Music did not return search results.',
        );
      }
    },
    show() {
      if (lastQuery || hasResults) setVisible(true);
    },
    close() {
      ++request;
      setVisible(false);
    },
    isOpen: () => !root.hidden,
    dispose() {
      ++request;
      unsubscribeState();
      document.documentElement.classList.remove('ui143-search-open');
      root.remove();
    },
  };
};