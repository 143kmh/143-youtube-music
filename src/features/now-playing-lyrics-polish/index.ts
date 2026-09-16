import { createFeature, createRenderer } from '@/utils';

import style from './style.css?inline';

const ROOT_ID = 'ui143-now-playing';

const renderer = createRenderer<{
  observer: MutationObserver | null;
  retryTimer: number | null;
  lastAligned: HTMLElement | null;
}>({
  observer: null,
  retryTimer: null,
  lastAligned: null,

  start() {
    const alignCurrent = () => {
      const root = document.getElementById(ROOT_ID);
      if (!root || root.hidden) return;

      const current = root.querySelector<HTMLElement>(
        '.ui143-now-playing-lyric.is-current',
      );
      if (!current || current === this.lastAligned) return;

      const scroller = current.closest<HTMLElement>(
        '.ui143-now-playing-lyrics',
      );
      if (!scroller) return;

      this.lastAligned = current;

      // Mirror the synced-lyrics YouTube renderer: keep one line ahead centered.
      // This leaves the currently sung line just above center and avoids the
      // large first-line jump caused by the old spacer + scrollIntoView setup.
      const next = current.nextElementSibling;
      const focus =
        next instanceof HTMLElement &&
        next.classList.contains('ui143-now-playing-lyric')
          ? next
          : current;
      const target =
        focus.offsetTop - (scroller.clientHeight - focus.offsetHeight) / 2;

      scroller.scrollTo({
        top: Math.max(0, target),
        behavior: 'smooth',
      });
    };

    const attach = () => {
      const root = document.getElementById(ROOT_ID);
      if (!root) return false;

      this.observer?.disconnect();
      this.observer = new MutationObserver(() => alignCurrent());
      this.observer.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'hidden'],
      });
      alignCurrent();
      return true;
    };

    if (!attach()) {
      this.retryTimer = window.setInterval(() => {
        if (!attach()) return;
        if (this.retryTimer !== null) window.clearInterval(this.retryTimer);
        this.retryTimer = null;
      }, 200);
    }
  },

  stop() {
    this.observer?.disconnect();
    this.observer = null;
    if (this.retryTimer !== null) window.clearInterval(this.retryTimer);
    this.retryTimer = null;
    this.lastAligned = null;
  },
});

export default createFeature({
  name: () => '143 Now Playing Lyrics Polish',
  description: () =>
    'Keeps the 143 playback layout while matching the YouTube synced-lyrics presentation.',
  config: { enabled: true },
  stylesheets: [style],
  renderer,
});
