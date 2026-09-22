import { test, expect, _electron as electron } from '@playwright/test';
import { build } from 'vite';
import { builtinModules, createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');

test('Ghostery blocks requests and cosmetics, updates without losing hooks, and retains offline cache', async ({}, info) => {
  test.setTimeout(60_000);
  const output = info.outputPath('bundle');
  await build({
    configFile: false,
    logLevel: 'error',
    build: {
      outDir: output,
      lib: { entry: path.join(root, 'src/features/shell-controls/ghostery.ts'), formats: ['es'], fileName: () => 'ghostery.mjs' },
      rolldownOptions: { external: ['electron', ...builtinModules, ...builtinModules.map((name) => `node:${name}`)] },
    },
  });
  const cache = info.outputPath('cache', 'ads.bin');
  await mkdir(path.dirname(cache), { recursive: true });
  await writeFile(cache, 'corrupt cache');
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/' ? 'text/html' : 'text/plain');
    res.end(req.url === '/' ? '<html><body><div id="sponsored">Ad</div><div id="song">Music</div></body></html>' : 'content');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = `http://127.0.0.1:${server.address().port}`;
  const bootstrap = info.outputPath('bootstrap.cjs');
  await writeFile(bootstrap, `
    const { app } = require('electron');
    app.setPath('userData', ${JSON.stringify(info.outputPath('profile'))});
    globalThis.fixture = {
      ElectronBlocker: require(${JSON.stringify(require.resolve('@ghostery/adblocker-electron'))}).ElectronBlocker,
      enhanceWebRequest: require(${JSON.stringify(require.resolve('@jellybrick/electron-better-web-request'))}).enhanceWebRequest,
      module: import(${JSON.stringify(pathToFileURL(path.join(output, 'ghostery.mjs')).href)}),
      downloads: 0, fail: false,
    };
    app.whenReady().then(() => {});
  `);
  let app;
  try {
    app = await electron.launch({ args: [bootstrap], cwd: root });
    await app.evaluate(async ({ session, BrowserWindow }, cachePath) => {
      const f = globalThis.fixture;
      const { installGhostery } = await f.module;
      const ses = session.defaultSession;
      f.enhanceWebRequest(ses);
      ses.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: { ...details.responseHeaders, 'X-143-Test': ['preserved'] } }));
      ses.webRequest.setResolver('onHeadersReceived', async (listeners) => {
        let result = {};
        for (const listener of listeners) result = { ...result, ...await listener.apply() };
        return result;
      });
      f.handle = await installGhostery(ses, cachePath, async () => {
        f.downloads++;
        if (f.fail) throw new Error('simulated offline');
        return f.ElectronBlocker.parse('/advertisement.js\n127.0.0.1###sponsored\n' + (f.downloads > 1 ? '/new-ad.js' : ''));
      });
      f.win = new BrowserWindow({ show: false, webPreferences: { sandbox: false } });
      if (await installGhostery(ses, cachePath) !== f.handle) throw new Error('Duplicate session registration');
      await f.win.loadURL('about:blank');
    }, cache);
    const page = await app.firstWindow();
    await page.goto(address);
    const getResource = (url) => page.evaluate(async (url) => {
      try { const r = await fetch(url); return { ok: r.ok, header: r.headers.get('X-143-Test') }; }
      catch { return { ok: false }; }
    }, url);
    expect((await getResource('/advertisement.js')).ok).toBe(false);
    expect(await getResource('/music')).toEqual({ ok: true, header: 'preserved' });
    await expect(page.locator('#sponsored')).toBeHidden();
    await expect(page.locator('#song')).toBeVisible();
    const preloadCount = await app.evaluate(({ session }) => session.defaultSession.getPreloadScripts().length);
    await app.evaluate(async () => globalThis.fixture.handle.refresh());
    expect((await getResource('/new-ad.js')).ok).toBe(false);
    expect(await getResource('/music')).toEqual({ ok: true, header: 'preserved' });
    expect(await app.evaluate(({ session }) => session.defaultSession.getPreloadScripts().length)).toBe(preloadCount);
    const saved = await readFile(cache);
    await app.evaluate(async () => { globalThis.fixture.fail = true; await globalThis.fixture.handle.refresh(); });
    expect((await getResource('/new-ad.js')).ok).toBe(false);
    expect(await readFile(cache)).toEqual(saved);
    expect(await app.evaluate(async ({ session }, address) => {
      const auth = session.fromPartition('separate-google-auth');
      return { ok: (await auth.fetch(address + '/advertisement.js')).ok, preloads: auth.getPreloadScripts().length };
    }, address)).toEqual({ ok: true, preloads: 0 });
    await app.close();
    app = await electron.launch({ args: [bootstrap], cwd: root });
    expect(await app.evaluate(async ({ session, BrowserWindow }, cachePath) => {
      const f = globalThis.fixture;
      const { installGhostery } = await f.module;
      f.handle = await installGhostery(session.defaultSession, cachePath, async () => { f.downloads++; throw new Error('offline'); });
      f.win = new BrowserWindow({ show: false });
      await f.win.loadURL('about:blank');
      return f.downloads;
    }, cache)).toBe(0);
    const restarted = await app.firstWindow();
    await restarted.goto(address);
    expect(await restarted.evaluate(async () => { try { await fetch('/new-ad.js'); return true; } catch { return false; } })).toBe(false);
  } finally {
    await app?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
