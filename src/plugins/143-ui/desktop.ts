import { Menu } from 'electron';

import * as config from '@/config';

import type { DiscordPluginConfig } from '../discord';
import type { QualityConfig } from '../force-high-audio-quality/preference';
import type { BackendContext } from '@/types/contexts';
import type { PluginConfig } from '@/types/plugins';

const PLAY_ON_YOUTUBE_MUSIC =
  'playOn\u0059\u006f\u0075\u0054\u0075\u0062\u0065\u004d\u0075\u0073\u0069\u0063' as const;

export const startDesktop = ({ window, ipc }: BackendContext<PluginConfig>) => {
  const read = () => {
    const discord = config.plugins.getOptions<DiscordPluginConfig>('discord');
    return {
      quality:
        config.plugins.getOptions<QualityConfig>('force-high-audio-quality')
          ?.quality ?? 'maximum',
      enabled:
        config.plugins.getOptions<QualityConfig>('force-high-audio-quality')
          ?.enabled ?? false,
      discordEnabled: discord?.enabled ?? false,
      discordAutoReconnect: discord?.autoReconnect ?? true,
      discordShowDuration: !(discord?.hideDurationLeft ?? false),
      discordClearOnPause: discord?.activityTimeoutEnabled ?? true,
      discordPauseTimeoutMinutes: Math.max(
        0,
        Math.round((discord?.activityTimeoutTime ?? 10 * 60 * 1000) / 60_000),
      ),
      discordPlayButton: discord?.[PLAY_ON_YOUTUBE_MUSIC] ?? true,
      discordShowGitHubButton: !(discord?.hideGitHubButton ?? true),
      alwaysOnTop: config.get('options.alwaysOnTop'),
      resumeOnStart: config.get('options.resumeOnStart'),
      customFrame: process.platform !== 'darwin',
      maximized: window.isMaximized(),
    };
  };
  ipc.handle('143:settings:get', read);
  ipc.handle('143:settings:set', (key: string, value: unknown) => {
    if (
      key === 'quality' &&
      (value === 'default' || value === 'maximum' || value === 'opus')
    ) {
      config.plugins.setOptions('force-high-audio-quality', { quality: value });
    } else if (key === 'enabled' && typeof value === 'boolean') {
      config.plugins.setOptions(
        'force-high-audio-quality',
        { enabled: value },
        [],
      );
    } else if (key === 'discordEnabled' && typeof value === 'boolean') {
      config.plugins.setOptions('discord', { enabled: value }, []);
    } else if (
      key === 'discordAutoReconnect' &&
      typeof value === 'boolean'
    ) {
      config.plugins.setOptions('discord', { autoReconnect: value });
    } else if (
      key === 'discordShowDuration' &&
      typeof value === 'boolean'
    ) {
      config.plugins.setOptions('discord', { hideDurationLeft: !value });
    } else if (
      key === 'discordClearOnPause' &&
      typeof value === 'boolean'
    ) {
      config.plugins.setOptions('discord', { activityTimeoutEnabled: value });
    } else if (
      key === 'discordPauseTimeoutMinutes' &&
      typeof value === 'number' &&
      Number.isFinite(value)
    ) {
      config.plugins.setOptions('discord', {
        activityTimeoutTime: Math.round(Math.max(0, Math.min(1440, value)) * 60_000),
      });
    } else if (
      key === 'discordPlayButton' &&
      typeof value === 'boolean'
    ) {
      config.plugins.setOptions('discord', { [PLAY_ON_YOUTUBE_MUSIC]: value });
    } else if (
      key === 'discordShowGitHubButton' &&
      typeof value === 'boolean'
    ) {
      config.plugins.setOptions('discord', { hideGitHubButton: !value });
    } else if (key === 'alwaysOnTop' && typeof value === 'boolean') {
      config.set('options.alwaysOnTop', value);
      window.setAlwaysOnTop(value);
    } else if (key === 'resumeOnStart' && typeof value === 'boolean') {
      config.set('options.resumeOnStart', value);
    } else throw new Error('Unsupported setting');
    return read();
  });
  ipc.handle('143:window', (action: string) => {
    if (action === 'minimize') window.minimize();
    else if (action === 'maximize') {
      if (window.isMaximized()) window.unmaximize();
      else window.maximize();
    } else if (action === 'close') window.close();
    else if (action === 'advanced')
      Menu.getApplicationMenu()?.popup({ window });
    else if (action === 'audio-details')
      window.webContents.send('peard:force-high-audio-quality:inspect');
  });
  return () => {
    for (const channel of [
      '143:settings:get',
      '143:settings:set',
      '143:window',
    ])
      ipc.removeHandler(channel);
  };
};
