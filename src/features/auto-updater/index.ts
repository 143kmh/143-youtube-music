import { createFeature } from '@/utils';

import backend from './backend';

export default createFeature({
  name: () => 'Auto Updates',
  description: () => 'Automatically download 143 Music updates from GitHub Releases.',
  config: {
    enabled: true,
  },
  backend,
});
