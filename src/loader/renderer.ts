export {
  createFeatureContext,
  getLoadedRendererFeature,
  getLoadedRendererFeatures,
  loadRendererFeature,
  loadRendererFeatures,
  unloadRendererFeature,
  unloadRendererFeatures,
} from '@/core/renderer-features';

// Temporary compatibility exports until src/renderer.ts moves to feature names.
export {
  createFeatureContext as createContext,
  getLoadedRendererFeature as getLoadedRendererPlugin,
  getLoadedRendererFeatures as getAllLoadedRendererPlugins,
  loadRendererFeature as forceLoadRendererPlugin,
  loadRendererFeatures as loadAllRendererPlugins,
  unloadRendererFeature as forceUnloadRendererPlugin,
  unloadRendererFeatures as unloadAllRendererPlugins,
} from '@/core/renderer-features';
