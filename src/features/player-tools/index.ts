import { createFeature, createRenderer } from '@/utils';

import type { MusicPlayer } from '@/types/music-player';

const COPY_BUTTON_ID = 'ui143-copy-track-link';
const STYLE_ID = 'ui143-player-tools-style';
const TOAST_ID = 'ui143-player-tools-toast';

const icon = (path: string) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ui143-player-icon');
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  node.setAttribute('d', path);
  svg.append(node);
  return svg;
};

const toolButton = (id: string, label: string, path: string) => {
  const button = document.createElement('button');
  button.id = id;
  button.type = 'button';
  button.className = 'ui143-player-button ui143-player-tool';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.append(icon(path));
  return button;
};

const fallbackCopy = (value: string) => {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  return copied;
};

type PlayerToolsState = {
  player: MusicPlayer | null;
  observer: MutationObserver | null;
  toastTimeout: number | null;
  mount: () => void;
  showToast: (message: string) => void;
  copyTrackLink: () => Promise<void>;
};

const renderer = createRenderer<PlayerToolsState>({
  player: null,
  observer: null,
  toastTimeout: null,

  mount() {
    const metaActions = document.querySelector<HTMLElement>(
      '.ui143-player-meta-actions',
    );
    if (!metaActions || document.getElementById(COPY_BUTTON_ID)) {
      if (document.getElementById(COPY_BUTTON_ID)) {
        this.observer?.disconnect();
        this.observer = null;
      }
      return;
    }

    const copy = toolButton(
      COPY_BUTTON_ID,
      'Copy track link',
      'M7 7h4V5H7a5 5 0 0 0 0 10h4v-2H7a3 3 0 0 1 0-6Zm2 6h6v-2H9v2Zm8-8h-4v2h4a3 3 0 1 1 0 6h-4v2h4a5 5 0 0 0 0-10Z',
    );
    copy.addEventListener('click', () => {
      void this.copyTrackLink();
    });
    metaActions.append(copy);
    this.observer?.disconnect();
    this.observer = null;
  },

  showToast(message) {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = TOAST_ID;
      toast.setAttribute('role', 'status');
      document.body.append(toast);
    }
    toast.textContent = message;
    toast.classList.add('is-visible');
    if (this.toastTimeout !== null) window.clearTimeout(this.toastTimeout);
    this.toastTimeout = window.setTimeout(() => {
      document.getElementById(TOAST_ID)?.classList.remove('is-visible');
      this.toastTimeout = null;
    }, 1800);
  },

  async copyTrackLink() {
    const videoId = this.player?.getVideoData()?.video_id?.trim();
    if (!videoId) {
      this.showToast('No track to copy');
      return;
    }

    const url = new URL('https://music.youtube.com/watch');
    url.searchParams.set('v', videoId);
    const value = url.toString();
    let copied = false;

    try {
      await navigator.clipboard.writeText(value);
      copied = true;
    } catch {
      copied = fallbackCopy(value);
    }

    this.showToast(copied ? 'Track link copied' : 'Could not copy track link');
  },

  start() {
    document.getElementById(STYLE_ID)?.remove();
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .ui143-player-tool { position: relative; overflow: visible !important; }
      #${TOAST_ID} {
        position: fixed;
        left: 50%;
        bottom: 104px;
        z-index: 2147483646;
        max-width: min(420px, calc(100vw - 32px));
        padding: 8px 12px;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 8px;
        background: rgba(24,24,24,.94);
        color: #eee;
        box-shadow: 0 12px 34px rgba(0,0,0,.34);
        font: 600 11px/1.3 ui-sans-serif, system-ui, sans-serif;
        opacity: 0;
        pointer-events: none;
        transform: translate(-50%, 8px);
        transition: opacity .14s ease, transform .14s ease;
      }
      #${TOAST_ID}.is-visible {
        opacity: 1;
        transform: translate(-50%, 0);
      }
    `;
    document.head.append(style);

    this.mount();
    if (!document.getElementById(COPY_BUTTON_ID)) {
      this.observer?.disconnect();
      this.observer = new MutationObserver(() => this.mount());
      this.observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }
  },

  onPlayerApiReady(playerApi) {
    this.player = playerApi;
    this.mount();
  },

  stop() {
    this.observer?.disconnect();
    this.observer = null;
    if (this.toastTimeout !== null) window.clearTimeout(this.toastTimeout);
    this.toastTimeout = null;
    document.getElementById(COPY_BUTTON_ID)?.remove();
    document.getElementById(TOAST_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    this.player = null;
  },
});

export default createFeature({
  name: () => 'Player Tools',
  description: () => 'Small quality-of-life controls for the 143 Music player.',
  config: { enabled: true },
  renderer,
});
