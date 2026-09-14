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
  name: () => t('plugins.force-high-audio-quality.name'),
  description: () => t('plugins.force-high-audio-quality.description'),
  restartNeeded: false,
  config: { enabled: false, quality: 'maximum' } as QualityConfig,

  menu: async ({ getConfig, setConfig, window }) => {
    const config = await getConfig();
    const qualityOptions: {
      quality: QualityConfig['quality'];
      label: string;
    }[] = [
      {
        quality: 'default',
        label: t('plugins.force-high-audio-quality.default'),
      },
      {
        quality: 'maximum',
        label: t('plugins.force-high-audio-quality.maximum'),
      },
      {
        quality: 'opus',
        label: 'Maximum Opus (experimental)',
      },
    ];

    return [
      ...qualityOptions.map(({ quality, label }) => ({
        label,
        type: 'radio' as const,
        checked: config.quality === quality,
        click: () => setConfig({ quality }),
      })),
      { type: 'separator' },
      {
        label: t('plugins.force-high-audio-quality.inspect'),
        click: () =>
          window.webContents.send('peard:force-high-audio-quality:inspect'),
      },
    ];
  },

  backend: {
    scriptPatchStatus: null as PlayerScriptPatchStatus | null,
    restoreScriptPatch: null as (() => Promise<void>) | null,

    async start({ ipc, window }) {
      const scriptPatch = await installPlayerScriptPatch(
        window.webContents.session,
      );
      this.scriptPatchStatus = scriptPatch.status;
      this.restoreScriptPatch = scriptPatch.restore;

      ipc.handle(
        'peard:force-high-audio-quality:show',
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
            `Script patch error: ${script?.lastError ?? 'none'}`,
          ].join('\n');

          return dialog.showMessageBox(window, {
            type: 'info',
            title: t('plugins.force-high-audio-quality.name'),
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
      ipc.removeHandler('peard:force-high-audio-quality:show');
      await this.restoreScriptPatch?.();
      this.restoreScriptPatch = null;
      this.scriptPatchStatus = null;
    },
  },

  renderer,
});
