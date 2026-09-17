import { mountDiscordSettingsControls } from './discord-settings';
import { mountSettingsPolish } from './settings-polish';

import type { DiscordPresenceTrack } from './discord-rich-presence';
import type { PlaybackContextAdapter } from './playback-context';
import type { MusicState } from './youtube-music';
import type { RendererContext } from '@/types/contexts';
import type { FeatureConfig } from '@/types/features';

const HEARTBEAT_MS = 30_000;
const SEEK_TOLERANCE_SECONDS = 3;

const artistText = (state: MusicState) =>
  state.track.artists
    .map((artist) => artist.name.trim())
    .filter(Boolean)
    .join(', ') ||
  state.track.byline.split(' • ')[0]?.trim() ||
  'YouTube Music';

const snapshot = (state: MusicState): DiscordPresenceTrack => ({
  id: state.track.id,
  title: state.track.title,
  artist: artistText(state),
  artwork: state.track.artwork,
  playing: state.playing,
  elapsed: state.time,
  duration: state.duration,
});

const metadataChanged = (
  before: DiscordPresenceTrack,
  after: DiscordPresenceTrack,
) =>
  before.id !== after.id ||
  before.title !== after.title ||
  before.artist !== after.artist ||
  before.artwork !== after.artwork ||
  before.duration !== after.duration;

export const mountDiscordPresenceBridge = (
  engine: PlaybackContextAdapter,
  ipc: RendererContext<FeatureConfig>['ipc'],
) => {
  let previous: { track: DiscordPresenceTrack; at: number } | null = null;
  let lastSentAt = 0;
  let disposed = false;
  const unmountSettingsPolish = mountSettingsPolish();
  const unmountSettingsControls = mountDiscordSettingsControls(ipc);

  const send = (track: DiscordPresenceTrack, now: number) => {
    lastSentAt = now;
    void ipc.invoke('143:discord:update', track).catch((error) => {
      if (!disposed)
        console.warn('[143 Music] Could not update Discord presence', error);
    });
  };

  const unsubscribe = engine.subscribe((state) => {
    if (disposed) return;
    const now = Date.now();
    const track = snapshot(state);
    const before = previous;

    let seeked = false;
    if (before && before.track.id && before.track.id === track.id) {
      const elapsedSinceSnapshot = Math.max(0, (now - before.at) / 1000);
      const expected =
        before.track.elapsed + (before.track.playing ? elapsedSinceSnapshot : 0);
      seeked = Math.abs(track.elapsed - expected) > SEEK_TOLERANCE_SECONDS;
    }

    const shouldSend =
      !before ||
      metadataChanged(before.track, track) ||
      before.track.playing !== track.playing ||
      seeked ||
      now - lastSentAt >= HEARTBEAT_MS;

    previous = { track, at: now };
    if (shouldSend) send(track, now);
  });

  return () => {
    disposed = true;
    unmountSettingsControls();
    unmountSettingsPolish();
    unsubscribe();
  };
};
