import ui from '@/features/143-ui/backend-feature';
import autoUpdater from '@/features/auto-updater';
import startupPlaybackSafety from '@/features/startup-playback-safety';
import audio from '@/features/force-high-audio-quality';
import obsOverlay from '@/features/obs-overlay';
import offlineLibrary from '@/features/offline-library';

import type { FeatureDef } from '@/types/features';

type CoreFeature = FeatureDef<unknown, unknown, unknown>;
const asCoreFeature = (feature: unknown): CoreFeature => feature as CoreFeature;

const rendererOnlyFeature = (
  name: string,
  description: string,
): CoreFeature =>
  asCoreFeature({
    name: () => name,
    description: () => description,
    config: { enabled: true },
  });

export const mainCoreFeatures: Record<string, CoreFeature> = {
  '143-ui': asCoreFeature(ui),
  'startup-playback-safety': asCoreFeature(startupPlaybackSafety),
  'auto-updater': asCoreFeature(autoUpdater),
  'shell-controls': rendererOnlyFeature(
    'Shell Controls',
    'Top-bar account control and small stability polish for the 143 Music shell.',
  ),
  'auth-session': rendererOnlyFeature(
    'Auth Session',
    'Keeps the 143 Music login gate in sync with the authenticated YouTube session.',
  ),
  'force-high-audio-quality': asCoreFeature(audio),
  'home-page': rendererOnlyFeature(
    '143 Music Home',
    'Renders the personalized YouTube Music Home feed in the 143 UI.',
  ),
  'now-playing': rendererOnlyFeature(
    '143 Now Playing',
    'Custom album, lyrics and playlist listening view for 143 Music.',
  ),
  'obs-overlay': asCoreFeature(obsOverlay),
  'offline-library': asCoreFeature(offlineLibrary),
  'player-tools': rendererOnlyFeature(
    'Player Tools',
    'Small quality-of-life controls for the 143 Music player.',
  ),
};
