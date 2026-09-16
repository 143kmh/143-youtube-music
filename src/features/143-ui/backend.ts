import path from 'node:path';

import { BrowserWindow, net } from 'electron';

import { createBackend } from '@/utils';

import { startDesktop } from './desktop';

const YOUTUBE_MUSIC_URL = 'https://music.youtube.com/';
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

export default createBackend<{
  desktopCleanup: (() => void) | null;
  authWindow: BrowserWindow | null;
}>({
  desktopCleanup: null,
  authWindow: null,

  start(ctx) {
    const { window, ipc } = ctx;
    this.desktopCleanup = startDesktop(ctx);
    const webContents = window.webContents;
    const originalOpenDevTools = webContents.openDevTools.bind(webContents);

    webContents.openDevTools = () => {};
    webContents.once('did-finish-load', () => {
      webContents.openDevTools = originalOpenDevTools;
    });

    ipc.removeHandler('143:auth:sign-in');
    ipc.handle('143:auth:sign-in', async () => {
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
        title: 'Sign in to 143 Music',
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

      const copyAuthCookies = async () => {
        const cookies = await authSession.cookies.get({});
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
          await webContents.session.cookies.set(details);
        }
        await webContents.session.cookies.flushStore();
      };

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
          await copyAuthCookies();
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

      // Do not treat the mere presence of SAPISID-like cookies as a successful
      // login. Google can set some of them before YouTube itself considers the
      // session authenticated. Wait until YouTube Music's own runtime reports
      // LOGGED_IN=true, then transfer the session.
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
        // Start at the real YouTube Music page and use its native Sign in action.
        await authWindow.loadURL(YOUTUBE_MUSIC_URL);
      } catch (error) {
        if (!authWindow.isDestroyed()) authWindow.close();
        throw error;
      }

      return true;
    });

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
    if (this.authWindow && !this.authWindow.isDestroyed()) this.authWindow.close();
    this.authWindow = null;
    this.desktopCleanup?.();
    this.desktopCleanup = null;
  },
});
