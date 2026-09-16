import { net } from 'electron';

import { createBackend } from '@/utils';

import { startDesktop } from './desktop';

export default createBackend<{
  desktopCleanup: (() => void) | null;
}>({
  desktopCleanup: null,

  start(ctx) {
    const { window, ipc } = ctx;
    this.desktopCleanup = startDesktop(ctx);
    const webContents = window.webContents;
    const originalOpenDevTools = webContents.openDevTools.bind(webContents);

    webContents.openDevTools = () => {};
    webContents.once('did-finish-load', () => {
      webContents.openDevTools = originalOpenDevTools;
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
    ipc.removeHandler('synced-lyrics:fetch');
    this.desktopCleanup?.();
    this.desktopCleanup = null;
  },
});
