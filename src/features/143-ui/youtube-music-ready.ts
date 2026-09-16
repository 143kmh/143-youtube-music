import type { MusicPlayerAppElement } from '@/types/music-player-app-element';

const LIBRARY_PROBE_BROWSE_ID = 'FEmusic_library_landing';

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
  const response = await app.networkManager.fetch<unknown, { browseId: string }>(
    '/browse',
    { browseId: LIBRARY_PROBE_BROWSE_ID },
  );

  return typeof response === 'object' && response !== null;
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
        // During startup Polymer can expose networkManager before /browse is usable.
      }
    }

    await sleep(intervalMs);
  }

  return false;
};
