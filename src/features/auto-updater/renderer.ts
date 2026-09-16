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

const BUTTON_ID = 'ui143-update-available';
const STYLE_ID = 'ui143-update-available-style';
const MOUNT_INTERVAL_MS = 1000;

const updateVisible = (state: UpdateSnapshot | null) =>
  state?.phase === 'available' ||
  state?.phase === 'downloading' ||
  state?.phase === 'downloaded';

export default createRenderer<{
  mountTimer: number | null;
  snapshot: UpdateSnapshot | null;
  button: HTMLButtonElement | null;
  style: HTMLStyleElement | null;
}>({
  mountTimer: null,
  snapshot: null,
  button: null,
  style: null,

  async start({ ipc }: RendererContext<FeatureConfig>) {
    const installStyle = () => {
      document.getElementById(STYLE_ID)?.remove();
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        #${BUTTON_ID} {
          flex: 0 0 auto;
          margin: 0 6px 0 0;
          padding: 7px 12px;
          border: 0;
          border-radius: 999px;
          background: #fff;
          color: #111;
          font: inherit;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .01em;
          cursor: pointer;
          box-shadow: 0 3px 16px rgba(0,0,0,.22);
          transition: transform 140ms ease, background 140ms ease;
          -webkit-app-region: no-drag;
        }
        #${BUTTON_ID}:hover { background: #f0f0f0; transform: translateY(-1px); }
        #${BUTTON_ID}[hidden] { display: none !important; }
      `;
      document.head.append(style);
      this.style = style;
    };

    const renderState = () => {
      const button = this.button;
      const state = this.snapshot;
      if (!button) return;
      button.hidden = !updateVisible(state);
      if (!state || button.hidden) return;
      button.textContent = 'Update available';
      const version = state.availableVersion ? ` ${state.availableVersion}` : '';
      if (state.phase === 'downloaded')
        button.title = `143 Music${version} is ready. Click to restart and install.`;
      else if (state.phase === 'downloading')
        button.title = `Downloading 143 Music${version} · ${Math.round(state.progress ?? 0)}%`;
      else button.title = `143 Music${version} is available`;
    };

    const mount = () => {
      const topbar = document.querySelector<HTMLElement>('.ui143-topbar');
      if (!topbar) return false;

      let button = document.getElementById(BUTTON_ID) as HTMLButtonElement | null;
      if (!button) {
        button = document.createElement('button');
        button.id = BUTTON_ID;
        button.type = 'button';
        button.hidden = true;
        button.textContent = 'Update available';
        button.addEventListener('click', () => {
          const state = this.snapshot;
          if (state?.phase === 'downloaded') {
            button!.disabled = true;
            void ipc.invoke('app:update:install').finally(() => {
              if (button) button.disabled = false;
            });
            return;
          }
          document.dispatchEvent(
            new CustomEvent('ui143:open-settings', { detail: 'app' }),
          );
        });

        const settingsButton = topbar.querySelector('.ui143-settings-button-icon');
        if (settingsButton) topbar.insertBefore(button, settingsButton);
        else topbar.append(button);
      }
      this.button = button;
      renderState();
      return true;
    };

    installStyle();

    try {
      this.snapshot = (await ipc.invoke('app:update:status')) as UpdateSnapshot;
    } catch {
      this.snapshot = null;
    }

    ipc.on('app:update:state', (_event: unknown, state: UpdateSnapshot) => {
      this.snapshot = state;
      mount();
      renderState();
    });

    this.mountTimer = window.setInterval(mount, MOUNT_INTERVAL_MS);
    mount();
  },

  stop({ ipc }: RendererContext<FeatureConfig>) {
    if (this.mountTimer !== null) window.clearInterval(this.mountTimer);
    this.mountTimer = null;
    this.snapshot = null;
    this.button?.remove();
    this.button = null;
    this.style?.remove();
    this.style = null;
    document.getElementById(BUTTON_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    ipc.removeAllListeners('app:update:state');
  },
});
