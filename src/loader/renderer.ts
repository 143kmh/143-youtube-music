import { coreFeatures } from '@/core/features';
import { LoggerPrefix, startFeature, stopFeature } from '@/utils';

import type { RendererContext } from '@/types/contexts';
import type { FeatureConfig, FeatureDef } from '@/types/plugins';

const loadedFeatureMap: Record<
  string,
  FeatureDef<unknown, unknown, unknown>
> = {};

export const createContext = <Config extends FeatureConfig>(
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

export const forceUnloadRendererFeature = async (id: string) => {
  const feature = loadedFeatureMap[id];
  if (!feature) return;

  const hasStopped = await stopFeature(id, feature, {
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

export const forceLoadRendererFeature = async (id: string) => {
  if (loadedFeatureMap[id]) return;

  const feature = coreFeatures[id];
  if (!feature?.renderer) return;

  const hasStarted = await startFeature(id, feature, {
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

export const loadAllRendererFeatures = async () => {
  for (const id of Object.keys(coreFeatures)) {
    await forceLoadRendererFeature(id);
  }
};

export const unloadAllRendererFeatures = async () => {
  for (const id of Object.keys(loadedFeatureMap)) {
    await forceUnloadRendererFeature(id);
  }
};

export const getLoadedRendererFeature = (
  id: string,
): FeatureDef<unknown, unknown, unknown> | undefined => loadedFeatureMap[id];

export const getAllLoadedRendererFeatures = () => loadedFeatureMap;

// Temporary compatibility exports until src/renderer.ts moves to feature names.
export const loadAllRendererPlugins = loadAllRendererFeatures;
export const unloadAllRendererPlugins = unloadAllRendererFeatures;
export const forceLoadRendererPlugin = forceLoadRendererFeature;
export const forceUnloadRendererPlugin = forceUnloadRendererFeature;
export const getLoadedRendererPlugin = getLoadedRendererFeature;
export const getAllLoadedRendererPlugins = getAllLoadedRendererFeatures;
