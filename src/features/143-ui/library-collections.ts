import collectionStyle from './library-collections.css?inline';

import type { PlaybackContextAdapter } from './playback-context';
import type { SearchResultItem } from './youtube-music';
import type { AlbumCatalog, ArtistCatalog } from './youtube-music-catalog';
import type { MusicPlayerAppElement } from '@/types/music-player-app-element';

type UnknownRecord = Record<string, unknown>;
type CollectionKind = 'albums' | 'artists';
type EntityKind = 'album' | 'artist';

type NavigationEndpoint = {
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

type LibraryEntity = Readonly<{
  kind: EntityKind;
  title: string;
  subtitle: string;
  artwork: string;
  browseId: string;
}>;

type CollectionState = {
  items: LibraryEntity[];
  continuation: string;
  loaded: boolean;
  loading: boolean;
};

type View =
  | Readonly<{ kind: CollectionKind }>
  | Readonly<{ kind: 'album-detail'; item: LibraryEntity }>
  | Readonly<{ kind: 'artist-detail'; item: LibraryEntity }>;

const ROOT_ID = 'ui143-library-collections';
const BROWSE_IDS: Record<CollectionKind, string> = {
  albums: 'FEmusic_liked_albums',
  // This is the subscriptions/followed-artists collection. The old
  // FEmusic_library_corpus_track_artists page is merely artists inferred from
  // songs/albums in the library, so following an artist would not appear there.
  artists: 'FEmusic_library_corpus_artists',
};

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
  if (!isRecord(value) || !isRecord(value.browseEndpoint)) return null;
  return value as NavigationEndpoint;
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

const bestSquareThumbnail = (root: unknown) => {
  let best = '';
  let score = -1;
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
        if (!width || !height) continue;
        const ratio = width / height;
        if (ratio < 0.72 || ratio > 1.38) continue;
        const area = width * height;
        const nextScore = area / (1 + Math.abs(1 - ratio) * 4);
        if (nextScore >= score) {
          score = nextScore;
          best = raw.url;
        }
      }
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return best;
};

