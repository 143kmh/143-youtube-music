import type { MusicPlayer } from '@/types/music-player';

import type { SearchResultItem } from './youtube-music';
import type { PlaylistCatalogAdapter } from './youtube-music-playlist';

export type PlaybackContextSource = Readonly<{
  kind: 'search' | 'artist' | 'album' | 'playlist';
  title: string;
  browseId?: string;
}>;

export type PlaybackContext = Readonly<{
  source: PlaybackContextSource;
  items: readonly SearchResultItem[];
  index: number;
  shuffle: boolean;
  repeat: 0 | 1 | 2;
  queueOpen: boolean;
}>;

export type PlaybackContextAdapter = PlaylistCatalogAdapter & {
  playContext: (
    items: readonly SearchResultItem[],
    startIndex: number,
    source: PlaybackContextSource,
    options?: Readonly<{ shuffle?: boolean }>,
  ) => boolean;
  playContextIndex: (index: number) => boolean;
  getPlaybackContext: () => PlaybackContext | null;
  subscribePlaybackContext: (
    listener: (context: PlaybackContext | null) => void,
  ) => () => void;
  closeContextQueue: () => void;
  clearPlaybackContext: () => void;
};

const playableItems = (items: readonly SearchResultItem[]) => {
  const result: SearchResultItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (item.kind !== 'song' || !item.videoId || seen.has(item.videoId)) continue;
    seen.add(item.videoId);
    result.push(item);
  }
  return result;
};

