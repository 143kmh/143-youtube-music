import { expect, test } from '@playwright/test';

import { interceptPlayerVars } from '../src/plugins/force-high-audio-quality/player-vars';

test('experimental Opus mode clears the AAC-high bias without enabling low quality', () => {
  let received: unknown;
  const api = {
    loadVideoByPlayerVars(vars: unknown) {
      received = vars;
    },
  };

  const restore = interceptPlayerVars(
    api,
    () => true,
    () => {},
    () => false,
  );

  api.loadVideoByPlayerVars({
    video_id: 'track',
    aac_high: true,
    prefer_low_quality_audio: true,
  });

  expect(received).toEqual({
    video_id: 'track',
    aac_high: false,
    prefer_low_quality_audio: false,
  });

  restore();
});
