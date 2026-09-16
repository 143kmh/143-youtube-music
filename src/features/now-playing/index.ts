import { createFeature, createRenderer } from '@/utils';

import style from './style.css?inline';
import { installBrowseCatalog, type AlbumCatalog } from '@/features/143-ui/youtube-music-catalog';
import type {
  SearchResultItem,
  YouTubeMusicAdapter,
} from '@/features/143-ui/youtube-music';
import { currentLyrics, lyricsStore } from '@/features/synced-lyrics/renderer/store';

import type { MusicPlayer } from '@/types/music-player';
import type { QueueElement } from '@/types/queue';

const ROOT_ID = 'ui143-now-playing';
const PLAY_CONTEXT_EVENT = 'ui143:play-context';
const PLAY_CONTEXT_INDEX_EVENT = 'ui143:play-context-index';

type TabId = 'lyrics' | 'playlist' | 'album';

type AlbumRef = Readonly<{
  title: string;
  browseId: string;
}>;

type PlaylistSnapshot = Readonly<{
  title: string;
  browseId?: string;
  items: readonly SearchResultItem[];
}>;

type NowPlayingState = {
  player: MusicPlayer | null;
  root: HTMLElement | null;
  timer: number | null;
  clickHandler: ((event: MouseEvent) => void) | null;
  keyHandler: ((event: KeyboardEvent) => void) | null;
  activeTab: TabId;
  trackId: string;
  artwork: string;
  albumRef: AlbumRef | null;
  albumCatalog: AlbumCatalog | null;
  albumRequest: number;
  lyricsKey: string;
  activeLyricIndex: number;
  playlistKey: string;
  playlistSnapshot: PlaylistSnapshot | null;
  playlistSnapshotArmed: boolean;
  mount: () => void;
  open: (tab?: TabId) => void;
  close: () => void;
  setTab: (tab: TabId) => void;
  sync: () => void;
  syncTrack: () => void;
  syncLyrics: () => void;
  syncPlaylist: () => void;
  resolveAlbum: () => void;
  renderAlbum: () => void;
  updateBackdrop: (artwork: string) => void;
};

const albumReader = installBrowseCatalog({} as YouTubeMusicAdapter);
const albumCache = new Map<string, Promise<AlbumCatalog>>();

const text = (selector: string) =>
  document.querySelector<HTMLElement>(selector)?.textContent?.trim() ?? '';

const playerArtwork = () =>
  document.querySelector<HTMLImageElement>('.ui143-player-art')?.currentSrc ||
  document.querySelector<HTMLImageElement>('.ui143-player-art')?.src ||
  '';

const queueElement = () => document.querySelector<QueueElement>('#queue');

const queueRow = (
  item: ReturnType<
    QueueElement['queue']['store']['store']['getState']
  >['queue']['items'][number],
) =>
  item.playlistPanelVideoRenderer ??
  item.playlistPanelVideoWrapperRenderer?.primaryRenderer
    ?.playlistPanelVideoRenderer;

const bestQueueArtwork = (row: ReturnType<typeof queueRow>) => {
  const thumbnails = row?.thumbnail?.thumbnails ?? [];
  return (
    thumbnails.reduce(
      (best, item) =>
        (item.width ?? 0) * (item.height ?? 0) >=
        (best?.width ?? 0) * (best?.height ?? 0)
          ? item
          : best,
      thumbnails[0],
    )?.url ?? ''
  );
};

const currentAlbumRef = (videoId: string): AlbumRef | null => {
  const store = queueElement()?.queue?.store?.store?.getState?.();
  const items = store?.queue?.items ?? [];
  const current = items
    .map(queueRow)
    .find((row) => row?.selected || row?.videoId === videoId);
  for (const run of current?.longBylineText?.runs ?? []) {
    const browse = run.navigationEndpoint?.browseEndpoint;
    if (
      browse?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig
        ?.pageType !== 'MUSIC_PAGE_TYPE_ALBUM'
    )
      continue;
    if (!browse.browseId) continue;
    return { title: run.text?.trim() || 'Album', browseId: browse.browseId };
  }
  return null;
};

