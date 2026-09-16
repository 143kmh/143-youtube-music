import ui from '@/features/143-ui';
import audio from '@/features/force-high-audio-quality';
import homePage from '@/features/home-page';
import nowPlaying from '@/features/now-playing';
import obsOverlay from '@/features/obs-overlay';
import playerTools from '@/features/player-tools';

import type { FeatureDef } from '@/types/features';

export const coreFeatures: Record<
  string,
  FeatureDef<unknown, unknown, unknown>
> = {
  '143-ui': ui,
  'force-high-audio-quality': audio,
  'home-page': homePage,
  'now-playing': nowPlaying,
  'obs-overlay': obsOverlay,
  'player-tools': playerTools,
};

export type CoreFeatureId = keyof typeof coreFeatures;
