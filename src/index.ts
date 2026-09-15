import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import ErrorHtmlAsset from '@assets/error.html?asset';
import {
  enhanceWebRequest,
  type BetterSession,
} from '@jellybrick/electron-better-web-request';
import {
  BrowserWindow,
  app,
  screen,
  globalShortcut,
  session,
  shell,
  dialog,
  ipcMain,
  protocol,
  type BrowserWindowConstructorOptions,
} from 'electron';
import electronDebug from 'electron-debug';
import is from 'electron-is';
import unhandled from 'electron-unhandled';
import { parse } from 'node-html-parser';
import { languageResources } from 'virtual:i18n';

import * as config from '@/config';
import { APPLICATION_NAME, loadI18n, setLanguage, t } from '@/i18n';
import { loadAllMainPlugins } from '@/loader/main';
import { refreshMenu, setApplicationMenu } from '@/menu';
import musicPlayerCss from '@/music-player.css?inline';
import { fileExists, injectCSS, injectCSSAsFile } from '@/plugins/utils/main';
import { restart, setupAppControls } from '@/providers/app-controls';
import {
  APP_PROTOCOL,
  handleProtocol,
  setupProtocolHandler,
} from '@/providers/protocol-handler';
import { setupSongInfo } from '@/providers/song-info';
import { setUpTray } from '@/tray';
import { LoggerPrefix } from '@/utils';
import { isTesting } from '@/utils/testing';

const WINDOWS_APP_ID = 'com.143aimclub.music';

unhandled({
  logger: console.error,
  showDialog: false,
});

let mainWindow: BrowserWindow | null;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) app.exit();

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'http',
    privileges: {
      standard: true,
      bypassCSP: true,
      allowServiceWorkers: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      codeCache: true,
    },
  },
  {
    scheme: 'https',
    privileges: {
      standard: true,
      bypassCSP: true,
      allowServiceWorkers: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      codeCache: true,
    },
  },
  { scheme: 'mailto', privileges: { standard: true } },
]);

app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
app.commandLine.appendSwitch(
  'enable-features',
  'OverlayScrollbar,SharedArrayBuffer,UseOzonePlatform,WaylandWindowDecorations',
);
app.commandLine.appendSwitch('disable-features', 'FluentScrollbar');

if (is.linux()) {
  app.setName(WINDOWS_APP_ID);
  app.commandLine.appendSwitch('class', WINDOWS_APP_ID);
}

if (config.get('options.disableHardwareAcceleration')) {
  if (is.dev()) console.log('Disabling hardware acceleration');
  app.disableHardwareAcceleration();
}

const proxy = config.get('options.proxy');
if (proxy) {
  console.log(LoggerPrefix, `Using proxy: ${proxy}`);
  app.commandLine.appendSwitch('proxy-server', proxy);
}

electronDebug({ showDevTools: false });

let icon = 'assets/icon.png';
if (process.platform === 'win32') {
  icon = 'assets/generated/icons/win/icon.png';
} else if (process.platform === 'darwin') {
  icon = 'assets/generated/icons/mac/icon.icns';
}

function onClosed() {
  mainWindow = null;
}

function initTheme(win: BrowserWindow) {
  injectCSS(win.webContents, musicPlayerCss);

  const themes: string[] = config.get('options.themes');
  if (Array.isArray(themes)) {
    for (const cssFile of themes) {
      fileExists(
        cssFile,
        () => injectCSSAsFile(win.webContents, cssFile),
        () =>
          console.warn(
            LoggerPrefix,
            t('main.console.theme.css-file-not-found', { cssFile }),
          ),
      );
    }
  }

  win.webContents.once('did-finish-load', () => {
    if (is.dev()) {
      console.debug(LoggerPrefix, t('main.console.did-finish-load.dev-tools'));
      win.webContents.openDevTools();
    }
  });
}

