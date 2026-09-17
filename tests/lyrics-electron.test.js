import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { test, expect, _electron as electron } from '@playwright/test';

test('Lyrics stays disabled until the current track has lyrics, uses fallback and ignores stale replies', async ({}, testInfo) => {
  test.setTimeout(60000);
  const cwd = path.resolve(import.meta.dirname, '..');
  const profile = testInfo.outputPath('profile');
  await mkdir(profile, { recursive: true });
  const bootstrap = testInfo.outputPath('bootstrap.cjs');
  await writeFile(bootstrap, `require('electron').app.setPath('userData', ${JSON.stringify(profile)}); import(${JSON.stringify(pathToFileURL(path.join(cwd, 'dist/main/index.js')).href)});`);
  const app = await electron.launch({ cwd, env: { ...process.env, NODE_ENV: 'production', NODE_OPTIONS: '' }, args: [bootstrap, '--no-sandbox', '--disable-gpu'] });
  let slowRequest;
  try {
    const page = await app.firstWindow();
    page.on('console', message => { if (message.type() === 'error') console.log('Renderer:', message.text()); });
    page.on('pageerror', error => console.log('Renderer error:', error.message));
    const consent = page.locator('form[action="https://consent.youtube.com/save"] button').first();
    if (await consent.isVisible()) await consent.click();
    await expect(page.locator('#ui143-player')).toBeVisible({ timeout: 30000 });
    await page.addStyleTag({ content: '#ui143-login-gate { display: none !important; }' });
    await page.route('https://lrclib.net/api/**', route => {
      const url = new URL(route.request().url());
      console.log('Lyrics request:', url.pathname, url.searchParams.get('track_name'));
      if (url.pathname === '/api/get' && url.searchParams.get('track_name') === 'Slow track') { slowRequest = route; return; }
      return route.fulfill({ status: url.pathname === '/api/get' ? 404 : 200, contentType: 'application/json', body: url.pathname === '/api/get' ? '{}' : '[]' });
    });
    await page.waitForFunction(() => typeof document.querySelector('#movie_player')?.getVideoData === 'function');
    await page.evaluate(() => {
      window.lyricsFixture = { track: { video_id: '', title: '', author: 'Fixture Artist' }, calls: [] };
      window.ipcRenderer.on('app:song:info', (_event, info) => console.log('Fixture received song', JSON.stringify(info)));
      const player = document.querySelector('#movie_player');
      player.getVideoData = () => window.lyricsFixture.track;
      player.getPlayerState = () => 1;
      player.getCurrentTime = () => 12;
      player.getDuration = () => 180;
      player.getPlayerResponse = () => ({ videoDetails: { videoId: window.lyricsFixture.track.video_id, title: window.lyricsFixture.track.title, author: 'Fixture Artist', lengthSeconds: '180' } });
      if (!document.querySelector('#tabsContent > .tab-header:nth-of-type(2)')) {
        const tabs = document.querySelector('#tabsContent') ?? document.body.appendChild(document.createElement('div'));
        tabs.id = 'tabsContent';
        tabs.innerHTML = '<div class="tab-header"></div><div class="tab-header" aria-selected="false"></div>';
      }
      const nativeApp = document.querySelector('ytmusic-app');
      const original = nativeApp.networkManager.fetch.bind(nativeApp.networkManager);
      nativeApp.networkManager.fetch = (url, data, ...rest) => {
        if (url.startsWith('/next') && data.videoId.startsWith('fixture-')) {
          window.lyricsFixture.calls.push(data.videoId);
          return Promise.resolve({ data: { contents: { singleColumnMusicWatchNextResultsRenderer: { tabbedRenderer: { watchNextTabbedResultsRenderer: { tabs: data.videoId === 'fixture-youtube' ? [{ tabRenderer: { endpoint: { browseEndpoint: { browseId: 'fixture-lyrics', browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_TRACK_LYRICS' } } } } } }] : [] } } } } } });
        }
        if (url === '/browse' && data.browseId === 'fixture-lyrics') return Promise.resolve({ data: { contents: { elementRenderer: { newElement: { type: { componentType: { model: { timedLyricsModel: { lyricsData: { timedLyricsData: [
          { lyricLine: 'First fixture line', cueRange: { startTimeMilliseconds: '10000', endTimeMilliseconds: '20000' } },
          { lyricLine: 'Second fixture line', cueRange: { startTimeMilliseconds: '20000', endTimeMilliseconds: '30000' } },
        ] } } } } } } } } } });
        return original(url, data, ...rest);
      };
    });
    const changeTrack = async (id, title) => {
      await page.evaluate(({ id, title }) => { window.lyricsFixture.track = { video_id: id, title, author: 'Fixture Artist' }; }, { id, title });
      console.log(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(win => ({ id: win.id, url: win.webContents.getURL() }))));
      await app.evaluate(({ BrowserWindow }, info) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().startsWith('https://music.youtube.com'))?.webContents.send('app:song:info', info), {
        videoId: id, title, artist: 'Fixture Artist', album: 'Album', songDuration: 180, elapsedSeconds: 12, isPaused: false,
      });
      await expect(page.locator('.ui143-player-title')).toHaveText(title);
    };
    const tab = page.locator('#ui143-now-playing [data-tab="lyrics"]');
    const karaoke = page.locator('#ui143-player [aria-label="Karaoke"]');
    await changeTrack('fixture-slow', 'Slow track');
    await expect.poll(() => Boolean(slowRequest)).toBe(true);
    await expect(karaoke).toBeDisabled();
    await page.locator('#ui143-player .ui143-player-art').click();
    await expect(page.locator('#ui143-now-playing')).toBeVisible();
    await expect(tab).toBeDisabled();
    await changeTrack('fixture-none', 'Missing track');
    await expect.poll(() => page.evaluate(() => window.lyricsFixture.calls.includes('fixture-none'))).toBe(true);
    await slowRequest.fulfill({ contentType: 'application/json', body: JSON.stringify({ trackName: 'Slow track', artistName: 'Fixture Artist', albumName: 'Album', duration: 180, instrumental: false, syncedLyrics: '[00:10.00]Old track lyrics', plainLyrics: '' }) });
    await expect(tab).toBeDisabled();
    await expect(karaoke).toBeDisabled();
    await changeTrack('fixture-youtube', 'Fallback track');
    await expect(tab).toBeEnabled({ timeout: 10000 });
    await expect(karaoke).toBeEnabled();
    await tab.click();
    await expect(page.locator('.ui143-now-playing-provider')).toHaveText('Lyrics · YouTube Music');
    await expect(page.locator('.ui143-now-playing-lyric.is-current')).toHaveText('First fixture line');
    await expect(page.locator('.ui143-now-playing-word')).toHaveCount(0);
    await changeTrack('fixture-none', 'Missing track');
    await expect(tab).toBeDisabled();
    await expect(page.locator('[data-pane="lyrics"]')).toBeHidden();
    await page.locator('[aria-label="Close now playing"]').click();
    // Even a dispatched click cannot open unavailable lyrics.
    await karaoke.dispatchEvent('click');
    await expect(page.locator('#ui143-now-playing')).toBeHidden();
  } finally { await app.close(); }
});
