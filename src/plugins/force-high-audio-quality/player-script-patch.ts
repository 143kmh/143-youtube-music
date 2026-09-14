import type { Session } from 'electron';

const FORCE_DIRECT_FLAG = '__PEARD_FORCE_DIRECT_HQ__';

export type PlayerScriptPatchStatus = {
  installed: boolean;
  matchedRequests: number;
  patchedRequests: number;
  detectedPolicyKey: string | null;
  lastError: string | null;
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

export const installPlayerScriptPatch = async (
  session: Session,
): Promise<{
  status: PlayerScriptPatchStatus;
  restore: () => Promise<void>;
}> => {
  const status: PlayerScriptPatchStatus = {
    installed: false,
    matchedRequests: 0,
    patchedRequests: 0,
    detectedPolicyKey: null,
    lastError: null,
  };

  try {
    await session.protocol.handle('https', async (request) => {
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
          return new Response(original, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        }

        status.patchedRequests++;
        status.lastError = null;

        const headers = new Headers(response.headers);
        // The body has been decoded and rewritten, so stale transport metadata
        // must not be forwarded.
        headers.delete('content-length');
        headers.delete('content-encoding');
        headers.delete('transfer-encoding');
        headers.delete('etag');

        return new Response(patched.source, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
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
