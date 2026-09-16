import { app, dialog } from 'electron';
import electronUpdater from 'electron-updater';

import { createBackend } from '@/utils';

const { autoUpdater } = electronUpdater;
const UPDATE_CHECK_INTERVAL = 4 * 60 * 60 * 1000;

type UpdatePhase =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'not-available'
  | 'error';

type UpdateSnapshot = {
  phase: UpdatePhase;
  currentVersion: string;
  availableVersion: string | null;
  progress: number | null;
  error: string | null;
};

type AutoUpdaterState = {
  initialCheckTimer: NodeJS.Timeout | null;
  periodicCheckTimer: NodeJS.Timeout | null;
  promptOpen: boolean;
  snapshot: UpdateSnapshot;
};

const initialSnapshot = (): UpdateSnapshot => ({
  phase:
    process.platform === 'win32' && app.isPackaged ? 'idle' : 'disabled',
  currentVersion: app.getVersion(),
  availableVersion: null,
  progress: null,
  error: null,
});

export default createBackend<AutoUpdaterState>({
  initialCheckTimer: null,
  periodicCheckTimer: null,
  promptOpen: false,
  snapshot: initialSnapshot(),

  async start({ ipc, window }) {
    const supported = process.platform === 'win32' && app.isPackaged;
    this.snapshot = initialSnapshot();

    const publishState = () => {
      if (!window.isDestroyed())
        window.webContents.send('app:update:state', this.snapshot);
    };

    const setState = (patch: Partial<UpdateSnapshot>) => {
      this.snapshot = { ...this.snapshot, ...patch };
      publishState();
    };

    const checkForUpdates = async () => {
      if (!supported) return this.snapshot;
      setState({ phase: 'checking', error: null, progress: null });
      try {
        await autoUpdater.checkForUpdates();
      } catch (error) {
        setState({
          phase: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return this.snapshot;
    };

    ipc.handle('app:update:status', () => this.snapshot);
    ipc.handle('app:update:check', async () => ({
      ok: supported,
      ...(await checkForUpdates()),
    }));
    ipc.handle('app:update:install', () => {
      if (!supported || this.snapshot.phase !== 'downloaded') return false;
      setImmediate(() => autoUpdater.quitAndInstall(false, true));
      return true;
    });

    if (!supported) return;

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;

    autoUpdater.on('checking-for-update', () => {
      setState({ phase: 'checking', error: null, progress: null });
    });

    autoUpdater.on('update-available', (info) => {
      setState({
        phase: 'available',
        availableVersion: info.version,
        progress: 0,
        error: null,
      });
    });

    autoUpdater.on('update-not-available', () => {
      setState({
        phase: 'not-available',
        availableVersion: null,
        progress: null,
        error: null,
      });
    });

    autoUpdater.on('download-progress', (progress) => {
      setState({
        phase: 'downloading',
        progress: Math.max(0, Math.min(100, progress.percent)),
        error: null,
      });
    });

    autoUpdater.on('error', (error) => {
      console.warn('[143 Music] Update check failed:', error);
      setState({
        phase: 'error',
        progress: null,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    autoUpdater.on('update-downloaded', async (info) => {
      setState({
        phase: 'downloaded',
        availableVersion: info.version,
        progress: 100,
        error: null,
      });

      if (this.promptOpen || window.isDestroyed()) return;
      this.promptOpen = true;

      try {
        const result = await dialog.showMessageBox(window, {
          type: 'info',
          title: '143 Music',
          message: `143 Music ${info.version} is ready to install`,
          detail:
            'The update was downloaded from GitHub Releases. Restart 143 Music now to install it?',
          buttons: ['Restart now', 'Later'],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
        });

        if (result.response === 0)
          setImmediate(() => autoUpdater.quitAndInstall(false, true));
      } finally {
        this.promptOpen = false;
      }
    });

    this.initialCheckTimer = setTimeout(() => {
      void checkForUpdates();
    }, 5_000);

    this.periodicCheckTimer = setInterval(() => {
      void checkForUpdates();
    }, UPDATE_CHECK_INTERVAL);
  },

  async stop({ ipc }) {
    if (this.initialCheckTimer) clearTimeout(this.initialCheckTimer);
    if (this.periodicCheckTimer) clearInterval(this.periodicCheckTimer);
    this.initialCheckTimer = null;
    this.periodicCheckTimer = null;
    this.promptOpen = false;

    ipc.removeHandler('app:update:status');
    ipc.removeHandler('app:update:check');
    ipc.removeHandler('app:update:install');

    autoUpdater.removeAllListeners('checking-for-update');
    autoUpdater.removeAllListeners('update-available');
    autoUpdater.removeAllListeners('update-not-available');
    autoUpdater.removeAllListeners('download-progress');
    autoUpdater.removeAllListeners('error');
    autoUpdater.removeAllListeners('update-downloaded');
  },
});
