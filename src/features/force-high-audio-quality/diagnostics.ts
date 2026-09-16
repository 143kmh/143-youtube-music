type AudioFormat = {
  itag?: number;
  mimeType?: string;
  averageBitrate?: number;
  bitrate?: number;
  audioQuality?: string;
};

export type PlaybackDetails = {
  subscriber: 'yes' | 'no' | 'unknown';
  effectivePreference: string;
  videoId: string;
  offeredFormats: string;
};

// Only report these allowlisted fields. Never expose cookies, tokens, signed
// media URLs, or the full player response through diagnostics.
export const readPlaybackDetails = (
  api: DiagnosticPlayer | null,
  config?: Record<string, unknown>,
): PlaybackDetails => {
  const details: PlaybackDetails = {
    subscriber:
      config?.IS_SUBSCRIBER === true
        ? 'yes'
        : config?.IS_SUBSCRIBER === false
          ? 'no'
          : 'unknown',
    effectivePreference:
      typeof config?.AUDIO_QUALITY === 'string'
        ? config.AUDIO_QUALITY
        : 'Unknown',
    videoId: 'Unknown',
    offeredFormats: 'Unknown',
  };
  try {
    const response = api?.getPlayerResponse?.();
    details.videoId = response?.videoDetails?.videoId ?? 'Unknown';
    const formats = response?.streamingData?.adaptiveFormats;
    if (Array.isArray(formats)) {
      details.offeredFormats =
        formats
          .filter((format) => format.mimeType?.startsWith('audio/'))
          .slice(0, 20)
          .map((format) => {
            const bitrate = format.averageBitrate ?? format.bitrate;
            const kbps =
              typeof bitrate === 'number' &&
              Number.isFinite(bitrate) &&
              bitrate > 0
                ? `~${Math.round(bitrate / 1000)} kbps`
                : 'Unknown bitrate';
            const codec =
              /codecs="([^"]+)"/.exec(format.mimeType ?? '')?.[1] ??
              'Unknown codec';
            return `${format.itag ?? '?'} / ${codec} / ${kbps} / ${format.audioQuality ?? '?'}`;
          })
          .join('\n') || 'No audio formats exposed';
    }
  } catch {
    // The native player may not expose metadata during a track transition.
  }
  return details;
};

export type DiagnosticPlayer = {
  getStatsForNerds?: () => {
    codecs?: string;
    video_id_and_cpn?: string;
  } | null;
  getPlayerResponse?: () => {
    videoDetails?: { videoId?: string };
    streamingData?: { adaptiveFormats?: AudioFormat[] };
  } | null;
};

export type AudioDiagnostics = {
  itag: number | null;
  codec: string | null;
  approximateKbps: number | null;
};

export const readAudioDiagnostics = (
  api: DiagnosticPlayer | null,
): AudioDiagnostics => {
  const result: AudioDiagnostics = {
    itag: null,
    codec: null,
    approximateKbps: null,
  };
  try {
    // Use the active format from Stats for Nerds, never the highest advertised
    // format or the last network request (which may belong to a preloaded song).
    const stats = api?.getStatsForNerds?.();
    const codecs = stats?.codecs;
    if (typeof codecs !== 'string') return result;
    const audio =
      /(?:^|\s\/\s)((?:mp4a|opus|vorbis|ac-3|ec-3|flac)[\w., -]*)\s+\((\d+)\)/i.exec(
        codecs,
      );
    if (!audio) return result;
    result.itag = Number(audio[2]);
    result.codec = audio[1].trim();

    const response = api?.getPlayerResponse?.();
    const statsId = stats?.video_id_and_cpn?.split(' / ')[0];
    const responseId = response?.videoDetails?.videoId;
    if (statsId && responseId && statsId !== responseId) return result;
    const formats = response?.streamingData?.adaptiveFormats;
    if (!Array.isArray(formats)) return result;
    const matches = formats.filter(
      (format) =>
        format.itag === result.itag && format.mimeType?.startsWith('audio/'),
    );
    // An itag can occur in multiple audio tracks/DRC variants. Don't guess which
    // bitrate applies if the metadata is ambiguous.
    const bitrates = matches.map(
      (format) => format.averageBitrate ?? format.bitrate,
    );
    const bitrate = bitrates[0];
    if (
      typeof bitrate === 'number' &&
      Number.isFinite(bitrate) &&
      bitrate > 0 &&
      bitrates.every((value) => value === bitrate)
    ) {
      result.approximateKbps = Math.round(bitrate / 1000);
    }
  } catch {
    // Private APIs can be absent or temporarily unavailable during navigation.
  }
  return result;
};
