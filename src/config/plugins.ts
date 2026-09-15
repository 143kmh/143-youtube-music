import { deepmerge } from 'deepmerge-ts';

import { restart } from '@/providers/app-controls';

import { store } from './store';

import type { PluginConfig } from '@/types/plugins';

type FeatureConfig = PluginConfig & Record<string, unknown>;

const featureDefaults: Record<string, FeatureConfig> = {
  '143-ui': { enabled: true },
  'force-high-audio-quality': { enabled: false, quality: 'maximum' },
};

const featureIds = new Set(Object.keys(featureDefaults));

export function isAllowedPlugin(feature: string) {
  return featureIds.has(feature);
}

export function getPlugins() {
  return store.get('plugins') as Record<string, FeatureConfig>;
}

export async function isEnabled(feature: string) {
  if (!isAllowedPlugin(feature)) return false;

  const featureConfig = deepmerge(
    featureDefaults[feature],
    (store.get('plugins') as Record<string, FeatureConfig>)[feature] ?? {},
  );
  return featureConfig.enabled;
}

/**
 * Remove inherited Pear feature state from persisted configuration. The two
 * 143-owned modules are the only entries that remain for legacy compatibility.
 */
export async function enforceAllowedPlugins() {
  const stored = store.get('plugins') as Record<string, FeatureConfig>;
  const next: Record<string, FeatureConfig> = {};

  for (const id of featureIds) {
    next[id] = deepmerge(featureDefaults[id], stored[id] ?? {});
  }

  store.set('plugins', next);
}

export function setOptions<T>(
  feature: string,
  options: T,
  exclude: string[] = ['enabled'],
) {
  if (!isAllowedPlugin(feature)) return;

  const plugins = store.get('plugins') as Record<string, T>;
  const nextOptions = { ...options } as T;
  exclude.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(nextOptions, key)) {
      delete nextOptions[key as keyof T];
    }
  });

  store.set('plugins', {
    ...plugins,
    [feature]: {
      ...plugins[feature],
      ...nextOptions,
    },
  });
}

export function setMenuOptions<T>(
  feature: string,
  options: T,
  exclude: string[] = ['enabled'],
) {
  if (!isAllowedPlugin(feature)) return;

  setOptions(feature, options, exclude);
  if (store.get('options.restartOnConfigChanges')) restart();
}

export function getOptions<T>(feature: string): T {
  return (store.get('plugins') as Record<string, T>)[feature];
}

export function enable(feature: string) {
  if (!isAllowedPlugin(feature)) return;
  setMenuOptions(feature, { enabled: true }, []);
}

export function disable(feature: string) {
  if (!isAllowedPlugin(feature)) return;
  setMenuOptions(feature, { enabled: false }, []);
}
