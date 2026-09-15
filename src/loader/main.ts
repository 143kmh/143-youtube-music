export {
  getLoadedMainFeature,
  getLoadedMainFeatures,
  loadMainFeature,
  loadMainFeatures,
  unloadMainFeature,
  unloadMainFeatures,
} from '@/core/main-features';

// Temporary compatibility exports until src/index.ts moves to feature names.
export {
  getLoadedMainFeature as getLoadedMainPlugin,
  getLoadedMainFeatures as getAllLoadedMainPlugins,
  loadMainFeature as forceLoadMainPlugin,
  loadMainFeatures as loadAllMainPlugins,
  unloadMainFeature as forceUnloadMainPlugin,
  unloadMainFeatures as unloadAllMainPlugins,
} from '@/core/main-features';