const buildCustomContext = () => {
  const root = document.getElementById('ui143-queue-panel');
  if (!root?.dataset.sourceKind) return null;
  const items = [...root.querySelectorAll<HTMLElement>('.ui143-queue-row')]
    .map((row) => ({
      kind: 'song' as const,
      title: row.dataset.title ?? '',
      subtitle: row.dataset.subtitle ?? '',
      artwork: row.dataset.artwork ?? '',
      videoId: row.dataset.videoId,
    }))
    .filter((item): item is SearchResultItem & { videoId: string } =>
      Boolean(item.videoId),
    );
  return {
    kind: root.dataset.sourceKind,
    title: root.dataset.sourceTitle ?? 'Up next',
    browseId: root.dataset.sourceBrowseId,
    currentIndex: Number(root.dataset.currentIndex ?? 0),
    items,
  };
};

const sampleArtwork = (url: string) =>
  new Promise<[number, number, number]>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 28;
        canvas.height = 28;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Canvas unavailable');
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let weight = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          const alpha = pixels[index + 3] / 255;
          if (alpha < 0.15) continue;
          const pr = pixels[index];
          const pg = pixels[index + 1];
          const pb = pixels[index + 2];
          const luminance = (pr + pg + pb) / 3;
          const useful = luminance < 8 || luminance > 248 ? 0.2 : 1;
          const nextWeight = alpha * useful;
          r += pr * nextWeight;
          g += pg * nextWeight;
          b += pb * nextWeight;
          weight += nextWeight;
        }
        if (!weight) throw new Error('Artwork has no pixels');
        resolve([
          Math.round(r / weight),
          Math.round(g / weight),
          Math.round(b / weight),
        ]);
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error('Artwork could not be sampled'));
    image.src = url;
  });

const createStars = (container: HTMLElement) => {
  const stars = document.createDocumentFragment();
  for (let index = 0; index < 56; index++) {
    const star = document.createElement('i');
    star.className = 'ui143-now-playing-star';
    const size = Math.random() < 0.86 ? 1 : 1.5 + Math.random() * 0.8;
    star.style.left = `${Math.random() * 100}%`;
    star.style.top = `${Math.random() * 100}%`;
    star.style.width = `${size}px`;
    star.style.height = `${size}px`;
    star.style.opacity = String(0.08 + Math.random() * 0.32);
    star.style.animationDuration = `${5 + Math.random() * 11}s`;
    star.style.animationDelay = `${-Math.random() * 12}s`;
    stars.append(star);
  }
  container.append(stars);
};

const button = (label: string, tab: TabId) => {
  const control = document.createElement('button');
  control.type = 'button';
  control.className = 'ui143-now-playing-tab';
  control.dataset.tab = tab;
  control.textContent = label;
  return control;
};

const message = (container: HTMLElement, title: string, detail = '') => {
  container.replaceChildren();
  const empty = document.createElement('div');
  empty.className = 'ui143-now-playing-empty';
  const heading = document.createElement('strong');
  heading.textContent = title;
  empty.append(heading);
  if (detail) {
    const copy = document.createElement('span');
    copy.textContent = detail;
    empty.append(copy);
  }
  container.append(empty);
};

