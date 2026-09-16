import { createFeature, createRenderer } from '@/utils';

import style from './style.css?inline';

import type { RendererContext } from '@/types/contexts';
import type { FeatureConfig } from '@/types/features';
import type { OfflineLibrarySnapshot, OfflineTrack } from './types';

const ROOT_ID = 'ui143-offline-page';
const NAV_ID = 'ui143-offline-nav';

const emptySnapshot: OfflineLibrarySnapshot = {
  tracks: [],
  totalBytes: 0,
};

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
};

const downloadIcon = () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ui143-icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute(
    'd',
    'M11 3h2v10.17l3.59-3.58L18 11l-6 6-6-6 1.41-1.41L11 13.17V3Zm-6 16h14v2H5v-2Z',
  );
  svg.append(path);
  return svg;
};

const hideOtherCustomPages = () => {
  for (const id of ['ui143-home-page', 'ui143-now-playing']) {
    const element = document.getElementById(id);
    if (element) element.hidden = true;
  }
  document
    .querySelectorAll<HTMLElement>(
      '#ui143-search-page, #ui143-artist-page, #ui143-album-page',
    )
    .forEach((element) => {
      element.hidden = true;
    });
};

const renderer = createRenderer<{
  ctx: RendererContext<FeatureConfig> | null;
  root: HTMLElement | null;
  content: HTMLElement | null;
  snapshot: OfflineLibrarySnapshot;
  observer: MutationObserver | null;
  navClickHandler: ((event: MouseEvent) => void) | null;
  styleSheet: CSSStyleSheet | null;
  audio: HTMLAudioElement | null;
  audioSync: (() => void) | null;
  playingId: string;
  mount: () => void;
  mountNav: () => void;
  show: () => Promise<void>;
  hide: () => void;
  refresh: () => Promise<void>;
  playTrack: (track: OfflineTrack) => Promise<void>;
  render: () => void;
  renderTrack: (track: OfflineTrack) => HTMLElement;
}>({
  ctx: null,
  root: null,
  content: null,
  snapshot: emptySnapshot,
  observer: null,
  navClickHandler: null,
  styleSheet: null,
  audio: null,
  audioSync: null,
  playingId: '',

  mount() {
    if (this.root) return;

    const root = document.createElement('main');
    root.id = ROOT_ID;
    root.hidden = true;
    const content = document.createElement('div');
    content.className = 'ui143-offline-content';
    root.append(content);
    document.body.append(root);
    this.root = root;
    this.content = content;
    this.render();
    this.mountNav();
  },

  mountNav() {
    if (document.getElementById(NAV_ID)) return;
    const collection = document.querySelector<HTMLElement>('.ui143-nav-secondary');
    if (!collection) return;

    const button = document.createElement('button');
    button.id = NAV_ID;
    button.type = 'button';
    button.className = 'ui143-nav-item';
    button.dataset.key = 'downloads';
    button.append(downloadIcon());
    const label = document.createElement('span');
    label.textContent = 'Downloads';
    button.append(label);
    button.addEventListener('click', () => void this.show());
    collection.append(button);
  },

  async show() {
    this.mount();
    if (!this.root) return;
    hideOtherCustomPages();
    this.root.hidden = false;
    document
      .querySelectorAll<HTMLElement>('.ui143-nav-item[data-key]')
      .forEach((item) =>
        item.classList.toggle('is-active', item.dataset.key === 'downloads'),
      );
    await this.refresh();
  },

  hide() {
    if (this.root) this.root.hidden = true;
  },

  async refresh() {
    if (!this.ctx || !this.content) return;
    try {
      this.snapshot = (await this.ctx.ipc.invoke(
        'offline-library:list',
      )) as OfflineLibrarySnapshot;
    } catch (error) {
      console.warn('[143 Music] Could not read offline library', error);
      this.snapshot = emptySnapshot;
    }
    this.render();
  },

  async playTrack(track) {
    if (!this.ctx || !this.audio) return;
    const audio = this.audio;
    if (this.playingId === track.id && audio.src) {
      if (audio.paused) await audio.play();
      else audio.pause();
      return;
    }

    document.querySelector<HTMLVideoElement>('video')?.pause();
    const url = (await this.ctx.ipc.invoke(
      'offline-library:stream-url',
      track.id,
    )) as string;
    if (!url) return;

    audio.pause();
    this.playingId = track.id;
    audio.src = url;
    audio.currentTime = 0;
    try {
      await audio.play();
    } catch (error) {
      console.warn('[143 Music] Could not play offline track', error);
      this.playingId = '';
      audio.removeAttribute('src');
      audio.load();
      this.render();
    }
  },

  renderTrack(track) {
    const row = document.createElement('article');
    row.className = 'ui143-offline-row';
    row.classList.toggle('is-playing', this.playingId === track.id && !this.audio?.paused);

    const art = document.createElement('div');
    art.className = 'ui143-offline-art';
    if (track.artwork) {
      const image = document.createElement('img');
      image.src = track.artwork;
      image.alt = '';
      art.append(image);
    } else {
      art.textContent = '♪';
    }

    const meta = document.createElement('div');
    meta.className = 'ui143-offline-meta';
    const name = document.createElement('strong');
    name.textContent = track.title;
    const secondary = document.createElement('span');
    secondary.textContent =
      [track.artist, track.album].filter(Boolean).join(' • ') || 'Local audio';
    const tertiary = document.createElement('small');
    tertiary.textContent = `${track.mimeType} • ${formatBytes(track.bytes)}`;
    meta.append(name, secondary, tertiary);

    const actions = document.createElement('div');
    actions.className = 'ui143-offline-row-actions';
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'ui143-offline-play';
    play.textContent =
      this.playingId === track.id && !this.audio?.paused ? 'Pause' : 'Play';
    play.addEventListener('click', () => void this.playTrack(track));

    const reveal = document.createElement('button');
    reveal.type = 'button';
    reveal.textContent = 'Show file';
    reveal.addEventListener('click', () =>
      void this.ctx?.ipc.invoke('offline-library:reveal', track.id),
    );
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'is-danger';
    remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      if (!this.ctx) return;
      remove.disabled = true;
      try {
        if (this.playingId === track.id && this.audio) {
          this.audio.pause();
          this.audio.removeAttribute('src');
          this.audio.load();
          this.playingId = '';
        }
        this.snapshot = (await this.ctx.ipc.invoke(
          'offline-library:remove',
          track.id,
        )) as OfflineLibrarySnapshot;
        this.render();
      } finally {
        remove.disabled = false;
      }
    });
    actions.append(play, reveal, remove);
    row.append(art, meta, actions);
    return row;
  },

  render() {
    const content = this.content;
    if (!content) return;
    content.replaceChildren();

    const hero = document.createElement('header');
    hero.className = 'ui143-offline-hero';
    const eyebrow = document.createElement('span');
    eyebrow.textContent = '143 Music';
    const title = document.createElement('h1');
    title.textContent = 'Downloads';
    const copy = document.createElement('p');
    copy.textContent =
      'Audio stored locally on this computer for the 143 Music offline library.';

    const actions = document.createElement('div');
    actions.className = 'ui143-offline-actions';
    const importButton = document.createElement('button');
    importButton.type = 'button';
    importButton.className = 'ui143-offline-primary';
    importButton.textContent = 'Import audio';
    importButton.addEventListener('click', async () => {
      if (!this.ctx) return;
      importButton.disabled = true;
      try {
        this.snapshot = (await this.ctx.ipc.invoke(
          'offline-library:import-local',
        )) as OfflineLibrarySnapshot;
        this.render();
      } finally {
        importButton.disabled = false;
      }
    });

    const stats = document.createElement('span');
    stats.className = 'ui143-offline-stats';
    stats.textContent = `${this.snapshot.tracks.length} tracks • ${formatBytes(this.snapshot.totalBytes)}`;
    actions.append(importButton, stats);
    hero.append(eyebrow, title, copy, actions);
    content.append(hero);

    const note = document.createElement('div');
    note.className = 'ui143-offline-note';
    const noteTitle = document.createElement('strong');
    noteTitle.textContent = 'Offline source adapters';
    const noteCopy = document.createElement('span');
    noteCopy.textContent =
      'The library is source-agnostic. Providers can add media that 143 Music is permitted to store locally; local-file import is enabled now.';
    note.append(noteTitle, noteCopy);
    content.append(note);

    if (!this.snapshot.tracks.length) {
      const empty = document.createElement('div');
      empty.className = 'ui143-offline-empty';
      const emptyTitle = document.createElement('strong');
      emptyTitle.textContent = 'No offline tracks yet';
      const emptyCopy = document.createElement('span');
      emptyCopy.textContent = 'Import audio files to populate the offline library.';
      empty.append(emptyTitle, emptyCopy);
      content.append(empty);
      return;
    }

    const list = document.createElement('section');
    list.className = 'ui143-offline-list';
    for (const track of this.snapshot.tracks) list.append(this.renderTrack(track));
    content.append(list);
  },

  async start(ctx) {
    this.ctx = ctx;
    this.styleSheet = new CSSStyleSheet();
    await this.styleSheet.replace(style);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, this.styleSheet];

    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this.audioSync = () => {
      if (this.audio?.ended) this.playingId = '';
      this.render();
    };
    for (const event of ['play', 'pause', 'ended', 'error'])
      this.audio.addEventListener(event, this.audioSync);

    this.mount();
    this.observer = new MutationObserver(() => this.mountNav());
    this.observer.observe(document.documentElement, { childList: true, subtree: true });

    this.navClickHandler = (event: MouseEvent) => {
      if (!this.root || this.root.hidden || !(event.target instanceof Element)) return;
      const nav = event.target.closest<HTMLElement>('.ui143-nav-item[data-key]');
      if (nav && nav.dataset.key !== 'downloads') this.hide();
    };
    document.addEventListener('click', this.navClickHandler, true);
  },

  stop() {
    this.observer?.disconnect();
    this.observer = null;
    if (this.navClickHandler)
      document.removeEventListener('click', this.navClickHandler, true);
    this.navClickHandler = null;

    if (this.audio) {
      if (this.audioSync)
        for (const event of ['play', 'pause', 'ended', 'error'])
          this.audio.removeEventListener(event, this.audioSync);
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
    }
    this.audio = null;
    this.audioSync = null;
    this.playingId = '';

    document.getElementById(NAV_ID)?.remove();
    this.root?.remove();
    this.root = null;
    this.content = null;
    this.ctx = null;
    if (this.styleSheet) {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
        (sheet) => sheet !== this.styleSheet,
      );
      this.styleSheet = null;
    }
  },
});

