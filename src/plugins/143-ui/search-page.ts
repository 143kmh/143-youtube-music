import type {
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
  text.textContent = item.subtitle || item.kind[0].toUpperCase() + item.kind.slice(1);
  return text;
};

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

  const renderTop = (item: SearchResultItem) => {
    const section = document.createElement('section');
    section.className = 'ui143-search-top';
    const heading = document.createElement('h2');
    heading.textContent = 'Top result';
    const card = resultButton(item, 'ui143-search-top-card');
    card.append(image(item, 'ui143-search-top-art'));
    const copy = document.createElement('div');
    copy.className = 'ui143-search-top-copy';
    const title = document.createElement('strong');
    title.textContent = item.title;
    copy.append(title, subtitle(item));
    card.append(copy);
    section.append(heading, card);
    return section;
  };

  const renderSongs = (items: readonly SearchResultItem[]) => {
    const section = document.createElement('section');
    section.className = 'ui143-search-songs';
    const heading = document.createElement('h2');
    heading.textContent = 'Songs';
    const list = document.createElement('div');
    list.className = 'ui143-search-song-list';
    for (const item of items.slice(0, 8)) {
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

    if (results.topResult || results.songs.length) {
      const hero = document.createElement('div');
      hero.className = 'ui143-search-hero-grid';
      if (results.topResult) hero.append(renderTop(results.topResult));
      if (results.songs.length) hero.append(renderSongs(results.songs));
      content.append(hero);
    }
    if (results.artists.length)
      content.append(renderCards('Artists', results.artists, true));
    if (results.albums.length)
      content.append(renderCards('Albums', results.albums));
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
