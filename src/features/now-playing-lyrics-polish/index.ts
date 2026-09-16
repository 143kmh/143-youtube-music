import { setIsVisible } from '@/features/synced-lyrics/renderer/renderer';
import {
  selectors,
  tabStates,
} from '@/features/synced-lyrics/renderer/utils';
import { createFeature, createRenderer } from '@/utils';

import style from './style.css?inline';

const ROOT_ID = 'ui143-now-playing';
const CONTAINER_ID = 'synced-lyrics-container';

const renderer = createRenderer<{
  observer: MutationObserver | null;
  retryTimer: number | null;
  container: HTMLElement | null;
  syncing: boolean;
  syncEmbed: () => Promise<void>;
  restoreNative: () => void;
}>({
  observer: null,
  retryTimer: null,
  container: null,
  syncing: false,

  restoreNative() {
    const nativeTab = document.querySelector<HTMLElement>(
      selectors.body.tabRenderer,
    );
    if (this.container && nativeTab && this.container.parentElement !== nativeTab)
      nativeTab.append(this.container);

    const header = document.querySelector<HTMLElement>(selectors.head);
    setIsVisible(header?.ariaSelected === 'true');
  },

  async syncEmbed() {
    if (this.syncing) return;
    this.syncing = true;

    try {
      const root = document.getElementById(ROOT_ID);
      const pane = root?.querySelector<HTMLElement>('[data-pane="lyrics"]');
      if (!root || !pane) return;

      const lyricsOpen = !root.hidden && !pane.hidden;
      if (!lyricsOpen) {
        pane.classList.remove('ui143-native-lyrics-mounted');
        this.restoreNative();
        return;
      }

      // Use the exact synced-lyrics renderer that powers the native YouTube
      // surface instead of maintaining a second imitation in 143 Playback.
      setIsVisible(true);

      this.container ??= document.getElementById(CONTAINER_ID);
      if (!this.container) {
        await tabStates.true();
        this.container = document.getElementById(CONTAINER_ID);
      }
      if (!this.container) return;

      pane.classList.add('ui143-native-lyrics-mounted');
      if (this.container.parentElement !== pane) pane.append(this.container);
      setIsVisible(true);
    } finally {
      this.syncing = false;
    }
  },

  start() {
    this.observer = new MutationObserver(() => {
      void this.syncEmbed();
    });
    this.observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['hidden', 'aria-selected'],
    });

    this.retryTimer = window.setInterval(() => {
      void this.syncEmbed();
    }, 300);

    void this.syncEmbed();
  },

  stop() {
    this.observer?.disconnect();
    this.observer = null;
    if (this.retryTimer !== null) window.clearInterval(this.retryTimer);
    this.retryTimer = null;

    document
      .querySelector<HTMLElement>('#ui143-now-playing [data-pane="lyrics"]')
      ?.classList.remove('ui143-native-lyrics-mounted');
    this.restoreNative();
    this.container = null;
    this.syncing = false;
  },
});

export default createFeature({
  name: () => '143 Now Playing Lyrics Polish',
  description: () =>
    'Embeds the native synced-lyrics renderer inside the 143 playback layout.',
  config: { enabled: true },
  stylesheets: [style],
  renderer,
});
