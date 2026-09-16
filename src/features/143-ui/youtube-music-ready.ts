import type { MusicPlayerAppElement } from '@/types/music-player-app-element';

const LIBRARY_PROBE_BROWSE_IDS = [
  'FEmusic_liked_playlists',
  'VLLM',
] as const;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

let readyApp: MusicPlayerAppElement | null = null;
let browseReady = false;

const isStructurallyReady = (app: MusicPlayerAppElement | null) =>
  Boolean(
    app?.networkManager?.fetch &&
      typeof app.navigate === 'function' &&
      document.querySelector('ytmusic-app-layout'),
  );

const probeBrowseApi = async (app: MusicPlayerAppElement) => {
  const responses = await Promise.all(
    LIBRARY_PROBE_BROWSE_IDS.map((browseId) =>
      app.networkManager.fetch<unknown, { browseId: string }>('/browse', {
        browseId,
      }),
    ),
  );

  return responses.every(
    (response) => typeof response === 'object' && response !== null,
  );
};

export const waitForYouTubeMusicReady = async (
  timeoutMs = 8000,
  intervalMs = 150,
) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const app = document.querySelector<MusicPlayerAppElement>('ytmusic-app');

    if (app !== readyApp) {
      readyApp = app;
      browseReady = false;
    }

    if (app && isStructurallyReady(app)) {
      if (browseReady) return true;

      try {
        if (await probeBrowseApi(app)) {
          browseReady = true;
          return true;
        }
      } catch {
        // Polymer can expose networkManager before authenticated /browse calls work.
      }
    }

    await sleep(intervalMs);
  }

  return false;
};