type StreamServer = Readonly<{
  urlFor: (id: string) => string;
  stop: () => Promise<void>;
}>;

export default createFeature({
  name: () => 'Offline Library',
  description: () =>
    'Local offline media storage and source-provider infrastructure for 143 Music.',
  config: { enabled: true },
  backend: {
    storage: null as typeof import('./storage') | null,
    streamServer: null as StreamServer | null,
    async start({ ipc }) {
      this.storage = await import('./storage');
      const stream = await import('./stream-server');
      this.streamServer = await stream.startOfflineStreamServer();

      ipc.handle('offline-library:list', () => this.storage!.getOfflineLibrary());
      ipc.handle('offline-library:import-local', () =>
        this.storage!.importLocalAudio(),
      );
      ipc.handle('offline-library:remove', (id: string) =>
        this.storage!.removeOfflineTrack(id),
      );
      ipc.handle('offline-library:reveal', (id: string) =>
        this.storage!.revealOfflineTrack(id),
      );
      ipc.handle('offline-library:stream-url', (id: string) =>
        this.streamServer?.urlFor(id) ?? '',
      );
    },
    async stop({ ipc }) {
      for (const channel of [
        'offline-library:list',
        'offline-library:import-local',
        'offline-library:remove',
        'offline-library:reveal',
        'offline-library:stream-url',
      ])
        ipc.removeHandler(channel);
      await this.streamServer?.stop();
      this.streamServer = null;
      this.storage = null;
    },
  },
  renderer,
});
