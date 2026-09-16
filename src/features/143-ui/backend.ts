import { BrowserWindow, net } from 'electron';

import { createBackend } from '@/utils';

import { startDesktop } from './desktop';

const YOUTUBE_MUSIC_URL = 'https://music.youtube.com/';

const hostname = (rawUrl: string) => {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return '';
  }
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

      let visitedGoogle = false;
      let completed = false;
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
          session: webContents.session,
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
        },
      });
      this.authWindow = authWindow;
      authWindow.setMenuBarVisibility(false);

      const completeSignIn = async () => {
        if (completed) return;
        completed = true;
        if (!authWindow.isDestroyed()) authWindow.close();
        if (!window.isDestroyed()) await webContents.loadURL(YOUTUBE_MUSIC_URL);
      };

      const inspectNavigation = (url: string) => {
        const host = hostname(url);
        if (host === 'accounts.google.com') {
          visitedGoogle = true;
          return;
        }
        if (visitedGoogle && host === 'music.youtube.com') {
          void completeSignIn();
        }
      };

      authWindow.webContents.on('did-navigate', (_event, url) => {
        inspectNavigation(url);
      });
      authWindow.webContents.on('did-navigate-in-page', (_event, url) => {
        inspectNavigation(url);
      });
      authWindow.webContents.on('will-redirect', (_event, url) => {
        inspectNavigation(url);
      });
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
        if (this.authWindow === authWindow) this.authWindow = null;
      });

      try {
        // Start from the real YouTube Music page and let its own Sign in button
        // create Google's current login request. No handcrafted ServiceLogin URL,
        // custom preload, renderer injection or auth-specific request rewriting.
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
