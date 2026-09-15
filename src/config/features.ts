import { deepmerge } from 'deepmerge-ts';

import { restart } from '@/providers/app-controls';

import { store } from './store';

import type { FeatureConfig as BaseFeatureConfig } from '@/types/features';

type FeatureConfig = BaseFeatureConfig & Record<string, unknown>;

const featureDefaults: Record<string, FeatureConfig> = {
  '143-ui': { enabled: true },
  'force-high-audio-quality': { enabled: false, quality: 'maximum' },
};

const featureIds = new Set(Object.keys(featureDefaults));

export function isAllowedFeature(feature: string) {
  return featureIds.has(feature);
}

export function getFeatures() {
  return store.get('plugins') as Record<string, FeatureConfig>;
}

export async function isEnabled(feature: string) {
  if (!isAllowedFeature(feature)) return false;

  const featureConfig = deepmerge(
    featureDefaults[feature],
    (store.get('plugins') as Record<string, FeatureConfig>)[feature] ?? {},
  );
  return featureConfig.enabled;
}

/**
 * Keep only 143-owned feature state in persisted configuration. The underlying
 * `plugins` store key is retained temporarily so existing installs keep their
 * audio settings while the runtime itself uses feature terminology.
 */
export async function enforceAllowedFeatures() {
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
  if (!isAllowedFeature(feature)) return;

  const features = store.get('plugins') as Record<string, T>;
  const nextOptions = { ...options } as T;
  exclude.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(nextOptions, key)) {
      delete nextOptions[key as keyof T];
    }
  });

  store.set('plugins', {
    ...features,
    [feature]: {
      ...features[feature],
      ...nextOptions,
    },
  });
}

export function setMenuOptions<T>(
  feature: string,
  options: T,
  exclude: string[] = ['enabled'],
) {
  if (!isAllowedFeature(feature)) return;

  setOptions(feature, options, exclude);
  if (store.get('options.restartOnConfigChanges')) restart();
}

export function getOptions<T>(feature: string): T {
  return (store.get('plugins') as Record<string, T>)[feature];
}

export function enable(feature: string) {
  if (!isAllowedFeature(feature)) return;
  setMenuOptions(feature, { enabled: true }, []);
}

export function disable(feature: string) {
  if (!isAllowedFeature(feature)) return;
  setMenuOptions(feature, { enabled: false }, []);
}
