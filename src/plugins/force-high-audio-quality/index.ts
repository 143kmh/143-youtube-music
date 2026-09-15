import { dialog } from 'electron';

import { t } from '@/i18n';
import { createPlugin } from '@/utils';

import renderer from './renderer';
import {
  installPlayerScriptPatch,
  type PlayerScriptPatchStatus,
} from './player-script-patch';

import type { AudioDiagnostics, PlaybackDetails } from './diagnostics';
import type { QualityConfig } from './preference';

export default createPlugin({
  name: () => 'Audio Quality',
  description: () => 'Native YouTube Music high-quality and Opus playback.',
  config: { enabled: false, quality: 'maximum' } as QualityConfig,

  backend: {
    scriptPatchStatus: null as PlayerScriptPatchStatus | null,
    restoreScriptPatch: null as (() => Promise<void>) | null,

    async start({ ipc, window, getConfig }) {
      const scriptPatch = await installPlayerScriptPatch(
        window.webContents.session,
        async () => {
          const config = await getConfig();
          return config.enabled && config.quality === 'opus';
        },
      );
      this.scriptPatchStatus = scriptPatch.status;
      this.restoreScriptPatch = scriptPatch.restore;

      ipc.handle(
        'app:audio:show',
        (
          stats: AudioDiagnostics &
            PlaybackDetails & {
              preferenceActive: boolean;
              maximumRequested: boolean;
              requestedMode: QualityConfig['quality'];
              patchedLoads: number;
              proxyFound: boolean;
              incomingHigh: string;
            },
        ) => {
          const unknown = t('plugins.force-high-audio-quality.unknown');
          const translatedDetail = t('plugins.force-high-audio-quality.detail', {
            subscriber: stats.subscriber,
            patchedLoads: stats.patchedLoads,
            proxyFound: stats.proxyFound ? 'yes' : 'no',
            incomingHigh: stats.incomingHigh,
            effectivePreference: stats.effectivePreference,
            videoId: stats.videoId,
            offeredFormats: stats.offeredFormats,
            preference: t(
              `plugins.force-high-audio-quality.${stats.preferenceActive ? 'maximum' : stats.maximumRequested ? 'unavailable' : 'default'}`,
            ),
          });
          const script = this.scriptPatchStatus;
          const scriptDetail = [
            `Requested mode: ${stats.requestedMode}`,
            `Player script interceptor: ${script?.installed ? 'installed' : 'not installed'}`,
            `base.js requests seen: ${script?.matchedRequests ?? 0}`,
            `base.js responses patched: ${script?.patchedRequests ?? 0}`,
            `Detected source policy key: ${script?.detectedPolicyKey ?? 'unknown'}`,
            `player API responses seen: ${script?.playerApiRequests ?? 0}`,
            `Opus responses narrowed: ${script?.opusResponsesPatched ?? 0}`,
            `Forced Opus itag: ${script?.lastForcedOpusItag ?? 'none'}`,
            `Opus patch error: ${script?.lastOpusError ?? 'none'}`,
            `Script patch error: ${script?.lastError ?? 'none'}`,
          ].join('\n');

          return dialog.showMessageBox(window, {
            type: 'info',
            title: 'Audio Quality',
            message: t('plugins.force-high-audio-quality.stats', {
              itag: stats.itag ?? unknown,
              codec: stats.codec ?? unknown,
              bitrate:
                stats.approximateKbps == null
                  ? unknown
                  : `~${stats.approximateKbps} kbps`,
            }),
            detail: `${translatedDetail}\n\n${scriptDetail}`,
          });
        },
      );
    },
    async stop({ ipc }) {
      ipc.removeHandler('app:audio:show');
      await this.restoreScriptPatch?.();
      this.restoreScriptPatch = null;
      this.scriptPatchStatus = null;
    },
  },

  renderer,
});
