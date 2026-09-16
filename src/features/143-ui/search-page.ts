import type {
  SearchArtistProfile,
  SearchCatalog,
  SearchResultItem,
} from './youtube-music';
import type { PlaybackContextAdapter } from './playback-context';
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

export type PlaylistOpenHandler = (
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

const isVariantVideoQuery = (query: string) =>
  /(?:^|\s)(?:sped\s*up|speed\s*up|speedup|slowed|reverb|nightcore|remix|lyrics?|lyric\s+video|live|bass\s*boosted|8d)(?:\s|$)/iu.test(
    normalizeLabel(query),
  );

const variantBaseQuery = (query: string) =>
  query
    .replace(
      /(?:^|\s)(?:sped\s*up|speed\s*up|speedup|slowed|reverb|nightcore|remix|lyrics?|lyric\s+video|live|bass\s*boosted|8d)(?=\s|$)/giu,
      ' ',
    )
    .replace(/\s*\+\s*/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

const variantLoadQueries = (query: string) => {
  const normalized = normalizeLabel(query);
  const base = variantBaseQuery(query) || query.trim();
  const queries = new Set<string>();
  const add = (...values: string[]) => {
    for (const value of values) {
      const clean = value.replace(/\s+/gu, ' ').trim();
      if (clean && normalizeLabel(clean) !== normalizeLabel(query)) queries.add(clean);
    }
  };

  if (/\bslowed\b/iu.test(normalized)) {
    add(
      `${base} slowed reverb`,
      `${base} slowed + reverb`,
      `${base} super slowed`,
      `${base} ultra slowed`,
      `${base} slowed version`,
      `${base} slowed audio`,
      `${base} slowed edit`,
      `${base} slowed remix`,
      `${base} slowed lyrics`,
      `${base} slowed down`,
      `${base} slowed to perfection`,
      `${base} slowed song`,
    );
  }

  if (/\b(?:sped\s*up|speed\s*up|speedup)\b/iu.test(normalized)) {
    add(
      `${base} sped up`,
      `${base} speed up`,
      `${base} speedup`,
      `${base} sped up reverb`,
      `${base} sped up + reverb`,
      `${base} nightcore`,
      `${base} nightcore sped up`,
      `${base} sped up version`,
      `${base} sped up audio`,
      `${base} sped up edit`,
      `${base} sped up remix`,
      `${base} sped up lyrics`,
    );
  }

  if (/\breverb\b/iu.test(normalized)) {
    add(
      `${base} reverb`,
      `${base} slowed reverb`,
      `${base} slowed + reverb`,
      `${base} reverb version`,
      `${base} reverb audio`,
      `${base} reverb edit`,
      `${base} reverb remix`,
    );
  }

  if (/\bnightcore\b/iu.test(normalized)) {
    add(
      `${base} nightcore`,
      `${base} nightcore sped up`,
      `${base} nightcore reverb`,
      `${base} nightcore version`,
      `${base} nightcore edit`,
    );
  }

  if (/\bremix\b/iu.test(normalized)) {
    add(
      `${base} remix`,
      `${base} remix audio`,
      `${base} remix video`,
      `${base} remix edit`,
      `${base} remix version`,
    );
  }

  if (/\blyrics?\b|\blyric\s+video\b/iu.test(normalized)) {
    add(
      `${base} lyrics`,
      `${base} lyric video`,
      `${base} lyrics video`,
      `${base} lyrics audio`,
    );
  }

  if (/\blive\b/iu.test(normalized)) {
    add(
      `${base} live`,
      `${base} live performance`,
      `${base} live concert`,
      `${base} live session`,
    );
  }

  if (/\bbass\s*boosted\b/iu.test(normalized)) {
    add(
      `${base} bass boosted`,
      `${base} bass boosted audio`,
      `${base} bass boosted version`,
    );
  }

  if (/\b8d\b/iu.test(normalized)) {
    add(`${base} 8d`, `${base} 8d audio`, `${base} 8d version`);
  }

  for (const suffix of ['audio', 'version', 'edit', 'music', 'youtube'])
    add(`${query} ${suffix}`);
  for (let year = new Date().getFullYear(); year >= 2018; year--)
    add(`${query} ${year}`);

  return [...queries];
};

const requestedVariantMatches = (query: string, item: SearchResultItem) => {
  const q = normalizeLabel(query);
  const text = normalizeLabel(`${item.title} ${item.subtitle}`);
  const checks: Array<[RegExp, RegExp]> = [
    [/\b(?:sped\s*up|speed\s*up|speedup)\b/iu, /\b(?:sped\s*up|speed\s*up|speedup)\b/iu],
    [/\bslowed\b/iu, /\bslowed\b/iu],
    [/\breverb\b/iu, /\breverb\b/iu],
    [/\bnightcore\b/iu, /\bnightcore\b/iu],
    [/\bremix\b/iu, /\bremix\b/iu],
    [/\blyrics?\b|\blyric\s+video\b/iu, /\blyrics?\b|\blyric\s+video\b/iu],
    [/\blive\b/iu, /\blive\b/iu],
    [/\bbass\s*boosted\b/iu, /\bbass\s*boosted\b/iu],
    [/\b8d\b/iu, /\b8d\b/iu],
  ];
  const requested = checks.filter(([pattern]) => pattern.test(q));
  return (
    requested.length > 0 && requested.every(([, pattern]) => pattern.test(text))
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
  engine: PlaybackContextAdapter,
  onOpenArtist?: ArtistOpenHandler,
  onOpenAlbum?: AlbumOpenHandler,
  onOpenPlaylist?: PlaylistOpenHandler,
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
  let variantObserver: IntersectionObserver | null = null;
  let variantViewRevision = 0;
  let interactionRevision = 0;
  // Background details must not replace a list the user is already using.
  for (const event of ['pointerdown', 'click', 'keydown', 'wheel', 'touchstart']) {
    root.addEventListener(event, () => {
      interactionRevision++;
    });
  }

  const syncNowPlaying = () => {
    if (root.hidden) return;
    for (const button of root.querySelectorAll<HTMLButtonElement>(
      'button[data-video-id]',
    )) {
      const active = Boolean(
        currentTrackId && button.dataset.videoId === currentTrackId,
      );
      if (button.classList.contains('is-now-playing') !== active) button.classList.toggle('is-now-playing', active);
      if (active) {
        if (button.getAttribute('aria-current') !== 'true') button.setAttribute('aria-current', 'true');
      } else if (button.hasAttribute('aria-current')) button.removeAttribute('aria-current');
    }
  };

  const unsubscribeState = engine.subscribe((state) => {
    if (currentTrackId === state.track.id) return;
    currentTrackId = state.track.id;
    syncNowPlaying();
  });

  const setVisible = (visible: boolean) => {
    root.hidden = !visible;
    if (visible) syncNowPlaying();
    document.documentElement.classList.toggle('ui143-search-open', visible);
  };

  const stopVariantLoading = () => {
    variantViewRevision++;
    variantObserver?.disconnect();
    variantObserver = null;
  };

  const clear = () => {
    stopVariantLoading();
    content.replaceChildren();
  };

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
    if (item.kind === 'playlist' && item.browseId && onOpenPlaylist) {
      setVisible(false);
      onOpenPlaylist(item.title, item.browseId, true);
      return;
    }
    if (!engine.openSearchResult(item)) return;
    if (!item.videoId) setVisible(false);
  };

  const playContextItem = (
    items: readonly SearchResultItem[],
    item: SearchResultItem,
  ) => {
    const songs = items.filter(
      (candidate) => candidate.kind === 'song' && !isEpisodeLike(candidate),
    );
    const index = songs.findIndex(
      (candidate) => candidate.videoId && candidate.videoId === item.videoId,
    );
    if (index < 0) {
      openItem(item);
      return;
    }
    engine.playContext(songs, index, {
      kind: 'search',
      title: lastQuery || 'Search results',
    });
  };

  const resultButton = (
    item: SearchResultItem,
    className: string,
    onClick?: () => void,
  ) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    if (item.videoId) button.dataset.videoId = item.videoId;
    button.addEventListener('click', onClick ?? (() => openItem(item)));
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

  const renderTopTracks = (
    items: readonly SearchResultItem[],
    onShowAll?: () => void,
  ) => {
    const section = document.createElement('section');
    section.className = 'ui143-search-top-tracks';
    const heading = document.createElement('div');
    heading.className = 'ui143-search-section-heading';
    const title = document.createElement('h2');
    title.textContent = 'Top tracks';
    heading.append(title);

    if (onShowAll) {
      const showAll = document.createElement('button');
      showAll.type = 'button';
      showAll.textContent = 'See all';
      showAll.style.marginLeft = 'auto';
      showAll.style.padding = '5px 9px';
      showAll.style.border = '0';
      showAll.style.borderRadius = '999px';
      showAll.style.background = 'transparent';
      showAll.style.color = 'var(--ui143-muted)';
      showAll.style.font = 'inherit';
      showAll.style.fontSize = '11px';
      showAll.style.fontWeight = '700';
      showAll.style.cursor = 'pointer';
      showAll.addEventListener('mouseenter', () => {
        showAll.style.color = '#fff';
        showAll.style.background = 'rgba(255,255,255,.06)';
      });
      showAll.addEventListener('mouseleave', () => {
        showAll.style.color = 'var(--ui143-muted)';
        showAll.style.background = 'transparent';
      });
      showAll.addEventListener('click', onShowAll);
      heading.append(showAll);
    }

    const list = document.createElement('div');
    list.className = 'ui143-search-top-track-list';
    const songs = items.filter(
      (item) => item.kind === 'song' && !isEpisodeLike(item),
    );
    for (const [index, item] of songs.slice(0, 10).entries()) {
      const row = resultButton(item, 'ui143-search-top-track', () => {
        engine.playContext(songs, index, {
          kind: 'search',
          title: lastQuery || 'Search results',
        });
      });
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
    const songs = items
      .filter((entry) => entry.kind === 'song' && !isEpisodeLike(entry))
      .slice(0, limit);
    for (const item of songs) {
      const row = resultButton(item, 'ui143-search-song', () =>
        playContextItem(songs, item),
      );
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

  const appendHeading = (query: string, eyebrowText = 'Search results') => {
    const heading = document.createElement('div');
    heading.className = 'ui143-search-heading';
    const eyebrow = document.createElement('span');
    eyebrow.textContent = eyebrowText;
    const title = document.createElement('h1');
    title.textContent = query;
    heading.append(eyebrow, title);
    content.append(heading);
  };

  const renderFocusCard = (
    labelText: string,
    item: SearchResultItem,
    round = false,
    contextItems?: readonly SearchResultItem[],
  ) => {
    const card = resultButton(
      item,
      'ui143-search-focus-card',
      item.kind === 'song' && contextItems
        ? () => playContextItem(contextItems, item)
        : undefined,
    );
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
      const moreSongs = rankTracks(results.songs).filter(
        (item) => item.videoId !== focus.song.videoId,
      );
      const contextSongs = [focus.song, ...moreSongs];
      grid.append(renderFocusCard('Track', focus.song, false, contextSongs));
      if (focus.album) grid.append(renderFocusCard('Album', focus.album));
      if (focus.artist) grid.append(renderFocusArtist(focus.artist));
      content.append(grid);

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

  const renderVariantAll = (results: SearchCatalog) => {
    clear();
    const token = variantViewRevision;
    hasResults = true;
    appendHeading(results.query, 'All alternate versions');

    const toolbar = document.createElement('div');
    toolbar.style.display = 'flex';
    toolbar.style.alignItems = 'center';
    toolbar.style.gap = '12px';
    toolbar.style.margin = '-8px 0 18px';

    const back = document.createElement('button');
    back.type = 'button';
    back.textContent = '← Back to results';
    back.style.padding = '7px 11px';
    back.style.border = '1px solid rgba(255,255,255,.10)';
    back.style.borderRadius = '999px';
    back.style.background = 'rgba(255,255,255,.035)';
    back.style.color = '#d0d0d0';
    back.style.font = 'inherit';
    back.style.fontSize = '11px';
    back.style.fontWeight = '700';
    back.style.cursor = 'pointer';
    back.addEventListener('click', () => render(results));

    const hint = document.createElement('span');
    hint.textContent = 'More results load as you scroll';
    hint.style.color = 'var(--ui143-subtle)';
    hint.style.fontSize = '11px';
    toolbar.append(back, hint);
    content.append(toolbar);

    const section = document.createElement('section');
    section.className = 'ui143-search-section ui143-search-more-songs';
    section.style.marginTop = '0';
    const list = document.createElement('div');
    list.className = 'ui143-search-song-list';
    list.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
    section.append(list);
    content.append(section);

    const allItems: SearchResultItem[] = [];
    const seen = new Set<string>();
    const sentinel = document.createElement('div');

    const appendItems = (items: readonly SearchResultItem[]) => {
      const additions = items.filter((item) => {
        if (
          item.kind !== 'song' ||
          !item.videoId ||
          isEpisodeLike(item) ||
          !requestedVariantMatches(results.query, item) ||
          seen.has(item.videoId)
        )
          return false;
        seen.add(item.videoId);
        return true;
      });
      allItems.push(...additions);

      for (const item of additions) {
        const row = resultButton(item, 'ui143-search-song', () =>
          playContextItem(allItems, item),
        );
        row.append(image(item, 'ui143-search-song-art'));
        const copy = document.createElement('div');
        copy.className = 'ui143-search-song-copy';
        const title = document.createElement('strong');
        title.textContent = item.title;
        copy.append(title, subtitle(item));
        row.append(copy);
        if (sentinel.isConnected) list.insertBefore(row, sentinel);
        else list.append(row);
      }
      syncNowPlaying();
      return additions.length;
    };

    appendItems(results.songs);

    sentinel.textContent = 'Loading more…';
    sentinel.style.gridColumn = '1 / -1';
    sentinel.style.minHeight = '72px';
    sentinel.style.display = 'grid';
    sentinel.style.placeItems = 'center';
    sentinel.style.color = 'var(--ui143-subtle)';
    sentinel.style.fontSize = '12px';
    sentinel.style.fontWeight = '600';
    sentinel.style.opacity = '.8';
    list.append(sentinel);

    const queries = variantLoadQueries(results.query);
    let cursor = 0;
    let loading = false;
    let emptyBatches = 0;

    const loadMore = async () => {
      if (
        loading ||
        token !== variantViewRevision ||
        cursor >= queries.length
      )
        return;
      loading = true;
      sentinel.textContent = 'Loading more…';
      const batch = queries.slice(cursor, cursor + 2);
      cursor += batch.length;
      const before = allItems.length;
      try {
        const settled = await Promise.allSettled(
          batch.map((query) => engine.searchCatalog(query)),
        );
        if (token !== variantViewRevision) return;
        for (const entry of settled) {
          if (entry.status !== 'fulfilled') continue;
          appendItems(entry.value.songs);
        }
        emptyBatches = allItems.length === before ? emptyBatches + 1 : 0;
      } finally {
        loading = false;
      }

      if (cursor >= queries.length || emptyBatches >= 4) {
        variantObserver?.disconnect();
        sentinel.textContent = 'End of results';
        sentinel.style.opacity = '.55';
      } else if (
        sentinel.getBoundingClientRect().top <
        root.getBoundingClientRect().bottom + 500
      ) {
        void loadMore();
      }
    };

    variantObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { root, rootMargin: '500px 0px 700px', threshold: 0.01 },
    );
    variantObserver.observe(sentinel);
    void loadMore();
  };

  const render = (results: SearchCatalog) => {
    clear();
    const variantQuery = isVariantVideoQuery(results.query);
    const rankedSongs = variantQuery
      ? results.songs.filter(
          (item) => item.kind === 'song' && !isEpisodeLike(item),
        )
      : rankTracks(results.songs);
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
    if (rankedSongs.length)
      hero.append(
        renderTopTracks(
          rankedSongs,
          variantQuery ? () => renderVariantAll(results) : undefined,
        ),
      );
    content.append(hero);

    if (artistAlbums.length)
      content.append(
        renderCards('Albums', artistAlbums, {
          className: 'ui143-search-albums',
          limit: artistAlbums.length,
        }),
      );

    const moreSongs = rankedSongs.slice(10);
    if (!variantQuery && moreSongs.length)
      content.append(renderSongs('More tracks', moreSongs));

    if (results.artists.length)
      content.append(
        renderCards('Artists you may like', results.artists, { round: true }),
      );
    if (cleanPlaylists.length)
      content.append(renderCards('Playlists', cleanPlaylists));

    syncNowPlaying();
  };

  return {
    async search(query: string) {
      const value = query.trim();
      if (!value) return;
      lastQuery = value;
      const current = ++request;
      const interaction = interactionRevision;
      const isCurrent = () => current === request;
      const canUpdate = () =>
        isCurrent() && interaction === interactionRevision && !root.contains(document.activeElement);
      setVisible(true);
      message('Searching…');
      try {
        const initial = await engine.searchCatalog(value, { basic: true });
        if (current !== request) return;
        render(initial);
        // A failed optional request must never replace usable results with an error.
        try {
          const enriched = await engine.searchCatalog(value, { isCurrent: canUpdate });
          if (!canUpdate()) return;
          render(enriched);
          const focus = await resolveSearchFocus(engine, enriched, canUpdate);
          if (focus && canUpdate()) renderFocus(enriched, focus);
        } catch (error) {
          console.warn('[143 Music] Search details unavailable', error);
        }
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
      stopVariantLoading();
      setVisible(false);
    },
    isOpen: () => !root.hidden,
    dispose() {
      ++request;
      clear();
      unsubscribeState();
      document.documentElement.classList.remove('ui143-search-open');
      root.remove();
    },
  };
};
