import { createRenderer } from '@/utils';

import {
  createDirectPlaybackPolicyPatcher,
  type DirectPlaybackPolicyPatcher,
} from './direct-playback';
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
  directPlayback: DirectPlaybackPolicyPatcher | null;
  syncDirectPlayback: () => void;
};

const getMusicConfig = () => {
  const musicWindow = window as MusicWindow;
  return musicWindow.yt?.config_ ?? musicWindow.ytcfg?.data_;
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
  directPlayback: null,

  apply() {
    this.syncPlayerProxy();
    this.syncDirectPlayback();
    this.restore?.();
    this.restore = null;
    if (!this.config.enabled || this.config.quality !== 'maximum') return;
    const config = getMusicConfig();
    if (config) this.restore = overrideAudioQuality(config);
  },

  async start({ getConfig, ipc }) {
    this.patchedLoads = 0;
    this.incomingHigh = 'No calls yet';
    this.config = await getConfig();
    this.directPlayback = createDirectPlaybackPolicyPatcher(
      () => {
        const config = getMusicConfig();
        return (
          this.config.enabled &&
          this.config.quality === 'maximum' &&
          config?.IS_SUBSCRIBER === true
        );
      },
    );
    this.apply();
    // Music/player internals resolve asynchronously and may be replaced after
    // navigation. Keep both hooks synchronized without stacking wrappers.
    this.proxyTimer = setInterval(() => {
      this.syncPlayerProxy();
      this.syncDirectPlayback();
    }, 1000);
    ipc.on('peard:force-high-audio-quality:inspect', () => {
      const directPlayback = this.directPlayback?.getStatus() ?? {
        hookFound: false,
        policyKey: null,
        applications: 0,
        lastBefore: null,
        lastAfter: null,
      };
      return ipc
        .invoke('peard:force-high-audio-quality:show', {
          ...readAudioDiagnostics(this.player),
          ...readPlaybackDetails(this.player, getMusicConfig()),
          preferenceActive: this.restore !== null,
          maximumRequested: this.config.quality === 'maximum',
          patchedLoads: this.patchedLoads,
          proxyFound: this.proxy !== null,
          incomingHigh: this.incomingHigh,
          directPlayback,
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
        const config = getMusicConfig();
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

  syncDirectPlayback() {
    if (!this.directPlayback) return;
    if (!this.config.enabled || this.config.quality !== 'maximum') {
      this.directPlayback.restore();
      return;
    }
    if (this.directPlayback.getStatus().hookFound) return;

    const host = document.querySelector<HTMLElement & MusicPlayerHost>(
      'ytmusic-player',
    );
    const moviePlayer = document.querySelector('#movie_player');
    const controllerHost = host as
      | (MusicPlayerHost & {
          polymerController?: unknown;
          inst?: unknown;
        })
      | null;

    // Search only the known player object graph. The patcher itself is bounded,
    // ignores accessors and fails open if YouTube changes the private contract.
    this.directPlayback.scan([
      this.player,
      moviePlayer,
      host,
      controllerHost?.polymerController,
      controllerHost?.inst,
      controllerHost?.playerApi,
      this.proxy,
    ]);
  },

  onPlayerApiReady(api) {
    this.player = api;
    // Retry here if the runtime config/player internals were not initialized
    // when start ran.
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
    this.directPlayback?.restore();
    this.directPlayback = null;
    this.restore?.();
    this.restore = null;
    this.player = null;
    ipc.removeAllListeners('peard:force-high-audio-quality:inspect');
  },
});
