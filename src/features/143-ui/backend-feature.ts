import { createFeature } from '@/utils';

import backend from './backend';

export default createFeature({
  name: () => '143 Music UI',
  description: () =>
    'A compact Spotify-inspired shell for the YouTube Music engine.',
  restartNeeded: true,
  config: {
    enabled: true,
  },
  backend,
});
