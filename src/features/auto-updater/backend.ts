import { app, dialog } from 'electron';
import electronUpdater from 'electron-updater';

import { createBackend } from '@/utils';

const { autoUpdater } = electronUpdater;

type AutoUpdaterState = {
  checkTimer: NodeJS.Timeout | null;
  promptOpen: boolean;
};

export default createBackend<AutoUpdaterState>({
  checkTimer: null,
  promptOpen: false,

  async start({ ipc, window }) {
    if (process.platform !== 'win32' || !app.isPackaged) return;

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;

    autoUpdater.on('error', (error) => {
      console.warn('[143 Music] Update check failed:', error);
    });

    autoUpdater.on('update-downloaded', async (info) => {
      if (this.promptOpen || window.isDestroyed()) return;
      this.promptOpen = true;

      try {
        const result = await dialog.showMessageBox(window, {
          type: 'info',
          title: '143 Music',
          message: `143 Music ${info.version} is ready to install`,
          detail: 'The update has been downloaded. Restart 143 Music now to install it?',
          buttons: ['Restart now', 'Later'],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
        });

        if (result.response === 0) {
          setImmediate(() => autoUpdater.quitAndInstall(false, true));
        }
      } finally {
        this.promptOpen = false;
      }
    });

    ipc.handle('app:update:check', async () => {
      try {
        const result = await autoUpdater.checkForUpdates();
        return {
          ok: true,
          currentVersion: app.getVersion(),
          availableVersion: result?.updateInfo.version ?? null,
        };
      } catch (error) {
        return {
          ok: false,
          currentVersion: app.getVersion(),
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    this.checkTimer = setTimeout(() => {
      void autoUpdater.checkForUpdates().catch((error) => {
        console.warn('[143 Music] Update check failed:', error);
      });
    }, 5_000);
  },

  async stop({ ipc }) {
    if (this.checkTimer) clearTimeout(this.checkTimer);
    this.checkTimer = null;
    this.promptOpen = false;
    ipc.removeHandler('app:update:check');
    autoUpdater.removeAllListeners('error');
    autoUpdater.removeAllListeners('update-downloaded');
  },
});
