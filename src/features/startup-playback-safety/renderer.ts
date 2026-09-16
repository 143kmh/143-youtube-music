import { createRenderer } from '@/utils';

import type { MusicPlayer } from '@/types/music-player';

const SAFE_NON_AD_MS = 900;
const TICK_MS = 100;

type StartupPlaybackSafetyState = {
  player: MusicPlayer | null;
  timer: number | null;
  userArmed: boolean;
  safePlayingSince: number;
  released: boolean;
  pointerHandler: ((event: PointerEvent) => void) | null;
  keyHandler: ((event: KeyboardEvent) => void) | null;
  tick: () => void;
  arm: () => void;
};

const isAdShowing = () => {
  const player = document.querySelector<HTMLElement>('#movie_player');
  return Boolean(
    player?.classList.contains('ad-showing') ||
      player?.classList.contains('ad-interrupting'),
  );
};

export default createRenderer<StartupPlaybackSafetyState>({
  player: null,
  timer: null,
  userArmed: false,
  safePlayingSince: 0,
  released: false,
  pointerHandler: null,
  keyHandler: null,

  arm() {
    this.userArmed = true;
  },

  tick() {
    const player = this.player;
    if (!player || this.released) return;

    const playing = player.getPlayerState() === 1;
    const ad = isAdShowing();

    if (ad) {
      this.safePlayingSince = 0;
      if (!player.isMuted()) player.mute();
      void window.ipcRenderer.invoke('startup-playback-safety:mute');
      return;
    }

    if (!playing) {
      this.safePlayingSince = 0;
      return;
    }

    // Anything that starts before the user has interacted with the app is
    // autoplay. Kill it instead of allowing YouTube to start a track or ad.
    if (!this.userArmed) {
      player.pauseVideo();
      if (!player.isMuted()) player.mute();
      void window.ipcRenderer.invoke('startup-playback-safety:mute');
      this.safePlayingSince = 0;
      return;
    }

    // Keep the first moment of user-started playback silent. This gives the
    // player enough time to mark an ad before any audio can escape.
    if (!this.safePlayingSince) this.safePlayingSince = performance.now();
    if (performance.now() - this.safePlayingSince < SAFE_NON_AD_MS) return;

    this.released = true;
    if (player.isMuted()) player.unMute();
    void window.ipcRenderer.invoke('startup-playback-safety:unmute');

    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  },

  start() {
    this.userArmed = false;
    this.safePlayingSince = 0;
    this.released = false;
    void window.ipcRenderer.invoke('startup-playback-safety:mute');

    this.pointerHandler = () => this.arm();
    this.keyHandler = (event) => {
      if (
        event.key === ' ' ||
        event.key === 'Enter' ||
        event.key === 'MediaPlayPause'
      )
        this.arm();
    };
    window.addEventListener('pointerdown', this.pointerHandler, true);
    window.addEventListener('keydown', this.keyHandler, true);

    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  },

  onPlayerApiReady(playerApi) {
    this.player = playerApi;
    this.released = false;
    this.safePlayingSince = 0;

    // Always start paused and silent. The old resume-on-start preference is not
    // allowed to make audio play automatically anymore.
    playerApi.mute();
    playerApi.pauseVideo();
    void window.ipcRenderer.invoke('startup-playback-safety:mute');
    this.tick();
  },

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    if (this.pointerHandler)
      window.removeEventListener('pointerdown', this.pointerHandler, true);
    if (this.keyHandler)
      window.removeEventListener('keydown', this.keyHandler, true);
    this.pointerHandler = null;
    this.keyHandler = null;
    this.player = null;
    this.userArmed = false;
    this.safePlayingSince = 0;
    this.released = false;
    void window.ipcRenderer.invoke('startup-playback-safety:unmute');
  },
});