async function createMainWindow() {
  const windowSize = config.get('window-size');
  const windowMaximized = config.get('window-maximized');
  const windowPosition: Electron.Point = config.get('window-position');

  const defaultTitleBarOverlayOptions: Electron.TitleBarOverlay = {
    color: '#00000000',
    symbolColor: '#ffffff',
    height: 32,
  };

  const decorations: Partial<BrowserWindowConstructorOptions> = is.macOS()
    ? {
        frame: true,
        titleBarOverlay: defaultTitleBarOverlayOptions,
        titleBarStyle: 'hiddenInset',
        autoHideMenuBar: true,
      }
    : {
        frame: false,
        titleBarOverlay: false,
        autoHideMenuBar: true,
      };

  const electronWindowSettings: BrowserWindowConstructorOptions = {
    icon,
    width: windowSize.width,
    height: windowSize.height,
    minWidth: 325,
    minHeight: 425,
    backgroundColor: '#000',
    show: false,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'preload', 'preload.cjs'),
      ...(isTesting()
        ? undefined
        : {
            sandbox: false,
          }),
    },
    ...decorations,
  };

  const win = new BrowserWindow(electronWindowSettings);

  initTheme(win);
  await loadAllMainPlugins(win);

  if (windowPosition) {
    const { x: windowX, y: windowY } = windowPosition;
    const winSize = win.getSize();
    const display = screen.getDisplayNearestPoint(windowPosition);
    const primaryDisplay = screen.getPrimaryDisplay();

    const scaleFactor = is.windows()
      ? primaryDisplay.scaleFactor / display.scaleFactor
      : 1;
    const scaledWidth = Math.floor(windowSize.width * scaleFactor);
    const scaledHeight = Math.floor(windowSize.height * scaleFactor);

    if (
      windowX + scaledWidth / 2 < display.bounds.x - 8 ||
      windowX + scaledWidth / 2 > display.bounds.x + display.bounds.width ||
      windowY < display.bounds.y - 8 ||
      windowY + scaledHeight / 2 > display.bounds.y + display.bounds.height
    ) {
      if (is.dev()) {
        console.warn(
          LoggerPrefix,
          t('main.console.window.tried-to-render-offscreen', {
            windowSize: String(winSize),
            displaySize: JSON.stringify(display.bounds),
            position: JSON.stringify(windowPosition),
          }),
        );
      }
    } else {
      win.setSize(scaledWidth, scaledHeight);
      win.setPosition(windowX, windowY);
    }
  }

  if (windowMaximized) win.maximize();
  if (config.get('options.alwaysOnTop')) win.setAlwaysOnTop(true);

  const urlToLoad = config.get('options.resumeOnStart')
    ? config.get('url')
    : config.defaultConfig.url;
  win.on('closed', onClosed);

  win.on('move', () => {
    if (win.isMaximized()) return;
    const [x, y] = win.getPosition();
    lateSave('window-position', { x, y });
  });

  let winWasMaximized: boolean;
  win.on('resize', () => {
    const [width, height] = win.getSize();
    const isMaximized = win.isMaximized();

    if (winWasMaximized !== isMaximized) {
      winWasMaximized = isMaximized;
      config.set('window-maximized', isMaximized);
    }
    if (isMaximized) return;
    lateSave('window-size', { width, height });
  });

  const savedTimeouts: Record<string, NodeJS.Timeout | undefined> = {};
  function lateSave(
    key: string,
    value: unknown,
    fn: (key: string, value: unknown) => void = config.set,
  ) {
    if (savedTimeouts[key]) clearTimeout(savedTimeouts[key]);
    savedTimeouts[key] = setTimeout(() => {
      fn(key, value);
      savedTimeouts[key] = undefined;
    }, 600);
  }

  app.on('render-process-gone', (_event, _webContents, details) => {
    showUnresponsiveDialog(win, details);
  });

  win.once('ready-to-show', () => {
    if (config.get('options.appVisible')) win.show();
  });

  removeContentSecurityPolicy();

  win.webContents.on('will-redirect', (event) => {
    const target = URL.parse(event.url);
    if (
      target &&
      target.hostname.endsWith('youtube.com') &&
      target.pathname === '/premium'
    ) {
      event.preventDefault();
      win.webContents.loadURL(
        'https://accounts.google.com/ServiceLogin?ltmpl=music&service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2Fsignin%3Faction_handle_signin%3Dtrue%26next%3Dhttps%253A%252F%252Fmusic.youtube.com%252F',
      );
    }
  });

  win.webContents.loadURL(urlToLoad);
  return win;
}

