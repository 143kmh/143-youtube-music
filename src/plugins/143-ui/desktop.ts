import fs from 'node:fs';
import path from 'node:path';

import WindowsIcon from '@assets/143-music-icon.png?asset&asarUnpack';
import { Menu, app, nativeImage } from 'electron';

import * as config from '@/config';

import { DiscordRichPresence } from './discord-rich-presence';

import type {
  DiscordPresenceSettings,
  DiscordPresenceTrack,
} from './discord-rich-presence';
import type { QualityConfig } from '../force-high-audio-quality/preference';
import type { BackendContext } from '@/types/contexts';
import type { FeatureConfig } from '@/types/features';

const DISCORD_APPLICATION_ID = '1549504717527322724';
const WINDOWS_APP_ID = 'com.143aimclub.music';
const DEFAULT_DISCORD_SETTINGS: DiscordPresenceSettings = {
  enabled: false,
  applicationId: DISCORD_APPLICATION_ID,
  autoReconnect: true,
  showRemainingTime: true,
  clearOnPause: true,
  pauseTimeoutMinutes: 10,
  playButton: true,
};

const createSingleImageIco = (png: Buffer, width: number, height: number) => {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry.writeUInt8(width >= 256 ? 0 : width, 0);
  entry.writeUInt8(height >= 256 ? 0 : height, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);

  return Buffer.concat([header, entry, png]);
};

const ensureWindowsTaskbarIcon = () => {
  const source = nativeImage.createFromPath(WindowsIcon);
  if (source.isEmpty()) throw new Error(`Could not load ${WindowsIcon}`);

  const image = source.resize({ width: 64, height: 64, quality: 'best' });
  const png = image.toPNG();
  const ico = createSingleImageIco(png, 64, 64);
  const iconPath = path.join(app.getPath('userData'), '143-music-taskbar.ico');
  fs.writeFileSync(iconPath, ico);

  return { iconPath, image };
};

export const startDesktop = ({ window, ipc }: BackendContext<FeatureConfig>) => {
  const presence = new DiscordRichPresence();
  const channels = [
    '143:settings:get',
    '143:settings:set',
    '143:discord:update',
    '143:window',
  ] as const;

  for (const channel of channels) ipc.removeHandler(channel);

  const discordSettings = (): DiscordPresenceSettings => ({
    ...DEFAULT_DISCORD_SETTINGS,
    ...(config.get('options.discordRichPresence') ?? {}),
    applicationId: DISCORD_APPLICATION_ID,
  });

  const applyDiscordSettings = (settings: DiscordPresenceSettings) => {
    try {
      presence.applySettings(settings);
    } catch (error) {
      console.warn('[143 Music] Discord presence initialization failed', error);
    }
  };

  const updateDiscordSettings = (patch: Partial<DiscordPresenceSettings>) => {
    const next = {
      ...discordSettings(),
      ...patch,
      applicationId: DISCORD_APPLICATION_ID,
    };
    config.set('options.discordRichPresence', next);
    applyDiscordSettings(next);
  };

  const read = () => {
    const discord = discordSettings();
    return {
      quality:
        config.features.getOptions<QualityConfig>('force-high-audio-quality')
          ?.quality ?? 'maximum',
      enabled:
        config.features.getOptions<QualityConfig>('force-high-audio-quality')
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
      config.features.setOptions('force-high-audio-quality', { quality: value });
    } else if (key === 'enabled' && typeof value === 'boolean') {
      config.features.setOptions(
        'force-high-audio-quality',
        { enabled: value },
        [],
      );
    } else if (key === 'discordEnabled' && typeof value === 'boolean') {
      updateDiscordSettings({ enabled: value });
    } else if (key === 'discordApplicationId' && typeof value === 'string') {
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
    try {
      presence.updateTrack(track);
    } catch (error) {
      console.warn('[143 Music] Discord presence update failed', error);
    }
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
      window.webContents.send('app:audio:inspect');
  });

  applyDiscordSettings(discordSettings());

  if (process.platform === 'win32') {
    try {
      app.setAppUserModelId(WINDOWS_APP_ID);

      const { iconPath, image } = ensureWindowsTaskbarIcon();
      window.setIcon(image);
      window.setAppDetails({
        appId: WINDOWS_APP_ID,
        appIconPath: iconPath,
        appIconIndex: 0,
        relaunchCommand: process.execPath,
        relaunchDisplayName: 'YouTube Music',
      });
    } catch (error) {
      console.warn('[143 Music] Could not apply Windows window icon', error);
    }
  }

  return () => {
    presence.dispose();
    for (const channel of channels) ipc.removeHandler(channel);
  };
};
