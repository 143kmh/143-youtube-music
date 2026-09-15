export type QualityConfig = {
  enabled: boolean;
  quality: 'default' | 'maximum' | 'opus';
};

export type MusicConfig = Record<string, unknown>;

// This is the same runtime preference read by YouTube Music when constructing
// load/cue/preload player vars. It preserves the native IS_SUBSCRIBER gate.
// See README.md for the inspected upstream code and verification procedure.
export const overrideAudioQuality = (
  config: MusicConfig,
): (() => void) | null => {
  const key = 'AUDIO_QUALITY';
  const descriptor = Object.getOwnPropertyDescriptor(config, key);
  const value: unknown = descriptor?.value;
  // Fail open if YouTube changes this contract; do not replace foreign accessors.
  if (
    !descriptor?.configurable ||
    !descriptor.writable ||
    !('value' in descriptor) ||
    typeof value !== 'string' ||
    ![
      'AUDIO_QUALITY_LOW',
      'AUDIO_QUALITY_MEDIUM',
      'AUDIO_QUALITY_HIGH',
    ].includes(value)
  ) {
    return null;
  }

  let underlying: unknown = descriptor.value;
  const get = () => 'AUDIO_QUALITY_HIGH';
  Object.defineProperty(config, key, {
    configurable: true,
    enumerable: descriptor.enumerable,
    get,
    set(value: unknown) {
      // Retain changes from YouTube's settings while the override is active.
      underlying = value;
    },
  });

  return () => {
    if (Object.getOwnPropertyDescriptor(config, key)?.get === get) {
      Object.defineProperty(config, key, { ...descriptor, value: underlying });
    }
  };
};
