import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { test, expect, _electron as electron } from '@playwright/test';

test('built Electron shell shows search results before optional requests finish', async ({}, testInfo) => {
  test.setTimeout(60_000);
  const appPath = path.resolve(import.meta.dirname, '..');
  const profile = testInfo.outputPath('profile');
  await mkdir(profile, { recursive: true });
  const bootstrap = testInfo.outputPath('bootstrap.cjs');
  await writeFile(bootstrap,
    `require('electron').app.setPath('userData', ${JSON.stringify(profile)}); import(${JSON.stringify(pathToFileURL(path.join(appPath, 'dist/main/index.js')).href)});`);
  const app = await electron.launch({
    cwd: appPath,
    env: { ...process.env, NODE_ENV: 'production', NODE_OPTIONS: '' },
    args: [bootstrap, '--no-sandbox', '--disable-gpu'],
  });
  try {
    const page = await app.firstWindow();
    const consent = page.locator('form[action="https://consent.youtube.com/save"] button').first();
    if (await consent.isVisible()) await consent.click();
    await expect(page.locator('#ui143-player')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#ui143-login-gate')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('signed-out-startup.png') });
    // This isolated profile is deliberately signed out. Hide only the local
    // overlay to exercise the built search UI against a controlled fixture;
    // no authentication or real account/playback behavior is being simulated.
    await page.addStyleTag({ content: '#ui143-login-gate { display: none !important; }' });
    await page.waitForFunction(() => typeof document.querySelector('ytmusic-app')?.networkManager?.fetch === 'function');
    await page.evaluate(() => {
      const nativeApp = document.querySelector('ytmusic-app');
      const original = nativeApp.networkManager.fetch.bind(nativeApp.networkManager);
      const artistName = 'Search Performance Fixture';
      const browseId = 'UCsearch-performance-fixture';
      const fixture = {
        musicCardShelfRenderer: {
          title: { runs: [{ text: artistName, navigationEndpoint: { browseEndpoint: {
            browseId, browseEndpointContextSupportedConfigs: {
              browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_ARTIST' },
            },
          } } }] },
          subtitle: { runs: [{ text: 'Artist' }] },
        },
        song: { musicResponsiveListItemRenderer: {
          flexColumns: [
            { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'First playable result' }] } } },
            { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: artistName }] } } },
          ],
          navigationEndpoint: { watchEndpoint: { videoId: 'fixture-track', watchEndpointMusicSupportedConfigs: {
            watchEndpointMusicConfig: { musicVideoType: 'MUSIC_VIDEO_TYPE_ATV' },
          } } },
        } },
      };
      window.searchFixture = { calls: [], pending: [], player: document.querySelector('#movie_player') };
      nativeApp.networkManager.fetch = (endpoint, data, ...rest) => {
        if (endpoint === '/search' && data.query?.startsWith(artistName)) {
          window.searchFixture.calls.push(data.query);
          if (data.query === artistName) return Promise.resolve(fixture);
          return new Promise(resolve => window.searchFixture.pending.push(() => resolve(fixture)));
        }
        if (endpoint === '/browse' && data.browseId === browseId) return Promise.resolve({});
        return original(endpoint, data, ...rest);
      };
      const input = document.querySelector('#ui143-search');
      input.value = artistName;
      input.form.requestSubmit();
    });
    await expect(page.locator('#ui143-search-page [data-video-id="fixture-track"]').first()).toBeVisible();
    expect(await page.evaluate(() => window.searchFixture.pending.length)).toBe(4);
    expect(await page.evaluate(() => document.querySelector('#movie_player') === window.searchFixture.player)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('first-results-before-enrichment.png') });
    await page.evaluate(() => window.searchFixture.pending.forEach(resolve => resolve()));
    await expect(page.locator('#ui143-search-page')).not.toContainText('Searching…');
    expect(await page.evaluate(() => window.searchFixture.calls.filter(query => query === 'Search Performance Fixture').length)).toBe(1);
  } finally {
    await app.close();
  }
});
