import type { MusicPlayerAppElement } from '@/types/music-player-app-element';

const sleep = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export const waitForYouTubeMusicReady = async (
  timeoutMs = 5000,
  intervalMs = 50,
) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const app = document.querySelector<MusicPlayerAppElement>('ytmusic-app');
    if (app?.networkManager?.fetch) return true;
    await sleep(intervalMs);
  }
  return false;
};
