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

const text = (selector: string) =>
  document.querySelector<HTMLElement>(selector)?.textContent?.trim() ?? '';

const httpsArtwork = (value: string | null | undefined) => {
  const source = value?.trim() ?? '';
  return /^https:\/\//iu.test(source) ? source : '';
};

const imageSource = (image: HTMLImageElement | null) =>
  httpsArtwork(image?.currentSrc) ||
  httpsArtwork(image?.src) ||
  httpsArtwork(image?.getAttribute('src'));

const artworkFrom143Ui = () =>
  imageSource(document.querySelector<HTMLImageElement>('.ui143-player-art'));

const artworkFromNativeUi = () => {
  const selectors = [
    'ytmusic-player-bar #song-image img',
    'ytmusic-player-bar yt-img-shadow img',
    'ytmusic-player-bar .thumbnail-image',
    'ytmusic-player-bar img[src]',
  ];

  for (const selector of selectors) {
    const source = imageSource(document.querySelector<HTMLImageElement>(selector));
    if (source) return source;
  }
  return '';
};

const artworkFromVideoId = (videoId: string) =>
  /^[\w-]{6,32}$/u.test(videoId)
    ? `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`
    : '';

const parseClock = (value: string) => {
  const parts = value
    .trim()
    .split(':')
    .map((part) => Number(part));
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
};

const uiTimes = () => {
  const values = [...document.querySelectorAll<HTMLElement>('.ui143-player-time')]
    .map((element) => parseClock(element.textContent ?? ''));
  return {
    time: values[0] ?? 0,
    duration: values.at(-1) ?? 0,
  };
};

export default createRenderer<ObsOverlayRendererState>({
  player: null,
  ipc: null,
  timer: null,

  publish() {
    if (!this.ipc) return;

    // YouTube exposes slightly different player objects across accounts and
    // experiments. Never make the whole OBS state depend on one private method.
    // The 143 player DOM is a stable fallback and is enough to keep the overlay
    // useful even when getPlayerResponse/onPlayerApiReady differs for a profile.
    const domPlayer = document.querySelector<HTMLElement & MusicPlayer>('#movie_player');
    const player = (this.player ?? domPlayer) as Partial<MusicPlayer> | null;

    let response: ReturnType<MusicPlayer['getPlayerResponse']> | null = null;
    let videoData: ReturnType<MusicPlayer['getVideoData']> | null = null;
    let playerState: number | null = null;
    let time = 0;
    let duration = 0;

    try {
      response = player?.getPlayerResponse?.() ?? null;
    } catch {
      // Some account/player variants do not expose this private API.
    }
    try {
      videoData = player?.getVideoData?.() ?? null;
    } catch {
      // Fall back to the 143 player DOM below.
    }
    try {
      playerState = player?.getPlayerState?.() ?? null;
    } catch {
      // Fall back to the 143 play/pause control below.
    }
    try {
      time = Math.max(0, player?.getCurrentTime?.() || 0);
    } catch {
      // Fall back to rendered time below.
    }
    try {
      duration = Math.max(0, player?.getDuration?.() || 0);
    } catch {
      // Fall back to rendered duration below.
    }

    const details = response?.videoDetails;
    const thumbnails = details?.thumbnail?.thumbnails ?? [];
    const domTitle = text('.ui143-player-title');
    const domArtist = text('.ui143-player-artist');
    const title = details?.title ?? videoData?.title ?? domTitle;
    const artist = details?.author ?? videoData?.author ?? domArtist;
    const rawVideoId = details?.videoId ?? videoData?.video_id ?? '';
    const artwork =
      httpsArtwork(thumbnails.at(-1)?.url) ||
      artworkFromNativeUi() ||
      artworkFrom143Ui() ||
      artworkFromVideoId(rawVideoId);
    const times = uiTimes();

    if (!time) time = times.time;
    if (!duration) duration = times.duration;

    const id = rawVideoId || (title ? `ui:${title}\u0000${artist}` : '');
    const playing =
      playerState === 1 ||
      (playerState == null &&
        document.querySelector('#ui143-player button[aria-label="Pause"]') !== null);

    const state: ObsOverlayState = {
      id,
      title,
      artist,
      album: details?.album ?? '',
      artwork,
      playing,
      time,
      duration,
      updatedAt: Date.now(),
    };

    void this.ipc.invoke('obs-overlay:update', state).catch(() => {
      // The backend may already be stopping.
    });
  },

  start({ ipc }) {
    this.ipc = ipc;
    this.publish();
    if (this.timer !== null) window.clearInterval(this.timer);
    // Start publishing regardless of whether YouTube calls onPlayerApiReady.
    // This also survives account switches that replace the underlying player.
    this.timer = window.setInterval(() => this.publish(), 1000);
  },

  onPlayerApiReady(player) {
    this.player = player;
    this.publish();
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
