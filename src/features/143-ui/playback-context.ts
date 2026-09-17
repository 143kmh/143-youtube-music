import {
  nativeStore,
  isNativeSubstitution,
  interceptNativeTransitions,
} from './native-player';

import type { MusicState, SearchResultItem } from './youtube-music';
import type { PlaylistCatalogAdapter } from './youtube-music-playlist';
import type { MusicPlayer } from '@/types/music-player';

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
  const seen = new Set<string>();
  return items.filter((item) => {
    if (item.kind !== 'song' || !item.videoId || seen.has(item.videoId))
      return false;
    seen.add(item.videoId);
    return true;
  });
};

export const installPlaybackContext = (
  engine: PlaylistCatalogAdapter,
): PlaybackContextAdapter => {
  const original = {
    open: engine.openSearchResult.bind(engine),
    next: engine.next.bind(engine),
    previous: engine.previous.bind(engine),
    seek: engine.seek.bind(engine),
    shuffle: engine.toggleShuffle.bind(engine),
    repeat: engine.cycleRepeat.bind(engine),
    queue: engine.openQueue.bind(engine),
    state: engine.getState.bind(engine),
    subscribe: engine.subscribe.bind(engine),
    dispose: engine.dispose.bind(engine),
  };
  const api = () =>
    document.querySelector<HTMLElement & MusicPlayer>('#movie_player');
  let context: PlaybackContext | null = null;
  let epoch = 0;
  let revision = 0;
  let pending = false;
  let advancing = false;
  let ended = false;
  let disposed = false;
  let recovering = false;
  let acceptedId = '';
  let visible = original.state();
  const history: number[] = [];
  const shuffleBag = new Set<string>();
  const extensions = new Map<string, Promise<number>>();
  const contextListeners = new Set<(context: PlaybackContext | null) => void>();
  const stateListeners = new Set<(state: MusicState) => void>();
  let savedNative: {
    autoplay: unknown;
    repeatMode: unknown;
    shuffleEnabled: unknown;
  } | null = null;

  const nativeTransitions = interceptNativeTransitions(() => {
    engine.refresh();
    if (
      !pending &&
      context &&
      original.state().track.id === acceptedId &&
      visible.time >= visible.duration - 0.5
    )
      advance(true);
  });
  const ownNative = () => {
    nativeTransitions.install();
    const store = nativeStore();
    const queue = store?.getState().queue;
    if (queue && !savedNative)
      savedNative = {
        autoplay: queue.autoplay,
        repeatMode: queue.repeatMode,
        shuffleEnabled: queue.shuffleEnabled,
      };
    for (const [key, type, value] of [
      ['autoplay', 'SET_AUTOPLAY_ENABLED', false],
      ['repeatMode', 'SET_REPEAT', 'NONE'],
      ['shuffleEnabled', 'SET_SHUFFLE_ENABLED', false],
    ] as const) {
      if (queue && queue[key] !== value)
        store?.dispatch({ type, payload: value });
    }
    try {
      api()?.setAutonav?.(false);
    } catch {
      /* guarded by ended capture too */
    }
  };
  const releaseNative = () => {
    nativeTransitions.dispose();
    const store = nativeStore();
    if (savedNative) {
      for (const [key, type] of [
        ['autoplay', 'SET_AUTOPLAY_ENABLED'],
        ['repeatMode', 'SET_REPEAT'],
        ['shuffleEnabled', 'SET_SHUFFLE_ENABLED'],
      ] as const)
        if (savedNative[key] !== undefined)
          store?.dispatch({ type, payload: savedNative[key] });
    }
    try {
      api()?.setAutonav?.(savedNative?.autoplay ?? true);
    } catch {
      /* player detached */
    }
    savedNative = null;
  };
  let queueItems: PlaybackContext['items'] | null = null;
  let queueIndex = -1;
  let queueSnapshot: MusicState['queue'] = [];
  const contextQueue = (): MusicState['queue'] => {
    if (!context) return [];
    if (queueItems !== context.items || queueIndex !== context.index) {
      queueItems = context.items;
      queueIndex = context.index;
      queueSnapshot = context.items.map((item, index) => ({
        id: item.videoId!, title: item.title, selected: index === context!.index,
      }));
    }
    return queueSnapshot;
  };
  const state = (): MusicState =>
    context
      ? {
          ...visible,
          shuffle: context.shuffle,
          repeat: context.repeat,
          queueActive: context.queueOpen,
          queue: contextQueue(),
        }
      : original.state();
  const notify = () => {
    const snapshot = state();
    for (const listener of stateListeners) listener(snapshot);
  };
  const emit = () => {
    for (const listener of contextListeners) listener(context);
    notify();
  };
  const clear = () => {
    epoch++;
    revision++;
    context = null;
    queueItems = null;
    queueSnapshot = [];
    pending = advancing = ended = recovering = false;
    extensions.clear();
    history.length = 0;
    shuffleBag.clear();
    acceptedId = '';
    releaseNative();
    emit();
  };
  const extend = (seed: string): Promise<number> => {
    if (!context || !seed) return Promise.resolve(0);
    const existing = extensions.get(seed);
    if (existing) return existing;
    const token = epoch;
    const request = engine
      .getAutoplayItems(seed)
      .then((items) => {
        if (!context || token !== epoch || disposed) return 0;
        const known = new Set(context.items.map((item) => item.videoId));
        const additions = playableItems(items).filter(
          (item) => !known.has(item.videoId),
        );
        if (additions.length) {
          context = { ...context, items: [...context.items, ...additions] };
          emit();
        }
        // Keep completed empty responses cached so refresh cannot start a request storm.

        return additions.length;
      })
      .catch((error) => {
        if (token === epoch) extensions.delete(seed);
        console.warn('[143 Music] Could not extend autoplay queue', error);
        return 0;
      });
    extensions.set(seed, request);
    return request;
  };
  const ensureTail = () => {
    if (
      context &&
      context.repeat === 0 &&
      context.items.length - context.index <= 6
    )
      extend(context.items.at(-1)?.videoId ?? '');
  };
  const load = (index: number, record = true) => {
    if (!context || !context.items[index]?.videoId) return false;
    const before = context;
    const item = before.items[index];
    const previousVisible = visible;
    revision++;
    pending = true;
    ended = false;
    recovering = false;
    acceptedId = '';
    context = { ...before, index };
    visible = {
      ...visible,
      track: {
        id: item.videoId!,
        title: item.title,
        byline: item.subtitle,
        artwork: item.artwork,
        artists: [],
      },
      duration: 0,
      time: 0,
      lyricsAvailable: false,
    };
    ownNative();
    api()?.clearQueue?.();
    emit();
    let opened = false;
    try {
      opened = original.open(item);
    } catch (error) {
      console.warn('[143 Music] Could not load track', error);
    }
    if (!opened) {
      context = before;
      visible = previousVisible;
      pending = false;
      emit();
      return false;
    }
    if (record && before.index !== index) history.push(before.index);
    shuffleBag.add(item.videoId!);
    ensureTail();
    return true;
  };
  const chooseShuffle = () => {
    if (!context) return -1;
    let choices = context.items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !shuffleBag.has(item.videoId!));
    if (!choices.length && context.repeat === 1) {
      shuffleBag.clear();
      shuffleBag.add(context.items[context.index].videoId!);
      choices = context.items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => !shuffleBag.has(item.videoId!));
      if (!choices.length) return context.index;
    }
    return choices.length
      ? choices[Math.floor(Math.random() * choices.length)].index
      : -1;
  };
  const advance = async (automatic: boolean) => {
    if (!context || disposed || pending || advancing || (automatic && ended))
      return;
    advancing = true;
    ended = true;
    const token = epoch,
      turn = revision;
    try {
      if (automatic && context.repeat === 2) {
        load(context.index, false);
        return;
      }
      let next = context.shuffle ? chooseShuffle() : context.index + 1;
      if (next >= 0 && next < context.items.length) {
        load(next);
        return;
      }
      if (context.repeat === 1) {
        load(0);
        return;
      }
      if (context.repeat === 0) {
        await extend(context.items.at(-1)?.videoId ?? '');
        if (!context || epoch !== token || revision !== turn) return;
        next = context.shuffle ? chooseShuffle() : context.index + 1;
        if (next >= 0 && next < context.items.length) {
          load(next);
          return;
        }
      }
      if (automatic) api()?.pauseVideo?.();
    } finally {
      if (epoch === token) advancing = false;
    }
  };
  const unsubscribe = original.subscribe((base) => {
    if (!context) {
      visible = base;
      notify();
      return;
    }
    ownNative();
    const expected = context.items[context.index]?.videoId;
    const id = base.track.id;
    if (!id || !expected) return;
    const matches = id === expected || isNativeSubstitution(expected, id);
    if (!matches) {
      // No timer-based adoption: only a native wrapper explicitly pairing the IDs
      // can establish an audio/video substitution. Keep the same queue position.
      if (!pending && !recovering) {
        recovering = true;
        pending = true;
        original.open(context.items[context.index]);
      }
      return;
    }
    // Metadata acknowledgement includes a duration tied to this video. Until then
    // no seek/ended event is allowed to operate on the previous decoder state.
    if (base.duration <= 0) return;
    pending = false;
    recovering = false;
    acceptedId = id;
    visible = base;
    notify();
    ensureTail();
  });
  const onEnded = (event: Event) => {
    if (!context) return;
    const video =
      api()?.querySelector('video') ?? document.querySelector('video');
    if (!video || event.target !== video) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (pending || original.state().track.id !== acceptedId) return;
    if (visible.time < visible.duration - 0.5 && !video.ended) return;
    advance(true);
  };
  // Window capture precedes the document/media listeners installed by YTM.
  window.addEventListener('ended', onEnded, true);
  return Object.assign(engine, {
    playContext(
      items: readonly SearchResultItem[],
      startIndex: number,
      source: PlaybackContextSource,
      options: Readonly<{ shuffle?: boolean }> = {},
    ) {
      if (!nativeTransitions.install()) {
        console.warn('[143 Music] Native playback controller is not ready');
        return false;
      }
      const list = playableItems(items);
      if (!list.length) {
        if (!context) nativeTransitions.dispose();
        return false;
      }
      epoch++;
      revision++;
      extensions.clear();
      history.length = 0;
      shuffleBag.clear();
      advancing = false;
      const index = Math.max(
        0,
        list.findIndex((item) => item.videoId === items[startIndex]?.videoId),
      );
      context = {
        source,
        items: list,
        index,
        shuffle: options.shuffle ?? false,
        repeat: context?.repeat ?? original.state().repeat ?? 0,
        queueOpen: context?.queueOpen ?? false,
      };
      return load(index, false);
    },
    playContextIndex: (index: number) => load(index),
    getPlaybackContext: () => context,
    subscribePlaybackContext(
      listener: (value: PlaybackContext | null) => void,
    ) {
      contextListeners.add(listener);
      listener(context);
      return () => {
        contextListeners.delete(listener);
      };
    },
    closeContextQueue() {
      if (context) {
        context = { ...context, queueOpen: false };
        emit();
      }
    },
    clearPlaybackContext: clear,
    getState: state,
    subscribe(listener: (value: MusicState) => void) {
      stateListeners.add(listener);
      listener(state());
      return () => {
        stateListeners.delete(listener);
      };
    },
    openSearchResult(item: SearchResultItem) {
      clear();
      return original.open(item);
    },
    next() {
      if (context) advance(false);
      else original.next();
    },
    previous() {
      if (!context) {
        original.previous();
        return;
      }
      if (pending || advancing) return;
      if (visible.time > 3) {
        original.seek(0);
        ended = false;
        return;
      }
      const index = context.shuffle ? history.pop() : context.index - 1;
      if (index !== undefined && index >= 0) load(index, false);
      else if (context.repeat === 1) load(context.items.length - 1, false);
      else original.seek(0);
    },
    seek(seconds: number) {
      if (!Number.isFinite(seconds)) return;
      if (!context) {
        original.seek(seconds);
        return;
      }
      if (
        pending ||
        advancing ||
        visible.duration <= 0 ||
        original.state().track.id !== acceptedId
      )
        return;
      const target = Math.max(0, seconds);
      if (target >= visible.duration - 0.25) {
        advance(true);
        return;
      }
      ended = false;
      original.seek(target);
    },
    toggleShuffle() {
      if (!context) {
        original.shuffle();
        return;
      }
      shuffleBag.clear();
      shuffleBag.add(context.items[context.index].videoId!);
      context = { ...context, shuffle: !context.shuffle };
      emit();
    },
    cycleRepeat() {
      if (!context) {
        original.repeat();
        return;
      }
      context = { ...context, repeat: ((context.repeat + 1) % 3) as 0 | 1 | 2 };
      emit();
    },
    openQueue() {
      if (context) {
        context = { ...context, queueOpen: !context.queueOpen };
        emit();
      } else original.queue();
    },
    dispose() {
      disposed = true;
      unsubscribe();
      window.removeEventListener('ended', onEnded, true);
      clear();
      contextListeners.clear();
      stateListeners.clear();
      original.dispose();
    },
  });
};
