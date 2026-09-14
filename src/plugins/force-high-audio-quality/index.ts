import { dialog } from 'electron';

import { t } from '@/i18n';
import { createPlugin } from '@/utils';

import renderer from './renderer';

import type { AudioDiagnostics, PlaybackDetails } from './diagnostics';
import type { DirectPlaybackStatus } from './direct-playback';
import type { QualityConfig } from './preference';

export default createPlugin({
  name: () => t('plugins.force-high-audio-quality.name'),
  description: () => t('plugins.force-high-audio-quality.description'),
  restartNeeded: false,
  config: { enabled: false, quality: 'maximum' } as QualityConfig,

  menu: async ({ getConfig, setConfig, window }) => {
    const config = await getConfig();
    return [
      ...(['default', 'maximum'] as const).map((quality) => ({
        label: t(`plugins.force-high-audio-quality.${quality}`),
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
    start({ ipc, window }) {
      ipc.handle(
        'peard:force-high-audio-quality:show',
        (
          stats: AudioDiagnostics &
            PlaybackDetails & {
              preferenceActive: boolean;
              maximumRequested: boolean;
              patchedLoads: number;
              proxyFound: boolean;
              incomingHigh: string;
              directPlayback: DirectPlaybackStatus;
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
          const direct = stats.directPlayback;
          const directDetail = [
            `Direct playback hook: ${direct.hookFound ? 'found' : 'not found'}`,
            `Server-ABR policy key: ${direct.policyKey ?? 'unknown'}`,
            `Direct-path applications: ${direct.applications}`,
            `Last server-ABR policy: ${direct.lastBefore ?? 'unknown'} -> ${direct.lastAfter ?? 'unknown'}`,
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
            detail: `${translatedDetail}\n\n${directDetail}`,
          });
        },
      );
    },
    stop({ ipc }) {
      ipc.removeHandler('peard:force-high-audio-quality:show');
    },
  },

  renderer,
});
