import type { Session } from 'electron';

const FORCE_DIRECT_FLAG = '__PEARD_FORCE_DIRECT_HQ__';

export type PlayerScriptPatchStatus = {
  installed: boolean;
  matchedRequests: number;
  patchedRequests: number;
  detectedPolicyKey: string | null;
  playerApiRequests: number;
  opusResponsesPatched: number;
  lastForcedOpusItag: string | null;
  lastOpusError: string | null;
  lastError: string | null;
};

type PlayerFormat = Record<string, unknown>;
type PlayerResponse = {
  streamingData?: {
    adaptiveFormats?: PlayerFormat[];
  };
};

const isPlayerBaseScript = (rawUrl: string) => {
  try {
    const parsed = new URL(rawUrl);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'music.youtube.com' &&
      parsed.pathname.includes('/s/player/') &&
      parsed.pathname.endsWith('/base.js')
    );
  } catch {
    return false;
  }
};

const isPlayerApiRequest = (rawUrl: string) => {
  try {
    const parsed = new URL(rawUrl);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'music.youtube.com' &&
      parsed.pathname.endsWith('/youtubei/v1/player')
    );
  } catch {
    return false;
  }
};

const findPolicyKey = (body: string): string | null => {
  if (
    !body.includes('this.policy.') ||
    !body.includes('this.audioTrack') ||
    !body.includes('this.videoTrack') ||
    !body.includes('this.XK') ||
    !body.includes('this.getCurrentTime')
  ) {
    return null;
  }

  const keys = [
    ...body.matchAll(/this\.policy\.([A-Za-z_$][\w$]*)/g),
  ].map((match) => match[1]);

  for (const key of new Set(keys)) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const count = body.match(
      new RegExp(`this\\.policy\\.${escaped}\\b`, 'g'),
    )?.length;
    if ((count ?? 0) < 3) continue;

    const positive = new RegExp(
      `this\\.policy\\.${escaped}\\s*&&`,
    ).test(body);
    const negative = new RegExp(
      `this\\.policy\\.${escaped}\\s*\\|\\|`,
    ).test(body);
    if (positive && negative) return key;
  }

  return null;
};

const isAudioFormat = (format: PlayerFormat) =>
  typeof format.mimeType === 'string' && format.mimeType.startsWith('audio/');

const isOpusFormat = (format: PlayerFormat) =>
  isAudioFormat(format) &&
  typeof format.mimeType === 'string' &&
  /(?:^|[^a-z])opus(?:[^a-z]|$)/i.test(format.mimeType);

const bitrateOf = (format: PlayerFormat) => {
  const average = format.averageBitrate;
  if (typeof average === 'number' && Number.isFinite(average)) return average;
  const bitrate = format.bitrate;
  return typeof bitrate === 'number' && Number.isFinite(bitrate) ? bitrate : 0;
};

const itagOf = (format: PlayerFormat) => {
  const itag = format.itag;
  return typeof itag === 'number' || typeof itag === 'string'
    ? String(itag)
    : null;
};

/**
 * In experimental Opus mode, keep YouTube's native player response and native
 * signed URLs, but narrow the audio candidates before the player ranks them.
 *
 * The normal Maximum mode is deliberately untouched. When a HIGH Opus stream is
 * offered, retain the highest-bitrate non-DRC HIGH Opus candidate (or the best
 * HIGH Opus candidate if every one is DRC) plus every non-audio format. If no
 * HIGH Opus stream exists, retain the best available Opus stream. If there is
 * no Opus audio at all, fail open and leave the response byte-for-byte alone.
 */
