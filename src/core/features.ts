import ui from '@/features/143-ui';
import autoUpdater from '@/features/auto-updater';
import releasePolish from '@/features/release-polish';
import shellControls from '@/features/shell-controls';
import startupPlaybackSafety from '@/features/startup-playback-safety';
import audio from '@/features/force-high-audio-quality';
import homePage from '@/features/home-page';
import nowPlaying from '@/features/now-playing';
import nowPlayingLyricsPolish from '@/features/now-playing-lyrics-polish';
import obsOverlay from '@/features/obs-overlay';
import playerTools from '@/features/player-tools';

import type { FeatureDef } from '@/types/features';

type CoreFeature = FeatureDef<unknown, unknown, unknown>;
const asCoreFeature = (feature: unknown): CoreFeature => feature as CoreFeature;

export const coreFeatures: Record<string, CoreFeature> = {
  '143-ui': asCoreFeature(ui),
  'startup-playback-safety': asCoreFeature(startupPlaybackSafety),
  'auto-updater': asCoreFeature(autoUpdater),
  'release-polish': asCoreFeature(releasePolish),
  'shell-controls': asCoreFeature(shellControls),
  'force-high-audio-quality': asCoreFeature(audio),
  'home-page': asCoreFeature(homePage),
  'now-playing': asCoreFeature(nowPlaying),
  'now-playing-lyrics-polish': asCoreFeature(nowPlayingLyricsPolish),
  'obs-overlay': asCoreFeature(obsOverlay),
  'player-tools': asCoreFeature(playerTools),
};

export type CoreFeatureId = keyof typeof coreFeatures;
