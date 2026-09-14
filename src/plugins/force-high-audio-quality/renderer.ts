import { createRenderer } from '@/utils';

import {
  readAudioDiagnostics,
  readPlaybackDetails,
  type DiagnosticPlayer,
} from './diagnostics';
import {
  interceptPlayerVars,
  findMusicPlayerProxy,
  type PlayerVarsApi,
  type MusicPlayerHost,
} from './player-vars';
import {
  overrideAudioQuality,
  type MusicConfig,
  type QualityConfig,
} from './preference';

type MusicWindow = Window & {
  yt?: { config_?: MusicConfig };
  ytcfg?: { data_?: MusicConfig };
};

type RendererState = {
  config: QualityConfig;
  player: DiagnosticPlayer | null;
  restore: (() => void) | null;
  apply: () => void;
  restorePlayerVars: (() => void) | null;
  patchedLoads: number;
  incomingHigh: string;
  proxy: PlayerVarsApi | null;
  proxyTimer: ReturnType<typeof setInterval> | null;
  syncPlayerProxy: () => void;
};

export default createRenderer<RendererState, QualityConfig>({
  config: { enabled: false, quality: 'default' } as QualityConfig,
  player: null as DiagnosticPlayer | null,
  restore: null as (() => void) | null,
  restorePlayerVars: null,
  patchedLoads: 0,
  incomingHigh: 'No calls yet',
  proxy: null,
  proxyTimer: null,

  apply() {
    this.syncPlayerProxy();
    this.restore?.();
    this.restore = null;
    if (!this.config.enabled || this.config.quality !== 'maximum') return;
    const musicWindow = window as MusicWindow;
    const config = musicWindow.yt?.config_ ?? musicWindow.ytcfg?.data_;
    if (config) this.restore = overrideAudioQuality(config);
  },

  async start({ getConfig, ipc }) {
    this.patchedLoads = 0;
    this.incomingHigh = 'No calls yet';
    this.config = await getConfig();
    this.apply();
    // The Music component resolves its proxy asynchronously. Also notice proxy
    // replacement after navigation; don't stack wrappers on a stable instance.
    this.proxyTimer = setInterval(() => this.syncPlayerProxy(), 1000);
    ipc.on('peard:force-high-audio-quality:inspect', () => {
      const musicWindow = window as MusicWindow;
      return ipc
        .invoke('peard:force-high-audio-quality:show', {
          ...readAudioDiagnostics(this.player),
          ...readPlaybackDetails(
            this.player,
            musicWindow.yt?.config_ ?? musicWindow.ytcfg?.data_,
          ),
          preferenceActive: this.restore !== null,
          maximumRequested: this.config.quality === 'maximum',
          patchedLoads: this.patchedLoads,
          proxyFound: this.proxy !== null,
          incomingHigh: this.incomingHigh,
        })
        .catch(() => {
          // The backend may already have stopped if the plugin was just disabled.
        });
    });
  },

  syncPlayerProxy() {
    const host = document.querySelector<HTMLElement & MusicPlayerHost>(
      'ytmusic-player',
    );
    const api =
      this.config.enabled && this.config.quality === 'maximum'
        ? findMusicPlayerProxy(host)
        : null;
    if (api === this.proxy) return;
    this.restorePlayerVars?.();
    this.restorePlayerVars = null;
    this.proxy = api;
    if (!api) return;
    this.restorePlayerVars = interceptPlayerVars(
      api,
      () => {
        const musicWindow = window as MusicWindow;
        const config = musicWindow.yt?.config_ ?? musicWindow.ytcfg?.data_;
        return (
          this.config.enabled &&
          this.config.quality === 'maximum' &&
          config?.IS_SUBSCRIBER === true
        );
      },
      (incomingHigh) => {
        this.patchedLoads++;
        this.incomingHigh =
          typeof incomingHigh === 'boolean' || typeof incomingHigh === 'number'
            ? String(incomingHigh)
            : incomingHigh === undefined
              ? 'unset'
              : 'Other';
      },
    );
  },

  onPlayerApiReady(api) {
    this.player = api;
    // Retry here if the runtime config wasn't initialized when start ran.
    this.apply();
  },

  onConfigChange(config) {
    this.config = config;
    this.apply();
  },

  stop({ ipc }) {
    if (this.proxyTimer !== null) clearInterval(this.proxyTimer);
    this.proxyTimer = null;
    this.proxy = null;
    this.restorePlayerVars?.();
    this.restorePlayerVars = null;
    this.restore?.();
    this.restore = null;
    this.player = null;
    ipc.removeAllListeners('peard:force-high-audio-quality:inspect');
  },
});
