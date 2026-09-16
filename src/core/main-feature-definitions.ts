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

export const mainCoreFeatures: Record<
  string,
  FeatureDef<unknown, unknown, unknown>
> = {
  '143-ui': ui,
  'auto-updater': autoUpdater,
  'shell-controls': shellControls,
  'force-high-audio-quality': audio,
  'home-page': homePage,
  'now-playing': nowPlaying,
  'obs-overlay': obsOverlay,
  'offline-library': offlineLibrary,
  'player-tools': playerTools,
};