export const installPlaybackContext = (
  engine: PlaylistCatalogAdapter,
): PlaybackContextAdapter => {
  const originalOpenSearchResult = engine.openSearchResult.bind(engine);
  const originalNext = engine.next.bind(engine);
  const originalPrevious = engine.previous.bind(engine);
  const originalToggleShuffle = engine.toggleShuffle.bind(engine);
  const originalCycleRepeat = engine.cycleRepeat.bind(engine);
  const originalOpenQueue = engine.openQueue.bind(engine);
  const originalDispose = engine.dispose.bind(engine);

  const playerApi = () =>
    document.querySelector<HTMLElement & MusicPlayer>('#movie_player');

  let context: PlaybackContext | null = null;
  let pendingVideoId = '';
  let mismatchTicks = 0;
  let endedVideoId = '';
  const history: number[] = [];
  const listeners = new Set<(value: PlaybackContext | null) => void>();

  const emit = () => {
    for (const listener of listeners) listener(context);
  };

  const replace = (next: PlaybackContext | null) => {
    context = next;
    if (!next) {
      pendingVideoId = '';
      mismatchTicks = 0;
      endedVideoId = '';
      history.length = 0;
    }
    emit();
  };

  const loadIndex = (index: number, recordHistory = true) => {
    if (!context || index < 0 || index >= context.items.length) return false;
    const item = context.items[index];
    if (!item?.videoId) return false;
    if (recordHistory && context.index !== index) history.push(context.index);
    context = { ...context, index };
    pendingVideoId = item.videoId;
    mismatchTicks = 0;
    endedVideoId = '';
    emit();

    // A custom 143 context must not inherit the stale native YouTube queue.
    // The stream itself is still loaded by the existing adapter, so HQ selection
    // remains in force-high-audio-quality.
    try {
      playerApi()?.clearQueue?.();
    } catch {
      // Some player builds expose clearQueue but reject it outside a native queue.
    }
    return originalOpenSearchResult(item);
  };

  const randomNextIndex = () => {
    if (!context || context.items.length < 2) return context?.index ?? -1;
    let next = context.index;
    while (next === context.index)
      next = Math.floor(Math.random() * context.items.length);
    return next;
  };

  const advance = (automatic: boolean) => {
    if (!context) return false;
    if (automatic && context.repeat === 2) return loadIndex(context.index, false);

    const next = context.shuffle ? randomNextIndex() : context.index + 1;
    if (next >= 0 && next < context.items.length) return loadIndex(next, true);
    if (context.repeat === 1 && context.items.length) return loadIndex(0, true);

    if (automatic) {
      try {
        playerApi()?.stopVideo?.();
      } catch {
        // The media element is already ended; stopping is only an autonav guard.
      }
    }
    return false;
  };

  const rewind = () => {
    if (!context) return false;
    if (engine.getState().time > 3) {
      engine.seek(0);
      return true;
    }
    if (context.shuffle && history.length) {
      const previous = history.pop();
      return previous === undefined ? false : loadIndex(previous, false);
    }
    const previous = context.index - 1;
    if (previous >= 0) return loadIndex(previous, true);
    if (context.repeat === 1 && context.items.length)
      return loadIndex(context.items.length - 1, true);
    engine.seek(0);
    return true;
  };

  const stateUnsubscribe = engine.subscribe((state) => {
    if (!context) return;
    const id = state.track.id;
    if (!id) return;

    if (pendingVideoId) {
      if (id === pendingVideoId) {
        pendingVideoId = '';
        mismatchTicks = 0;
      } else {
        return;
      }
    }

    const index = context.items.findIndex((item) => item.videoId === id);
    if (index >= 0) {
      mismatchTicks = 0;
      if (index !== context.index) {
        context = { ...context, index };
        emit();
      }
      return;
    }

    // Native clicks outside 143 are still possible while old YT surfaces exist.
    // Once a different track is stable for ~1s, relinquish our custom context.
    mismatchTicks++;
    if (mismatchTicks >= 10) replace(null);
  });

  const onEnded = () => {
    if (!context) return;
    const id = engine.getState().track.id;
    if (!id || endedVideoId === id) return;
    const current = context.items[context.index];
    if (current?.videoId !== id) return;
    endedVideoId = id;
    advance(true);
  };
  document.addEventListener('ended', onEnded, true);

  return Object.assign(engine, {
    playContext(
      items: readonly SearchResultItem[],
      startIndex: number,
      source: PlaybackContextSource,
      options: Readonly<{ shuffle?: boolean }> = {},
    ) {
      const selected = items[startIndex];
      const playable = playableItems(items);
      if (!playable.length) return false;
      const index = selected?.videoId
        ? Math.max(
            0,
            playable.findIndex((item) => item.videoId === selected.videoId),
          )
        : 0;
      history.length = 0;
      context = {
        source,
        items: playable,
        index,
        shuffle: options.shuffle === true,
        repeat: 0,
        queueOpen: false,
      };
      emit();
      return loadIndex(index, false);
    },
    playContextIndex(index: number) {
      return loadIndex(index, true);
    },
    getPlaybackContext: () => context,
    subscribePlaybackContext(listener: (value: PlaybackContext | null) => void) {
      listeners.add(listener);
      listener(context);
      return () => listeners.delete(listener);
    },
    closeContextQueue() {
      if (!context?.queueOpen) return;
      context = { ...context, queueOpen: false };
      emit();
    },
    clearPlaybackContext() {
      replace(null);
    },
    openSearchResult(item: SearchResultItem) {
      replace(null);
      return originalOpenSearchResult(item);
    },
    next() {
      if (!context || !advance(false)) originalNext();
    },
    previous() {
      if (!context || !rewind()) originalPrevious();
    },
    toggleShuffle() {
      if (!context) {
        originalToggleShuffle();
        return;
      }
      context = { ...context, shuffle: !context.shuffle };
      emit();
      // Keep the hidden native control in sync so the existing player chrome
      // still reflects the selected mode.
      originalToggleShuffle();
    },
    cycleRepeat() {
      if (!context) {
        originalCycleRepeat();
        return;
      }
      context = {
        ...context,
        repeat: ((context.repeat + 1) % 3) as 0 | 1 | 2,
      };
      emit();
      originalCycleRepeat();
    },
    openQueue() {
      if (!context) {
        originalOpenQueue();
        return;
      }
      context = { ...context, queueOpen: !context.queueOpen };
      emit();
    },
    dispose() {
      stateUnsubscribe();
      document.removeEventListener('ended', onEnded, true);
      listeners.clear();
      replace(null);
      originalDispose();
    },
  });
};
