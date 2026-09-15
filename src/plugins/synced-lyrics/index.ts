import { t } from '@/i18n';
import { createFeature } from '@/utils';

import { backend } from './backend';
import { menu } from './menu';
import { renderer } from './renderer';
import style from './style.css?inline';

import type { SyncedLyricsFeatureConfig } from './types';

export default createFeature<
  typeof backend,
  unknown,
  typeof renderer,
  SyncedLyricsFeatureConfig
>({
  name: () => t('plugins.synced-lyrics.name'),
  description: () => t('plugins.synced-lyrics.description'),
  authors: ['Non0reo', 'ArjixWasTaken', 'KimJammer', 'Strvm'],
  restartNeeded: true,
  addedVersion: '3.5.X',
  config: {
    enabled: false,
    preciseTiming: true,
    showLyricsEvenIfInexact: true,
    showTimeCodes: false,
    defaultTextString: '♪',
    lineEffect: 'fancy',
    romanization: true,
  },

  menu,
  renderer,
  backend,
  stylesheets: [style],
});
