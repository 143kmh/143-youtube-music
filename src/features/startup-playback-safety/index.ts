import { createFeature } from '@/utils';

import backend from './backend';
import renderer from './renderer';

export default createFeature({
  name: () => 'Startup Playback Safety',
  description: () =>
    'Starts 143 Music paused and silent, and never releases startup audio into an advertisement.',
  config: { enabled: true },
  backend,
  renderer,
});
