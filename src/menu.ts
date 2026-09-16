import {
  app,
  type BrowserWindow,
  clipboard,
  Menu,
  type MenuItem,
} from 'electron';
import is from 'electron-is';

import * as config from './config';
import { restart } from './providers/app-controls';

export type MenuTemplate = Electron.MenuItemConstructorOptions[];

export const refreshMenu = async (win: BrowserWindow) => {
  await setApplicationMenu(win);
};

export const mainMenuTemplate = async (
  win: BrowserWindow,
): Promise<MenuTemplate> => {
  const { navigationHistory } = win.webContents;

  return [
    {
      label: 'Options',
      submenu: [
        {
          label: 'Resume on start',
          type: 'checkbox',
          checked: config.get('options.resumeOnStart'),
          click(item: MenuItem) {
            config.setMenuOption('options.resumeOnStart', item.checked);
          },
        },
        {
          label: 'Always on top',
          type: 'checkbox',
          checked: config.get('options.alwaysOnTop'),
          click(item: MenuItem) {
            config.setMenuOption('options.alwaysOnTop', item.checked);
            win.setAlwaysOnTop(item.checked);
          },
        },
        ...((is.windows() || is.macOS()
          ? [
              {
                label: 'Start at login',
                type: 'checkbox' as const,
                checked: config.get('options.startAtLogin'),
                click(item: MenuItem) {
                  config.setMenuOption('options.startAtLogin', item.checked);
                },
              },
            ]
          : []) satisfies Electron.MenuItemConstructorOptions[]),
        {
          label: 'Disable hardware acceleration',
          type: 'checkbox',
          checked: config.get('options.disableHardwareAcceleration'),
          click(item: MenuItem) {
            config.setMenuOption(
              'options.disableHardwareAcceleration',
              item.checked,
            );
          },
        },
        { type: 'separator' },
        is.macOS()
          ? {
              label: 'Toggle developer tools',
              click() {
                const { webContents } = win;
                if (webContents.isDevToolsOpened()) webContents.closeDevTools();
                else webContents.openDevTools();
              },
            }
          : {
              label: 'Toggle developer tools',
              role: 'toggleDevTools',
            },
        {
          label: 'Edit config JSON',
          click() {
            config.edit();
          },
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', role: 'reload' },
        { label: 'Force reload', role: 'forceReload' },
        { type: 'separator' },
        {
          label: 'Zoom in',
          role: 'zoomIn',
          accelerator: 'CmdOrCtrl+Plus',
        },
        {
          label: 'Zoom out',
          role: 'zoomOut',
          accelerator: 'CmdOrCtrl+-',
        },
        { label: 'Reset zoom', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Toggle fullscreen', role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Navigation',
      submenu: [
        {
          label: 'Back',
          click() {
            if (navigationHistory.canGoBack()) navigationHistory.goBack();
          },
        },
        {
          label: 'Forward',
          click() {
            if (navigationHistory.canGoForward()) navigationHistory.goForward();
          },
        },
        {
          label: 'Copy current URL',
          click() {
            clipboard.writeText(win.webContents.getURL());
          },
        },
        { type: 'separator' },
        { label: 'Restart', click: restart },
        { label: 'Quit', role: 'quit' },
      ],
    },
    {
      label: 'About',
      submenu: [{ role: 'about' }],
    },
  ];
};

export const setApplicationMenu = async (win: BrowserWindow) => {
  const menuTemplate: MenuTemplate = [...(await mainMenuTemplate(win))];

  if (process.platform === 'darwin') {
    menuTemplate.unshift({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'selectAll' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { type: 'separator' },
        { role: 'minimize' },
        { role: 'close' },
        { role: 'quit' },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  // 143 Music owns its frame on Windows/Linux. Keep the native menu available
  // to the Advanced button without drawing an extra menu bar in the window.
  if (process.platform !== 'darwin') win.setMenu(null);
};
