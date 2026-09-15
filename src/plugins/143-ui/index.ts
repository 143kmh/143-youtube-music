import { net } from 'electron';

import { createPlugin } from '@/utils';

import { mountArtistPage, type ArtistPageController } from './artist-page';
import artistPageStyle from './artist-page.css?inline';
import { installCatalogPolish } from './catalog-polish';
import { startDesktop } from './desktop';
import { mountInteractions } from './interactions';
import interactionStyle from './interactions.css?inline';
import { attachKaraokePlayer, startKaraoke, stopKaraoke } from './karaoke';
import { mountPlayer } from './player';
import playerPolishStyle from './player-polish.css?inline';
import playerStyle from './player.css?inline';
import { mountSearchPage, type SearchPageController } from './search-page';
import searchPageStyle from './search-page.css?inline';
import { mountSettings } from './settings';
import style from './style.css?inline';
import {
  createYouTubeMusicAdapter,
  type YouTubeMusicAdapter,
  type MusicSection,
} from './youtube-music';

import type { MusicPlayer } from '@/types/music-player';

const UI_ROOT_ID = 'ui143-root';
const UI_ATTR = 'data-143-ui';
const UI_SEARCH_ID = 'ui143-search';

type IconName =
  | 'home'
  | 'search'
  | 'library'
  | 'playlist'
  | 'heart'
  | 'album'
  | 'artist'
  | 'back'
  | 'forward';

const iconPaths: Record<IconName, string[]> = {
  home: [
    'M3 10.8 12 3l9 7.8v9.7a.5.5 0 0 1-.5.5h-5.25a.5.5 0 0 1-.5-.5V15h-5.5v5.5a.5.5 0 0 1-.5.5H3.5a.5.5 0 0 1-.5-.5v-9.7Z',
  ],
  search: [
    'M11 4a7 7 0 1 0 4.9 12l4.55 4.55 1.1-1.1L17 14.9A7 7 0 0 0 11 4Zm0 1.7a5.3 5.3 0 1 1 0 10.6 5.3 5.3 0 0 1 0-10.6Z',
  ],
  library: [
    'M4 3.5h2v17H4v-17Zm5 0h2v17H9v-17Zm5.2.3 1.9-.6 4.7 16.2-1.9.6-4.7-16.2Z',
  ],
  playlist: [
    'M4 6h10v1.8H4V6Zm0 5h10v1.8H4V11Zm0 5h7v1.8H4V16Zm14-5.3V16a3 3 0 1 1-1.8-2.75V9.9l4.8-1.2v1.8l-3 .75Z',
  ],
  heart: [
    'M12 20.6 4.1 13A5.1 5.1 0 0 1 11.3 5.8l.7.72.7-.72A5.1 5.1 0 1 1 19.9 13L12 20.6Z',
  ],
  album: [
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 6.1a2.9 2.9 0 1 1 0 5.8 2.9 2.9 0 0 1 0-5.8Zm0 1.8a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Z',
  ],
  artist: [
    'M12 3.5a4.2 4.2 0 1 1 0 8.4 4.2 4.2 0 0 1 0-8.4ZM4.5 20.5a7.5 7.5 0 0 1 15 0h-15Z',
  ],
  back: ['m14.7 5.3-1.4-1.4L5.2 12l8.1 8.1 1.4-1.4L8 12l6.7-6.7Z'],
  forward: ['m9.3 5.3 1.4-1.4 8.1 8.1-8.1 8.1-1.4-1.4L16 12 9.3 5.3Z'],
};

const createIcon = (name: IconName) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ui143-icon');

  for (const data of iconPaths[name]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', data);
    svg.append(path);
  }

  return svg;
};

const setActiveNav = (key: string) => {
  document
    .querySelectorAll<HTMLElement>('.ui143-nav-item[data-key]')
    .forEach((item) => item.classList.toggle('is-active', item.dataset.key === key));
};

const createNavButton = (
  engine: YouTubeMusicAdapter,
  label: string,
  icon: IconName,
  section: MusicSection,
  key: string,
  beforeNavigate?: () => void,
) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ui143-nav-item';
  button.dataset.key = key;
  button.append(createIcon(icon));

  const text = document.createElement('span');
  text.textContent = label;
  button.append(text);

  button.addEventListener('click', () => {
    beforeNavigate?.();
    if (!engine.navigateSection(section)) return;
    setActiveNav(key);
  });

  return button;
};

const createHistoryButton = (
  engine: YouTubeMusicAdapter,
  searchPage: SearchPageController,
  artistPage: ArtistPageController,
  icon: 'back' | 'forward',
  label: string,
) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ui143-circle-button';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.append(createIcon(icon));
  button.addEventListener('click', () => {
    if (icon === 'back' && artistPage.isOpen()) {
      const result = artistPage.back();
      if (result === 'search') {
        searchPage.show();
        setActiveNav('search');
      }
      return;
    }
    if (icon === 'back' && searchPage.isOpen()) {
      searchPage.close();
      return;
    }
    engine.history(icon);
  });
  return button;
};

