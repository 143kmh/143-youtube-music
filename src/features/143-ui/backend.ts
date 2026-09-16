import path from 'node:path';

import { BrowserWindow, net } from 'electron';

import { createBackend } from '@/utils';

import { startDesktop } from './desktop';

const YOUTUBE_MUSIC_URL = 'https://music.youtube.com/';
const ACCOUNT_CHOOSER_URL =
  'https://accounts.google.com/AccountChooser?service=youtube&continue=https%3A%2F%2Fmusic.youtube.com%2F';
const AUTH_COOKIE_NAMES = new Set([
  'SAPISID',
  'APISID',
  '__Secure-1PAPISID',
  '__Secure-3PAPISID',
  '__Secure-1PSID',
  '__Secure-3PSID',
]);

const isGoogleOrYouTubeDomain = (domain: string) => {
  const host = domain.replace(/^\./u, '').toLowerCase();
  return (
    host === 'google.com' ||
    host.endsWith('.google.com') ||
    host === 'youtube.com' ||
    host.endsWith('.youtube.com')
  );
};

const hostname = (rawUrl: string) => {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return '';
  }
};

const hasYouTubeAuthCookies = async (targetSession: Electron.Session) => {
  const cookies = await targetSession.cookies.get({});
  return cookies.some(
    (cookie) =>
      isGoogleOrYouTubeDomain(cookie.domain) && AUTH_COOKIE_NAMES.has(cookie.name),
  );
};

const copyGoogleYouTubeCookies = async (
  source: Electron.Session,
  target: Electron.Session,
) => {
  const cookies = await source.cookies.get({});
  for (const cookie of cookies) {
    if (!isGoogleOrYouTubeDomain(cookie.domain)) continue;
    const host = cookie.domain.replace(/^\./u, '');
    const scheme = cookie.secure ? 'https' : 'http';
    const cookiePath = cookie.path || '/';
    const details: Electron.CookiesSetDetails = {
      url: `${scheme}://${host}${cookiePath}`,
      name: cookie.name,
      value: cookie.value,
      path: cookiePath,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
    };
    if (!cookie.hostOnly) details.domain = cookie.domain;
    if (cookie.expirationDate !== undefined)
      details.expirationDate = cookie.expirationDate;
    await target.cookies.set(details);
  }
  await target.cookies.flushStore();
};

