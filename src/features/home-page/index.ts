import { getLoadedRendererFeature } from '@/core/renderer-features';
import { createFeature, createRenderer } from '@/utils';

import style from './style.css?inline';

import type { AlbumPageController } from '@/features/143-ui/album-page';
import type { ArtistPageController } from '@/features/143-ui/artist-page';
import type { LibraryPageController } from '@/features/143-ui/library-page';
import type { PlaybackContextAdapter } from '@/features/143-ui/playback-context';
import type { SearchPageController } from '@/features/143-ui/search-page';
import type { SearchResultItem } from '@/features/143-ui/youtube-music';
import type { MusicPlayerAppElement } from '@/types/music-player-app-element';

const ROOT_ID = 'ui143-home-page';
const HOME_BROWSE_ID = 'FEmusic_home';

type UnknownRecord = Record<string, unknown>;
type NavigationEndpoint = {
  watchEndpoint?: {
    videoId?: string;
    watchEndpointMusicSupportedConfigs?: {
      watchEndpointMusicConfig?: { musicVideoType?: string };
    };
  };
  browseEndpoint?: {
    browseId?: string;
    browseEndpointContextSupportedConfigs?: {
      browseEndpointContextMusicConfig?: { pageType?: string };
    };
  };
};
type TextRun = { text?: string; navigationEndpoint?: NavigationEndpoint };
type HomeSection = Readonly<{ title: string; items: readonly SearchResultItem[] }>;
type UiState = {
  engine: PlaybackContextAdapter | null;
  searchPage: SearchPageController | null;
  artistPage: ArtistPageController | null;
  albumPage: AlbumPageController | null;
  libraryPage: LibraryPageController | null;
};

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const runs = (value: unknown): TextRun[] =>
  isRecord(value) && Array.isArray(value.runs)
    ? (value.runs.filter(isRecord) as TextRun[])
    : [];

const text = (value: unknown): string => {
  if (typeof value === 'string') return value.replaceAll(/\s+/g, ' ').trim();
  if (!isRecord(value)) return '';
  if (typeof value.simpleText === 'string')
    return value.simpleText.replaceAll(/\s+/g, ' ').trim();
  return runs(value)
    .map((run) => run.text ?? '')
    .join('')
    .replaceAll(/\s+/g, ' ')
    .trim();
};

const endpoint = (value: unknown): NavigationEndpoint | null => {
  if (!isRecord(value)) return null;
  if (isRecord(value.watchEndpoint) || isRecord(value.browseEndpoint))
    return value as NavigationEndpoint;
  return null;
};

const deepEndpoint = (root: unknown): NavigationEndpoint | null => {
  let found: NavigationEndpoint | null = null;
  const visit = (value: unknown) => {
    if (found) return;
    if (Array.isArray(value)) return value.forEach(visit);
    if (!isRecord(value)) return;
    const direct = endpoint(value);
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
    const value = runs(renderer.text);
    if (value.length) groups.push(value);
  }
  return groups;
};

const bestArtwork = (root: unknown) => {
  let best = '';
  let score = -1;
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!isRecord(value)) return;
    if (Array.isArray(value.thumbnails)) {
      for (const raw of value.thumbnails) {
        if (!isRecord(raw) || typeof raw.url !== 'string') continue;
        const width = typeof raw.width === 'number' ? raw.width : 0;
        const height = typeof raw.height === 'number' ? raw.height : 0;
        const ratio = width && height ? width / height : 1;
        const squareBias = 1 / (1 + Math.abs(1 - ratio) * 2);
        const next = Math.max(1, width * height) * squareBias;
        if (next >= score) {
          best = raw.url;
          score = next;
        }
      }
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return best;
};