const createShell = (
  engine: YouTubeMusicAdapter,
  searchPage: SearchPageController,
  artistPage: ArtistPageController,
) => {
  document.getElementById(UI_ROOT_ID)?.remove();
  document.documentElement.setAttribute(UI_ATTR, '');

  const closePages = () => {
    searchPage.close();
    artistPage.close();
  };

  const root = document.createElement('div');
  root.id = UI_ROOT_ID;

  const sidebar = document.createElement('aside');
  sidebar.className = 'ui143-sidebar';

  const brand = document.createElement('div');
  brand.className = 'ui143-brand';
  const brandMark = document.createElement('span');
  brandMark.className = 'ui143-brand-mark';
  brandMark.textContent = '143';
  const brandName = document.createElement('span');
  brandName.className = 'ui143-brand-name';
  brandName.textContent = 'Music';
  brand.append(brandMark, brandName);

  const primary = document.createElement('nav');
  primary.className = 'ui143-nav ui143-nav-primary';
  const home = createNavButton(
    engine,
    'Home',
    'home',
    'home',
    'home',
    closePages,
  );
  home.classList.add('is-active');

  const search = document.createElement('button');
  search.type = 'button';
  search.className = 'ui143-nav-item';
  search.dataset.key = 'search';
  search.append(createIcon('search'));
  const searchText = document.createElement('span');
  searchText.textContent = 'Search';
  search.append(searchText);
  search.addEventListener('click', () => {
    artistPage.close();
    searchPage.show();
    setActiveNav('search');
    document.getElementById(UI_SEARCH_ID)?.focus();
  });

  primary.append(
    home,
    search,
    createNavButton(
      engine,
      'Your Library',
      'library',
      'library',
      'library',
      closePages,
    ),
  );

  const divider = document.createElement('div');
  divider.className = 'ui143-divider';

  const collectionTitle = document.createElement('div');
  collectionTitle.className = 'ui143-section-title';
  collectionTitle.textContent = 'Your collection';

  const collection = document.createElement('nav');
  collection.className = 'ui143-nav ui143-nav-secondary';
  collection.append(
    createNavButton(
      engine,
      'Playlists',
      'playlist',
      'playlists',
      'playlists',
      closePages,
    ),
    createNavButton(
      engine,
      'Liked songs',
      'heart',
      'songs',
      'songs',
      closePages,
    ),
    createNavButton(
      engine,
      'Albums',
      'album',
      'albums',
      'albums',
      closePages,
    ),
    createNavButton(
      engine,
      'Artists',
      'artist',
      'artists',
      'artists',
      closePages,
    ),
  );

  const footer = document.createElement('div');
  footer.className = 'ui143-sidebar-footer';
  footer.textContent = 'YouTube Music engine';

  sidebar.append(brand, primary, divider, collectionTitle, collection, footer);

  const topbar = document.createElement('header');
  topbar.className = 'ui143-topbar';

  const historyControls = document.createElement('div');
  historyControls.className = 'ui143-history';
  historyControls.append(
    createHistoryButton(engine, searchPage, artistPage, 'back', 'Back'),
    createHistoryButton(engine, searchPage, artistPage, 'forward', 'Forward'),
  );

  const searchForm = document.createElement('form');
  searchForm.className = 'ui143-search';
  searchForm.setAttribute('role', 'search');
  searchForm.append(createIcon('search'));
  const input = document.createElement('input');
  input.id = UI_SEARCH_ID;
  input.type = 'search';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = 'What do you want to play?';
  input.setAttribute('aria-label', 'Search YouTube Music');
  searchForm.append(input);
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const query = input.value.trim();
    if (!query) return;
    artistPage.close();
    setActiveNav('search');
    void searchPage.search(query);
  });
  input.addEventListener('search', () => {
    if (!input.value.trim()) searchPage.close();
  });

  const topbarSpacer = document.createElement('div');
  topbarSpacer.className = 'ui143-topbar-spacer';

  const product = document.createElement('div');
  product.className = 'ui143-product';
  product.textContent = '143 Music';

  topbar.append(historyControls, searchForm, topbarSpacer, product);
  root.append(sidebar, topbar);
  document.body.append(root);
};

