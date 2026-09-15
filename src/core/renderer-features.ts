import { coreFeatures } from '@/core/features';
import { LoggerPrefix, startFeature, stopFeature } from '@/utils';

import type { RendererContext } from '@/types/contexts';
import type { FeatureConfig, FeatureDef } from '@/types/plugins';

const loadedFeatureMap: Record<
  string,
  FeatureDef<unknown, unknown, unknown>
> = {};

export const createFeatureContext = <Config extends FeatureConfig>(
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

export const unloadRendererFeature = async (id: string) => {
  const feature = loadedFeatureMap[id];
  if (!feature) return;

  const hasStopped = await stopFeature(id, feature, {
    ctx: 'renderer',
    context: createFeatureContext(id),
  });

  if (feature.stylesheets) {
    document.querySelector(`style#feature-${id}`)?.remove();
  }

  if (hasStopped || (hasStopped === null && feature.renderer)) {
    delete loadedFeatureMap[id];
    console.log(LoggerPrefix, `Core feature ${id} stopped`);
  }
};

export const loadRendererFeature = async (id: string) => {
  if (loadedFeatureMap[id]) return;

  const feature = coreFeatures[id];
  if (!feature?.renderer) return;

  const hasStarted = await startFeature(id, feature, {
    ctx: 'renderer',
    context: createFeatureContext(id),
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

export const loadRendererFeatures = async () => {
  for (const id of Object.keys(coreFeatures)) {
    await loadRendererFeature(id);
  }
};

export const unloadRendererFeatures = async () => {
  for (const id of Object.keys(loadedFeatureMap)) {
    await unloadRendererFeature(id);
  }
};

export const getLoadedRendererFeature = (
  id: string,
): FeatureDef<unknown, unknown, unknown> | undefined => loadedFeatureMap[id];

export const getLoadedRendererFeatures = () => loadedFeatureMap;