app.once('browser-window-created', (_event, win) => {
  if (config.get('options.overrideUserAgent')) {
    const originalUserAgent = win.webContents.userAgent;
    const userAgents = {
      mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.152 Safari/537.36',
      windows:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.152 Safari/537.36',
      linux:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.152 Safari/537.36',
    };

    const updatedUserAgent = is.macOS()
      ? userAgents.mac
      : is.windows()
        ? userAgents.windows
        : userAgents.linux;

    win.webContents.userAgent = updatedUserAgent;
    app.userAgentFallback = updatedUserAgent;

    win.webContents.session.webRequest.onBeforeSendHeaders((details, cb) => {
      if (
        win.webContents.getURL().startsWith('https://accounts.google.com') &&
        details.url.startsWith('https://accounts.google.com')
      ) {
        details.requestHeaders['User-Agent'] = originalUserAgent;
      }
      cb({ requestHeaders: details.requestHeaders });
    });
  }

  setupSongInfo(win);
  setupAppControls();

  win.webContents.on(
    'did-fail-load',
    (
      _event,
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame,
      frameProcessId,
      frameRoutingId,
    ) => {
      const log = JSON.stringify(
        {
          error: 'did-fail-load',
          errorCode,
          errorDescription,
          validatedURL,
          isMainFrame,
          frameProcessId,
          frameRoutingId,
        },
        null,
        '\t',
      );
      if (is.dev()) console.log(log);

      if (
        errorCode !== -3 &&
        !URL.parse(validatedURL)?.hostname?.includes('doubleclick.net')
      ) {
        win.webContents.send('log', log);
        win.webContents.loadFile(ErrorHtmlAsset);
      }
    },
  );

  win.webContents.on('will-prevent-unload', (event) => event.preventDefault());

  const customWindowTitle = config.get('options.customWindowTitle');
  if (customWindowTitle) {
    win.on('page-title-updated', (event) => {
      event.preventDefault();
      win.setTitle(customWindowTitle);
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
  globalShortcut.unregisterAll();
});

app.on('activate', async () => {
  if (mainWindow === null) mainWindow = await createMainWindow();
  else if (!mainWindow.isVisible()) mainWindow.show();
});

const getDefaultLocale = async (locale: string) =>
  Object.keys(await languageResources()).includes(locale) ? locale : null;

app.whenReady().then(async () => {
  if (!config.get('options.language')) {
    const locale = await getDefaultLocale(app.getLocale());
    if (locale) config.set('options.language', locale);
  }

  await loadI18n().then(async () => {
    await setLanguage(config.get('options.language') ?? 'en');
    console.log(LoggerPrefix, t('main.console.i18n.loaded'));
  });

  if (config.get('options.autoResetAppCache')) {
    const clearCacheTimeout = setTimeout(() => {
      if (is.dev()) {
        console.log(
          LoggerPrefix,
          t('main.console.when-ready.clearing-cache-after-20s'),
        );
      }
      session.defaultSession.clearCache();
      clearTimeout(clearCacheTimeout);
    }, 20_000);
  }

  if (is.windows()) {
    app.setAppUserModelId(WINDOWS_APP_ID);
    const appLocation = process.execPath;
    const appData = app.getPath('appData');

    if (
      !is.dev() &&
      !appLocation.startsWith(path.join(appData, '..', 'Local', 'Temp'))
    ) {
      const shortcutPath = path.join(
        appData,
        'Microsoft',
        'Windows',
        'Start Menu',
        'Programs',
        `${APPLICATION_NAME}.lnk`,
      );
      try {
        const shortcutDetails = shell.readShortcutLink(shortcutPath);
        if (
          shortcutDetails.target !== appLocation ||
          shortcutDetails.appUserModelId !== WINDOWS_APP_ID
        ) {
          throw new Error('needUpdate');
        }
      } catch (error) {
        shell.writeShortcutLink(
          shortcutPath,
          error instanceof Error && error.message === 'needUpdate'
            ? 'update'
            : 'create',
          {
            target: appLocation,
            cwd: path.dirname(appLocation),
            description: `${APPLICATION_NAME} Desktop App`,
            appUserModelId: WINDOWS_APP_ID,
          },
        );
      }
    }
  }

  ipcMain.on('get-renderer-script', (event) => {
    if (is.dev() && process.env.ELECTRON_RENDERER_URL) {
      event.returnValue = [
        null,
        `
        console.log('${LoggerPrefix}', 'Loading vite from dev server');
        (async () => {
          await new Promise((resolve) => {
            if (document.readyState === 'loading') {
              console.log('${LoggerPrefix}', 'Waiting for DOM to load');
              document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
            } else {
              resolve();
            }
          });
          const viteScript = document.createElement('script');
          viteScript.type = 'module';
          viteScript.src = '${process.env.ELECTRON_RENDERER_URL}/@vite/client';
          const rendererScript = document.createElement('script');
          rendererScript.type = 'module';
          rendererScript.src = '${process.env.ELECTRON_RENDERER_URL}/renderer.ts';
          document.body.appendChild(viteScript);
          document.body.appendChild(rendererScript);
        })();
        0
      `,
      ];
    } else {
      const rendererPath = path.join(__dirname, '..', 'renderer');
      const indexHTML = parse(
        fs.readFileSync(path.join(rendererPath, 'index.html'), 'utf-8'),
      );
      const scriptSrc = indexHTML.querySelector('script')!;
      const scriptPath = path.join(
        rendererPath,
        scriptSrc.getAttribute('src')!,
      );
      const scriptString = fs.readFileSync(scriptPath, 'utf-8');
      event.returnValue = [
        url.pathToFileURL(scriptPath).toString(),
        scriptString + ';0',
      ];
    }
  });

  mainWindow = await createMainWindow();
  await setApplicationMenu(mainWindow);
  await refreshMenu(mainWindow);
  setUpTray(app, mainWindow);
  setupProtocolHandler(mainWindow);

  app.on('second-instance', (_, commandLine) => {
    const uri = `${APP_PROTOCOL}://`;
    const protocolArgv = commandLine.find((arg) => arg.startsWith(uri));
    if (protocolArgv) {
      const lastIndex = protocolArgv.endsWith('/') ? -1 : undefined;
      const command = protocolArgv.slice(uri.length, lastIndex);
      if (is.dev()) {
        console.debug(
          LoggerPrefix,
          t('main.console.second-instance.receive-command', { command }),
        );
      }
      const split = decodeURIComponent(command).split(' ');
      handleProtocol(split.shift()!, ...split);
      return;
    }

    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  });

  app.setLoginItemSettings({
    openAtLogin: config.get('options.startAtLogin'),
  });

  if (is.macOS() && !config.get('options.appVisible')) app.dock?.hide();

  let forceQuit = false;
  app.on('before-quit', () => {
    forceQuit = true;
  });

  if (is.macOS() || config.get('options.tray')) {
    mainWindow.on('close', (event) => {
      if (!forceQuit) {
        event.preventDefault();
        mainWindow!.hide();
      }
    });
  }
});

function showUnresponsiveDialog(
  win: BrowserWindow,
  details: Electron.RenderProcessGoneDetails,
) {
  if (details) {
    console.error(
      LoggerPrefix,
      t('main.console.unresponsive.details', {
        error: JSON.stringify(details, null, '\t'),
      }),
    );
  }

  dialog
    .showMessageBox(win, {
      type: 'error',
      title: t('main.dialog.unresponsive.title'),
      message: t('main.dialog.unresponsive.message'),
      detail: t('main.dialog.unresponsive.detail'),
      buttons: [
        t('main.dialog.unresponsive.buttons.wait'),
        t('main.dialog.unresponsive.buttons.relaunch'),
        t('main.dialog.unresponsive.buttons.quit'),
      ],
      cancelId: 0,
    })
    .then((result) => {
      if (result.response === 1) restart();
      else if (result.response === 2) app.quit();
    });
}

function removeContentSecurityPolicy(
  betterSession: BetterSession = session.defaultSession as BetterSession,
) {
  enhanceWebRequest(betterSession);

  betterSession.webRequest.onHeadersReceived((details, callback) => {
    details.responseHeaders ??= {};

    if (URL.parse(details.url)?.protocol === 'https:') {
      delete details.responseHeaders['content-security-policy-report-only'];
      delete details.responseHeaders['Content-Security-Policy-Report-Only'];
      delete details.responseHeaders['content-security-policy'];
      delete details.responseHeaders['Content-Security-Policy'];

      if (
        !details.responseHeaders['access-control-allow-origin'] &&
        !details.responseHeaders['Access-Control-Allow-Origin']
      ) {
        details.responseHeaders['access-control-allow-origin'] = [
          'https://music.youtube.com',
        ];
      }
    }

    callback({ cancel: false, responseHeaders: details.responseHeaders });
  });

  betterSession.webRequest.setResolver('onHeadersReceived', async (listeners) =>
    listeners.reduce(
      async (accumulator, listener) => {
        const acc = await accumulator;
        if (acc.cancel) return acc;
        const result = await listener.apply();
        return { ...acc, ...result };
      },
      Promise.resolve({ cancel: false }),
    ),
  );
}
