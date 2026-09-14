import { deepmerge } from 'deepmerge-ts';
import { allPlugins } from 'virtual:plugins';

import { restart } from '@/providers/app-controls';

import { store } from './store';

import type { PluginConfig } from '@/types/plugins';

const allowedPluginIds = new Set(['143-ui', 'force-high-audio-quality']);

export function isAllowedPlugin(plugin: string) {
  return allowedPluginIds.has(plugin);
}

export function getPlugins() {
  return store.get('plugins') as Record<string, PluginConfig>;
}

export async function isEnabled(plugin: string) {
  if (!isAllowedPlugin(plugin)) return false;

  const pluginConfig = deepmerge(
    (await allPlugins())[plugin]?.config ?? { enabled: false },
    (store.get('plugins') as Record<string, PluginConfig>)[plugin] ?? {},
  );
  return pluginConfig !== undefined && pluginConfig.enabled;
}

/**
 * Force the fork into a stock-YouTube-Music baseline by persisting every
 * upstream Pear plugin as disabled. Only the 143-owned features stay enabled.
 */
export async function enforceAllowedPlugins() {
  const plugins = store.get('plugins') as Record<string, PluginConfig>;
  const next: Record<string, PluginConfig> = { ...plugins };

  for (const id of Object.keys(await allPlugins())) {
    if (isAllowedPlugin(id)) continue;
    next[id] = {
      ...(plugins[id] ?? { enabled: false }),
      enabled: false,
    };
  }

  store.set('plugins', next);
}

/**
 * Set options for a plugin
 * @param plugin Plugin name
 * @param options Options to set
 * @param exclude Options to exclude from the options object
 */
export function setOptions<T>(
  plugin: string,
  options: T,
  exclude: string[] = ['enabled'],
) {
  if (!isAllowedPlugin(plugin)) return;

  const plugins = store.get('plugins') as Record<string, T>;
  // HACK: This is a workaround for preventing changed options from being overwritten
  exclude.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(options, key)) {
      delete options[key as keyof T];
    }
  });
  store.set('plugins', {
    ...plugins,
    [plugin]: {
      ...plugins[plugin],
      ...options,
    },
  });
}

export function setMenuOptions<T>(
  plugin: string,
  options: T,
  exclude: string[] = ['enabled'],
) {
  if (!isAllowedPlugin(plugin)) return;

  setOptions(plugin, options, exclude);
  if (store.get('options.restartOnConfigChanges')) {
    restart();
  }
}

export function getOptions<T>(plugin: string): T {
  return (store.get('plugins') as Record<string, T>)[plugin];
}

export function enable(plugin: string) {
  if (!isAllowedPlugin(plugin)) return;
  setMenuOptions(plugin, { enabled: true }, []);
}

export function disable(plugin: string) {
  if (!isAllowedPlugin(plugin)) return;
  setMenuOptions(plugin, { enabled: false }, []);
}