const deepBrowseEndpoint = (root: unknown): NavigationEndpoint | null => {
  let found: NavigationEndpoint | null = null;
  const visit = (value: unknown) => {
    if (found) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    const endpoint = endpointFrom(value);
    if (endpoint?.browseEndpoint?.browseId) {
      found = endpoint;
      return;
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return found;
};

const entityFromCandidate = (
  candidate: UnknownRecord,
  expected: EntityKind,
): LibraryEntity | null => {
  const titleRuns = readRuns(candidate.title);
  const groups = flexGroups(candidate);
  const effectiveTitleRuns = titleRuns.length ? titleRuns : (groups[0] ?? []);
  const title =
    textFromRuns(effectiveTitleRuns) || textFromValue(candidate.title);
  if (!title) return null;

  const runEndpoint = effectiveTitleRuns
    .map((run) => run.navigationEndpoint ?? null)
    .find((endpoint) => endpoint?.browseEndpoint?.browseId);
  const endpoint =
    runEndpoint ??
    endpointFrom(candidate.navigationEndpoint) ??
    endpointFrom(candidate.onTap) ??
    deepBrowseEndpoint(candidate);
  const browseId = endpoint?.browseEndpoint?.browseId ?? '';
  const pageType =
    endpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs
      ?.browseEndpointContextMusicConfig?.pageType ?? '';

  const actualKind: EntityKind | null =
    pageType === 'MUSIC_PAGE_TYPE_ARTIST' || browseId.startsWith('UC')
      ? 'artist'
      : pageType === 'MUSIC_PAGE_TYPE_ALBUM' || browseId.startsWith('MPRE')
        ? 'album'
        : null;
  if (!browseId || actualKind !== expected) return null;

  const subtitle =
    textFromValue(candidate.subtitle) ||
    (titleRuns.length ? groups : groups.slice(1))
      .map(textFromRuns)
      .filter(Boolean)
      .join(' • ');

  return {
    kind: actualKind,
    title,
    subtitle,
    artwork: bestSquareThumbnail(candidate),
    browseId,
  };
};

const collectEntities = (root: unknown, expected: EntityKind) => {
  const result: LibraryEntity[] = [];
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
      const item = entityFromCandidate(candidate, expected);
      if (item && !seen.has(item.browseId)) {
        seen.add(item.browseId);
        result.push(item);
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
    const item = isRecord(value.continuationItemRenderer)
      ? value.continuationItemRenderer
      : null;
    const endpoint = item && isRecord(item.continuationEndpoint)
      ? item.continuationEndpoint
      : null;
    const command = endpoint && isRecord(endpoint.continuationCommand)
      ? endpoint.continuationCommand
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

const image = (src: string, className: string, fallback: string) => {
  const art = document.createElement('div');
  art.className = className;
  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.loading = 'lazy';
    art.append(img);
  } else art.textContent = fallback;
  return art;
};

export type LibraryCollectionsController = ReturnType<typeof mountLibraryCollections>;

export const mountLibraryCollections = (engine: PlaybackContextAdapter) => {
  document.getElementById(ROOT_ID)?.remove();
  const sheet = new CSSStyleSheet();
  void sheet.replace(collectionStyle);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

  const root = document.createElement('main');
  root.id = ROOT_ID;
  root.hidden = true;
  root.setAttribute('aria-live', 'polite');
  const content = document.createElement('div');
  content.className = 'ui143-library-collections-content';
  root.append(content);
  document.body.append(root);

  const collections: Record<CollectionKind, CollectionState> = {
    albums: { items: [], continuation: '', loaded: false, loading: false },
    artists: { items: [], continuation: '', loaded: false, loading: false },
  };
  const albumCache = new Map<string, Promise<AlbumCatalog>>();
  const artistCache = new Map<string, Promise<ArtistCatalog>>();
  const history: View[] = [];
  let view: View = { kind: 'albums' };
  let filter = '';
  let disposed = false;
  let request = 0;
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
    document.documentElement.classList.toggle(
      'ui143-library-collections-open',
      visible,
    );
  };

  const syncNowPlaying = () => {
    for (const row of root.querySelectorAll<HTMLElement>('[data-video-id]')) {
      const active = Boolean(currentTrackId && row.dataset.videoId === currentTrackId);
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
    observer?.disconnect();
    content.replaceChildren();
    const state = document.createElement('div');
    state.className = 'ui143-library-collections-message';
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

  const loadCollection = async (kind: CollectionKind) => {
    const state = collections[kind];
    if (state.loaded || state.loading) return;
    state.loading = true;
    try {
      const response = await fetchBrowse(BROWSE_IDS[kind]);
      if (disposed) return;
      const expected: EntityKind = kind === 'albums' ? 'album' : 'artist';
      state.items = collectEntities(response, expected);
      state.continuation = continuationToken(response);
      state.loaded = true;
    } finally {
      state.loading = false;
    }
  };

  const loadMore = async (kind: CollectionKind) => {
    const state = collections[kind];
    if (disposed || state.loading || !state.continuation) return;
    state.loading = true;
    const token = state.continuation;
    try {
      const response = await fetchContinuation(token);
      if (disposed || token !== state.continuation) return;
      const expected: EntityKind = kind === 'albums' ? 'album' : 'artist';
      const known = new Set(state.items.map((item) => item.browseId));
      const additions = collectEntities(response, expected).filter(
        (item) => !known.has(item.browseId),
      );
      state.items = [...state.items, ...additions];
      state.continuation = continuationToken(response);
      if (view.kind === kind) renderCollection(kind);
    } catch (error) {
      console.warn(`[143 Music] Could not continue library ${kind}`, error);
    } finally {
      state.loading = false;
    }
  };

  const matchesFilter = (item: LibraryEntity) => {
    const key = filter.trim().toLocaleLowerCase();
    return !key || `${item.title} ${item.subtitle}`.toLocaleLowerCase().includes(key);
  };

  const top = (title: string, eyebrow = 'Your Library') => {
    const header = document.createElement('header');
    header.className = 'ui143-library-collections-header';
    const copy = document.createElement('div');
    const label = document.createElement('span');
    label.textContent = eyebrow;
    const heading = document.createElement('h1');
    heading.textContent = title;
    copy.append(label, heading);
    header.append(copy);
    return header;
  };

  const tabs = (active: CollectionKind) => {
    const bar = document.createElement('nav');
    bar.className = 'ui143-library-collections-tabs';
    for (const [label, kind] of [
      ['Albums', 'albums'],
      ['Artists', 'artists'],
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ui143-library-collections-tab';
      button.classList.toggle('is-active', active === kind);
      button.textContent = label;
      button.addEventListener('click', () => void open(kind));
      bar.append(button);
    }
    return bar;
  };

  const filterInput = (kind: CollectionKind) => {
    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'ui143-library-collections-filter';
    input.placeholder = kind === 'albums' ? 'Filter albums' : 'Filter artists';
    input.value = filter;
    input.addEventListener('input', () => {
      filter = input.value;
      renderCollection(kind);
    });
    return input;
  };

  const albumCatalog = (item: LibraryEntity) => {
    const existing = albumCache.get(item.browseId);
    if (existing) return existing;
    const promise = engine.getAlbumCatalog(item.browseId, item.title);
    promise.catch(() => albumCache.delete(item.browseId));
    albumCache.set(item.browseId, promise);
    return promise;
  };
  const artistCatalog = (item: LibraryEntity) => {
    const existing = artistCache.get(item.browseId);
    if (existing) return existing;
    const promise = engine.getArtistCatalog(item.browseId, item.title);
    promise.catch(() => artistCache.delete(item.browseId));
    artistCache.set(item.browseId, promise);
    return promise;
  };

  const openDetail = async (
    detail: Extract<View, { kind: 'album-detail' | 'artist-detail' }>,
    push = true,
  ) => {
    if (push) history.push(view);
    view = detail;
    filter = '';
    const token = ++request;
    setVisible(true);
    message(detail.kind === 'album-detail' ? 'Loading album…' : 'Loading artist…');
    try {
      if (detail.kind === 'album-detail') {
        const catalog = await albumCatalog(detail.item);
        if (disposed || token !== request) return;
        renderAlbumDetail(detail.item, catalog);
      } else {
        const catalog = await artistCatalog(detail.item);
        if (disposed || token !== request) return;
        renderArtistDetail(detail.item, catalog);
      }
    } catch (error) {
      if (token !== request) return;
      console.error('[143 Music] Library detail failed', error);
      message(
        detail.kind === 'album-detail' ? 'Album unavailable' : 'Artist unavailable',
        'YouTube Music did not return this saved item.',
      );
    }
  };

  const card = (item: LibraryEntity) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ui143-library-collection-card is-${item.kind}`;
    const art = image(
      item.artwork,
      'ui143-library-collection-art',
      item.kind === 'artist' ? '●' : '♪',
    );
    const title = document.createElement('strong');
    title.textContent = item.title;
    const meta = document.createElement('span');
    meta.textContent = item.subtitle || (item.kind === 'artist' ? 'Artist' : 'Album');
    button.append(art, title, meta);
    button.addEventListener('click', () =>
      void openDetail(
        item.kind === 'artist'
          ? { kind: 'artist-detail', item }
          : { kind: 'album-detail', item },
      ),
    );
    return button;
  };

  const renderCollection = (kind: CollectionKind) => {
    observer?.disconnect();
    const state = collections[kind];
    content.replaceChildren();
    const header = top(kind === 'albums' ? 'Albums' : 'Artists');
    header.append(filterInput(kind));
    content.append(header, tabs(kind));

    const visible = state.items.filter(matchesFilter);
    if (!visible.length) {
      const empty = document.createElement('div');
      empty.className = 'ui143-library-collections-message';
      empty.textContent = filter
        ? 'Nothing matches this filter.'
        : kind === 'albums'
          ? 'No saved albums yet.'
          : 'No followed artists yet.';
      content.append(empty);
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'ui143-library-collection-grid';
    for (const item of visible) grid.append(card(item));
    content.append(grid);

    const sentinel = document.createElement('div');
    sentinel.className = 'ui143-library-collections-sentinel';
    sentinel.textContent = state.continuation ? 'Loading more as you scroll…' : `End of ${kind}`;
    content.append(sentinel);
    if (state.continuation) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) void loadMore(kind);
        },
        { root, rootMargin: '500px 0px' },
      );
      observer.observe(sentinel);
    }
  };

  const action = (label: string, secondary = false) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ui143-library-detail-action${secondary ? ' secondary' : ''}`;
    button.textContent = label;
    return button;
  };

  const detailBack = (label: string) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ui143-library-detail-back';
    button.textContent = `← ${label}`;
    button.addEventListener('click', () => back());
    return button;
  };

  const trackList = (
    tracks: readonly SearchResultItem[],
    source: Readonly<{ kind: 'album' | 'artist'; title: string; browseId: string }>,
  ) => {
    const list = document.createElement('div');
    list.className = 'ui143-library-detail-tracks';
    for (const [index, item] of tracks.entries()) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ui143-library-detail-track';
      if (item.videoId) row.dataset.videoId = item.videoId;
      row.dataset.trackTitle = item.title;
      row.dataset.trackSubtitle = item.subtitle;
      const number = document.createElement('span');
      number.className = 'ui143-library-detail-number';
      number.textContent = String(index + 1);
      const art = image(item.artwork, 'ui143-library-detail-track-art', '♪');
      const copy = document.createElement('div');
      copy.className = 'ui143-library-detail-track-copy';
      const name = document.createElement('strong');
      name.textContent = item.title;
      const meta = document.createElement('span');
      meta.textContent = item.subtitle;
      copy.append(name, meta);
      const now = document.createElement('span');
      now.className = 'ui143-library-detail-now';
      now.textContent = 'Now playing';
      row.append(number, art, copy, now);
      row.addEventListener('click', () => engine.playContext(tracks, index, source));
      list.append(row);
    }
    return list;
  };

  const renderAlbumDetail = (item: LibraryEntity, catalog: AlbumCatalog) => {
    observer?.disconnect();
    content.replaceChildren(detailBack('Back to albums'));
    const hero = document.createElement('section');
    hero.className = 'ui143-library-detail-hero';
    hero.append(image(catalog.artwork || item.artwork, 'ui143-library-detail-art', '♪'));
    const copy = document.createElement('div');
    copy.className = 'ui143-library-detail-copy';
    const label = document.createElement('span');
    label.textContent = 'Album';
    const title = document.createElement('h1');
    title.textContent = catalog.title || item.title;
    const meta = document.createElement('p');
    meta.textContent = [
      catalog.artists.map((artist) => artist.name).filter(Boolean).join(', '),
      catalog.year,
      `${catalog.tracks.length} tracks`,
    ].filter(Boolean).join(' • ');
    const actions = document.createElement('div');
    actions.className = 'ui143-library-detail-actions';
    const play = action('Play');
    const shuffle = action('Shuffle', true);
    play.disabled = !catalog.tracks.length;
    shuffle.disabled = !catalog.tracks.length;
    const source = {
      kind: 'album' as const,
      title: catalog.title || item.title,
      browseId: item.browseId,
    };
    play.addEventListener('click', () => {
      if (catalog.tracks.length) engine.playContext(catalog.tracks, 0, source);
    });
    shuffle.addEventListener('click', () => {
      if (!catalog.tracks.length) return;
      engine.playContext(
        catalog.tracks,
        Math.floor(Math.random() * catalog.tracks.length),
        source,
        { shuffle: true },
      );
    });
    actions.append(play, shuffle);
    copy.append(label, title, meta, actions);
    hero.append(copy);
    content.append(hero);
    if (catalog.tracks.length)
      content.append(trackList(catalog.tracks, source));
    syncNowPlaying();
  };

  const artistShelf = (
    titleText: string,
    items: readonly SearchResultItem[],
    round = false,
  ) => {
    const section = document.createElement('section');
    section.className = 'ui143-library-artist-section';
    const heading = document.createElement('h2');
    heading.textContent = titleText;
    const shelf = document.createElement('div');
    shelf.className = 'ui143-artist-shelf-row ui143-library-artist-shelf';
    for (const result of items) {
      if (!result.browseId) continue;
      const item: LibraryEntity = {
        kind: result.kind === 'artist' ? 'artist' : 'album',
        title: result.title,
        subtitle: result.subtitle,
        artwork: result.artwork,
        browseId: result.browseId,
      };
      const button = card(item);
      button.classList.add('ui143-library-shelf-card');
      if (round) button.classList.add('is-round');
      shelf.append(button);
    }
    section.append(heading, shelf);
    return section;
  };

  const renderArtistDetail = (item: LibraryEntity, catalog: ArtistCatalog) => {
    observer?.disconnect();
    content.replaceChildren(detailBack('Back to artists'));
    const hero = document.createElement('section');
    hero.className = 'ui143-library-artist-hero';
    if (catalog.profile.banner) {
      const banner = document.createElement('img');
      banner.src = catalog.profile.banner;
      banner.alt = '';
      banner.className = 'ui143-library-artist-banner';
      hero.append(banner);
    }
    const shade = document.createElement('div');
    shade.className = 'ui143-library-artist-shade';
    const identity = document.createElement('div');
    identity.className = 'ui143-library-artist-identity';
    identity.append(
      image(catalog.profile.avatar || item.artwork, 'ui143-library-artist-avatar', '●'),
    );
    const copy = document.createElement('div');
    const label = document.createElement('span');
    label.textContent = 'Artist';
    const title = document.createElement('h1');
    title.textContent = catalog.profile.title || item.title;
    const metrics = document.createElement('p');
    metrics.textContent = [catalog.profile.subscribers, catalog.profile.monthlyListeners]
      .filter(Boolean)
      .join(' • ');
    copy.append(label, title, metrics);
    identity.append(copy);
    hero.append(shade, identity);
    content.append(hero);

    if (catalog.topTracks.length) {
      const section = document.createElement('section');
      section.className = 'ui143-library-artist-section';
      const heading = document.createElement('h2');
      heading.textContent = 'Top tracks';
      section.append(heading, trackList(catalog.topTracks.slice(0, 10), {
        kind: 'artist',
        title: catalog.profile.title || item.title,
        browseId: item.browseId,
      }));
      content.append(section);
    }
    if (catalog.albums.length) content.append(artistShelf('Albums', catalog.albums));
    if (catalog.releases.length) content.append(artistShelf('Latest', catalog.releases));
    if (catalog.relatedArtists.length)
      content.append(artistShelf('Related artists', catalog.relatedArtists.slice(0, 16), true));
    syncNowPlaying();
  };

  const showView = async (next: View, push = false) => {
    if (next.kind === 'albums' || next.kind === 'artists') {
      if (push) history.push(view);
      view = next;
      filter = '';
      const token = ++request;
      setVisible(true);
      message(`Loading ${next.kind}…`);
      try {
        await loadCollection(next.kind);
        if (disposed || token !== request) return;
        renderCollection(next.kind);
      } catch (error) {
        if (token !== request) return;
        console.error(`[143 Music] Library ${next.kind} failed`, error);
        message('Library unavailable', `YouTube Music did not return saved ${next.kind}.`);
      }
      return;
    }
    await openDetail(next, push);
  };

  const open = (kind: CollectionKind) => showView({ kind });

  const back = () => {
    if (root.hidden) return false;
    const previous = history.pop();
    if (previous) {
      void showView(previous);
      return true;
    }
    if (view.kind === 'album-detail') {
      void showView({ kind: 'albums' });
      return true;
    }
    if (view.kind === 'artist-detail') {
      void showView({ kind: 'artists' });
      return true;
    }
    setVisible(false);
    return 'library' as const;
  };

  const onLibraryChanged = (event: Event) => {
    const kind = (event as CustomEvent<{ kind?: CollectionKind }>).detail?.kind;
    if (kind !== 'albums' && kind !== 'artists') return;
    const state = collections[kind];
    state.items = [];
    state.continuation = '';
    state.loaded = false;
    state.loading = false;
    if (kind === 'albums') albumCache.clear();
    else artistCache.clear();
    if (!root.hidden && view.kind === kind) void showView({ kind });
  };
  document.addEventListener('ui143:library-changed', onLibraryChanged);

  return {
    open,
    back,
    close() {
      ++request;
      history.length = 0;
      observer?.disconnect();
      setVisible(false);
    },
    isOpen: () => !root.hidden,
    dispose() {
      disposed = true;
      ++request;
      history.length = 0;
      observer?.disconnect();
      unsubscribe();
      document.removeEventListener('ui143:library-changed', onLibraryChanged);
      albumCache.clear();
      artistCache.clear();
      document.documentElement.classList.remove('ui143-library-collections-open');
      root.remove();
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
        (entry) => entry !== sheet,
      );
    },
  };
};
