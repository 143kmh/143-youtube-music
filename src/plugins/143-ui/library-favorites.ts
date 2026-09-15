import { responseData } from './native-player';

import type { MusicPlayerAppElement } from '@/types/music-player-app-element';

type UnknownRecord = Record<string, unknown>;

export type ArtistLibraryState = Readonly<{
  saved: boolean;
  channelId: string;
}>;

export type AlbumLibraryState = Readonly<{
  saved: boolean;
  playlistId: string;
}>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const app = () => document.querySelector<MusicPlayerAppElement>('ytmusic-app');

const requireApp = () => {
  const musicApp = app();
  if (!musicApp?.networkManager?.fetch)
    throw new Error('YouTube Music is not ready');
  return musicApp;
};

const browse = (browseId: string) =>
  requireApp().networkManager.fetch<unknown, { browseId: string }>('/browse', {
    browseId,
  });

const stringValue = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const findStringByKey = (root: unknown, keys: readonly string[]) => {
  let found = '';
  const visit = (value: unknown) => {
    if (found) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    for (const key of keys) {
      const candidate = stringValue(value[key]);
      if (candidate) {
        found = candidate;
        return;
      }
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return found;
};

const collectStrings = (root: unknown) => {
  const result: string[] = [];
  const visit = (value: unknown) => {
    if (typeof value === 'string') {
      result.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    Object.values(value).forEach(visit);
  };
  visit(root);
  return result;
};

const findRenderer = (root: unknown, keys: readonly string[]) => {
  let found: UnknownRecord | null = null;
  const visit = (value: unknown) => {
    if (found) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    for (const key of keys) {
      const candidate = value[key];
      if (isRecord(candidate)) {
        found = candidate;
        return;
      }
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return found;
};

const findArtistState = (
  root: unknown,
  fallbackBrowseId: string,
): ArtistLibraryState => {
  const renderer = findRenderer(root, [
    'subscribeButtonRenderer',
    'musicSubscribeButtonRenderer',
  ]);
  const channelId =
    findStringByKey(renderer ?? root, ['channelId', 'channelID']) ||
    (fallbackBrowseId.startsWith('UC') ? fallbackBrowseId : '');
  const raw = renderer ?? {};
  const strings = collectStrings(raw).join(' ').toLocaleLowerCase();
  const saved =
    raw.subscribed === true ||
    raw.isSubscribed === true ||
    raw.isToggled === true ||
    /unsubscribe|subscribed|following|вы подписаны|підписан/iu.test(strings);
  return { saved, channelId };
};

const findPlaylistId = (root: unknown) => {
  let fallback = '';
  let exact = '';
  const visit = (value: unknown) => {
    if (exact) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;

    const playlistId = stringValue(value.playlistId);
    if (playlistId) {
      if (/^OLAK/iu.test(playlistId)) {
        exact = playlistId;
        return;
      }
      fallback ||= playlistId;
    }

    const like = isRecord(value.likeEndpoint) ? value.likeEndpoint : null;
    const target = like && isRecord(like.target) ? like.target : null;
    const targetId = stringValue(target?.playlistId);
    if (targetId) {
      exact = targetId;
      return;
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return exact || fallback;
};

const findAlbumState = (root: unknown): AlbumLibraryState => {
  let toggle: UnknownRecord | null = null;
  const visit = (value: unknown) => {
    if (toggle) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;

    for (const key of [
      'musicToggleButtonRenderer',
      'toggleButtonRenderer',
      'toggleButtonViewModel',
    ]) {
      const candidate = value[key];
      if (!isRecord(candidate)) continue;
      const strings = collectStrings(candidate).join(' ').toLocaleLowerCase();
      if (
        /library_add|library_saved|save to library|add to library|remove from library|в библиотек|у бібліотец|зберегти в бібліотец/iu.test(
          strings,
        )
      ) {
        toggle = candidate;
        return;
      }
    }
    Object.values(value).forEach(visit);
  };
  visit(root);

  const scope = toggle ?? root;
  const strings = collectStrings(scope).join(' ').toLocaleLowerCase();
  const saved =
    Boolean(toggle?.isToggled) ||
    Boolean(toggle?.isSelected) ||
    Boolean(toggle?.isChecked) ||
    /library_saved|remove from library|saved to library|в библиотеке|у бібліотеці/iu.test(
      strings,
    );
  return { saved, playlistId: findPlaylistId(scope) || findPlaylistId(root) };
};

const validateMutation = (raw: unknown) => {
  const response = responseData(raw);
  if (!response) return;
  if (response.error) throw new Error('YouTube Music rejected the library update.');
  const status = response.status;
  if (typeof status === 'string' && /FAILED|ERROR|REJECTED/iu.test(status))
    throw new Error('YouTube Music rejected the library update.');
};

const announceChange = (kind: 'albums' | 'artists') => {
  document.dispatchEvent(
    new CustomEvent('ui143:library-changed', { detail: { kind } }),
  );
};

export const getArtistLibraryState = async (
  browseId: string,
): Promise<ArtistLibraryState> => findArtistState(await browse(browseId), browseId);

export const setArtistLibraryState = async (
  state: ArtistLibraryState,
  saved: boolean,
) => {
  if (!state.channelId) throw new Error('Artist subscription id is unavailable.');
  const response = await requireApp().networkManager.fetch(
    saved ? '/subscription/subscribe' : '/subscription/unsubscribe',
    { channelIds: [state.channelId] },
  );
  validateMutation(response);
  announceChange('artists');
};

export const getAlbumLibraryState = async (
  browseId: string,
): Promise<AlbumLibraryState> => findAlbumState(await browse(browseId));

export const setAlbumLibraryState = async (
  state: AlbumLibraryState,
  saved: boolean,
) => {
  if (!state.playlistId) throw new Error('Album playlist id is unavailable.');
  const response = await requireApp().networkManager.fetch(
    saved ? '/like/like' : '/like/removelike',
    { target: { playlistId: state.playlistId } },
  );
  validateMutation(response);
  announceChange('albums');
};
