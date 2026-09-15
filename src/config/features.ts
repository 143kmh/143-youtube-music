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

const readFeatureState = () =>
  (store.get('features') ?? {}) as Record<string, FeatureConfig>;

export function isAllowedFeature(feature: string) {
  return featureIds.has(feature);
}

export function getFeatures() {
  return readFeatureState();
}

export async function isEnabled(feature: string) {
  if (!isAllowedFeature(feature)) return false;

  const featureConfig = deepmerge(
    featureDefaults[feature],
    readFeatureState()[feature] ?? {},
  );
  return featureConfig.enabled;
}

/**
 * Keep only 143-owned feature state and migrate the legacy `plugins` key once.
 * New feature state wins if both keys exist, while old installs retain their
 * audio/UI settings on the first launch after the migration.
 */
export async function enforceAllowedFeatures() {
  const stored = readFeatureState();
  const legacy = (store.get('plugins') ?? {}) as Record<string, FeatureConfig>;
  const next: Record<string, FeatureConfig> = {};

  for (const id of featureIds) {
    next[id] = deepmerge(
      featureDefaults[id],
      legacy[id] ?? {},
      stored[id] ?? {},
    );
  }

  store.set('features', next);
  store.delete('plugins');
}

export function setOptions<T>(
  feature: string,
  options: T,
  exclude: string[] = ['enabled'],
) {
  if (!isAllowedFeature(feature)) return;

  const features = readFeatureState() as Record<string, T>;
  const nextOptions = { ...options } as T;
  exclude.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(nextOptions, key)) {
      delete nextOptions[key as keyof T];
    }
  });

  store.set('features', {
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
  return readFeatureState()[feature] as T;
}

export function enable(feature: string) {
  if (!isAllowedFeature(feature)) return;
  setMenuOptions(feature, { enabled: true }, []);
}

export function disable(feature: string) {
  if (!isAllowedFeature(feature)) return;
  setMenuOptions(feature, { enabled: false }, []);
}
