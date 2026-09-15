import type { YouTubeMusicAdapter } from './youtube-music';

const NATIVE_POLISH_STYLE_ID = 'ui143-native-polish';
const PAGE_IDS = [
  'ui143-search-page',
  'ui143-artist-page',
  'ui143-album-page',
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
  );
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
    if (!shelf || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

    const max = Math.max(0, shelf.scrollWidth - shelf.clientWidth);
    if (max <= 1) return;
    const direction = Math.sign(event.deltaY);
    const canMove =
      (direction > 0 && shelf.scrollLeft < max - 1) ||
      (direction < 0 && shelf.scrollLeft > 1);
    if (!canMove) return;

    event.preventDefault();
    const delta =
      event.deltaY *
      (event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? shelf.clientWidth
          : 1);
    shelf.scrollLeft = Math.max(0, Math.min(max, shelf.scrollLeft + delta));
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

export const mountInteractions = (engine: YouTubeMusicAdapter) => {
  const removeNativePolish = mountNativePolish();
  const shelfGestures = mountShelfGestures();

  // Do not synthesize /watch navigation ourselves. loadVideoById() can play a
  // track without creating all of YouTube Music's watch-page state, so asking
  // ytmusic-app.navigate('/watch?...') may produce an empty page. The hidden
  // native player-bar thumbnail already owns the correct transition and keeps
  // the current playback session intact.
  const openNowPlayingSurface = async () => {
    if (!engine.getState().track.id) return;
    if (await engine.openNowPlaying()) hideCustomPages();
  };

  const openLyricsFromAnywhere = async () => {
    if (!engine.getState().track.id) return;
    if (await engine.toggleLyrics()) hideCustomPages();
  };

  const onClick = (event: MouseEvent) => {
    if (shelfGestures.suppressDraggedClick(event)) return;
    const target = event.target;
    if (!(target instanceof Element)) return;

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

  document.addEventListener('click', onClick, true);
  return () => {
    document.removeEventListener('click', onClick, true);
    shelfGestures.dispose();
    removeNativePolish();
  };
};
