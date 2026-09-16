import { createFeature } from '@/utils';

import backend from './backend';
import renderer from './renderer';

export default createFeature({
  name: () => 'OBS Overlay',
  description: () =>
    'Local transparent now-playing overlay for OBS Browser Source.',
  config: {
    enabled: true,
  },
  backend,
  renderer,
});
