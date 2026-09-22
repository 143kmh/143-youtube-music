import type { MusicPlayerAppElement } from '@/types/music-player-app-element';

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
const path = (value: unknown, ...keys: string[]): unknown =>
  keys.reduce<unknown>((current, key) => record(current)?.[key], value);
type NativeState = {
  queue?: {
    items?: readonly unknown[];
    autoplay?: boolean;
    repeatMode?: string;
    shuffleEnabled?: boolean;
  };
  playerPage?: { playerPageTabs?: readonly unknown[] };
  navigation?: { playerPageInfo?: { open?: boolean }; playerUiState?: string };
};
type NativeStore = {
  getState: () => NativeState;
  dispatch: (action: { type: string; payload: unknown }) => void;
};
export const nativeStore = (): NativeStore | null => {
  const queue = document.querySelector('#queue') as
    | (HTMLElement & { queue?: { store?: { store?: NativeStore } } })
    | null;
  const app = document.querySelector('ytmusic-app') as
    | (HTMLElement & { ytmusicReduxBehavior?: { store?: NativeStore } })
    | null;
  return queue?.queue?.store?.store ?? app?.ytmusicReduxBehavior?.store ?? null;
};
export const responseData = (response: unknown): RecordValue | null => {
  if (!response || typeof response !== 'object' || Array.isArray(response))
    return null;
  const envelope = response as RecordValue;
  return record(envelope.data) ?? envelope;
};
export const isNativeSubstitution = (requested: string, actual: string) => {
  const items = nativeStore()?.getState().queue?.items ?? [];
  return items.some((item) => {
    const wrapper = record(path(item, 'playlistPanelVideoWrapperRenderer'));
    if (!wrapper) return false;
    const counterpart = Array.isArray(wrapper.counterpart)
      ? wrapper.counterpart
      : [];
    const ids = [wrapper.primaryRenderer, ...counterpart].map(
      (entry) =>
        path(entry, 'playlistPanelVideoRenderer', 'videoId') ??
        path(
          entry,
          'counterpartRenderer',
          'playlistPanelVideoRenderer',
          'videoId',
        ),
    );
    return ids.includes(requested) && ids.includes(actual);
  });
};

type PlaybackController = {
  onPlayerStateChange: (state: number) => void;
  onVideoProgress: (...args: unknown[]) => unknown;
  playEndpoint: (
    endpoint: { data?: { videoId?: string } },
    ...args: unknown[]
  ) => unknown;
};
const nativeController = (): PlaybackController | null => {
  const bar = record(document.querySelector('ytmusic-player-bar'));
  for (const host of [bar, record(bar?.inst), record(bar?.polymerController)]) {
    if (!host) continue;
    const key = Object.getOwnPropertyNames(host).find((name) =>
      /playerController/i.test(name),
    );
    const candidate = key ? record(host[key]) : null;
    if (
      typeof candidate?.onPlayerStateChange === 'function' &&
      typeof candidate?.onVideoProgress === 'function'
    )
      return candidate as PlaybackController;
  }
  return null;
};
const currentServerItem = (value: unknown, id: string): RecordValue | null => {
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = currentServerItem(child, id);
      if (found) return found;
    }
  }
  const item = record(value);
  if (!item) return null;
  const row = record(item.playlistPanelVideoRenderer);
  if (
    row?.videoId === id &&
    path(row, 'navigationEndpoint', 'watchEndpoint', 'videoId') === id
  )
    return { playlistPanelVideoRenderer: { ...row, selected: true } };
  for (const child of Object.values(item)) {
    const found = currentServerItem(child, id);
    if (found) return found;
  }
  return null;
};