const renderer = createRenderer<NowPlayingState>({
  player: null,
  root: null,
  timer: null,
  clickHandler: null,
  keyHandler: null,
  activeTab: 'lyrics',
  trackId: '',
  artwork: '',
  albumRef: null,
  albumCatalog: null,
  albumRequest: 0,
  lyricsKey: '',
  activeLyricIndex: -1,
  playlistKey: '',
  playlistSnapshot: null,
  playlistSnapshotArmed: false,

  mount() {
    document.getElementById(ROOT_ID)?.remove();
    const root = document.createElement('section');
    root.id = ROOT_ID;
    root.hidden = true;
    root.setAttribute('aria-label', '143 Music now playing');

    const wash = document.createElement('div');
    wash.className = 'ui143-now-playing-wash';
    const dust = document.createElement('div');
    dust.className = 'ui143-now-playing-dust';
    const stars = document.createElement('div');
    stars.className = 'ui143-now-playing-stars';
    createStars(stars);

    const stage = document.createElement('div');
    stage.className = 'ui143-now-playing-stage';

    const left = document.createElement('div');
    left.className = 'ui143-now-playing-left';
    const artShell = document.createElement('div');
    artShell.className = 'ui143-now-playing-art-shell';
    const art = document.createElement('img');
    art.className = 'ui143-now-playing-art';
    art.alt = '';
    const fallback = document.createElement('span');
    fallback.className = 'ui143-now-playing-art-fallback';
    fallback.textContent = '♪';
    artShell.append(fallback, art);

    const eyebrow = document.createElement('div');
    eyebrow.className = 'ui143-now-playing-eyebrow';
    eyebrow.textContent = 'NOW PLAYING';
    const title = document.createElement('h1');
    title.className = 'ui143-now-playing-title';
    const artist = document.createElement('div');
    artist.className = 'ui143-now-playing-artist';
    const album = document.createElement('div');
    album.className = 'ui143-now-playing-album';
    left.append(artShell, eyebrow, title, artist, album);

    const right = document.createElement('div');
    right.className = 'ui143-now-playing-panel';
    const header = document.createElement('div');
    header.className = 'ui143-now-playing-header';
    const tabs = document.createElement('div');
    tabs.className = 'ui143-now-playing-tabs';
    tabs.append(
      button('Lyrics', 'lyrics'),
      button('Playlist', 'playlist'),
      button('Album', 'album'),
    );
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ui143-now-playing-close';
    close.setAttribute('aria-label', 'Close now playing');
    close.title = 'Close';
    close.textContent = '×';
    close.addEventListener('click', () => this.close());
    header.append(tabs, close);

    const body = document.createElement('div');
    body.className = 'ui143-now-playing-body';
    for (const tab of ['lyrics', 'playlist', 'album'] as const) {
      const pane = document.createElement('div');
      pane.className = 'ui143-now-playing-pane';
      pane.dataset.pane = tab;
      pane.hidden = tab !== this.activeTab;
      body.append(pane);
    }
    right.append(header, body);
    stage.append(left, right);
    root.append(wash, dust, stars, stage);
    document.body.append(root);
    this.root = root;

    tabs.querySelectorAll<HTMLButtonElement>('button[data-tab]').forEach((tab) => {
      tab.addEventListener('click', () =>
        this.setTab(tab.dataset.tab as TabId),
      );
    });

    this.clickHandler = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const karaoke = target.closest(
        '#ui143-player button[aria-label="Karaoke"]',
      );
      if (karaoke) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.open('lyrics');
        return;
      }
      const queue = target.closest(
        '#ui143-player button[aria-label="Queue"]',
      );
      if (queue) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.open('playlist');
        return;
      }
      if (
        target.closest('#ui143-player .ui143-player-art') ||
        target.closest('#ui143-player .ui143-player-title')
      ) {
        this.open(this.activeTab);
        return;
      }
      if (
        this.root &&
        !this.root.hidden &&
        target.closest(
          '.ui143-sidebar .ui143-nav-item, .ui143-search, .ui143-history',
        )
      )
        this.close();
    };
    document.addEventListener('click', this.clickHandler, true);

    this.keyHandler = (event) => {
      if (event.key === 'Escape' && this.root && !this.root.hidden) this.close();
    };
    window.addEventListener('keydown', this.keyHandler);
    this.setTab(this.activeTab);
  },

  open(tab = this.activeTab) {
    if (!this.root) this.mount();
    if (!this.player?.getVideoData?.()?.video_id) return;
    this.root!.hidden = false;
    document.documentElement.classList.add('ui143-now-playing-open');
    this.setTab(tab);
    this.sync();
    if (this.timer === null)
      this.timer = window.setInterval(() => this.sync(), 200);
  },

  close() {
    if (!this.root) return;
    this.root.hidden = true;
    document.documentElement.classList.remove('ui143-now-playing-open');
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  },

  setTab(tab) {
    this.activeTab = tab;
    if (!this.root) return;
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-tab]')
      .forEach((control) => {
        const active = control.dataset.tab === tab;
        control.classList.toggle('is-active', active);
        control.setAttribute('aria-selected', String(active));
      });
    this.root.querySelectorAll<HTMLElement>('[data-pane]').forEach((pane) => {
      pane.hidden = pane.dataset.pane !== tab;
    });
    if (tab === 'lyrics') this.syncLyrics();
    if (tab === 'playlist') this.syncPlaylist();
    if (tab === 'album') this.resolveAlbum();
  },

  sync() {
    if (!this.player || !this.root || this.root.hidden) return;
    this.syncTrack();
    if (this.activeTab === 'lyrics') this.syncLyrics();
    else if (this.activeTab === 'playlist') this.syncPlaylist();
    else this.resolveAlbum();
  },

  syncTrack() {
    if (!this.player || !this.root) return;
    const data = this.player.getVideoData?.();
    const nextId = data?.video_id ?? '';
    const nextArtwork = playerArtwork();
    const changed = nextId !== this.trackId;
    this.trackId = nextId;

    const title = this.root.querySelector<HTMLElement>(
      '.ui143-now-playing-title',
    );
    const artist = this.root.querySelector<HTMLElement>(
      '.ui143-now-playing-artist',
    );
    const album = this.root.querySelector<HTMLElement>(
      '.ui143-now-playing-album',
    );
    const art = this.root.querySelector<HTMLImageElement>(
      '.ui143-now-playing-art',
    );
    if (title)
      title.textContent =
        text('.ui143-player-title') || data?.title || 'Nothing playing';
    if (artist)
      artist.textContent =
        text('.ui143-player-artist') || data?.author || '';

    const ref = currentAlbumRef(nextId);
    if (album) album.textContent = ref?.title ?? '';
    const albumChanged = ref?.browseId !== this.albumRef?.browseId;
    this.albumRef = ref;
    if (albumChanged) {
      this.albumCatalog = null;
      this.albumRequest++;
    }

    if (nextArtwork !== this.artwork) {
      this.artwork = nextArtwork;
      if (art) {
        if (nextArtwork) art.src = nextArtwork;
        else art.removeAttribute('src');
      }
      this.updateBackdrop(nextArtwork);
    }

    if (changed) {
      this.lyricsKey = '';
      this.activeLyricIndex = -1;
      this.playlistKey = '';
      if (this.activeTab === 'album') this.renderAlbum();
    }
  },

  syncLyrics() {
    if (!this.root || this.activeTab !== 'lyrics') return;
    const pane = this.root.querySelector<HTMLElement>('[data-pane="lyrics"]');
    if (!pane) return;
    const result = currentLyrics();
    const data = result?.data;
    const lineCount = data?.lines?.length ?? 0;
    const plainLength = data?.lyrics?.length ?? 0;
    const key = `${this.trackId}|${lyricsStore.provider}|${result?.state}|${lineCount}|${plainLength}`;

    if (key !== this.lyricsKey) {
      this.lyricsKey = key;
      this.activeLyricIndex = -1;
      if (!result || result.state === 'fetching') {
        message(
          pane,
          'Finding lyrics…',
          '143 Music is checking the selected lyrics provider.',
        );
        return;
      }
      if (result.state === 'error') {
        message(
          pane,
          'Lyrics unavailable',
          'The lyrics provider returned an error.',
        );
        return;
      }
      if (!data) {
        message(
          pane,
          'No lyrics found',
          'This track has no lyrics from the selected provider.',
        );
        return;
      }
      pane.replaceChildren();
      const provider = document.createElement('div');
      provider.className = 'ui143-now-playing-provider';
      provider.textContent = `Lyrics · ${lyricsStore.provider}`;
      pane.append(provider);
      const scroll = document.createElement('div');
      scroll.className = 'ui143-now-playing-lyrics';
      if (data.lines?.length) {
        data.lines.forEach((line, index) => {
          const row = document.createElement('button');
          row.type = 'button';
          row.className = 'ui143-now-playing-lyric';
          row.dataset.index = String(index);
          row.dataset.time = String(line.timeInMs);
          row.textContent = line.text || '♪';
          row.addEventListener('click', () =>
            this.player?.seekTo(line.timeInMs / 1000),
          );
          scroll.append(row);
        });
      } else if (data.lyrics) {
        for (const line of data.lyrics
          .split('\n')
          .filter((value) => value.trim())) {
          const row = document.createElement('div');
          row.className = 'ui143-now-playing-lyric is-plain';
          row.textContent = line;
          scroll.append(row);
        }
      }
      pane.append(scroll);
    }

    if (!data?.lines?.length || !this.player) return;
    const currentMs = this.player.getCurrentTime() * 1000;
    let index = -1;
    for (let cursor = 0; cursor < data.lines.length; cursor++) {
      if (data.lines[cursor].timeInMs <= currentMs) index = cursor;
      else break;
    }
    if (index === this.activeLyricIndex) return;
    this.activeLyricIndex = index;
    pane
      .querySelectorAll<HTMLElement>('.ui143-now-playing-lyric[data-index]')
      .forEach((row) => {
        const rowIndex = Number(row.dataset.index);
        row.classList.toggle('is-current', rowIndex === index);
        row.classList.toggle('is-past', rowIndex < index);
        row.classList.toggle('is-upcoming', rowIndex > index);
      });
    pane
      .querySelector<HTMLElement>('.ui143-now-playing-lyric.is-current')
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  },

  syncPlaylist() {
    if (!this.root || this.activeTab !== 'playlist') return;
    const pane = this.root.querySelector<HTMLElement>('[data-pane="playlist"]');
    if (!pane) return;
    const custom = buildCustomContext();

    if (custom?.kind === 'playlist' && custom.items.length) {
      this.playlistSnapshot = {
        title: custom.title,
        browseId: custom.browseId,
        items: custom.items,
      };
      if (!this.playlistSnapshotArmed) this.playlistSnapshotArmed = false;
    } else if (
      custom?.kind &&
      custom.kind !== 'album' &&
      this.playlistSnapshotArmed
    ) {
      this.playlistSnapshot = null;
      this.playlistSnapshotArmed = false;
    }

    const useSnapshot =
      custom?.kind === 'album' &&
      this.playlistSnapshotArmed &&
      this.playlistSnapshot;
    const customItems = useSnapshot
      ? this.playlistSnapshot!.items
      : custom?.items;
    const customTitle = useSnapshot
      ? this.playlistSnapshot!.title
      : custom?.title;
    const customCurrentIndex = useSnapshot
      ? -1
      : (custom?.currentIndex ?? -1);
    if (customItems?.length) {
      const key = `custom:${customTitle}:${customCurrentIndex}:${customItems.map((item) => item.videoId).join(',')}`;
      if (key === this.playlistKey) return;
      this.playlistKey = key;
      pane.replaceChildren();
      const heading = document.createElement('div');
      heading.className = 'ui143-now-playing-list-heading';
      heading.textContent =
        custom?.kind === 'playlist' || useSnapshot
          ? `Playlist · ${customTitle}`
          : `Up next · ${customTitle}`;
      pane.append(heading);
      const list = document.createElement('div');
      list.className = 'ui143-now-playing-list';
      customItems.forEach((item, index) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'ui143-now-playing-track';
        row.classList.toggle('is-current', index === customCurrentIndex);
        const art = document.createElement('div');
        art.className = 'ui143-now-playing-track-art';
        if (item.artwork) {
          const image = document.createElement('img');
          image.src = item.artwork;
          image.alt = '';
          art.append(image);
        } else art.textContent = '♪';
        const copy = document.createElement('div');
        copy.className = 'ui143-now-playing-track-copy';
        const name = document.createElement('strong');
        name.textContent = item.title;
        const meta = document.createElement('span');
        meta.textContent = item.subtitle;
        copy.append(name, meta);
        const number = document.createElement('span');
        number.className = 'ui143-now-playing-track-number';
        number.textContent = String(index + 1);
        row.append(art, copy, number);
        row.addEventListener('click', () => {
          if (useSnapshot) {
            document.dispatchEvent(
              new CustomEvent(PLAY_CONTEXT_EVENT, {
                detail: {
                  items: this.playlistSnapshot!.items,
                  startIndex: index,
                  source: {
                    kind: 'playlist',
                    title: this.playlistSnapshot!.title,
                    browseId: this.playlistSnapshot!.browseId,
                  },
                },
              }),
            );
            this.playlistSnapshotArmed = false;
          } else {
            document.dispatchEvent(
              new CustomEvent(PLAY_CONTEXT_INDEX_EVENT, { detail: index }),
            );
          }
        });
        list.append(row);
      });
      pane.append(list);
      pane
        .querySelector<HTMLElement>('.ui143-now-playing-track.is-current')
        ?.scrollIntoView({ block: 'nearest' });
      return;
    }

    const queue = queueElement();
    const store = queue?.queue?.store?.store?.getState?.();
    const items = store?.queue?.items ?? [];
    const rows = items.map(queueRow).filter(Boolean);
    const selected = rows.findIndex((row) => row?.selected);
    const key = `native:${selected}:${rows.map((row) => row?.videoId).join(',')}`;
    if (key === this.playlistKey) return;
    this.playlistKey = key;
    if (!rows.length) {
      message(
        pane,
        'Nothing queued',
        'Play a track and 143 Music will show what comes next.',
      );
      return;
    }
    pane.replaceChildren();
    const heading = document.createElement('div');
    heading.className = 'ui143-now-playing-list-heading';
    heading.textContent = 'Up next';
    pane.append(heading);
    const list = document.createElement('div');
    list.className = 'ui143-now-playing-list';
    rows.forEach((row, index) => {
      if (!row) return;
      const control = document.createElement('button');
      control.type = 'button';
      control.className = 'ui143-now-playing-track';
      control.classList.toggle('is-current', row.selected);
      const art = document.createElement('div');
      art.className = 'ui143-now-playing-track-art';
      const artwork = bestQueueArtwork(row);
      if (artwork) {
        const image = document.createElement('img');
        image.src = artwork;
        image.alt = '';
        art.append(image);
      } else art.textContent = '♪';
      const copy = document.createElement('div');
      copy.className = 'ui143-now-playing-track-copy';
      const name = document.createElement('strong');
      name.textContent =
        row.title?.runs?.map((run) => run.text).join('') ?? '';
      const meta = document.createElement('span');
      meta.textContent =
        row.longBylineText?.runs?.map((run) => run.text).join('') ?? '';
      copy.append(name, meta);
      const number = document.createElement('span');
      number.className = 'ui143-now-playing-track-number';
      number.textContent = String(index + 1);
      control.append(art, copy, number);
      control.addEventListener('click', () =>
        queue?.dispatch({ type: 'SET_INDEX', payload: index }),
      );
      list.append(control);
    });
    pane.append(list);
    pane
      .querySelector<HTMLElement>('.ui143-now-playing-track.is-current')
      ?.scrollIntoView({ block: 'nearest' });
  },

  resolveAlbum() {
    if (!this.root || this.activeTab !== 'album') return;
    const pane = this.root.querySelector<HTMLElement>('[data-pane="album"]');
    if (!pane) return;
    if (!this.albumRef) {
      message(
        pane,
        'Album unavailable',
        'YouTube Music did not expose an album for this track.',
      );
      return;
    }
    if (this.albumCatalog?.browseId === this.albumRef.browseId) return;
    const request = ++this.albumRequest;
    message(pane, 'Loading album…', this.albumRef.title);
    let task = albumCache.get(this.albumRef.browseId);
    if (!task) {
      task = albumReader.getAlbumCatalog(
        this.albumRef.browseId,
        this.albumRef.title,
      );
      albumCache.set(this.albumRef.browseId, task);
    }
    void task
      .then((catalog) => {
        if (request !== this.albumRequest) return;
        this.albumCatalog = catalog;
        this.renderAlbum();
      })
      .catch((error) => {
        console.warn('[143 Music] Could not load now-playing album', error);
        if (request !== this.albumRequest) return;
        albumCache.delete(this.albumRef!.browseId);
        message(
          pane,
          'Album unavailable',
          'YouTube Music did not return the album track list.',
        );
      });
  },

  renderAlbum() {
    if (!this.root || this.activeTab !== 'album') return;
    const pane = this.root.querySelector<HTMLElement>('[data-pane="album"]');
    const catalog = this.albumCatalog;
    if (!pane || !catalog) return;
    pane.replaceChildren();
    const hero = document.createElement('div');
    hero.className = 'ui143-now-playing-album-hero';
    const art = document.createElement('div');
    art.className = 'ui143-now-playing-album-art';
    if (catalog.artwork) {
      const image = document.createElement('img');
      image.src = catalog.artwork;
      image.alt = '';
      art.append(image);
    } else art.textContent = '♪';
    const copy = document.createElement('div');
    const label = document.createElement('span');
    label.textContent = 'ALBUM';
    const title = document.createElement('strong');
    title.textContent = catalog.title || this.albumRef?.title || 'Album';
    const meta = document.createElement('span');
    meta.textContent = [
      catalog.artists.map((artist) => artist.name).join(', '),
      catalog.year,
      `${catalog.tracks.length} tracks`,
    ]
      .filter(Boolean)
      .join(' · ');
    copy.append(label, title, meta);
    hero.append(art, copy);
    pane.append(hero);

    if (!catalog.tracks.length) {
      const empty = document.createElement('div');
      empty.className = 'ui143-now-playing-empty is-inline';
      empty.textContent = 'No album tracks returned.';
      pane.append(empty);
      return;
    }

    const list = document.createElement('div');
    list.className = 'ui143-now-playing-list';
    catalog.tracks.forEach((item, index) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ui143-now-playing-track';
      row.classList.toggle('is-current', item.videoId === this.trackId);
      const number = document.createElement('span');
      number.className = 'ui143-now-playing-track-number is-leading';
      number.textContent = String(index + 1);
      const trackCopy = document.createElement('div');
      trackCopy.className = 'ui143-now-playing-track-copy';
      const name = document.createElement('strong');
      name.textContent = item.title;
      const subtitle = document.createElement('span');
      subtitle.textContent = item.subtitle;
      trackCopy.append(name, subtitle);
      row.append(number, trackCopy);
      row.addEventListener('click', () => {
        const custom = buildCustomContext();
        if (custom?.kind === 'playlist' && custom.items.length) {
          this.playlistSnapshot = {
            title: custom.title,
            browseId: custom.browseId,
            items: custom.items,
          };
          this.playlistSnapshotArmed = true;
        }
        document.dispatchEvent(
          new CustomEvent(PLAY_CONTEXT_EVENT, {
            detail: {
              items: catalog.tracks,
              startIndex: index,
              source: {
                kind: 'album',
                title: catalog.title || this.albumRef?.title || 'Album',
                browseId: catalog.browseId,
              },
            },
          }),
        );
      });
      list.append(row);
    });
    pane.append(list);
    pane
      .querySelector<HTMLElement>('.ui143-now-playing-track.is-current')
      ?.scrollIntoView({ block: 'nearest' });
  },

  updateBackdrop(artwork) {
    if (!this.root) return;
    const wash = this.root.querySelector<HTMLElement>(
      '.ui143-now-playing-wash',
    );
    if (wash)
      wash.style.backgroundImage = artwork
        ? `url("${artwork.replaceAll('"', '%22')}")`
        : '';
    const expected = artwork;
    if (!artwork) {
      this.root.style.setProperty('--ui143-now-playing-rgb', '96 81 155');
      return;
    }
    void sampleArtwork(artwork)
      .then(([r, g, b]) => {
        if (!this.root || this.artwork !== expected) return;
        this.root.style.setProperty(
          '--ui143-now-playing-rgb',
          `${r} ${g} ${b}`,
        );
      })
      .catch(() => {
        if (!this.root || this.artwork !== expected) return;
        this.root.style.setProperty('--ui143-now-playing-rgb', '96 81 155');
      });
  },

  start() {
    this.mount();
  },

  onPlayerApiReady(api) {
    this.player = api;
    if (this.root && !this.root.hidden) this.sync();
  },

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    if (this.clickHandler)
      document.removeEventListener('click', this.clickHandler, true);
    if (this.keyHandler)
      window.removeEventListener('keydown', this.keyHandler);
    this.clickHandler = null;
    this.keyHandler = null;
    this.player = null;
    this.root?.remove();
    this.root = null;
    document.documentElement.classList.remove('ui143-now-playing-open');
  },
});

export default createFeature({
  name: () => '143 Now Playing',
  description: () =>
    'Custom album, lyrics and playlist listening view for 143 Music.',
  config: { enabled: true },
  stylesheets: [style],
  renderer,
});
