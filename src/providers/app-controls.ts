import { app, BrowserWindow, ipcMain } from 'electron';

import * as config from '@/config';

export const restart = () => restartInternal();

export const setupAppControls = () => {
  ipcMain.removeAllListeners('app:reload');
  ipcMain.on('app:reload', () =>
    BrowserWindow.getFocusedWindow()?.webContents.loadURL(config.get('url')),
  );
};

function restartInternal() {
  app.relaunch({ execPath: process.env.PORTABLE_EXECUTABLE_FILE });
  app.quit();
}

function sendToFrontInternal(channel: string, ...args: unknown[]) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, ...args);
  }
}

export const sendToFront =
  process.type === 'browser'
    ? sendToFrontInternal
    : () => {
        console.error('sendToFront called from renderer');
      };
