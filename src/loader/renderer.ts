import { deepmerge } from 'deepmerge-ts';

import { coreFeatures } from '@/core/features';
import { LoggerPrefix, startPlugin, stopPlugin } from '@/utils';

import type { RendererContext } from '@/types/contexts';
import type { PluginConfig, PluginDef } from '@/types/plugins';

const unregisterStyleMap: Record<string, (() => void)[]> = {};
const loadedFeatureMap: Record<
  string,
  PluginDef<unknown, unknown, unknown>
> = {};

export const createContext = <Config extends PluginConfig>(
  id: string,
): RendererContext<Config> => ({
  getConfig: () =>
    window.ipcRenderer.invoke('app:get-feature-config', id) as Promise<Config>,
  setConfig: async (newConfig) => {
    await window.ipcRenderer.invoke('app:set-feature-config', id, newConfig);
  },
  ipc: {
    send: (event: string, ...args: unknown[]) => {
      window.ipcRenderer.send(event, ...args);
    },
    invoke: (event: string, ...args: unknown[]) =>
      window.ipcRenderer.invoke(event, ...args),
    on: (event: string, listener: CallableFunction) => {
      window.ipcRenderer.on(event, (_, ...args: unknown[]) => {
        listener(...args);
      });
    },
    removeAllListeners: (event: string) => {
      window.ipcRenderer.removeAllListeners(event);
    },
  },
});

export const forceUnloadRendererPlugin = async (id: string) => {
  unregisterStyleMap[id]?.forEach((unregister) => unregister());
  delete unregisterStyleMap[id];

  const feature = loadedFeatureMap[id];
  if (!feature) return;

  const hasStopped = await stopPlugin(id, feature, {
    ctx: 'renderer',
    context: createContext(id),
  });

  if (feature.stylesheets) {
    document.querySelector(`style#feature-${id}`)?.remove();
  }

  if (hasStopped || (hasStopped === null && feature.renderer)) {
    delete loadedFeatureMap[id];
    console.log(LoggerPrefix, `Core feature ${id} stopped`);
  }
};

export const forceLoadRendererPlugin = async (id: string) => {
  const feature = coreFeatures[id];
  if (!feature?.renderer) return;

  const hasStarted = await startPlugin(id, feature, {
    ctx: 'renderer',
    context: createContext(id),
  });

  if (
    hasStarted ||
    feature.stylesheets ||
    (hasStarted === null &&
      typeof feature.renderer !== 'function' &&
      feature.renderer)
  ) {
    loadedFeatureMap[id] = feature;

    if (feature.stylesheets) {
      const styleSheetList = feature.stylesheets.map((style) => {
        const styleSheet = new CSSStyleSheet();
        styleSheet.replaceSync(style);
        return styleSheet;
      });

      document.adoptedStyleSheets = [
        ...document.adoptedStyleSheets,
        ...styleSheetList,
      ];
    }

    console.log(LoggerPrefix, `Core feature ${id} loaded`);
  }
};

export const loadAllRendererPlugins = async () => {
  const featureConfigs = window.mainConfig.plugins.getPlugins();

  for (const [id, feature] of Object.entries(coreFeatures)) {
    const featureConfig = deepmerge(
      feature.config ?? { enabled: false },
      featureConfigs[id] ?? {},
    );

    if (featureConfig.enabled && feature.renderer) {
      await forceLoadRendererPlugin(id);
    } else if (loadedFeatureMap[id]) {
      await forceUnloadRendererPlugin(id);
    }
  }
};

export const unloadAllRendererPlugins = async () => {
  for (const id of Object.keys(loadedFeatureMap)) {
    await forceUnloadRendererPlugin(id);
  }
};

export const getLoadedRendererPlugin = (
  id: string,
): PluginDef<unknown, unknown, unknown> | undefined => loadedFeatureMap[id];

export const getAllLoadedRendererPlugins = () => loadedFeatureMap;