const itemFrom = (candidate: UnknownRecord): SearchResultItem | null => {
  const titleRuns = runs(candidate.title);
  const groups = flexGroups(candidate);
  const primary = titleRuns.length ? titleRuns : (groups[0] ?? []);
  const title = text(candidate.title) || primary.map((run) => run.text ?? '').join('').trim();
  if (!title) return null;
  const subtitle =
    text(candidate.subtitle) ||
    (titleRuns.length ? groups : groups.slice(1))
      .map((group) => group.map((run) => run.text ?? '').join('').trim())
      .filter(Boolean)
      .join(' • ');
  const target =
    endpoint(candidate.navigationEndpoint) ??
    endpoint(candidate.onTap) ??
    primary.map((run) => run.navigationEndpoint ?? null).find(Boolean) ??
    deepEndpoint(candidate);
  const videoId =
    target?.watchEndpoint?.videoId ??
    (isRecord(candidate.playlistItemData) &&
    typeof candidate.playlistItemData.videoId === 'string'
      ? candidate.playlistItemData.videoId
      : undefined);
  const browseId = target?.browseEndpoint?.browseId;
  const pageType =
    target?.browseEndpoint?.browseEndpointContextSupportedConfigs
      ?.browseEndpointContextMusicConfig?.pageType ?? '';
  const videoType =
    target?.watchEndpoint?.watchEndpointMusicSupportedConfigs
      ?.watchEndpointMusicConfig?.musicVideoType ?? '';

  let kind: SearchResultItem['kind'] | null = null;
  if (pageType === 'MUSIC_PAGE_TYPE_ARTIST' || browseId?.startsWith('UC')) kind = 'artist';
  else if (pageType === 'MUSIC_PAGE_TYPE_ALBUM' || browseId?.startsWith('MPRE')) kind = 'album';
  else if (
    pageType === 'MUSIC_PAGE_TYPE_PLAYLIST' ||
    browseId?.startsWith('VL') ||
    browseId?.startsWith('PL')
  )
    kind = 'playlist';
  else if (videoId) kind = /OMV|UGC|PODCAST|EPISODE/iu.test(videoType) ? 'video' : 'song';
  if (!kind) return null;

  return {
    kind,
    title,
    subtitle,
    artwork: bestArtwork(candidate),
    ...(videoId ? { videoId } : {}),
    ...(browseId ? { browseId } : {}),
  };
};

const sectionTitle = (renderer: UnknownRecord) => {
  const header = isRecord(renderer.header) ? renderer.header : null;
  const basic =
    header && isRecord(header.musicCarouselShelfBasicHeaderRenderer)
      ? header.musicCarouselShelfBasicHeaderRenderer
      : null;
  return text(renderer.title) || text(basic?.title) || text(header?.title);
};

const collectItems = (root: unknown) => {
  const result: SearchResultItem[] = [];
  const seen = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!isRecord(value)) return;
    for (const key of [
      'musicResponsiveListItemRenderer',
      'musicTwoRowItemRenderer',
      'musicMultiRowListItemRenderer',
    ]) {
      const candidate = value[key];
      if (!isRecord(candidate)) continue;
      const item = itemFrom(candidate);
      if (!item) return;
      const id = `${item.kind}:${item.videoId ?? item.browseId ?? `${item.title}\u0000${item.subtitle}`}`;
      if (!seen.has(id)) {
        seen.add(id);
        result.push(item);
      }
      return;
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return result;
};

const collectSections = (root: unknown): HomeSection[] => {
  const result: HomeSection[] = [];
  const rendererKeys = [
    'musicCarouselShelfRenderer',
    'musicImmersiveCarouselShelfRenderer',
    'musicShelfRenderer',
    'musicGridRenderer',
  ] as const;
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!isRecord(value)) return;
    for (const key of rendererKeys) {
      const renderer = value[key];
      if (!isRecord(renderer)) continue;
      const items = collectItems(renderer.contents);
      if (items.length) {
        result.push({
          title: sectionTitle(renderer) || 'For you',
          items: items.slice(0, 24),
        });
      }
      return;
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return result;
};

const uiState = (): UiState | null => {
  const feature = getLoadedRendererFeature('143-ui');
  if (!feature?.renderer || typeof feature.renderer === 'function') return null;
  return feature.renderer as unknown as UiState;
};

