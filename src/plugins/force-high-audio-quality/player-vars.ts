// These are native player-vars entry points, not media download requests.
const methods = [
  'loadVideoByPlayerVars',
  'cueVideoByPlayerVars',
  'preloadVideoByPlayerVars',
  'enqueueVideoByPlayerVars',
] as const;

type PlayerVarsMethod = (vars: unknown, ...args: unknown[]) => unknown;
export type PlayerVarsApi = Partial<
  Record<(typeof methods)[number], PlayerVarsMethod>
>;

export type MusicPlayerHost = {
  playerApi?: PlayerVarsApi;
  polymerController?: { playerApi?: PlayerVarsApi };
  inst?: { playerApi?: PlayerVarsApi };
};

// Music's PlayerProxy captures references to the original #movie_player methods
// before Pear's onPlayerApiReady runs. Patch the shared proxy used by Music's
// controller instead. Reading the component instance doesn't modify its DOM.
export const findMusicPlayerProxy = (
  host: MusicPlayerHost | null,
): PlayerVarsApi | null => {
  for (const api of [
    host?.polymerController?.playerApi,
    host?.inst?.playerApi,
    host?.playerApi,
  ]) {
    if (typeof api?.loadVideoByPlayerVars === 'function') return api;
  }
  return null;
};

export const interceptPlayerVars = (
  api: PlayerVarsApi,
  shouldPreferHigh: () => boolean,
  onApplied: (incomingHigh: unknown) => void,
): (() => void) => {
  const restorers: (() => void)[] = [];
  for (const method of methods) {
    const original = api[method];
    const descriptor = Object.getOwnPropertyDescriptor(api, method);
    if (
      typeof original !== 'function' ||
      !descriptor?.configurable ||
      !descriptor.writable
    )
      continue;
    const wrapped: PlayerVarsMethod = function (this: unknown, vars, ...args) {
      let input = vars;
      if (
        shouldPreferHigh() &&
        vars &&
        typeof vars === 'object' &&
        !Array.isArray(vars)
      ) {
        input = { ...vars, aac_high: true, prefer_low_quality_audio: false };
        onApplied((vars as { aac_high?: unknown }).aac_high);
      }
      // Preserve receiver, extra arguments, return value and native exceptions.
      return Reflect.apply(original, this, [input, ...args]);
    };
    Object.defineProperty(api, method, { ...descriptor, value: wrapped });
    restorers.push(() => {
      if (api[method] === wrapped)
        Object.defineProperty(api, method, descriptor);
    });
  }
  return () => restorers.reverse().forEach((restore) => restore());
};
