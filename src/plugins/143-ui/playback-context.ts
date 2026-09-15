import type { MusicPlayer } from '@/types/music-player';

import type { MusicState, SearchResultItem } from './youtube-music';
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
  const originalSeek = engine.seek.bind(engine);
  const originalToggleShuffle = engine.toggleShuffle.bind(engine);
  const originalCycleRepeat = engine.cycleRepeat.bind(engine);
  const originalOpenQueue = engine.openQueue.bind(engine);
  const originalGetState = engine.getState.bind(engine);
  const originalSubscribe = engine.subscribe.bind(engine);
  const originalDispose = engine.dispose.bind(engine);

  const playerApi = () =>
    document.querySelector<HTMLElement & MusicPlayer>('#movie_player');
  const playerMedia = () =>
    playerApi()?.querySelector<HTMLVideoElement>('video') ??
    document.querySelector<HTMLVideoElement>('video');

  let context: PlaybackContext | null = null;
  let contextToken = 0;
  let pendingVideoId = '';
  let pendingTicks = 0;
  let mismatchTicks = 0;
  let endedVideoId = '';
  const history: number[] = [];
  const extensionSeeds = new Set<string>();
  const contextListeners = new Set<(value: PlaybackContext | null) => void>();
  const stateListeners = new Set<(state: MusicState) => void>();

  const setNativeAutonav = (enabled: boolean) => {
    try {
      playerApi()?.setAutonav?.(enabled);
    } catch {
      // Player builds differ here; the 143 queue does not depend on this call.
    }
  };

  const presentedState = (base: MusicState): MusicState =>
    context
      ? {
          ...base,
          shuffle: context.shuffle,
          repeat: context.repeat,
          queueActive: context.queueOpen,
        }
      : base;

  const notifyState = (base = originalGetState()) => {
    const visible = presentedState(base);
    for (const listener of stateListeners) listener(visible);
  };

  const emit = () => {
    for (const listener of contextListeners) listener(context);
    notifyState();
  };

  const replace = (next: PlaybackContext | null) => {
    context = next;
    contextToken++;
    pendingVideoId = '';
    pendingTicks = 0;
    mismatchTicks = 0;
    endedVideoId = '';
    history.length = 0;
    extensionSeeds.clear();
    setNativeAutonav(!next);
    emit();
  };

  const extendFrom = async (seedVideoId: string) => {
    if (!context || !seedVideoId || extensionSeeds.has(seedVideoId)) return 0;
    extensionSeeds.add(seedVideoId);
    const token = contextToken;

    try {
      const extra = await engine.getAutoplayItems(seedVideoId);
      if (!context || token !== contextToken) return 0;
      const known = new Set(
        context.items.flatMap((item) => (item.videoId ? [item.videoId] : [])),
      );
      const additions = playableItems(extra).filter(
        (item) => item.videoId && !known.has(item.videoId),
      );
      if (!additions.length) return 0;
      context = { ...context, items: [...context.items, ...additions] };
      emit();
      return additions.length;
    } catch (error) {
      extensionSeeds.delete(seedVideoId);
      console.warn('[143 Music] Could not extend autoplay queue', error);
      return 0;
    }
  };

  const ensureTail = () => {
    if (!context || context.items.length - context.index > 6) return;
    const seed = context.items.at(-1)?.videoId;
    if (seed) void extendFrom(seed);
  };

  const loadIndex = (index: number, recordHistory = true) => {
    if (!context || index < 0 || index >= context.items.length) return false;
    const item = context.items[index];
    if (!item?.videoId) return false;
    if (recordHistory && context.index !== index) history.push(context.index);
    context = { ...context, index };
    pendingVideoId = item.videoId;
    pendingTicks = 0;
    mismatchTicks = 0;
    endedVideoId = '';
    setNativeAutonav(false);
    emit();

    const opened = originalOpenSearchResult(item);
    if (opened) ensureTail();
    return opened;
  };

  const randomNextIndex = () => {
    if (!context || context.items.length < 2) return context?.index ?? -1;
    let next = context.index;
    while (next === context.index)
      next = Math.floor(Math.random() * context.items.length);
    return next;
  };

  const advance = async (automatic: boolean) => {
    if (!context) return false;
    if (automatic && context.repeat === 2) return loadIndex(context.index, false);

    const token = contextToken;
    const next = context.shuffle ? randomNextIndex() : context.index + 1;
    if (next >= 0 && next < context.items.length) return loadIndex(next, true);

    const seed = context.items.at(-1)?.videoId ?? '';
    if (seed) await extendFrom(seed);
    if (!context || token !== contextToken) return false;

    const extendedNext = context.index + 1;
    if (!context.shuffle && extendedNext < context.items.length)
      return loadIndex(extendedNext, true);

    if (context.repeat === 1 && context.items.length) return loadIndex(0, true);

    if (automatic) {
      try {
        playerApi()?.stopVideo?.();
      } catch {
        // The media element is already ended; stopping only blocks native autonav.
      }
    }
    return false;
  };

  const rewind = () => {
    if (!context) return false;
    if (originalGetState().time > 3) {
      const api = playerApi();
      if (api?.seekTo) api.seekTo(0);
      else originalSeek(0);
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
    const api = playerApi();
    if (api?.seekTo) api.seekTo(0);
    else originalSeek(0);
    return true;
  };

  const stateUnsubscribe = originalSubscribe((baseState) => {
    if (!context) {
      notifyState(baseState);
      return;
    }

    const id = baseState.track.id;
    if (!id) {
      notifyState(baseState);
      return;
    }

    if (pendingVideoId) {
      if (id === pendingVideoId) {
        pendingVideoId = '';
        pendingTicks = 0;
        mismatchTicks = 0;
      } else {
        pendingTicks++;
        if (pendingTicks < 30) return;
        // Some uploads can be substituted by YouTube. Wait for the requested ID
        // first instead of immediately accepting a native autonav race.
        pendingVideoId = '';
        pendingTicks = 0;
      }
    }

    const index = context.items.findIndex((item) => item.videoId === id);
    if (index >= 0) {
      mismatchTicks = 0;
      if (index !== context.index) {
        context = { ...context, index };
        emit();
      } else {
        notifyState(baseState);
      }
      ensureTail();
      return;
    }

    mismatchTicks++;
    if (mismatchTicks >= 3) {
      const adopted: SearchResultItem = {
        kind: 'song',
        title: baseState.track.title || 'Autoplay',
        subtitle: baseState.track.byline,
        artwork: baseState.track.artwork,
        videoId: id,
      };
      context = {
        ...context,
        items: [...context.items, adopted],
        index: context.items.length,
      };
      mismatchTicks = 0;
      endedVideoId = '';
      emit();
      ensureTail();
      return;
    }

    notifyState(baseState);
  });

  const onEnded = (event: Event) => {
    if (!context) return;
    const media = playerMedia();
    if (media && event.target !== media) return;

    const id = originalGetState().track.id;
    if (!id || endedVideoId === id) return;
    const current = context.items[context.index];
    if (current?.videoId !== id) return;

    // A custom 143 context owns end-of-track navigation. Block YouTube Music's
    // native ended handlers here; otherwise native Automix can race our next
    // loadVideoById() and replace it with an unrelated track.
    event.preventDefault();
    event.stopImmediatePropagation();
    endedVideoId = id;
    void advance(true);
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
      const baseState = originalGetState();
      contextToken++;
      history.length = 0;
      extensionSeeds.clear();
      context = {
        source,
        items: playable,
        index,
        // Custom contexts start sequentially unless the caller explicitly asks
        // for shuffle. This avoids inheriting stale hidden-YT shuffle state.
        shuffle: options.shuffle ?? false,
        repeat: baseState.repeat ?? 0,
        queueOpen: false,
      };
      setNativeAutonav(false);
      emit();
      const seed = playable.at(-1)?.videoId;
      if (seed) void extendFrom(seed);
      return loadIndex(index, false);
    },
    playContextIndex(index: number) {
      return loadIndex(index, true);
    },
    getPlaybackContext: () => context,
    subscribePlaybackContext(listener: (value: PlaybackContext | null) => void) {
      contextListeners.add(listener);
      listener(context);
      return () => contextListeners.delete(listener);
    },
    closeContextQueue() {
      if (!context?.queueOpen) return;
      context = { ...context, queueOpen: false };
      emit();
    },
    clearPlaybackContext() {
      replace(null);
    },
    getState() {
      return presentedState(originalGetState());
    },
    subscribe(listener: (state: MusicState) => void) {
      stateListeners.add(listener);
      listener(presentedState(originalGetState()));
      return () => stateListeners.delete(listener);
    },
    openSearchResult(item: SearchResultItem) {
      replace(null);
      return originalOpenSearchResult(item);
    },
    next() {
      if (context) {
        void advance(false);
        return;
      }
      originalNext();
    },
    previous() {
      if (context) {
        rewind();
        return;
      }
      originalPrevious();
    },
    seek(seconds: number) {
      if (!Number.isFinite(seconds)) return;
      const target = Math.max(0, seconds);
      const api = playerApi();
      const liveDuration = api?.getDuration?.() ?? originalGetState().duration;

      // Seeking exactly to the end can let YouTube's own autonav run before our
      // ended handler. Treat the final fraction of a second as an explicit
      // request for the next item and use the same deterministic 143 transition
      // as the Next button.
      if (context && liveDuration > 0) {
        const endGuard = Math.max(0.6, Math.min(1.25, liveDuration * 0.003));
        if (target >= liveDuration - endGuard) {
          endedVideoId = originalGetState().track.id;
          void advance(true);
          return;
        }
      }

      endedVideoId = '';
      if (api?.seekTo) {
        // Do not clamp against cached state.duration. Right after a track change
        // that value can belong to the previous song and causes a visible snap back.
        api.seekTo(target);
        engine.refresh();
        return;
      }
      originalSeek(target);
    },
    toggleShuffle() {
      if (!context) {
        originalToggleShuffle();
        return;
      }
      context = { ...context, shuffle: !context.shuffle };
      emit();
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
      contextListeners.clear();
      stateListeners.clear();
      replace(null);
      originalDispose();
    },
  });
};