import { deepmerge } from 'deepmerge-ts';
import { type BrowserWindow, ipcMain } from 'electron';

import * as config from '@/config';
import { coreFeatures } from '@/core/features';
import { LoggerPrefix, startPlugin, stopPlugin } from '@/utils';

import type { BackendContext } from '@/types/contexts';
import type { PluginConfig, PluginDef } from '@/types/plugins';

const loadedFeatureMap: Record<
  string,
  PluginDef<unknown, unknown, unknown>
> = {};
let activeWindow: BrowserWindow | null = null;
let configWatchInstalled = false;

const getFeatureConfig = (id: string) =>
  deepmerge(
    coreFeatures[id]?.config ?? { enabled: false },
    config.get(`plugins.${id}`) ?? {},
  ) as PluginConfig;

const setFeatureConfig = (id: string, newConfig: Partial<PluginConfig>) => {
  if (!coreFeatures[id]) return;
  config.setPartial(
    `plugins.${id}`,
    newConfig,
    coreFeatures[id]?.config ?? { enabled: false },
  );
};

const broadcastFeatureConfig = () => {
  const win = activeWindow;
  if (!win || win.isDestroyed()) return;

  for (const id of Object.keys(coreFeatures)) {
    win.webContents.send('app:feature-config-changed', id, getFeatureConfig(id));
  }
};

const createContext = (
  id: string,
  win: BrowserWindow,
): BackendContext<PluginConfig> => ({
  getConfig: () => getFeatureConfig(id),
  setConfig: (newConfig) => setFeatureConfig(id, newConfig),
  ipc: {
    send: (event: string, ...args: unknown[]) => {
      win.webContents.send(event, ...args);
    },
    handle: (event: string, listener: CallableFunction) => {
      ipcMain.removeHandler(event);
      ipcMain.handle(event, (_, ...args: unknown[]) => listener(...args));
    },
    on: (event: string, listener: CallableFunction) => {
      ipcMain.on(event, (_, ...args: unknown[]) => listener(...args));
    },
    removeHandler: (event: string) => {
      ipcMain.removeHandler(event);
    },
  },
  window: win,
});

export const forceUnloadMainPlugin = async (
  id: string,
  win: BrowserWindow,
): Promise<void> => {
  const feature = loadedFeatureMap[id];
  if (!feature) return;

  const hasStopped = await stopPlugin(id, feature, {
    ctx: 'backend',
    context: createContext(id, win),
  });

  if (
    hasStopped ||
    (hasStopped === null &&
      typeof feature.backend !== 'function' &&
      feature.backend)
  ) {
    delete loadedFeatureMap[id];
    console.log(LoggerPrefix, `Core feature ${id} stopped`);
  }
};

export const forceLoadMainPlugin = async (
  id: string,
  win: BrowserWindow,
): Promise<void> => {
  if (loadedFeatureMap[id]) return;

  const feature = coreFeatures[id];
  if (!feature?.backend) return;

  const hasStarted = await startPlugin(id, feature, {
    ctx: 'backend',
    context: createContext(id, win),
  });

  if (
    hasStarted ||
    (hasStarted === null &&
      typeof feature.backend !== 'function' &&
      feature.backend)
  ) {
    loadedFeatureMap[id] = feature;
  }
};

export const loadAllMainPlugins = async (win: BrowserWindow) => {
  activeWindow = win;
  if (config.get('options.autoUpdates')) config.set('options.autoUpdates', false);
  await config.plugins.enforceAllowedPlugins();

  ipcMain.removeHandler('app:get-feature-config');
  ipcMain.removeHandler('app:set-feature-config');
  ipcMain.handle('app:get-feature-config', (_event, id: string) =>
    getFeatureConfig(id),
  );
  ipcMain.handle(
    'app:set-feature-config',
    (_event, id: string, newConfig: Partial<PluginConfig>) => {
      setFeatureConfig(id, newConfig);
      return getFeatureConfig(id);
    },
  );

  if (!configWatchInstalled) {
    configWatchInstalled = true;
    config.watch(() => broadcastFeatureConfig());
  }

  await Promise.allSettled(
    Object.keys(coreFeatures).map((id) => forceLoadMainPlugin(id, win)),
  );
};

export const unloadAllMainPlugins = async (win: BrowserWindow) => {
  for (const id of Object.keys(loadedFeatureMap)) {
    await forceUnloadMainPlugin(id, win);
  }
  if (activeWindow === win) activeWindow = null;
};

export const getLoadedMainPlugin = (
  id: string,
): PluginDef<unknown, unknown, unknown> | undefined => loadedFeatureMap[id];

export const getAllLoadedMainPlugins = () => loadedFeatureMap;