export default createBackend<{
  desktopCleanup: (() => void) | null;
  authWindow: BrowserWindow | null;
  authNavigationCleanup: (() => void) | null;
}>({
  desktopCleanup: null,
  authWindow: null,
  authNavigationCleanup: null,

  start(ctx) {
    const { window, ipc } = ctx;
    this.desktopCleanup = startDesktop(ctx);
    const webContents = window.webContents;
    const originalOpenDevTools = webContents.openDevTools.bind(webContents);

    webContents.openDevTools = () => {};
    webContents.once('did-finish-load', () => {
      webContents.openDevTools = originalOpenDevTools;
    });

    const openAuthWindow = async (mode: unknown = 'sign-in') => {
      const switchingAccount = mode === 'switch';
      if (this.authWindow && !this.authWindow.isDestroyed()) {
        this.authWindow.show();
        this.authWindow.focus();
        return true;
      }

      let completed = false;
      let authStatePoll: NodeJS.Timeout | null = null;
      const chromeVersion = process.versions.chrome;
      const chromeMajor = chromeVersion.split('.')[0] || chromeVersion;
      const chromeUserAgent =
        `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ` +
        `AppleWebKit/537.36 (KHTML, like Gecko) ` +
        `Chrome/${chromeVersion} Safari/537.36`;

      // Keep Google login isolated from the main app's request hooks. The auth
      // window gets a Chrome-like browser surface, then only its resulting
      // Google/YouTube cookies are copied into the real 143 Music session.
      const authPartition = `143-google-auth-${Date.now()}`;
      const authWindow = new BrowserWindow({
        width: 980,
        height: 760,
        minWidth: 640,
        minHeight: 540,
        parent: window,
        modal: false,
        show: false,
        autoHideMenuBar: true,
        backgroundColor: '#ffffff',
        title: switchingAccount
          ? 'Switch Google account · 143 Music'
          : 'Sign in to 143 Music',
        webPreferences: {
          partition: authPartition,
          preload: path.join(__dirname, '..', 'preload', 'preload.cjs'),
          additionalArguments: ['--143-auth-window'],
          contextIsolation: true,
          sandbox: false,
          nodeIntegration: false,
        },
      });
      this.authWindow = authWindow;
      authWindow.setMenuBarVisibility(false);

      const authSession = authWindow.webContents.session;
      authSession.setUserAgent(chromeUserAgent);
      authWindow.webContents.setUserAgent(chromeUserAgent);

      authSession.webRequest.onBeforeSendHeaders((details, callback) => {
        const headers = details.requestHeaders;
        const setHeader = (name: string, value: string) => {
          const existing = Object.keys(headers).find(
            (key) => key.toLowerCase() === name.toLowerCase(),
          );
          headers[existing ?? name] = value;
        };

        setHeader('User-Agent', chromeUserAgent);
        setHeader(
          'Sec-CH-UA',
          `"Not_A Brand";v="99", "Chromium";v="${chromeMajor}", "Google Chrome";v="${chromeMajor}"`,
        );
        setHeader('Sec-CH-UA-Mobile', '?0');
        setHeader('Sec-CH-UA-Platform', '"Windows"');
        callback({ requestHeaders: headers });
      });

      const authWindowIsActuallySignedIn = async () => {
        if (authWindow.isDestroyed()) return false;
        if (hostname(authWindow.webContents.getURL()) !== 'music.youtube.com')
          return false;
        try {
          return (
            (await authWindow.webContents.executeJavaScript(
              `Boolean(globalThis.ytcfg?.get?.('LOGGED_IN'))`,
              true,
            )) === true
          );
        } catch {
          return false;
        }
      };

      const completeSignIn = async () => {
        if (completed) return;
        if (!(await authWindowIsActuallySignedIn())) return;
        completed = true;
        try {
          await copyGoogleYouTubeCookies(authSession, webContents.session);
          if (!(await hasYouTubeAuthCookies(webContents.session))) {
            throw new Error('YouTube auth cookies were not transferred');
          }
        } catch (error) {
          completed = false;
          console.warn('[143 Music] Could not copy Google session cookies', error);
          return;
        }

        if (!window.isDestroyed()) await webContents.loadURL(YOUTUBE_MUSIC_URL);
        if (!authWindow.isDestroyed()) authWindow.close();
      };

      authStatePoll = setInterval(() => {
        void completeSignIn();
      }, 700);

      authWindow.webContents.setWindowOpenHandler(({ url }) => {
        authWindow.loadURL(url).catch((error) => {
          console.warn('[143 Music] Could not continue sign-in navigation', error);
        });
        return { action: 'deny' };
      });

      authWindow.once('ready-to-show', () => {
        if (!authWindow.isDestroyed()) authWindow.show();
      });
      authWindow.once('closed', () => {
        if (authStatePoll) clearInterval(authStatePoll);
        authStatePoll = null;
        authSession.webRequest.onBeforeSendHeaders(null);
        if (this.authWindow === authWindow) this.authWindow = null;
      });

      try {
        // For account switching, seed the clean auth partition with the current
        // account cookies so Google's chooser can show the active account. The
        // browser identity remains isolated and Chrome-like, avoiding the 401
        // that occurs when accounts.google.com loads in the main Electron window.
        if (switchingAccount)
          await copyGoogleYouTubeCookies(webContents.session, authSession);
        await authWindow.loadURL(
          switchingAccount ? ACCOUNT_CHOOSER_URL : YOUTUBE_MUSIC_URL,
        );
      } catch (error) {
        if (!authWindow.isDestroyed()) authWindow.close();
        throw error;
      }

      return true;
    };

    ipc.removeHandler('143:auth:sign-in');
    ipc.handle('143:auth:sign-in', openAuthWindow);

    // Never let the real 143 Music window navigate to Google Accounts. The
    // custom avatar/native YouTube account button can both trigger that route;
    // reroute it into the clean auth window instead.
    const interceptAccountNavigation = (
      event: { preventDefault: () => void },
      url: string,
    ) => {
      if (hostname(url) !== 'accounts.google.com') return;
      event.preventDefault();
      void openAuthWindow('switch');
    };
    webContents.on('will-navigate', interceptAccountNavigation);
    webContents.on('will-redirect', interceptAccountNavigation);
    this.authNavigationCleanup = () => {
      webContents.off('will-navigate', interceptAccountNavigation);
      webContents.off('will-redirect', interceptAccountNavigation);
    };

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
    ipc.removeHandler('143:auth:sign-in');
    ipc.removeHandler('synced-lyrics:fetch');
    this.authNavigationCleanup?.();
    this.authNavigationCleanup = null;
    if (this.authWindow && !this.authWindow.isDestroyed()) this.authWindow.close();
    this.authWindow = null;
    this.desktopCleanup?.();
    this.desktopCleanup = null;
  },
});
