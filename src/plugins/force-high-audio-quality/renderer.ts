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
  __YT143_FORCE_DIRECT_HQ__?: boolean;
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

const FEATURE_ID = 'force-high-audio-quality';

const getMusicConfig = () => {
  const musicWindow = window as MusicWindow;
  return musicWindow.yt?.config_ ?? musicWindow.ytcfg?.data_;
};

const isHighMode = (config: QualityConfig) =>
  config.enabled && (config.quality === 'maximum' || config.quality === 'opus');

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
    const musicWindow = window as MusicWindow;
    musicWindow.__YT143_FORCE_DIRECT_HQ__ = isHighMode(this.config);

    this.syncPlayerProxy();
    this.restore?.();
    this.restore = null;

    if (!isHighMode(this.config)) return;
    const config = getMusicConfig();
    if (config) this.restore = overrideAudioQuality(config);
  },

  async start({ getConfig, ipc }) {
    this.patchedLoads = 0;
    this.incomingHigh = 'No calls yet';
    this.config = await getConfig();
    this.apply();

    this.proxyTimer = setInterval(() => this.syncPlayerProxy(), 1000);

    ipc.on('app:feature-config-changed', (id: string, config: QualityConfig) => {
      if (id !== FEATURE_ID) return;
      this.onConfigChange?.(config);
    });

    ipc.on('app:audio:inspect', () =>
      ipc
        .invoke('app:audio:show', {
          ...readAudioDiagnostics(this.player),
          ...readPlaybackDetails(this.player, getMusicConfig()),
          preferenceActive: this.restore !== null,
          maximumRequested: isHighMode(this.config),
          requestedMode: this.config.quality,
          patchedLoads: this.patchedLoads,
          proxyFound: this.proxy !== null,
          incomingHigh: this.incomingHigh,
        })
        .catch(() => {
          // The main process may already be shutting down.
        }),
    );
  },

  syncPlayerProxy() {
    const host = document.querySelector<HTMLElement & MusicPlayerHost>(
      'ytmusic-player',
    );
    const api = isHighMode(this.config) ? findMusicPlayerProxy(host) : null;
    if (api === this.proxy) return;

    this.restorePlayerVars?.();
    this.restorePlayerVars = null;
    this.proxy = api;
    if (!api) return;

    this.restorePlayerVars = interceptPlayerVars(
      api,
      () => {
        const config = getMusicConfig();
        return isHighMode(this.config) && config?.IS_SUBSCRIBER === true;
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
      () => this.config.quality !== 'opus',
    );
  },

  onPlayerApiReady(api) {
    this.player = api;
    this.apply();
  },

  onConfigChange(config) {
    this.config = config;
    this.apply();
  },

  stop({ ipc }) {
    (window as MusicWindow).__YT143_FORCE_DIRECT_HQ__ = false;
    if (this.proxyTimer !== null) clearInterval(this.proxyTimer);
    this.proxyTimer = null;
    this.proxy = null;
    this.restorePlayerVars?.();
    this.restorePlayerVars = null;
    this.restore?.();
    this.restore = null;
    this.player = null;
    ipc.removeAllListeners('app:feature-config-changed');
    ipc.removeAllListeners('app:audio:inspect');
  },
});