export default createPlugin({
  name: () => '143 Music UI',
  description: () =>
    'A compact Spotify-inspired shell for the YouTube Music engine.',
  restartNeeded: true,
  config: {
    enabled: true,
  },
  backend: {
    desktopCleanup: null as (() => void) | null,
    start(ctx) {
      const { window, ipc } = ctx;
      this.desktopCleanup = startDesktop(ctx);
      const webContents = window.webContents;
      const originalOpenDevTools = webContents.openDevTools.bind(webContents);

      webContents.openDevTools = () => {};
      webContents.once('did-finish-load', () => {
        webContents.openDevTools = originalOpenDevTools;
      });

      ipc.handle(
        'synced-lyrics:fetch',
        async (url: string, init: RequestInit) => {
          const response = await net.fetch(url, init);
          return [
            response.status,
            await response.text(),
            Object.fromEntries(response.headers.entries()),
          ] as [number, string, Record<string, string>];
        },
      );
    },
    stop({ ipc }) {
      ipc.removeHandler('synced-lyrics:fetch');
      this.desktopCleanup?.();
      this.desktopCleanup = null;
    },
  },
  renderer: {
    styleSheet: null as CSSStyleSheet | null,
    playerStyleSheet: null as CSSStyleSheet | null,
    playerPolishStyleSheet: null as CSSStyleSheet | null,
    interactionStyleSheet: null as CSSStyleSheet | null,
    searchPageStyleSheet: null as CSSStyleSheet | null,
    artistPageStyleSheet: null as CSSStyleSheet | null,
    settingsCleanup: null as (() => void) | null,
    playerCleanup: null as (() => void) | null,
    searchPage: null as SearchPageController | null,
    artistPage: null as ArtistPageController | null,
    engine: null as YouTubeMusicAdapter | null,
    interactionCleanup: null as (() => void) | null,

    async start(ctx) {
      if (this.engine) return;
      this.styleSheet = new CSSStyleSheet();
      this.playerStyleSheet = new CSSStyleSheet();
      this.playerPolishStyleSheet = new CSSStyleSheet();
      this.interactionStyleSheet = new CSSStyleSheet();
      this.searchPageStyleSheet = new CSSStyleSheet();
      this.artistPageStyleSheet = new CSSStyleSheet();
      await Promise.all([
        this.styleSheet.replace(style),
        this.playerStyleSheet.replace(playerStyle),
        this.playerPolishStyleSheet.replace(playerPolishStyle),
        this.interactionStyleSheet.replace(interactionStyle),
        this.searchPageStyleSheet.replace(searchPageStyle),
        this.artistPageStyleSheet.replace(artistPageStyle),
        startKaraoke(ctx),
      ]);
      document.adoptedStyleSheets = [
        ...document.adoptedStyleSheets,
        this.styleSheet,
        this.playerStyleSheet,
        this.playerPolishStyleSheet,
        this.interactionStyleSheet,
        this.searchPageStyleSheet,
        this.artistPageStyleSheet,
      ];
      this.playerCleanup?.();
      this.interactionCleanup?.();
      this.searchPage?.dispose();
      this.artistPage?.dispose();
      const engine = createYouTubeMusicAdapter({
        attach: attachKaraokePlayer,
        stop: stopKaraoke,
      });
      installCatalogPolish(engine);
      this.engine = engine;
      engine.start();

      const artistPage = mountArtistPage(engine);
      this.artistPage = artistPage;
      const searchPage = mountSearchPage(
        engine,
        (name, browseId, restoreSearch) => {
          setActiveNav('');
          void artistPage.open(name, browseId, { restoreSearch });
        },
      );
      this.searchPage = searchPage;
      createShell(engine, searchPage, artistPage);
      this.settingsCleanup?.();
      this.settingsCleanup = mountSettings(ctx.ipc);
      this.playerCleanup = mountPlayer(engine, (name, browseId) => {
        searchPage.close();
        setActiveNav('');
        void artistPage.open(name, browseId);
      });
      this.interactionCleanup = mountInteractions(engine);
    },

    async onPlayerApiReady(api: MusicPlayer) {
      await this.engine?.attachPlayer(api);
    },

    async stop() {
      stopKaraoke();
      this.settingsCleanup?.();
      this.settingsCleanup = null;
      this.interactionCleanup?.();
      this.interactionCleanup = null;
      this.searchPage?.dispose();
      this.searchPage = null;
      this.artistPage?.dispose();
      this.artistPage = null;
      this.engine?.dispose();
      this.engine = null;
      this.playerCleanup?.();
      this.playerCleanup = null;
      document.getElementById(UI_ROOT_ID)?.remove();
      document.documentElement.removeAttribute(UI_ATTR);
      await Promise.all([
        this.styleSheet?.replace(''),
        this.playerStyleSheet?.replace(''),
        this.playerPolishStyleSheet?.replace(''),
        this.interactionStyleSheet?.replace(''),
        this.searchPageStyleSheet?.replace(''),
        this.artistPageStyleSheet?.replace(''),
      ]);
      const ownedSheets = new Set([
        this.styleSheet,
        this.playerStyleSheet,
        this.playerPolishStyleSheet,
        this.interactionStyleSheet,
        this.searchPageStyleSheet,
        this.artistPageStyleSheet,
      ]);
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
        (sheet) => !ownedSheets.has(sheet),
      );
    },
  },
});
