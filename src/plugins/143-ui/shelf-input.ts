const STYLE_ID = 'ui143-shelf-fixes';

type DragState = {
  shelf: HTMLElement;
  pointerId: number;
  startX: number;
  startY: number;
  startScrollLeft: number;
  active: boolean;
};

const shelfFromTarget = (target: Element) =>
  target.closest<HTMLElement>(
    '.ui143-artist-shelf-row, .ui143-search-albums .ui143-search-card-grid',
  );

const mountStyle = () => {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .ui143-artist-shelf-row,
    .ui143-search-albums .ui143-search-card-grid {
      scroll-snap-type: none !important;
      scrollbar-width: auto !important;
      scrollbar-color: rgba(255,255,255,.34) rgba(255,255,255,.055);
      padding-bottom: 14px !important;
    }
    .ui143-artist-shelf-row::-webkit-scrollbar,
    .ui143-search-albums .ui143-search-card-grid::-webkit-scrollbar {
      height: 11px !important;
    }
    .ui143-artist-shelf-row::-webkit-scrollbar-track,
    .ui143-search-albums .ui143-search-card-grid::-webkit-scrollbar-track {
      border-radius: 999px;
      background: rgba(255,255,255,.055);
    }
    .ui143-artist-shelf-row::-webkit-scrollbar-thumb,
    .ui143-search-albums .ui143-search-card-grid::-webkit-scrollbar-thumb {
      min-width: 42px;
      border: 2px solid transparent;
      border-radius: 999px;
      background: rgba(255,255,255,.34) !important;
      background-clip: padding-box !important;
    }
    .ui143-artist-shelf-row:hover::-webkit-scrollbar-thumb,
    .ui143-search-albums .ui143-search-card-grid:hover::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,.48) !important;
      background-clip: padding-box !important;
    }
    .ui143-stable-dragging {
      cursor: grabbing !important;
      user-select: none !important;
    }
    .ui143-stable-dragging * {
      pointer-events: none !important;
      user-select: none !important;
    }
  `;
  document.head.append(style);
  return () => style.remove();
};

export const installShelfInput = () => {
  document.getElementById(STYLE_ID)?.remove();
  const removeStyle = mountStyle();
  let drag: DragState | null = null;
  let suppressShelf: HTMLElement | null = null;
  let suppressUntil = 0;

  const onWheel = (event: WheelEvent) => {
    if (!(event.target instanceof Element)) return;
    const shelf = shelfFromTarget(event.target);
    if (!shelf || event.shiftKey) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.stopImmediatePropagation();
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
    event.stopImmediatePropagation();
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.active) {
      if (Math.abs(dx) < 4) return;
      if (Math.abs(dy) > Math.abs(dx) * 1.3) {
        drag = null;
        return;
      }
      drag.active = true;
      drag.shelf.classList.add('ui143-stable-dragging');
      try {
        drag.shelf.setPointerCapture(event.pointerId);
      } catch {}
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const max = Math.max(0, drag.shelf.scrollWidth - drag.shelf.clientWidth);
    drag.shelf.scrollLeft = Math.max(0, Math.min(max, drag.startScrollLeft - dx));
  };

  const finish = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.active) {
      suppressShelf = drag.shelf;
      suppressUntil = performance.now() + 300;
      drag.shelf.classList.remove('ui143-stable-dragging');
      try {
        drag.shelf.releasePointerCapture(event.pointerId);
      } catch {}
      event.stopImmediatePropagation();
    }
    drag = null;
  };

  const onClick = (event: MouseEvent) => {
    if (
      performance.now() > suppressUntil ||
      !suppressShelf ||
      !(event.target instanceof Node) ||
      !suppressShelf.contains(event.target)
    ) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressShelf = null;
    suppressUntil = 0;
  };

  document.addEventListener('wheel', onWheel, { capture: true, passive: true });
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointermove', onPointerMove, { capture: true, passive: false });
  document.addEventListener('pointerup', finish, true);
  document.addEventListener('pointercancel', finish, true);
  document.addEventListener('click', onClick, true);

  return () => {
    drag?.shelf.classList.remove('ui143-stable-dragging');
    removeStyle();
    document.removeEventListener('wheel', onWheel, true);
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('pointermove', onPointerMove, true);
    document.removeEventListener('pointerup', finish, true);
    document.removeEventListener('pointercancel', finish, true);
    document.removeEventListener('click', onClick, true);
  };
};
