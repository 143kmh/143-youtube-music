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

const createContext = (
  id: string,
  win: BrowserWindow,
): BackendContext<PluginConfig> => ({
  getConfig: () =>
    deepmerge(
      coreFeatures[id]?.config ?? { enabled: false },
      config.get(`plugins.${id}`) ?? {},
    ) as PluginConfig,
  setConfig: (newConfig) => {
    config.setPartial(
      `plugins.${id}`,
      newConfig,
      coreFeatures[id]?.config ?? { enabled: false },
    );
  },
  ipc: {
    send: (event: string, ...args: unknown[]) => {
      win.webContents.send(event, ...args);
    },
    handle: (event: string, listener: CallableFunction) => {
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
  if (config.get('options.autoUpdates')) config.set('options.autoUpdates', false);
  await config.plugins.enforceAllowedPlugins();

  const featureConfigs = config.plugins.getPlugins();
  const queue: Promise<void>[] = [];

  for (const [id, feature] of Object.entries(coreFeatures)) {
    const featureConfig = deepmerge(
      feature.config ?? { enabled: false },
      featureConfigs[id] ?? {},
    );

    if (featureConfig.enabled && feature.backend) {
      queue.push(forceLoadMainPlugin(id, win));
    } else if (loadedFeatureMap[id]) {
      queue.push(forceUnloadMainPlugin(id, win));
    }
  }

  await Promise.allSettled(queue);
};

export const unloadAllMainPlugins = async (win: BrowserWindow) => {
  for (const id of Object.keys(loadedFeatureMap)) {
    await forceUnloadMainPlugin(id, win);
  }
};

export const getLoadedMainPlugin = (
  id: string,
): PluginDef<unknown, unknown, unknown> | undefined => loadedFeatureMap[id];

export const getAllLoadedMainPlugins = () => loadedFeatureMap;
