import type {
  SearchArtistProfile,
  SearchCatalog,
  SearchResultItem,
  YouTubeMusicAdapter,
} from './youtube-music';

const ROOT_ID = 'ui143-search-page';

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
    .map((item, index) => ({ item, index, plays: playCount(item) }))
    .sort((left, right) => right.plays - left.plays || left.index - right.index)
    .map(({ item }) => item);

export type SearchPageController = ReturnType<typeof mountSearchPage>;

export const mountSearchPage = (engine: YouTubeMusicAdapter) => {
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
    if (!engine.openSearchResult(item)) return;
    setVisible(false);
  };

  const resultButton = (item: SearchResultItem, className: string) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.addEventListener('click', () => openItem(item));
    return button;
  };

  const artistItem = (profile: SearchArtistProfile): SearchResultItem => ({
    kind: 'artist',
    title: profile.title,
    subtitle: profile.monthlyListeners,
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
    if (profile.avatar) {
      const avatarImage = document.createElement('img');
      avatarImage.src = profile.avatar;
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
    identity.className = 'ui143-search-artist-identity ui143-search-artist-identity-fallback';
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
    for (const [index, item] of items.slice(0, 5).entries()) {
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
      row.append(copy);
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
    for (const item of items.slice(0, limit)) {
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
    round = false,
  ) => {
    const section = document.createElement('section');
    section.className = 'ui143-search-section';
    const heading = document.createElement('h2');
    heading.textContent = titleText;
    const grid = document.createElement('div');
    grid.className = 'ui143-search-card-grid';
    for (const item of items.slice(0, 8)) {
      const card = resultButton(item, 'ui143-search-card');
      const art = image(item, 'ui143-search-card-art');
      if (round) art.classList.add('is-round');
      const name = document.createElement('strong');
      name.textContent = item.title;
      card.append(art, name, subtitle(item));
      grid.append(card);
    }
    section.append(heading, grid);
    return section;
  };

  const render = (results: SearchCatalog) => {
    clear();
    hasResults = Boolean(
      results.topResult ||
        results.songs.length ||
        results.artists.length ||
        results.albums.length ||
        results.playlists.length ||
        results.videos.length,
    );
    if (!hasResults) {
      message('Nothing found', `No results for “${results.query}”.`);
      return;
    }

    const heading = document.createElement('div');
    heading.className = 'ui143-search-heading';
    const eyebrow = document.createElement('span');
    eyebrow.textContent = 'Search results';
    const title = document.createElement('h1');
    title.textContent = results.query;
    heading.append(eyebrow, title);
    content.append(heading);

    const rankedSongs = rankTracks(results.songs);
    const hero = document.createElement('div');
    hero.className = 'ui143-search-hero-grid';
    if (results.featuredArtist)
      hero.append(renderArtistProfile(results.featuredArtist));
    else if (results.topResult) hero.append(renderTopFallback(results.topResult));
    if (rankedSongs.length) hero.append(renderTopTracks(rankedSongs));
    content.append(hero);

    if (results.albums.length)
      content.append(renderCards('Albums', results.albums));

    const moreSongs = rankedSongs.slice(5);
    if (moreSongs.length) content.append(renderSongs('More tracks', moreSongs));

    if (results.artists.length)
      content.append(renderCards('Artists you may like', results.artists, true));
    if (results.playlists.length)
      content.append(renderCards('Playlists', results.playlists));
    if (results.videos.length)
      content.append(renderCards('Videos', results.videos));
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
        const results = await engine.searchCatalog(value);
        if (current !== request) return;
        render(results);
      } catch (error) {
        if (current !== request) return;
        console.error('[143 Music] Search failed', error);
        message('Search unavailable', 'YouTube Music did not return search results.');
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
      document.documentElement.classList.remove('ui143-search-open');
      root.remove();
    },
  };
};
