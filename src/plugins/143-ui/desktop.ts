import { Menu } from 'electron';

import * as config from '@/config';

import { DiscordRichPresence } from './discord-rich-presence';

import type {
  DiscordPresenceSettings,
  DiscordPresenceTrack,
} from './discord-rich-presence';
import type { QualityConfig } from '../force-high-audio-quality/preference';
import type { BackendContext } from '@/types/contexts';
import type { PluginConfig } from '@/types/plugins';

const DISCORD_APPLICATION_ID = '1549504717527322724';
const DEFAULT_DISCORD_SETTINGS: DiscordPresenceSettings = {
  enabled: false,
  applicationId: DISCORD_APPLICATION_ID,
  autoReconnect: true,
  showRemainingTime: true,
  clearOnPause: true,
  pauseTimeoutMinutes: 10,
  playButton: true,
};

export const startDesktop = ({ window, ipc }: BackendContext<PluginConfig>) => {
  const presence = new DiscordRichPresence();
  const discordSettings = (): DiscordPresenceSettings => ({
    ...DEFAULT_DISCORD_SETTINGS,
    ...(config.get('options.discordRichPresence') ?? {}),
    applicationId: DISCORD_APPLICATION_ID,
  });
  const updateDiscordSettings = (patch: Partial<DiscordPresenceSettings>) => {
    const next = {
      ...discordSettings(),
      ...patch,
      applicationId: DISCORD_APPLICATION_ID,
    };
    config.set('options.discordRichPresence', next);
    presence.applySettings(next);
  };

  presence.applySettings(discordSettings());

  const read = () => {
    const discord = discordSettings();
    return {
      quality:
        config.plugins.getOptions<QualityConfig>('force-high-audio-quality')
          ?.quality ?? 'maximum',
      enabled:
        config.plugins.getOptions<QualityConfig>('force-high-audio-quality')
          ?.enabled ?? false,
      discordEnabled: discord.enabled,
      discordApplicationId: DISCORD_APPLICATION_ID,
      discordAutoReconnect: discord.autoReconnect,
      discordShowDuration: discord.showRemainingTime,
      discordClearOnPause: discord.clearOnPause,
      discordPauseTimeoutMinutes: discord.pauseTimeoutMinutes,
      discordPlayButton: discord.playButton,
      discordStatus: presence.getStatus(),
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
      updateDiscordSettings({ enabled: value });
    } else if (key === 'discordApplicationId' && typeof value === 'string') {
      // Kept for compatibility with older renderer builds. The app identity is
      // bundled with 143 Music and cannot drift through user config.
      updateDiscordSettings({ applicationId: DISCORD_APPLICATION_ID });
    } else if (
      key === 'discordAutoReconnect' &&
      typeof value === 'boolean'
    ) {
      updateDiscordSettings({ autoReconnect: value });
    } else if (
      key === 'discordShowDuration' &&
      typeof value === 'boolean'
    ) {
      updateDiscordSettings({ showRemainingTime: value });
    } else if (
      key === 'discordClearOnPause' &&
      typeof value === 'boolean'
    ) {
      updateDiscordSettings({ clearOnPause: value });
    } else if (
      key === 'discordPauseTimeoutMinutes' &&
      typeof value === 'number' &&
      Number.isFinite(value)
    ) {
      updateDiscordSettings({
        pauseTimeoutMinutes: Math.max(0, Math.min(1440, Math.round(value))),
      });
    } else if (
      key === 'discordPlayButton' &&
      typeof value === 'boolean'
    ) {
      updateDiscordSettings({ playButton: value });
    } else if (key === 'alwaysOnTop' && typeof value === 'boolean') {
      config.set('options.alwaysOnTop', value);
      window.setAlwaysOnTop(value);
    } else if (key === 'resumeOnStart' && typeof value === 'boolean') {
      config.set('options.resumeOnStart', value);
    } else throw new Error('Unsupported setting');
    return read();
  });

  ipc.handle('143:discord:update', (track: DiscordPresenceTrack) => {
    presence.updateTrack(track);
    return presence.getStatus();
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
    presence.dispose();
    for (const channel of [
      '143:settings:get',
      '143:settings:set',
      '143:discord:update',
      '143:window',
    ])
      ipc.removeHandler(channel);
  };
};
