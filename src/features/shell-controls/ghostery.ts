import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ElectronBlocker } from '@ghostery/adblocker-electron';
import { net, type Session } from 'electron';

const DAY = 24 * 60 * 60 * 1000;

const downloadFilters = () => {
  // One deadline for all lists, resources and retries. A failed update must not
  // replace the working cache with an HTTP error page or stall startup forever.
  const signal = AbortSignal.timeout(12_000);
  return ElectronBlocker.fromPrebuiltAdsOnly(async (url) => {
    const response = await net.fetch(url, { signal });
    if (!response.ok)
      throw new Error(`Ghostery filters: HTTP ${response.status}`);
    return response;
  });
};

const installations = new WeakMap<
  Session,
  ReturnType<typeof initializeGhostery>
>();

export function installGhostery(
  session: Session,
  cachePath: string,
  download: () => Promise<ElectronBlocker> = downloadFilters,
) {
  const existing = installations.get(session);
  if (existing) return existing;
  const pending = initializeGhostery(session, cachePath, download);
  installations.set(session, pending);
  pending.catch(() => installations.delete(session));
  return pending;
}

async function initializeGhostery(
  session: Session,
  cachePath: string,
  download: () => Promise<ElectronBlocker> = downloadFilters,
) {
  let active = ElectronBlocker.parse('');
  let updatedAt = 0;
  let hasCache = false;
  let stopped = false;
  let updating: Promise<void> | undefined;
  try {
    const [bytes, info] = await Promise.all([
      readFile(cachePath),
      stat(cachePath),
    ]);
    active = ElectronBlocker.deserialize(bytes);
    updatedAt = info.mtimeMs;
    hasCache = true;
  } catch {
    // Missing, corrupt or incompatible cache: fetch a fresh engine below.
  }

  const refresh = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    if (updating) return updating;
    updating = (async () => {
      try {
        const next = await download();
        if (stopped) return;
        active = next;
        updatedAt = Date.now();
        await mkdir(path.dirname(cachePath), { recursive: true });
        const temporary = `${cachePath}.tmp`;
        await writeFile(temporary, next.serialize());
        await rename(temporary, cachePath);
      } catch (error) {
        console.warn(
          '[143 Music] Ghostery update failed; keeping current filters.',
          error,
        );
      }
    })().finally(() => {
      updating = undefined;
    });
    return updating;
  };

  if (!hasCache) await refresh();

  // Register once. Swapping the delegate updates rules without clearing other
  // webRequest listeners (CSP/audio handling) or duplicating preload/IPC hooks.
  const bridge = ElectronBlocker.parse('');
  bridge.onBeforeRequest = (...args) => active.onBeforeRequest(...args);
  bridge.onHeadersReceived = (...args) => active.onHeadersReceived(...args);
  bridge.onInjectCosmeticFilters = (event, ...args) =>
    event.sender.session === session
      ? active.onInjectCosmeticFilters(event, ...args)
      : Promise.resolve();
  bridge.onIsMutationObserverEnabled = (event) =>
    event.sender.session === session
      ? active.onIsMutationObserverEnabled(event)
      : Promise.resolve(false);
  bridge.enableBlockingInSession(session);

  if (hasCache && Date.now() - updatedAt >= DAY) refresh();
  const timer = setInterval(
    () => {
      if (Date.now() - updatedAt >= DAY) refresh();
    },
    60 * 60 * 1000,
  );
  timer.unref();

  return {
    refresh,
    // Session hooks live until application shutdown. Do not call Ghostery's
    // disableBlockingInSession: it clears unrelated webRequest listeners too.
    stopUpdates() {
      stopped = true;
      clearInterval(timer);
    },
  };
}
