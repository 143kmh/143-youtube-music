import { net } from 'electron';

import { createBackend } from '@/utils';

import { startDesktop } from './desktop';

const createYouTubeMusicSignInUrl = () => {
  const continueUrl = new URL('https://www.youtube.com/signin');
  continueUrl.search = new URLSearchParams({
    action_handle_signin: 'true',
    app: 'desktop',
    hl: 'en',
    next: 'https://music.youtube.com/',
  }).toString();

  const loginUrl = new URL('https://accounts.google.com/ServiceLogin');
  loginUrl.search = new URLSearchParams({
    service: 'youtube',
    uilel: '3',
    passive: 'true',
    continue: continueUrl.toString(),
    hl: 'en',
  }).toString();

  return loginUrl.toString();
};

export default createBackend<{
  desktopCleanup: (() => void) | null;
  authCleanup: (() => void) | null;
}>({
  desktopCleanup: null,
  authCleanup: null,

  start(ctx) {
    const { window, ipc } = ctx;
    this.desktopCleanup = startDesktop(ctx);
    const webContents = window.webContents;
    const originalOpenDevTools = webContents.openDevTools.bind(webContents);

    webContents.openDevTools = () => {};
    webContents.once('did-finish-load', () => {
      webContents.openDevTools = originalOpenDevTools;
    });

    const webRequest = webContents.session.webRequest;
    webRequest.onBeforeRequest(
      { urls: ['https://accounts.google.com/*'] },
      (details, callback) => {
        try {
          const target = new URL(details.url);
          const isLegacyYouTubeSignIn =
            details.resourceType === 'mainFrame' &&
            target.hostname === 'accounts.google.com' &&
            target.pathname === '/ServiceLogin' &&
            target.searchParams.get('service') === 'youtube' &&
            target.searchParams.get('ltmpl') === 'music';

          if (isLegacyYouTubeSignIn) {
            callback({ redirectURL: createYouTubeMusicSignInUrl() });
            return;
          }
        } catch {
          // Leave unrelated requests untouched.
        }

        callback({});
      },
    );
    this.authCleanup = () => webRequest.onBeforeRequest(null);

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
    ipc.removeHandler('synced-lyrics:fetch');
    this.authCleanup?.();
    this.authCleanup = null;
    this.desktopCleanup?.();
    this.desktopCleanup = null;
  },
});
