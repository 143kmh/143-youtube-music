import { createFeature } from '@/utils';

import backend from './backend';
import renderer from './renderer';
import style from './style.css?inline';

export default createFeature({
  name: () => 'Auto Updates',
  description: () =>
    'Automatically download 143 Music updates from GitHub Releases.',
  config: {
    enabled: true,
  },
  stylesheets: [style],
  backend,
  renderer,
});
