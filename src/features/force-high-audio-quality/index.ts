import { dialog } from 'electron';

import { t } from '@/i18n';
import { createFeature } from '@/utils';

import renderer from './renderer';
import {
  installPlayerScriptPatch,
  type PlayerScriptPatchStatus,
} from './player-script-patch';

import type { AudioDiagnostics, PlaybackDetails } from './diagnostics';
import type { QualityConfig } from './preference';

const accountLabel = (subscriber: PlaybackDetails['subscriber']) => {
  if (subscriber === 'yes') return 'Premium';
  if (subscriber === 'no') return 'Free';
  return 'Unknown';
};

const actualStreamLabel = (
  stats: AudioDiagnostics,
  unknown: string,
) => {
  const parts = [
    stats.itag == null ? null : `itag ${stats.itag}`,
    stats.codec ?? null,
    stats.approximateKbps == null ? null : `~${stats.approximateKbps} kbps`,
  ].filter(Boolean);

  return parts.length ? parts.join(' · ') : `${unknown} (Stats for Nerds unavailable)`;
};

const requestedStreamLabel = (
  mode: QualityConfig['quality'],
  forcedOpusItag: string | null | undefined,
) => {
  if (mode === 'opus') {
    return forcedOpusItag
      ? `Opus · requested itag ${forcedOpusItag}`
      : 'Opus · waiting for a player response';
  }
  if (mode === 'maximum') return 'Maximum available · native YouTube High preference';
  return 'Default · native YouTube selection';
};

const availabilityLabel = (
  subscriber: PlaybackDetails['subscriber'],
  mode: QualityConfig['quality'],
  forcedOpusItag: string | null | undefined,
) => {
  if (subscriber === 'no') {
    if (mode === 'opus' && forcedOpusItag)
      return `Best Opus offered to this Free account was requested (itag ${forcedOpusItag}). Premium High audio is not available to this account.`;
    return 'Premium High audio is not available to this account. YouTube can still provide its normal-quality AAC/Opus streams.';
  }

  if (subscriber === 'yes') {
    if (mode === 'opus' && forcedOpusItag)
      return `Premium account · requested the best offered Opus candidate (itag ${forcedOpusItag}). Check Actual stream above to confirm what is really playing.`;
    return 'Premium account · High-quality streams may be available when YouTube offers them for this track. Check Actual stream above for confirmation.';
  }

  return 'Account entitlement is unknown. Check the subscriber flag and offered formats below.';
};

export default createFeature({
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
          const script = this.scriptPatchStatus;
          const forcedOpusItag = script?.lastForcedOpusItag ?? null;

          const summary = [
            `Account: ${accountLabel(stats.subscriber)}`,
            `Requested: ${requestedStreamLabel(stats.requestedMode, forcedOpusItag)}`,
            `Actually playing: ${actualStreamLabel(stats, unknown)}`,
            `Availability: ${availabilityLabel(
              stats.subscriber,
              stats.requestedMode,
              forcedOpusItag,
            )}`,
          ].join('\n');

          const nativeDetail = [
            `YouTube subscriber flag: ${stats.subscriber}`,
            `Effective preference: ${stats.effectivePreference}`,
            `Preference override: ${t(
              `plugins.force-high-audio-quality.${stats.preferenceActive ? 'maximum' : stats.maximumRequested ? 'unavailable' : 'default'}`,
            )}`,
            `Music PlayerProxy found: ${stats.proxyFound ? 'yes' : 'no'}`,
            `Native playback calls patched: ${stats.patchedLoads}`,
            `Last incoming aac_high: ${stats.incomingHigh}`,
            `Track ID: ${stats.videoId}`,
            '',
            'Offered audio formats (not necessarily selected):',
            stats.offeredFormats,
          ].join('\n');

          const scriptDetail = [
            `Requested mode: ${stats.requestedMode}`,
            `Player script interceptor: ${script?.installed ? 'installed' : 'not installed'}`,
            `base.js requests seen: ${script?.matchedRequests ?? 0}`,
            `base.js responses patched: ${script?.patchedRequests ?? 0}`,
            `Detected source policy key: ${script?.detectedPolicyKey ?? 'unknown'}`,
            `player API responses seen: ${script?.playerApiRequests ?? 0}`,
            `Opus responses narrowed: ${script?.opusResponsesPatched ?? 0}`,
            `Requested Opus itag: ${forcedOpusItag ?? 'none'}`,
            `Opus patch error: ${script?.lastOpusError ?? 'none'}`,
            `Script patch error: ${script?.lastError ?? 'none'}`,
          ].join('\n');

          return dialog.showMessageBox(window, {
            type: 'info',
            title: 'Audio Quality',
            message: summary,
            detail: `${nativeDetail}\n\nAdvanced diagnostics\n${scriptDetail}`,
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
