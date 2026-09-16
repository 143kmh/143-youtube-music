import { createFeature } from '@/utils';

import style from './style.css?inline';

export default createFeature({
  name: () => '143 Now Playing Lyrics Polish',
  description: () =>
    'Keeps the 143 playback layout while matching the YouTube synced-lyrics presentation.',
  config: { enabled: true },
  stylesheets: [style],
});
