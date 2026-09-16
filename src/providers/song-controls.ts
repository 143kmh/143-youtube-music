import { type BrowserWindow, ipcMain } from 'electron';

import { LikeType } from '@/types/datahost-get-state';

type ArgsType<T> = T | string[] | undefined;

const parseNumberFromArgsType = (args: ArgsType<number>) => {
  if (typeof args === 'number') return args;
  if (Array.isArray(args)) return Number(args[0]);
  return null;
};

const parseBooleanFromArgsType = (args: ArgsType<boolean>) => {
  if (typeof args === 'boolean') return args;
  if (Array.isArray(args)) return args[0] === 'true';
  return null;
};

const parseStringFromArgsType = (args: ArgsType<string>) => {
  if (typeof args === 'string') return args;
  if (Array.isArray(args)) return args[0];
  return null;
};

export const getSongControls = (win: BrowserWindow) => ({
  previous: () => win.webContents.send('app:media:previous'),
  next: () => win.webContents.send('app:media:next'),
  play: () => win.webContents.send('app:media:play'),
  pause: () => win.webContents.send('app:media:pause'),
  playPause: () => win.webContents.send('app:media:toggle-play'),
  like: () => win.webContents.send('app:media:update-like', LikeType.Like),
  dislike: () =>
    win.webContents.send('app:media:update-like', LikeType.Dislike),
  seekTo: (seconds: ArgsType<number>) => {
    const value = parseNumberFromArgsType(seconds);
    if (value !== null) win.webContents.send('app:media:seek-to', value);
  },
  goBack: (seconds: ArgsType<number>) => {
    const value = parseNumberFromArgsType(seconds);
    if (value !== null) win.webContents.send('app:media:seek-by', -value);
  },
  goForward: (seconds: ArgsType<number>) => {
    const value = parseNumberFromArgsType(seconds);
    if (value !== null) win.webContents.send('app:media:seek-by', value);
  },
  requestShuffleInformation: () =>
    win.webContents.send('app:media:get-shuffle'),
  shuffle: () => win.webContents.send('app:media:shuffle'),
  switchRepeat: (n: ArgsType<number> = 1) => {
    const value = parseNumberFromArgsType(n);
    if (value !== null) win.webContents.send('app:media:switch-repeat', value);
  },
  setVolume: (volume: ArgsType<number>) => {
    const value = parseNumberFromArgsType(volume);
    if (value !== null) win.webContents.send('app:media:update-volume', value);
  },
  setFullscreen: (fullscreen: ArgsType<boolean>) => {
    const value = parseBooleanFromArgsType(fullscreen);
    if (value === null) return;
    win.setFullScreen(value);
    win.webContents.send('app:media:click-fullscreen-button', value);
  },
  requestFullscreenInformation: () =>
    win.webContents.send('app:media:get-fullscreen'),
  requestQueueInformation: () => win.webContents.send('app:media:get-queue'),
  muteUnmute: () => win.webContents.send('app:media:toggle-mute'),
  openSearchBox: () => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: '/' });
  },
  addSongToQueue: (videoId: string, queueInsertPosition: string) => {
    const value = parseStringFromArgsType(videoId);
    if (value === null) return;
    win.webContents.send('app:media:add-to-queue', value, queueInsertPosition);
  },
  moveSongInQueue: (
    fromIndex: ArgsType<number>,
    toIndex: ArgsType<number>,
  ) => {
    const from = parseNumberFromArgsType(fromIndex);
    const to = parseNumberFromArgsType(toIndex);
    if (from === null || to === null) return;
    win.webContents.send('app:media:move-in-queue', from, to);
  },
  removeSongFromQueue: (index: ArgsType<number>) => {
    const value = parseNumberFromArgsType(index);
    if (value !== null) win.webContents.send('app:media:remove-from-queue', value);
  },
  setQueueIndex: (index: ArgsType<number>) => {
    const value = parseNumberFromArgsType(index);
    if (value !== null) win.webContents.send('app:media:set-queue-index', value);
  },
  clearQueue: () => win.webContents.send('app:media:clear-queue'),
  search: (query: string, params?: string, continuation?: string) =>
    new Promise((resolve) => {
      ipcMain.once('app:media:search-results', (_, result) => resolve(result));
      win.webContents.send('app:media:search', query, params, continuation);
    }),
});
