import ui from '@/features/143-ui/backend-feature';
import autoUpdater from '@/features/auto-updater';
import audio from '@/features/force-high-audio-quality';
import homePage from '@/features/home-page';
import nowPlaying from '@/features/now-playing';
import obsOverlay from '@/features/obs-overlay';
import offlineLibrary from '@/features/offline-library';
import playerTools from '@/features/player-tools';
import shellControls from '@/features/shell-controls';

import type { FeatureDef } from '@/types/features';

type CoreFeature = FeatureDef<unknown, unknown, unknown>;
const asCoreFeature = (feature: unknown): CoreFeature => feature as CoreFeature;

export const mainCoreFeatures: Record<string, CoreFeature> = {
  '143-ui': asCoreFeature(ui),
  'auto-updater': asCoreFeature(autoUpdater),
  'shell-controls': asCoreFeature(shellControls),
  'force-high-audio-quality': asCoreFeature(audio),
  'home-page': asCoreFeature(homePage),
  'now-playing': asCoreFeature(nowPlaying),
  'obs-overlay': asCoreFeature(obsOverlay),
  'offline-library': asCoreFeature(offlineLibrary),
  'player-tools': asCoreFeature(playerTools),
};
