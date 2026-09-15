import type { MusicPlayerAppElement } from '@/types/music-player-app-element';

type UnknownRecord = Record<string, unknown>;
type NetworkManager = {
  fetch: (path: string, payload?: unknown) => Promise<unknown>;
};

const TRACK_RENDERER_KEYS = new Set([
  'musicResponsiveListItemRenderer',
  'musicTwoRowItemRenderer',
  'musicMultiRowListItemRenderer',
]);
const CONTINUATION_KEYS = new Set([
  'continuationItemRenderer',
  'nextContinuationData',
  'reloadContinuationData',
]);

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const findRecordByKey = (root: unknown, keys: readonly string[]) => {
  let found: UnknownRecord | null = null;
  const visit = (value: unknown) => {
    if (found) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    for (const key of keys) {
      if (isRecord(value[key])) {
        found = value[key];
        return;
      }
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return found;
};

const continuationTokens = (root: unknown) => {
  const result = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    const item = isRecord(value.continuationItemRenderer)
      ? value.continuationItemRenderer
      : null;
    const endpoint = item && isRecord(item.continuationEndpoint)
      ? item.continuationEndpoint
      : null;
    const command = endpoint && isRecord(endpoint.continuationCommand)
      ? endpoint.continuationCommand
      : null;
    if (typeof command?.token === 'string' && command.token)
      result.add(command.token);
    for (const key of ['nextContinuationData', 'reloadContinuationData']) {
      const data = isRecord(value[key]) ? value[key] : null;
      if (typeof data?.continuation === 'string' && data.continuation)
        result.add(data.continuation);
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return result;
};

const isolatePlaylistResponse = (response: unknown) => {
  if (!isRecord(response) && !Array.isArray(response))
    return { response, tokens: new Set<string>() };

  let copy: unknown;
  try {
    copy = structuredClone(response);
  } catch {
    copy = response;
  }

  const shelf = findRecordByKey(copy, [
    'musicPlaylistShelfRenderer',
    'musicPlaylistShelfContinuation',
  ]);
  if (!shelf) return { response: copy, tokens: new Set<string>() };

  const prune = (value: unknown, insideShelf = false) => {
    if (Array.isArray(value)) {
      value.forEach((child) => prune(child, insideShelf));
      return;
    }
    if (!isRecord(value)) return;

    for (const [key, child] of Object.entries(value)) {
      const allowed = insideShelf || child === shelf;
      if (!allowed && (TRACK_RENDERER_KEYS.has(key) || CONTINUATION_KEYS.has(key))) {
        delete value[key];
        continue;
      }
      prune(child, allowed);
    }
  };

  prune(copy);
  return { response: copy, tokens: continuationTokens(shelf) };
};

export const installPlaylistIsolation = () => {
  let manager: NetworkManager | null = null;
  let original: NetworkManager['fetch'] | null = null;
  let wrapped: NetworkManager['fetch'] | null = null;
  const playlistContinuations = new Set<string>();

  const detach = () => {
    if (manager && original && wrapped && manager.fetch === wrapped)
      manager.fetch = original;
    manager = null;
    original = null;
    wrapped = null;
  };

  const attach = () => {
    const app = document.querySelector<MusicPlayerAppElement>('ytmusic-app');
    const next = app?.networkManager as unknown as NetworkManager | undefined;
    if (!next?.fetch) return;
    if (next === manager && next.fetch === wrapped) return;

    detach();
    manager = next;
    original = next.fetch;
    const nativeFetch = original;

    wrapped = async (path: string, payload?: unknown) => {
      const data = isRecord(payload) ? payload : null;
      const browseId = typeof data?.browseId === 'string' ? data.browseId : '';
      const continuation =
        typeof data?.continuation === 'string' ? data.continuation : '';
      const playlistBrowse = path === '/browse' && /^VL/u.test(browseId);
      const playlistContinuation =
        path === '/browse' &&
        Boolean(continuation && playlistContinuations.has(continuation));

      const result = await nativeFetch.call(next, path, payload);
      if (!playlistBrowse && !playlistContinuation) return result;

      if (playlistContinuation) playlistContinuations.delete(continuation);
      const isolated = isolatePlaylistResponse(result);
      for (const token of isolated.tokens) playlistContinuations.add(token);
      return isolated.response;
    };
    next.fetch = wrapped;
  };

  attach();
  const timer = window.setInterval(attach, 500);
  return () => {
    window.clearInterval(timer);
    detach();
    playlistContinuations.clear();
  };
};