const setHomeNav = (active: boolean) => {
  document
    .querySelectorAll<HTMLElement>('.ui143-nav-item[data-key]')
    .forEach((item) => item.classList.toggle('is-active', active && item.dataset.key === 'home'));
};

const renderer = createRenderer<{
  root: HTMLElement | null;
  content: HTMLElement | null;
  abort: AbortController | null;
  request: number;
  returnToHome: boolean;
  show: (refresh?: boolean) => Promise<void>;
  hide: () => void;
  render: (sections: readonly HomeSection[]) => void;
  openItem: (item: SearchResultItem, section: HomeSection) => void;
}>({
  root: null,
  content: null,
  abort: null,
  request: 0,
  returnToHome: false,

  async show(refresh = false) {
    if (!this.root || !this.content) return;
    const state = uiState();
    if (!state?.engine) return;
    state.searchPage?.close();
    state.artistPage?.close();
    state.albumPage?.close();
    state.libraryPage?.close();
    this.root.hidden = false;
    setHomeNav(true);
    if (!refresh && this.content.dataset.loaded === 'true') return;

    const ticket = ++this.request;
    this.content.dataset.loaded = 'loading';
    this.content.replaceChildren();
    const loading = document.createElement('div');
    loading.className = 'ui143-home-state';
    loading.innerHTML = '<strong>Loading your Home…</strong><span>Getting recommendations from YouTube Music.</span>';
    this.content.append(loading);

    try {
      const app = document.querySelector<MusicPlayerAppElement>('ytmusic-app');
      if (!app?.networkManager?.fetch) throw new Error('YouTube Music is not ready');
      const response = await app.networkManager.fetch<unknown, { browseId: string }>(
        '/browse',
        { browseId: HOME_BROWSE_ID },
      );
      if (ticket !== this.request || this.root.hidden) return;
      const sections = collectSections(response);
      this.content.dataset.loaded = 'true';
      this.render(sections);
    } catch (error) {
      if (ticket !== this.request) return;
      console.warn('[143 Music] Could not load Home feed', error);
      this.content.dataset.loaded = 'error';
      this.content.replaceChildren();
      const failed = document.createElement('div');
      failed.className = 'ui143-home-state';
      failed.innerHTML = '<strong>Home is unavailable</strong><span>YouTube Music did not return the recommendation feed.</span>';
      this.content.append(failed);
    }
  },

  hide() {
    if (!this.root) return;
    this.root.hidden = true;
    this.returnToHome = false;
  },

  openItem(item, section) {
    const state = uiState();
    const engine = state?.engine;
    if (!engine) return;
    if (item.kind === 'song' && item.videoId) {
      const tracks = section.items.filter(
        (entry): entry is SearchResultItem & { videoId: string } =>
          entry.kind === 'song' && Boolean(entry.videoId),
      );
      const index = tracks.findIndex((entry) => entry.videoId === item.videoId);
      if (tracks.length && index >= 0) {
        engine.playContext(tracks, index, {
          kind: 'search',
          title: section.title,
        });
        return;
      }
    }
    if (item.kind === 'album' && item.browseId) {
      this.returnToHome = true;
      this.root!.hidden = true;
      setHomeNav(false);
      void state?.albumPage?.open(item.title, item.browseId);
      return;
    }
    if (item.kind === 'playlist' && item.browseId) {
      this.returnToHome = true;
      this.root!.hidden = true;
      setHomeNav(false);
      void state?.albumPage?.openPlaylist(item.title, item.browseId);
      return;
    }
    if (item.kind === 'artist' && item.browseId) {
      this.returnToHome = true;
      this.root!.hidden = true;
      setHomeNav(false);
      void state?.artistPage?.open(item.title, item.browseId);
      return;
    }
    engine.openSearchResult(item);
  },

  render(sections) {
    if (!this.content) return;
    this.content.replaceChildren();
    if (!sections.length) {
      const empty = document.createElement('div');
      empty.className = 'ui143-home-state';
      empty.innerHTML = '<strong>Nothing here yet</strong><span>YouTube Music returned an empty Home feed.</span>';
      this.content.append(empty);
      return;
    }

    const intro = document.createElement('header');
    intro.className = 'ui143-home-intro';
    const eyebrow = document.createElement('span');
    eyebrow.textContent = '143 Music';
    const title = document.createElement('h1');
    title.textContent = 'Home';
    const subtitle = document.createElement('p');
    subtitle.textContent = 'Your YouTube Music recommendations, without the YouTube Music UI.';
    intro.append(eyebrow, title, subtitle);
    this.content.append(intro);

    for (const section of sections) {
      const block = document.createElement('section');
      block.className = 'ui143-home-section';
      const heading = document.createElement('h2');
      heading.textContent = section.title;
      block.append(heading);

      const songCount = section.items.filter((item) => item.kind === 'song').length;
      const compact = songCount >= Math.ceil(section.items.length * 0.6);
      const list = document.createElement('div');
      list.className = compact ? 'ui143-home-tracks' : 'ui143-home-cards';

      for (const item of section.items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = compact ? 'ui143-home-track' : 'ui143-home-card';
        button.title = item.subtitle ? `${item.title} — ${item.subtitle}` : item.title;
        button.addEventListener('click', () => this.openItem(item, section));

        const art = document.createElement('div');
        art.className = 'ui143-home-art';
        if (item.artwork) {
          const image = document.createElement('img');
          image.src = item.artwork;
          image.alt = '';
          image.loading = 'lazy';
          art.append(image);
        } else {
          art.textContent = item.kind === 'artist' ? '◉' : '♪';
        }
        if (item.kind === 'artist') art.classList.add('is-artist');

        const copy = document.createElement('div');
        copy.className = 'ui143-home-copy';
        const name = document.createElement('strong');
        name.textContent = item.title;
        const meta = document.createElement('span');
        meta.textContent = item.subtitle || item.kind[0].toUpperCase() + item.kind.slice(1);
        copy.append(name, meta);
        button.append(art, copy);
        list.append(button);
      }
      block.append(list);
      this.content.append(block);
    }
  },

  start() {
    const state = uiState();
    if (!state?.engine) throw new Error('143 UI is not ready');
    document.getElementById(ROOT_ID)?.remove();
    const root = document.createElement('main');
    root.id = ROOT_ID;
    const content = document.createElement('div');
    content.className = 'ui143-home-content';
    root.append(content);
    document.body.append(root);
    this.root = root;
    this.content = content;

    this.abort = new AbortController();
    const { signal } = this.abort;
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const nav = target?.closest<HTMLElement>('.ui143-nav-item[data-key]');
        if (nav?.dataset.key === 'home') {
          event.preventDefault();
          event.stopPropagation();
          void this.show(true);
          return;
        }
        if (nav) this.hide();

        const back = target?.closest<HTMLElement>('.ui143-history .ui143-circle-button');
        if (back && this.returnToHome) {
          window.setTimeout(() => {
            const ui = uiState();
            if (
              this.returnToHome &&
              !ui?.albumPage?.isOpen() &&
              !ui?.artistPage?.isOpen() &&
              !ui?.searchPage?.isOpen()
            ) {
              this.returnToHome = false;
              void this.show(false);
            }
          }, 0);
        }
      },
      { capture: true, signal },
    );
    document.addEventListener(
      'submit',
      (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.matches('.ui143-search')) this.hide();
      },
      { capture: true, signal },
    );
    void this.show(true);
  },

  stop() {
    this.abort?.abort();
    this.abort = null;
    this.request++;
    this.root?.remove();
    this.root = null;
    this.content = null;
    this.returnToHome = false;
  },
});

export default createFeature({
  name: () => '143 Music Home',
  description: () => 'Renders the personalized YouTube Music Home feed in the 143 UI.',
  config: { enabled: true },
  stylesheets: [style],
  renderer,
});
