import { mountLibraryCollections } from './library-collections';
import { mountLibraryPage } from './library-page';
import { mountPlaylistWorkspace } from './playlist-workspace';
import { installUxFixes } from './ux-fixes';

import type { PlaybackContextAdapter } from './playback-context';

const NATIVE_POLISH_STYLE_ID = 'ui143-native-polish';
const PAGE_IDS = [
  'ui143-search-page',
  'ui143-artist-page',
  'ui143-album-page',
  'ui143-library-page',
  'ui143-library-collections',
  'ui143-playlist-workspace',
] as const;

const mountNativePolish = () => {
  document.getElementById(NATIVE_POLISH_STYLE_ID)?.remove();
  const style = document.createElement('style');
  style.id = NATIVE_POLISH_STYLE_ID;
  style.textContent = `
    .ui143-topbar {
      background: #121212 !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }

    html[data-143-ui] ytmusic-podcast-show,
    html[data-143-ui] ytmusic-podcast-detail-page,
    html[data-143-ui] ytmusic-podcast-shelf-renderer,
    html[data-143-ui] ytmusic-two-row-item-renderer:has(a[href*="/podcast/"]),
    html[data-143-ui] ytmusic-responsive-list-item-renderer:has(a[href*="/podcast/"]),
    html[data-143-ui] ytmusic-two-row-item-renderer:has(a[href*="MPSP"]),
    html[data-143-ui] ytmusic-responsive-list-item-renderer:has(a[href*="MPSP"]),
    html[data-143-ui] ytmusic-guide-entry-renderer:has(a[href*="/podcast/"]) {
      display: none !important;
    }

    .ui143-artist-shelf-row,
    .ui143-search-albums .ui143-search-card-grid {
      cursor: grab;
      overscroll-behavior-inline: contain;
    }

    .ui143-artist-shelf-row.is-dragging,
    .ui143-search-albums .ui143-search-card-grid.is-dragging {
      cursor: grabbing;
      scroll-snap-type: none !important;
      user-select: none;
    }

    .ui143-artist-shelf-row.is-dragging *,
    .ui143-search-albums .ui143-search-card-grid.is-dragging * {
      pointer-events: none;
      user-select: none;
    }
  `;
  document.head.append(style);
  return () => style.remove();
};

const hideCustomPages = () => {
  for (const id of PAGE_IDS) {
    const page = document.getElementById(id);
    if (page) page.hidden = true;
  }
  document.documentElement.classList.remove(
    'ui143-search-open',
    'ui143-artist-open',
    'ui143-album-open',
    'ui143-library-open',
    'ui143-library-collections-open',
    'ui143-playlist-workspace-open',
  );
};

const setActiveNav = (key: string) => {
  document
    .querySelectorAll<HTMLElement>('.ui143-nav-item[data-key]')
    .forEach((item) => item.classList.toggle('is-active', item.dataset.key === key));
};

const shelfFromTarget = (target: Element) => {
  return target.closest<HTMLElement>(
    '.ui143-artist-shelf-row, .ui143-search-albums .ui143-search-card-grid',
  );
};

const mountShelfGestures = () => {
  type DragState = {
    shelf: HTMLElement;
    pointerId: number;
    startX: number;
    startY: number;
    startScrollLeft: number;
    active: boolean;
  };

  let drag: DragState | null = null;
  let suppressShelf: HTMLElement | null = null;
  let suppressClickUntil = 0;

  const onWheel = (event: WheelEvent) => {
    if (!(event.target instanceof Element)) return;
    const shelf = shelfFromTarget(event.target);
    const deltaY = Number.isFinite(event.deltaY) ? event.deltaY : 0;
    const deltaX = Number.isFinite(event.deltaX) ? event.deltaX : 0;
    if (!shelf || deltaY === 0 || Math.abs(deltaY) <= Math.abs(deltaX)) return;

    const max = Math.max(0, shelf.scrollWidth - shelf.clientWidth);
    if (max <= 1) return;
    const currentScroll = Number.isFinite(shelf.scrollLeft) ? shelf.scrollLeft : 0;
    const direction = Math.sign(deltaY);
    const canMove =
      (direction > 0 && currentScroll < max - 1) ||
      (direction < 0 && currentScroll > 1);
    if (!canMove) return;

    event.preventDefault();
    const delta =
      deltaY *
      (event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? shelf.clientWidth
          : 1);
    shelf.scrollLeft = Math.max(0, Math.min(max, currentScroll + delta));
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    const shelf = shelfFromTarget(event.target);
    if (!shelf || shelf.scrollWidth <= shelf.clientWidth + 1) return;
    drag = {
      shelf,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: shelf.scrollLeft,
      active: false,
    };
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.active) {
      if (Math.abs(dx) < 7 || Math.abs(dx) <= Math.abs(dy)) return;
      drag.active = true;
      drag.shelf.classList.add('is-dragging');
      try {
        drag.shelf.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is only a convenience; document listeners still work.
      }
    }
    event.preventDefault();
    const max = Math.max(0, drag.shelf.scrollWidth - drag.shelf.clientWidth);
    drag.shelf.scrollLeft = Math.max(
      0,
      Math.min(max, drag.startScrollLeft - dx),
    );
  };

  const finishDrag = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.active) {
      suppressShelf = drag.shelf;
      suppressClickUntil = performance.now() + 260;
      drag.shelf.classList.remove('is-dragging');
      try {
        drag.shelf.releasePointerCapture(event.pointerId);
      } catch {
        // It may already have been released by Chromium.
      }
    }
    drag = null;
  };

  const suppressDraggedClick = (event: MouseEvent) => {
    if (
      performance.now() > suppressClickUntil ||
      !suppressShelf ||
      !(event.target instanceof Node) ||
      !suppressShelf.contains(event.target)
    )
      return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressShelf = null;
    suppressClickUntil = 0;
    return true;
  };

  document.addEventListener('wheel', onWheel, {
    capture: true,
    passive: false,
  });
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointermove', onPointerMove, {
    capture: true,
    passive: false,
  });
  document.addEventListener('pointerup', finishDrag, true);
  document.addEventListener('pointercancel', finishDrag, true);

  return {
    suppressDraggedClick,
    dispose() {
      drag?.shelf.classList.remove('is-dragging');
      document.removeEventListener('wheel', onWheel, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointerup', finishDrag, true);
      document.removeEventListener('pointercancel', finishDrag, true);
    },
  };
};

