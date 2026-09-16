import { createFeature, createRenderer } from '@/utils';

import style from './style.css?inline';

const BUTTON_ID = 'ui143-account-button';
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

const renderer = createRenderer<{
  button: HTMLButtonElement | null;
  syncTimer: number | null;
  styleSheet: CSSStyleSheet | null;
  mount: () => void;
  sync: () => void;
  openAccount: () => void;
}>({
  button: null,
  syncTimer: null,
  styleSheet: null,

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
    const signIn = clickTarget(nativeSignIn());
    if (signIn) {
      signIn.click();
      return;
    }

    const account = nativeAccountTrigger();
    if (account) {
      account.click();
      return;
    }

    // Fallback stays in the same Electron session so a selected account becomes
    // the account used by 143 Music when Google returns to music.youtube.com.
    window.location.assign(ACCOUNT_CHOOSER);
  },

  async start() {
    this.styleSheet = new CSSStyleSheet();
    await this.styleSheet.replace(style);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, this.styleSheet];
    this.mount();

    // Account state changes rarely. A tiny five-second sync is cheaper than a
    // document-wide MutationObserver reacting to YouTube Music's busy DOM.
    this.syncTimer = window.setInterval(() => {
      this.mount();
      this.sync();
    }, 5000);
  },

  stop() {
    if (this.syncTimer !== null) window.clearInterval(this.syncTimer);
    this.syncTimer = null;
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
    'Top-bar account control and small stability polish for the 143 Music shell.',
  config: { enabled: true },
  renderer,
});