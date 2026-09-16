import { createFeature, createRenderer } from '@/utils';

import type { MusicPlayer } from '@/types/music-player';

const COPY_BUTTON_ID = 'ui143-copy-track-link';
const SLEEP_BUTTON_ID = 'ui143-sleep-timer';
const STYLE_ID = 'ui143-player-tools-style';
const TOAST_ID = 'ui143-player-tools-toast';
const SLEEP_STEPS = [0, 15, 30, 60] as const;

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
  sleepTimeout: number | null;
  sleepTick: number | null;
  sleepMinutes: number;
  sleepEndsAt: number;
  toastTimeout: number | null;
  mount: () => void;
  renderSleepButton: () => void;
  showToast: (message: string) => void;
  copyTrackLink: () => Promise<void>;
  cycleSleepTimer: () => void;
  clearSleepTimer: (notify?: boolean) => void;
};

const renderer = createRenderer<PlayerToolsState>({
  player: null,
  observer: null,
  sleepTimeout: null,
  sleepTick: null,
  sleepMinutes: 0,
  sleepEndsAt: 0,
  toastTimeout: null,

  mount() {
    const metaActions = document.querySelector<HTMLElement>(
      '.ui143-player-meta-actions',
    );
    if (metaActions && !document.getElementById(COPY_BUTTON_ID)) {
      const copy = toolButton(
        COPY_BUTTON_ID,
        'Copy track link',
        'M7 7h4V5H7a5 5 0 0 0 0 10h4v-2H7a3 3 0 0 1 0-6Zm2 6h6v-2H9v2Zm8-8h-4v2h4a3 3 0 1 1 0 6h-4v2h4a5 5 0 0 0 0-10Z',
      );
      copy.addEventListener('click', () => {
        void this.copyTrackLink();
      });
      metaActions.append(copy);
    }

    const utilities = document.querySelector<HTMLElement>('.ui143-player-utils');
    if (utilities && !document.getElementById(SLEEP_BUTTON_ID)) {
      const sleep = toolButton(
        SLEEP_BUTTON_ID,
        'Sleep timer · Off',
        'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm1-13h-2v6l5 3 1-1.73-4-2.27V7Z',
      );
      sleep.setAttribute('aria-pressed', 'false');
      const badge = document.createElement('span');
      badge.className = 'ui143-player-tool-badge';
      badge.hidden = true;
      sleep.append(badge);
      sleep.addEventListener('click', () => this.cycleSleepTimer());
      utilities.prepend(sleep);
    }

    this.renderSleepButton();
  },

  renderSleepButton() {
    const button = document.getElementById(
      SLEEP_BUTTON_ID,
    ) as HTMLButtonElement | null;
    if (!button) return;
    const badge = button.querySelector<HTMLElement>('.ui143-player-tool-badge');
    const active = this.sleepMinutes > 0 && this.sleepEndsAt > Date.now();
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));

    if (!active) {
      button.title = 'Sleep timer · Off';
      button.setAttribute('aria-label', 'Sleep timer · Off');
      if (badge) badge.hidden = true;
      return;
    }

    const minutesLeft = Math.max(
      1,
      Math.ceil((this.sleepEndsAt - Date.now()) / 60_000),
    );
    button.title = `Sleep timer · ${minutesLeft} min left · click to change`;
    button.setAttribute(
      'aria-label',
      `Sleep timer · ${minutesLeft} minutes left`,
    );
    if (badge) {
      badge.hidden = false;
      badge.textContent = String(minutesLeft);
    }
  },

  showToast(message: string) {
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

  clearSleepTimer(notify = false) {
    if (this.sleepTimeout !== null) window.clearTimeout(this.sleepTimeout);
    if (this.sleepTick !== null) window.clearInterval(this.sleepTick);
    this.sleepTimeout = null;
    this.sleepTick = null;
    this.sleepMinutes = 0;
    this.sleepEndsAt = 0;
    this.renderSleepButton();
    if (notify) this.showToast('Sleep timer off');
  },

  cycleSleepTimer() {
    const current = SLEEP_STEPS.findIndex(
      (minutes) => minutes === this.sleepMinutes,
    );
    const next = SLEEP_STEPS[(current + 1) % SLEEP_STEPS.length];

    this.clearSleepTimer(false);
    if (next === 0) {
      this.showToast('Sleep timer off');
      return;
    }

    this.sleepMinutes = next;
    this.sleepEndsAt = Date.now() + next * 60_000;
    this.sleepTimeout = window.setTimeout(() => {
      try {
        this.player?.pauseVideo();
      } finally {
        this.sleepTimeout = null;
        if (this.sleepTick !== null) window.clearInterval(this.sleepTick);
        this.sleepTick = null;
        this.sleepMinutes = 0;
        this.sleepEndsAt = 0;
        this.renderSleepButton();
        this.showToast('Sleep timer finished');
      }
    }, next * 60_000);
    this.sleepTick = window.setInterval(() => this.renderSleepButton(), 30_000);
    this.renderSleepButton();
    this.showToast(`Sleep timer set for ${next} minutes`);
  },

  start() {
    document.getElementById(STYLE_ID)?.remove();
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .ui143-player-tool { position: relative; overflow: visible !important; }
      .ui143-player-tool-badge {
        position: absolute;
        top: -5px;
        right: -7px;
        min-width: 14px;
        height: 14px;
        box-sizing: border-box;
        padding: 0 3px;
        border-radius: 999px;
        background: var(--ui143-accent-strong, #8f7dd1);
        color: #111;
        font-size: 8px;
        font-weight: 800;
        line-height: 14px;
        text-align: center;
        pointer-events: none;
      }
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

    this.observer?.disconnect();
    this.observer = new MutationObserver(() => this.mount());
    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    this.mount();
  },

  onPlayerApiReady(playerApi) {
    this.player = playerApi;
    this.mount();
  },

  stop() {
    this.observer?.disconnect();
    this.observer = null;
    this.clearSleepTimer(false);
    if (this.toastTimeout !== null) window.clearTimeout(this.toastTimeout);
    this.toastTimeout = null;
    document.getElementById(COPY_BUTTON_ID)?.remove();
    document.getElementById(SLEEP_BUTTON_ID)?.remove();
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
