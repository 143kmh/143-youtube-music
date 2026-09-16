import { createRenderer } from '@/utils';

import type { MusicPlayer } from '@/types/music-player';
import type { ObsOverlayState } from './types';

type RendererIpc = {
  invoke: (event: string, ...args: unknown[]) => Promise<unknown>;
};

type ObsOverlayRendererState = {
  player: MusicPlayer | null;
  ipc: RendererIpc | null;
  timer: number | null;
  publish: () => void;
};

const blankState = (): ObsOverlayState => ({
  id: '',
  title: '',
  artist: '',
  album: '',
  artwork: '',
  playing: false,
  time: 0,
  duration: 0,
  updatedAt: Date.now(),
});

export default createRenderer<ObsOverlayRendererState>({
  player: null,
  ipc: null,
  timer: null,

  publish() {
    if (!this.player || !this.ipc) return;

    try {
      const response = this.player.getPlayerResponse();
      const details = response?.videoDetails;
      const videoData = this.player.getVideoData();
      const thumbnails = details?.thumbnail?.thumbnails ?? [];
      const artwork = thumbnails.at(-1)?.url ?? '';
      const state: ObsOverlayState = {
        id: details?.videoId ?? videoData?.video_id ?? '',
        title: details?.title ?? videoData?.title ?? '',
        artist: details?.author ?? videoData?.author ?? '',
        album: details?.album ?? '',
        artwork,
        playing: this.player.getPlayerState() === 1,
        time: Math.max(0, this.player.getCurrentTime() || 0),
        duration: Math.max(0, this.player.getDuration() || 0),
        updatedAt: Date.now(),
      };

      void this.ipc.invoke('obs-overlay:update', state).catch(() => {
        // The backend may already be stopping.
      });
    } catch {
      void this.ipc.invoke('obs-overlay:update', blankState()).catch(() => {
        // Ignore transient player teardown/reload states.
      });
    }
  },

  start({ ipc }) {
    this.ipc = ipc;
  },

  onPlayerApiReady(player) {
    this.player = player;
    this.publish();
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.publish(), 1000);
  },

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    if (this.ipc) {
      void this.ipc.invoke('obs-overlay:update', blankState()).catch(() => {
        // The backend may already be stopping.
      });
    }
    this.player = null;
    this.ipc = null;
  },
});
