import ui from '@/plugins/143-ui';
import audio from '@/plugins/force-high-audio-quality';

import type { PluginDef } from '@/types/plugins';

export const coreFeatures: Record<
  string,
  PluginDef<unknown, unknown, unknown>
> = {
  '143-ui': ui,
  'force-high-audio-quality': audio,
};

export type CoreFeatureId = keyof typeof coreFeatures;
