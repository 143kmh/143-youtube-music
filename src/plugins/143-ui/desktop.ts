import { Menu } from 'electron';

import * as config from '@/config';

import type { QualityConfig } from '../force-high-audio-quality/preference';
import type { BackendContext } from '@/types/contexts';
import type { PluginConfig } from '@/types/plugins';

export const startDesktop = ({ window, ipc }: BackendContext<PluginConfig>) => {
  const read = () => ({
    quality:
      config.plugins.getOptions<QualityConfig>('force-high-audio-quality')
        ?.quality ?? 'maximum',
    enabled:
      config.plugins.getOptions<QualityConfig>('force-high-audio-quality')
        ?.enabled ?? false,
    alwaysOnTop: config.get('options.alwaysOnTop'),
    resumeOnStart: config.get('options.resumeOnStart'),
  });
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
    } else if (key === 'alwaysOnTop' && typeof value === 'boolean') {
      config.set('options.alwaysOnTop', value);
      window.setAlwaysOnTop(value);
    } else if (key === 'resumeOnStart' && typeof value === 'boolean') {
      config.set('options.resumeOnStart', value);
    } else throw new Error('Unsupported setting');
    return read();
  });
  ipc.handle('143:window', (action: string) => {
    if (action === 'advanced')
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