const bridgeWindowConstructors = () => {
  const isolatedGlobal = globalThis as typeof globalThis & Record<string, unknown>;
  const browserWindow = window as unknown as Window & Record<string, unknown>;
  for (const key of ['CSSStyleSheet', 'IntersectionObserver', 'MutationObserver']) {
    if (isolatedGlobal[key] === undefined && browserWindow[key] !== undefined)
      Object.defineProperty(isolatedGlobal, key, {
        configurable: true,
        value: browserWindow[key],
      });
  }
};

export const mountInteractions = (engine: PlaybackContextAdapter) => {
  bridgeWindowConstructors();
  const removeUxFixes = installUxFixes(engine);
  const removeNativePolish = mountNativePolish();
  const shelfGestures = mountShelfGestures();
  const libraryPage = mountLibraryPage(engine);
  const collectionsPage = mountLibraryCollections(engine);
  const playlistWorkspace = mountPlaylistWorkspace(engine);

  const openNowPlayingSurface = async () => {
    if (!engine.getState().track.id) return;
    if (await engine.openNowPlaying()) {
      playlistWorkspace.close(false);
      hideCustomPages();
    }
  };

  const openLyricsFromAnywhere = async () => {
    if (!engine.getState().track.id) return;
    if (await engine.toggleLyrics()) {
      playlistWorkspace.close(false);
      hideCustomPages();
    }
  };

  const onClick = (event: MouseEvent) => {
    if (shelfGestures.suppressDraggedClick(event)) return;
    const target = event.target;
    if (!(target instanceof Element)) return;

    const historyBack = target.closest<HTMLElement>(
      '.ui143-history button[aria-label="Back"]',
    );
    if (historyBack && collectionsPage.isOpen()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const result = collectionsPage.back();
      if (result === 'library') {
        setActiveNav('library');
        void libraryPage.open('landing');
      }
      return;
    }

    const nav = target.closest<HTMLElement>('.ui143-nav-item[data-key]');
    const navKey = nav?.dataset.key ?? '';
    const libraryMode =
      navKey === 'library'
        ? 'landing'
        : navKey === 'playlists'
          ? 'playlists'
          : navKey === 'songs'
            ? 'songs'
            : null;
    const collectionMode =
      navKey === 'albums' ? 'albums' : navKey === 'artists' ? 'artists' : null;

    if (libraryMode) {
      event.preventDefault();
      event.stopImmediatePropagation();
      playlistWorkspace.close(false);
      hideCustomPages();
      collectionsPage.close();
      setActiveNav(navKey);
      void libraryPage.open(libraryMode);
      return;
    }
    if (collectionMode) {
      event.preventDefault();
      event.stopImmediatePropagation();
      playlistWorkspace.close(false);
      hideCustomPages();
      libraryPage.close();
      setActiveNav(navKey);
      void collectionsPage.open(collectionMode);
      return;
    }
    if (nav) {
      if (playlistWorkspace.isOpen()) playlistWorkspace.close(false);
      if (libraryPage.isOpen()) libraryPage.close();
      if (collectionsPage.isOpen()) collectionsPage.close();
    }

    const karaoke = target.closest(
      '.ui143-player-utils button[aria-label="Karaoke"]',
    );
    if (karaoke) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openLyricsFromAnywhere();
      return;
    }

    const meta = target.closest('.ui143-player-meta');
    const interactive = target.closest('a, button, input, [role="button"]');
    if (meta && (!interactive || !meta.contains(interactive))) {
      event.preventDefault();
      event.stopPropagation();
      openNowPlayingSurface();
      return;
    }
    engine.handleTrackClick(event);
  };

  const onSubmit = (event: SubmitEvent) => {
    if (
      event.target instanceof Element &&
      event.target.matches('.ui143-search')
    ) {
      if (playlistWorkspace.isOpen()) playlistWorkspace.close(false);
      if (libraryPage.isOpen()) libraryPage.close();
      if (collectionsPage.isOpen()) collectionsPage.close();
    }
  };

  document.addEventListener('click', onClick, true);
  document.addEventListener('submit', onSubmit, true);
  return () => {
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('submit', onSubmit, true);
    playlistWorkspace.dispose();
    collectionsPage.dispose();
    libraryPage.dispose();
    shelfGestures.dispose();
    removeUxFixes();
    removeNativePolish();
  };
};
