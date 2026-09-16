import { createFeature, createRenderer } from '@/utils';

import style from './style.css?inline';

import type { MusicPlayer } from '@/types/music-player';

const BUTTON_ID = 'ui143-account-button';
const GATE_ID = 'ui143-login-gate';
const AD_BADGE_ID = 'ui143-ad-badge';
const ACCOUNT_CHOOSER =
  'https://accounts.google.com/AccountChooser?service=youtube&continue=https%3A%2F%2Fmusic.youtube.com%2F';

const clickTarget = (element: Element | null): HTMLElement | null => {
  if (!(element instanceof HTMLElement)) return null;
  return (
    element.closest<HTMLElement>(
      'button, a, [role="button"], tp-yt-paper-icon-button, yt-button-shape, ytmusic-settings-button',
    ) ?? element
  );
};

const nativeSignIn = () => {
  const candidates = document.querySelectorAll<HTMLElement>(
    'ytmusic-nav-bar a, ytmusic-nav-bar button, ytmusic-nav-bar tp-yt-paper-button, ytmusic-nav-bar yt-button-shape',
  );
  for (const candidate of candidates) {
    const label = `${candidate.getAttribute('aria-label') ?? ''} ${candidate.textContent ?? ''}`;
    if (/\b(?:sign in|log in)\b|войти|увійти/iu.test(label)) return candidate;
  }
  return null;
};

const nativeAccountTrigger = () => {
  const selectors = [
    'ytmusic-nav-bar button[aria-label*="account" i]',
    'ytmusic-nav-bar [role="button"][aria-label*="account" i]',
    'ytmusic-nav-bar #avatar',
    'ytmusic-nav-bar img[src*="googleusercontent.com"]',
    'ytmusic-nav-bar img[src*="ggpht.com"]',
  ];
  for (const selector of selectors) {
    const target = clickTarget(document.querySelector(selector));
    if (target) return target;
  }
  return null;
};

const nativeAvatar = () => {
  for (const image of document.querySelectorAll<HTMLImageElement>('ytmusic-nav-bar img')) {
    const source = image.currentSrc || image.src;
    if (/googleusercontent\.com|ggpht\.com/iu.test(source)) return source;
  }
  return '';
};

const loggedInState = (): boolean | null => {
  const ytcfg = (window as unknown as {
    ytcfg?: { get?: (key: string) => unknown };
  }).ytcfg;
  const value = ytcfg?.get?.('LOGGED_IN');
  if (typeof value === 'boolean') return value;
  if (nativeAvatar()) return true;
  if (nativeSignIn()) return false;
  return null;
};

const userIcon = () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ui143-account-icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute(
    'd',
    'M12 3.5a4.25 4.25 0 1 1 0 8.5 4.25 4.25 0 0 1 0-8.5ZM4.25 20.5a7.75 7.75 0 0 1 15.5 0h-2a5.75 5.75 0 0 0-11.5 0h-2Z',
  );
  svg.append(path);
  return svg;
};

type PlayerElement = HTMLElement & MusicPlayer;

