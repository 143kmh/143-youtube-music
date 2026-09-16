import { createRenderer } from '@/utils';

import type { MusicPlayer } from '@/types/music-player';

const TICK_MS = 100;

type StartupPlaybackSafetyState = {
  player: MusicPlayer | null;
  timer: number | null;
  userArmed: boolean;
  released: boolean;
  mutedBySafety: boolean;
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
  released: false,
  mutedBySafety: false,
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
      if (!player.isMuted()) {
        player.mute();
        this.mutedBySafety = true;
      }
      return;
    }

    if (!playing) return;

    // Anything that starts before the user has interacted with the app is
    // autoplay. Pause it, but never globally mute Electron or the player.
    if (!this.userArmed) {
      player.pauseVideo();
      return;
    }

    this.released = true;
    if (this.mutedBySafety && player.isMuted()) player.unMute();
    this.mutedBySafety = false;

    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  },

  start() {
    this.userArmed = false;
    this.released = false;
    this.mutedBySafety = false;

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
    this.mutedBySafety = false;

    // Start paused, but do not mute. Muting the whole release build (or even the
    // player here) can strand fresh profiles in a permanently silent state.
    playerApi.pauseVideo();
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
    if (this.mutedBySafety && this.player?.isMuted()) this.player.unMute();
    this.player = null;
    this.userArmed = false;
    this.released = false;
    this.mutedBySafety = false;
  },
});
