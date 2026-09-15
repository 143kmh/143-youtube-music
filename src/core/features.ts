import ui from '@/features/143-ui';
import audio from '@/features/force-high-audio-quality';

import type { FeatureDef } from '@/types/features';

export const coreFeatures: Record<
  string,
  FeatureDef<unknown, unknown, unknown>
> = {
  '143-ui': ui,
  'force-high-audio-quality': audio,
};

export type CoreFeatureId = keyof typeof coreFeatures;