// This boundary mirrors YTM's native page-only Redux actions. It never dispatches
// a playback load or media URL. Native history receives the server-provided
// current item; its synchronous endpoint observer must not reload that same song.
export const createNativeSurface = (videoId: () => string) => {
  let request = 0;
  let preparedId = '';
  const cancel = () => {
    request++;
  };
  const open = async (lyrics: boolean): Promise<boolean> => {
    const token = ++request;
    const id = videoId();
    const store = nativeStore();
    const app = document.querySelector<MusicPlayerAppElement>('ytmusic-app');
    if (!id || !store?.dispatch || !app?.networkManager?.fetch) return false;
    const current = () => request === token && videoId() === id;
    try {
      if (preparedId !== id) {
        const response = responseData(
          await app.networkManager.fetch('/next', {
            videoId: id,
            isAudioOnly: true,
            enablePersistentPlaylistPanel: true,
          }),
        );
        if (!current() || !response || response.error) return false;
        const tabs = path(
          response,
          'contents',
          'singleColumnMusicWatchNextResultsRenderer',
          'tabbedRenderer',
          'watchNextTabbedResultsRenderer',
          'tabs',
        );
        if (!Array.isArray(tabs) || !path(tabs[0], 'tabRenderer', 'content'))
          return false;
        const item = currentServerItem(tabs[0], id);
        const controller = nativeController();
        if (!item || typeof controller?.playEndpoint !== 'function')
          return false;
        const playEndpoint = controller.playEndpoint;
        controller.playEndpoint = function (endpoint, ...args) {
          if (endpoint.data?.videoId === id) return;
          return playEndpoint.call(this, endpoint, ...args);
        };
        try {
          store.dispatch({ type: 'RESET_ITEMS', payload: [item] });
          store.dispatch({ type: 'SET_PRELOADED_ENDPOINT', payload: null });
        } finally {
          controller.playEndpoint = playEndpoint;
        }
        store.dispatch({
          type: 'SET_PLAYER_PAGE_WATCH_NEXT_RESPONSE',
          payload: response,
        });
        store.dispatch({ type: 'SET_PLAYER_PAGE_TABS_CONTENT', payload: {} });
        store.dispatch({ type: 'SET_PLAYER_PAGE_TABS', payload: tabs });
        store.dispatch({
          type: 'SET_PLAYER_OVERLAY',
          payload: response.playerOverlays ?? null,
        });
        preparedId = id;
      }
      if (!current()) return false;
      const tabs = store.getState().playerPage?.playerPageTabs ?? [];
      if (
        lyrics &&
        (!path(tabs[1], 'tabRenderer') ||
          path(tabs[1], 'tabRenderer', 'unselectable'))
      )
        return false;
      store.dispatch({
        type: 'SET_PLAYER_PAGE_TAB_SELECTED_INDEX',
        payload: lyrics ? 1 : 0,
      });
      store.dispatch({
        type: 'SET_PLAYER_UI_STATE',
        payload: 'PLAYER_PAGE_OPEN',
      });
      store.dispatch({ type: 'SET_PLAYER_PAGE_INFO', payload: { open: true } });
      // Native rendering is asynchronous. Callers retain their existing page on
      // missing/changed native contracts rather than revealing a blank surface.
      for (let attempt = 0; attempt < 30 && current(); attempt++) {
        const page = document.querySelector('ytmusic-player-page');
        const tab = document.querySelector<HTMLElement>(
          `#tabsContent > .tab-header:nth-of-type(${lyrics ? 2 : 1})`,
        );
        if (page && tab && store.getState().navigation?.playerPageInfo?.open) {
          if (lyrics) tab.click();
          return true;
        }
        await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
      }
      return false;
    } catch (error) {
      console.warn('[143 Music] Could not open native player surface', error);
      return false;
    }
  };
  return { open, cancel };
};

export const playlistEditPayload = (playlistId: string, videoId: string) => {
  const id = playlistId.trim().replace(/^VL/u, '');
  if (!id || !videoId.trim())
    throw new Error('A playlist and track are required');
  return {
    playlistId: id,
    actions: [
      {
        action: 'ACTION_ADD_VIDEO',
        addedVideoId: videoId.trim(),
        dedupeOption: 'DEDUPE_OPTION_SKIP',
      },
    ],
  };
};
export const validatePlaylistEdit = (raw: unknown) => {
  const response = responseData(raw);
  const envelope = responseData({ data: raw });
  const status = response?.status;
  if (
    envelope?.error ||
    response?.error ||
    (typeof envelope?.status === 'number' && envelope.status >= 400) ||
    (typeof status === 'string' && status !== 'STATUS_SUCCEEDED')
  )
    throw new Error('YouTube Music rejected the playlist update.');
  if (status === 'STATUS_SUCCEEDED') return;
  if (
    Array.isArray(response?.playlistEditResults) &&
    response.playlistEditResults.some((entry) =>
      path(entry, 'playlistEditVideoAddedResultData', 'videoId'),
    )
  )
    return;
  throw new PlaylistEditUnconfirmedError();
};
export class PlaylistEditUnconfirmedError extends Error {
  constructor() {
    super(
      'YouTube Music did not confirm the update. Check the playlist before retrying.',
    );
  }
}

// YTM's controller advances on its API state event before the DOM ended event,
// and queues gapless media in onVideoProgress. Both must share our owner.
export const interceptNativeTransitions = (onEnd: () => void) => {
  type Controller = PlaybackController;
  let controller: Controller | undefined;
  let stateHandler: Controller['onPlayerStateChange'] | undefined;
  let progressHandler: Controller['onVideoProgress'] | undefined;
  const install = () => {
    if (controller) return true;
    const candidate = nativeController();
    if (candidate) {
      controller = candidate;
      stateHandler = candidate.onPlayerStateChange;
      progressHandler = candidate.onVideoProgress;
      candidate.onPlayerStateChange = function (state) {
        if (state === 0 && !document.querySelector('#movie_player.ad-showing, #movie_player.ad-interrupting')) {
          onEnd();
          return;
        }
        stateHandler?.call(this, state);
      };
      candidate.onVideoProgress = () => {};
    }
    return Boolean(controller);
  };
  return {
    install,
    dispose() {
      if (controller && stateHandler && progressHandler) {
        controller.onPlayerStateChange = stateHandler;
        controller.onVideoProgress = progressHandler;
      }
      controller = undefined;
    },
  };
};