const renderer = createRenderer<{
  button: HTMLButtonElement | null;
  gate: HTMLElement | null;
  adBadge: HTMLElement | null;
  syncTimer: number | null;
  authTimer: number | null;
  styleSheet: CSSStyleSheet | null;
  clickHandler: ((event: MouseEvent) => void) | null;
  playerObserver: MutationObserver | null;
  observedPlayer: PlayerElement | null;
  adActive: boolean;
  adWasMuted: boolean;
  startupPlaybackHandled: boolean;
  mount: () => void;
  sync: () => void;
  openAccount: () => void;
  mountAuthGate: () => void;
  syncAuth: () => void;
  installPlayerSafety: () => void;
  syncAdState: () => void;
}>({
  button: null,
  gate: null,
  adBadge: null,
  syncTimer: null,
  authTimer: null,
  styleSheet: null,
  clickHandler: null,
  playerObserver: null,
  observedPlayer: null,
  adActive: false,
  adWasMuted: false,
  startupPlaybackHandled: false,

  mount() {
    const topbar = document.querySelector<HTMLElement>('.ui143-topbar');
    if (!topbar) return;

    let button = document.getElementById(BUTTON_ID) as HTMLButtonElement | null;
    if (!button) {
      button = document.createElement('button');
      button.id = BUTTON_ID;
      button.type = 'button';
      button.className = 'ui143-circle-button ui143-account-button';
      button.setAttribute('aria-label', 'Google account');
      button.title = 'Google account';
      button.append(userIcon());
      button.addEventListener('click', () => this.openAccount());
    }

    const settings = topbar.querySelector<HTMLElement>('.ui143-settings-button');
    if (settings && settings.nextElementSibling !== button) settings.after(button);
    else if (!settings && button.parentElement !== topbar) topbar.append(button);
    this.button = button;
    this.sync();
  },

  sync() {
    const button = this.button;
    if (!button) return;
    const avatar = nativeAvatar();
    const current = button.querySelector<HTMLImageElement>('.ui143-account-avatar');

    if (avatar) {
      button.classList.add('has-avatar');
      button.title = 'Google account';
      button.setAttribute('aria-label', 'Google account');
      if (!current) {
        const image = document.createElement('img');
        image.className = 'ui143-account-avatar';
        image.alt = '';
        image.referrerPolicy = 'no-referrer';
        image.src = avatar;
        button.replaceChildren(image);
      } else if (current.src !== avatar) current.src = avatar;
      return;
    }

    button.classList.remove('has-avatar');
    button.title = 'Sign in or switch Google account';
    button.setAttribute('aria-label', 'Sign in or switch Google account');
    if (current || !button.querySelector('.ui143-account-icon'))
      button.replaceChildren(userIcon());
  },

  openAccount() {
    if (loggedInState() !== true) {
      void window.ipcRenderer.invoke('143:auth:sign-in');
      return;
    }

    const account = nativeAccountTrigger();
    if (account) {
      account.click();
      return;
    }

    window.location.assign(ACCOUNT_CHOOSER);
  },

  mountAuthGate() {
    if (this.gate?.isConnected) return;
    document.getElementById(GATE_ID)?.remove();

    const gate = document.createElement('section');
    gate.id = GATE_ID;
    gate.setAttribute('aria-label', 'Google account required');

    const card = document.createElement('div');
    card.className = 'ui143-login-card';
    const brand = document.createElement('div');
    brand.className = 'ui143-login-brand';
    brand.textContent = '143 Music';
    const title = document.createElement('h1');
    title.className = 'ui143-login-title';
    title.textContent = 'Checking your Google account…';
    const copy = document.createElement('p');
    copy.className = 'ui143-login-copy';
    copy.textContent = '143 Music requires a Google account.';
    const signIn = document.createElement('button');
    signIn.type = 'button';
    signIn.className = 'ui143-login-button';
    signIn.textContent = 'Sign in with Google';
    signIn.hidden = true;
    signIn.addEventListener('click', async () => {
      signIn.disabled = true;
      signIn.textContent = 'Opening Google…';
      try {
        await window.ipcRenderer.invoke('143:auth:sign-in');
      } catch {
        signIn.disabled = false;
        signIn.textContent = 'Try again';
      }
    });

    card.append(brand, title, copy, signIn);
    gate.append(card);
    document.body.append(gate);
    this.gate = gate;
  },

  syncAuth() {
    const state = loggedInState();
    if (state === true) {
      this.gate?.remove();
      this.gate = null;
      return;
    }

    for (const media of document.querySelectorAll<HTMLMediaElement>('video, audio'))
      media.pause();

    this.mountAuthGate();
    if (!this.gate) return;
    const title = this.gate.querySelector<HTMLElement>('.ui143-login-title');
    const copy = this.gate.querySelector<HTMLElement>('.ui143-login-copy');
    const signIn = this.gate.querySelector<HTMLButtonElement>('.ui143-login-button');
    if (!title || !copy || !signIn) return;

    if (state === false) {
      title.textContent = 'Sign in to 143 Music';
      copy.textContent =
        'Sign in with Google to use your library, liked songs, playlists and Premium audio.';
      signIn.hidden = false;
    } else {
      title.textContent = 'Checking your Google account…';
      copy.textContent = '143 Music requires a Google account.';
      signIn.hidden = true;
    }
  },

  installPlayerSafety() {
    const player = document.querySelector<PlayerElement>('#movie_player');
    if (!player || player === this.observedPlayer) return;

    this.playerObserver?.disconnect();
    this.observedPlayer = player;
    this.playerObserver = new MutationObserver(() => this.syncAdState());
    this.playerObserver.observe(player, {
      attributes: true,
      attributeFilter: ['class'],
    });

    if (!this.startupPlaybackHandled) {
      this.startupPlaybackHandled = true;
      if (!window.mainConfig.get('options.resumeOnStart')) player.pauseVideo();
    }

    this.syncAdState();
  },

  syncAdState() {
    const player = this.observedPlayer;
    if (!player || !player.isConnected) {
      this.observedPlayer = null;
      this.playerObserver?.disconnect();
      this.playerObserver = null;
      this.adBadge?.setAttribute('hidden', '');
      this.adActive = false;
      return;
    }

    const isAd =
      player.classList.contains('ad-showing') ||
      player.classList.contains('ad-interrupting');

    if (isAd) {
      if (!this.adActive) {
        this.adActive = true;
        this.adWasMuted = player.isMuted();
      }
      if (!player.isMuted()) player.mute();
      if (this.adBadge) this.adBadge.hidden = false;

      document
        .querySelector<HTMLElement>(
          '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button',
        )
        ?.click();
      return;
    }

    if (!this.adActive) return;
    this.adActive = false;
    if (!this.adWasMuted && player.isMuted()) player.unMute();
    this.adWasMuted = false;
    if (this.adBadge) this.adBadge.hidden = true;
  },

  async start() {
    this.styleSheet = new CSSStyleSheet();
    await this.styleSheet.replace(style);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, this.styleSheet];
    this.mount();

    const adBadge = document.createElement('div');
    adBadge.id = AD_BADGE_ID;
    adBadge.hidden = true;
    adBadge.textContent = 'Advertisement · muted';
    document.body.append(adBadge);
    this.adBadge = adBadge;

    this.mountAuthGate();
    this.syncAuth();
    this.installPlayerSafety();

    this.clickHandler = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest('#ui143-player .ui143-player-art')) return;
      const lyrics = document.querySelector<HTMLButtonElement>(
        '#ui143-player button[aria-label="Karaoke"]',
      );
      if (!lyrics) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      lyrics.click();
    };
    document.addEventListener('click', this.clickHandler, true);

    // Account state changes rarely. A tiny five-second sync is cheaper than a
    // document-wide MutationObserver reacting to YouTube Music's busy DOM.
    this.syncTimer = window.setInterval(() => {
      this.mount();
      this.sync();
    }, 5000);

    // Authentication and ad safety need a faster response, but both checks are
    // only a couple of selectors/player flags and do no page-wide DOM work.
    this.authTimer = window.setInterval(() => {
      this.syncAuth();
      this.installPlayerSafety();
      this.syncAdState();
    }, 750);
  },

  stop() {
    if (this.syncTimer !== null) window.clearInterval(this.syncTimer);
    if (this.authTimer !== null) window.clearInterval(this.authTimer);
    this.syncTimer = null;
    this.authTimer = null;
    if (this.clickHandler)
      document.removeEventListener('click', this.clickHandler, true);
    this.clickHandler = null;
    this.playerObserver?.disconnect();
    this.playerObserver = null;
    if (
      this.adActive &&
      this.observedPlayer?.isConnected &&
      !this.adWasMuted &&
      this.observedPlayer.isMuted()
    )
      this.observedPlayer.unMute();
    this.observedPlayer = null;
    this.adActive = false;
    this.adWasMuted = false;
    this.gate?.remove();
    this.gate = null;
    this.adBadge?.remove();
    this.adBadge = null;
    this.button?.remove();
    this.button = null;
    if (this.styleSheet) {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
        (sheet) => sheet !== this.styleSheet,
      );
      this.styleSheet = null;
    }
  },
});

export default createFeature({
  name: () => 'Shell Controls',
  description: () =>
    'Account gate, playback safety and small stability polish for the 143 Music shell.',
  config: { enabled: true },
  renderer,
});
