import { test, expect, _electron as electron } from '@playwright/test';
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { Window } from 'happy-dom';

import { createObsOverlayBackend } from '../src/features/obs-overlay/backend';
import renderer from '../src/features/obs-overlay/renderer';

const track = (id: string) => ({
  id,
  title: id,
  artist: 'Fixture artist',
  artwork: '',
  album: '',
  playing: true,
  time: 12,
  duration: 180,
  updatedAt: Date.now(),
  hideWhenPaused: true,
  useAccentColor: false,
  accent: '#60519B',
});

test('OBS recovers from occupied port, failed first request, unavailable SSE and app restart', async ({}, testInfo) => {
  test.setTimeout(45000);
  const blocker = createServer();
  await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
  const port = (blocker.address() as AddressInfo).port;
  const backend = createObsOverlayBackend(port);
  const handlers = new Map<string, (...args: any[]) => any>();
  const ctx = {
    ipc: {
      handle: (name: string, handler: (...args: any[]) => any) =>
        handlers.set(name, handler),
      removeHandler: (name: string) => handlers.delete(name),
    },
  } as any;
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    await backend.start!.call(backend, ctx);
    await expect.poll(() => backend.retryTimer !== null).toBe(true);
    expect(handlers.get('obs-overlay:get-url')!()).toBe(
      `http://127.0.0.1:${port}/overlay`,
    );
    handlers.get('obs-overlay:update')!(track('First track'));
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
    await expect
      .poll(() => backend.server?.listening, { timeout: 7000 })
      .toBe(true);

    const bootstrap = testInfo.outputPath('overlay.cjs');
    await writeFile(
      bootstrap,
      `const { app, BrowserWindow } = require('electron'); app.whenReady().then(() => { new BrowserWindow({ show: false, width: 720, height: 220, webPreferences: { backgroundThrottling: false } }).loadURL('about:blank'); });`,
    );
    app = await electron.launch({
      args: [bootstrap, '--no-sandbox'],
      env: { ...process.env, NODE_OPTIONS: '' },
    });
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/events', (route) => route.abort());
    let failFirstState = true;
    await page.route('**/state', (route) => {
      if (failFirstState) {
        failFirstState = false;
        return route.abort();
      }
      return route.continue();
    });
    await page.goto(backend.url);
    await expect(page.locator('#title')).toHaveText('First track', {
      timeout: 8000,
    });
    await expect(page.locator('body')).toHaveClass(/is-visible/);
    handlers.get('obs-overlay:update')!(track('Second track'));
    await expect(page.locator('#title')).toHaveText('Second track', {
      timeout: 8000,
    });

    await backend.stop!.call(backend, ctx);
    await backend.start!.call(backend, ctx);
    handlers.get('obs-overlay:update')!(track('After restart'));
    await expect(page.locator('#title')).toHaveText('After restart', {
      timeout: 8000,
    });
    expect(page.url()).toBe(backend.url);
    expect(errors).toEqual([]);
    await page.clock.install();
    await page.clock.fastForward(16000);
    await expect(page.locator('body')).not.toHaveClass(/is-visible/);
  } finally {
    await app?.close();
    await backend.stop!.call(backend, ctx);
    if (blocker.listening)
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
  }
});

test('OBS stop cancels port retries and releases open event streams', async () => {
  const blocker = createServer();
  await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
  const port = (blocker.address() as AddressInfo).port;
  const backend = createObsOverlayBackend(port);
  const ctx = { ipc: { handle() {}, removeHandler() {} } } as any;
  try {
    await backend.start!.call(backend, ctx);
    await expect.poll(() => backend.retryTimer !== null).toBe(true);
    await backend.stop!.call(backend, ctx);
    expect(backend.retryTimer).toBeNull();
    expect(backend.running).toBe(false);
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
    await backend.start!.call(backend, ctx);
    await expect.poll(() => backend.server?.listening).toBe(true);
    const stream = await fetch(`http://127.0.0.1:${port}/events`);
    const reader = stream.body!.getReader();
    expect((await reader.read()).done).toBe(false);
    await backend.stop!.call(backend, ctx);
    expect(backend.clients.size).toBe(0);
    await reader.cancel().catch(() => {});
  } finally {
    await backend.stop!.call(backend, ctx);
    if (blocker.listening)
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
  }
});

test('OBS follows a replaced player and rejects previous track metadata', async () => {
  const dom = new Window();
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const key of ['window', 'document']) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: key === 'window' ? dom : dom.document,
    });
  }
  try {
    document.body.innerHTML =
      '<div id="movie_player"></div><span class="ui143-player-time">1:15</span>';
    const player = document.querySelector('#movie_player') as any;
    player.getVideoData = () => ({
      video_id: 'new',
      title: 'New track',
      author: 'New artist',
    });
    player.getPlayerResponse = () => ({
      videoDetails: {
        videoId: 'old',
        title: 'Old track',
        author: 'Old artist',
      },
    });
    player.getPlayerState = () => 1;
    player.getCurrentTime = () => 0;
    player.getDuration = () => 180;
    renderer.player = {
      getVideoData: () => ({ video_id: 'old' }),
      getPlayerState: () => 2,
    } as any;
    const sent: any[] = [];
    renderer.ipc = {
      invoke: async (_event, state) => {
        sent.push(state);
      },
    };
    renderer.publish();
    expect(sent[0]).toMatchObject({
      id: 'new',
      title: 'New track',
      artist: 'New artist',
      playing: true,
      time: 0,
    });
  } finally {
    renderer.player = null;
    renderer.ipc = null;
    await dom.happyDOM.abort();
    dom.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
