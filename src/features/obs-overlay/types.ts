export type ObsOverlayState = Readonly<{
  id: string;
  title: string;
  artist: string;
  album: string;
  artwork: string;
  playing: boolean;
  time: number;
  duration: number;
  updatedAt: number;
}>;