export const patchPlayerResponseForOpus = (
  source: string,
): {
  source: string;
  patched: boolean;
  selectedItag: string | null;
  error: string | null;
} => {
  try {
    const parsed = JSON.parse(source) as PlayerResponse;
    const adaptiveFormats = parsed.streamingData?.adaptiveFormats;
    if (!Array.isArray(adaptiveFormats)) {
      return {
        source,
        patched: false,
        selectedItag: null,
        error: 'No adaptiveFormats in player response',
      };
    }

    const opus = adaptiveFormats.filter(isOpusFormat);
    if (opus.length === 0) {
      return {
        source,
        patched: false,
        selectedItag: null,
        error: 'No Opus audio format offered',
      };
    }

    const highOpus = opus.filter(
      (format) => format.audioQuality === 'AUDIO_QUALITY_HIGH',
    );
    const qualityPool = highOpus.length > 0 ? highOpus : opus;
    const nonDrc = qualityPool.filter((format) => format.isDrc !== true);
    const candidates = nonDrc.length > 0 ? nonDrc : qualityPool;
    const selected = [...candidates].sort(
      (left, right) => bitrateOf(right) - bitrateOf(left),
    )[0];

    if (!selected) {
      return {
        source,
        patched: false,
        selectedItag: null,
        error: 'No usable Opus candidate',
      };
    }

    parsed.streamingData!.adaptiveFormats = adaptiveFormats.filter(
      (format) => !isAudioFormat(format) || format === selected,
    );

    return {
      source: JSON.stringify(parsed),
      patched: true,
      selectedItag: itagOf(selected),
      error: null,
    };
  } catch (error) {
    return {
      source,
      patched: false,
      selectedItag: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Patch the playback controller at source level because the controller and its
 * shared policy object live inside the minified player closure and are not
 * reachable from the exposed movie_player/Music component object graphs.
 */
export const patchPlayerScript = (
  source: string,
): { source: string; policyKey: string | null; patched: boolean } => {
  const methodPattern = /\binitialize\s*\([^)]{0,240}\)\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = methodPattern.exec(source))) {
    const openBrace = source.indexOf('{', match.index);
    if (openBrace < 0) continue;

    // The current controller body is only a few KB. A generous bounded window
    // avoids parsing the entire minified bundle while still locating its stable
    // structural markers.
    const bodyWindow = source.slice(openBrace + 1, openBrace + 16_000);
    const policyKey = findPolicyKey(bodyWindow);
    if (!policyKey) continue;

    const injection =
      `globalThis.${FORCE_DIRECT_FLAG}===true&&this.policy&&` +
      `this.policy.${policyKey}===true&&(this.policy.${policyKey}=false);`;

    return {
      source: `${source.slice(0, openBrace + 1)}${injection}${source.slice(openBrace + 1)}`,
      policyKey,
      patched: true,
    };
  }

  return { source, policyKey: null, patched: false };
};

const rewrittenResponse = (response: Response, body: string) => {
  const headers = new Headers(response.headers);
  // The body has been decoded and rewritten, so stale transport metadata must
  // not be forwarded.
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('transfer-encoding');
  headers.delete('etag');

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export const installPlayerScriptPatch = async (
  session: Session,
  shouldForceOpus: () => boolean | Promise<boolean> = () => false,
): Promise<{
  status: PlayerScriptPatchStatus;
  restore: () => Promise<void>;
}> => {
  const status: PlayerScriptPatchStatus = {
    installed: false,
    matchedRequests: 0,
    patchedRequests: 0,
    detectedPolicyKey: null,
    playerApiRequests: 0,
    opusResponsesPatched: 0,
    lastForcedOpusItag: null,
    lastOpusError: null,
    lastError: null,
  };

  try {
    await session.protocol.handle('https', async (request) => {
      if (isPlayerApiRequest(request.url)) {
        status.playerApiRequests++;

        let forceOpus = false;
        try {
          forceOpus = await shouldForceOpus();
        } catch (error) {
          status.lastOpusError =
            error instanceof Error ? error.message : String(error);
        }

        if (forceOpus) {
          try {
            const response = await session.fetch(request, {
              bypassCustomProtocolHandlers: true,
              cache: 'no-store',
            });
            if (response.status === 204 || response.status === 304) return response;

            const original = await response.text();
            const patched = patchPlayerResponseForOpus(original);
            status.lastForcedOpusItag = patched.selectedItag;
            status.lastOpusError = patched.error;
            if (!patched.patched) return rewrittenResponse(response, original);

            status.opusResponsesPatched++;
            return rewrittenResponse(response, patched.source);
          } catch (error) {
            status.lastOpusError =
              error instanceof Error ? error.message : String(error);
            return session.fetch(request, { bypassCustomProtocolHandlers: true });
          }
        }

        return session.fetch(request, { bypassCustomProtocolHandlers: true });
      }

      if (!isPlayerBaseScript(request.url)) {
        return session.fetch(request, { bypassCustomProtocolHandlers: true });
      }

      status.matchedRequests++;

      try {
        const response = await session.fetch(request, {
          bypassCustomProtocolHandlers: true,
          cache: 'no-store',
        });

        // A cached conditional response has no body to patch. Retrying without
        // the browser cache is handled by cache:no-store above; if the server
        // still returns no body, fail open.
        if (response.status === 204 || response.status === 304) return response;

        const original = await response.text();
        const patched = patchPlayerScript(original);
        status.detectedPolicyKey = patched.policyKey;
        if (!patched.patched) {
          status.lastError = 'Playback initialize signature not found';
          return rewrittenResponse(response, original);
        }

        status.patchedRequests++;
        status.lastError = null;
        return rewrittenResponse(response, patched.source);
      } catch (error) {
        status.lastError = error instanceof Error ? error.message : String(error);
        return session.fetch(request, { bypassCustomProtocolHandlers: true });
      }
    });
    status.installed = true;
  } catch (error) {
    status.lastError = error instanceof Error ? error.message : String(error);
  }

  return {
    status,
    restore: async () => {
      if (!status.installed) return;
      try {
        await session.protocol.unhandle('https');
      } finally {
        status.installed = false;
      }
    },
  };
};
