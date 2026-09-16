import { createRenderer } from '@/utils';

import type { RendererContext } from '@/types/contexts';
import type { FeatureConfig } from '@/types/features';

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

const CARD_ID = 'ui143-update-card';

const messageFor = (state: UpdateSnapshot) => {
  const version = state.availableVersion;
  switch (state.phase) {
    case 'disabled':
      return `Version ${state.currentVersion} · Updates are enabled in the installed Windows build.`;
    case 'checking':
      return `Version ${state.currentVersion} · Checking GitHub Releases…`;
    case 'available':
      return `143 Music ${version ?? ''} is available. Download starting…`;
    case 'downloading':
      return `Downloading ${version ?? 'update'} · ${Math.round(state.progress ?? 0)}%`;
    case 'downloaded':
      return `143 Music ${version ?? ''} is ready. Restart to install.`;
    case 'not-available':
      return `Version ${state.currentVersion} · You're up to date.`;
    case 'error':
      return `Version ${state.currentVersion} · Could not check for updates.`;
    default:
      return `Version ${state.currentVersion} · Updates come from GitHub Releases.`;
  }
};

export default createRenderer<{
  observer: MutationObserver | null;
  snapshot: UpdateSnapshot | null;
}>({
  observer: null,
  snapshot: null,

  async start({ ipc }: RendererContext<FeatureConfig>) {
    const renderState = () => {
      const card = document.getElementById(CARD_ID);
      const state = this.snapshot;
      if (!card || !state) return;

      const status = card.querySelector<HTMLElement>('[data-update-status]');
      const error = card.querySelector<HTMLElement>('[data-update-error]');
      const action = card.querySelector<HTMLButtonElement>('[data-update-action]');
      const progress = card.querySelector<HTMLElement>('[data-update-progress]');
      const fill = card.querySelector<HTMLElement>('[data-update-progress-fill]');

      if (status) status.textContent = messageFor(state);
      if (error) {
        error.textContent = state.phase === 'error' ? state.error ?? '' : '';
        error.hidden = state.phase !== 'error';
      }

      if (progress && fill) {
        const visible = state.phase === 'available' || state.phase === 'downloading';
        progress.hidden = !visible;
        fill.style.width = `${Math.max(0, Math.min(100, state.progress ?? 0))}%`;
      }

      if (!action) return;
      action.disabled = state.phase === 'checking' || state.phase === 'downloading';
      action.textContent =
        state.phase === 'downloaded' ? 'Restart to update' : 'Check for updates';
    };

    const mount = () => {
      const panel = document.querySelector<HTMLElement>(
        '.ui143-settings-panel[data-settings-panel="app"]',
      );
      if (!panel || panel.querySelector(`#${CARD_ID}`)) return;

      const card = document.createElement('section');
      card.id = CARD_ID;
      card.className = 'ui143-update-card';

      const copy = document.createElement('div');
      copy.className = 'ui143-update-copy';
      const title = document.createElement('strong');
      title.textContent = 'Updates';
      const status = document.createElement('span');
      status.dataset.updateStatus = '';
      const error = document.createElement('small');
      error.dataset.updateError = '';
      error.hidden = true;
      copy.append(title, status, error);

      const action = document.createElement('button');
      action.type = 'button';
      action.dataset.updateAction = '';
      action.textContent = 'Check for updates';
      action.addEventListener('click', async () => {
        const current = this.snapshot;
        if (current?.phase === 'downloaded') {
          action.disabled = true;
          await ipc.invoke('app:update:install');
          return;
        }

        action.disabled = true;
        this.snapshot = {
          ...(current ?? {
            phase: 'checking',
            currentVersion: '',
            availableVersion: null,
            progress: null,
            error: null,
          }),
          phase: 'checking',
          error: null,
        };
        renderState();
        this.snapshot = (await ipc.invoke('app:update:check')) as UpdateSnapshot;
        renderState();
      });

      const progress = document.createElement('div');
      progress.className = 'ui143-update-progress';
      progress.dataset.updateProgress = '';
      progress.hidden = true;
      const fill = document.createElement('i');
      fill.dataset.updateProgressFill = '';
      progress.append(fill);

      card.append(copy, action, progress);
      panel.append(card);
      renderState();
    };

    this.snapshot = (await ipc.invoke('app:update:status')) as UpdateSnapshot;

    ipc.on('app:update:state', (_event: unknown, state: UpdateSnapshot) => {
      this.snapshot = state;
      mount();
      renderState();
    });

    this.observer = new MutationObserver(() => {
      mount();
      renderState();
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
    mount();
    renderState();
  },

  stop({ ipc }: RendererContext<FeatureConfig>) {
    this.observer?.disconnect();
    this.observer = null;
    this.snapshot = null;
    document.getElementById(CARD_ID)?.remove();
    ipc.removeAllListeners('app:update:state');
  },
});
