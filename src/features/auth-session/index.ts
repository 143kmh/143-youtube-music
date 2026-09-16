import { createFeature, createRenderer } from '@/utils';

const AUTH_MARKER_ID = 'ui143-auth-session-marker';
const LOGIN_GATE_ID = 'ui143-login-gate';

type YouTubeConfig = {
  get?: (key: string) => unknown;
  set?: (key: string, value: unknown) => void;
};

const renderer = createRenderer<{
  timer: number | null;
  syncing: boolean;
  sync: () => Promise<void>;
}>({
  timer: null,
  syncing: false,

  async sync() {
    if (this.syncing) return;
    this.syncing = true;
    try {
      const signedIn = await window.ipcRenderer.invoke('143:auth:status');
      if (signedIn !== true) return;

      const ytcfg = (window as unknown as { ytcfg?: YouTubeConfig }).ytcfg;
      ytcfg?.set?.('LOGGED_IN', true);

      // The shell used DOM account hints before backend auth status existed.
      // Keep a hidden marker as a fallback for builds/pages whose ytcfg object
      // does not expose set(). It is never shown to the user.
      const nav = document.querySelector<HTMLElement>('ytmusic-nav-bar');
      if (nav && !document.getElementById(AUTH_MARKER_ID)) {
        const marker = document.createElement('img');
        marker.id = AUTH_MARKER_ID;
        marker.hidden = true;
        marker.alt = '';
        marker.src = 'https://yt3.ggpht.com/';
        nav.append(marker);
      }

      document.getElementById(LOGIN_GATE_ID)?.remove();
    } catch {
      // Keep the existing gate while the backend/session is unavailable.
    } finally {
      this.syncing = false;
    }
  },

  start() {
    void this.sync();
    this.timer = window.setInterval(() => void this.sync(), 1000);
  },

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    document.getElementById(AUTH_MARKER_ID)?.remove();
  },
});

export default createFeature({
  name: () => 'Auth Session',
  description: () =>
    'Keeps the 143 Music login gate in sync with the authenticated YouTube session.',
  config: { enabled: true },
  renderer,
});
