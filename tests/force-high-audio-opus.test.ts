import { expect, test } from '@playwright/test';

import { patchPlayerResponseForOpus } from '../src/features/force-high-audio-quality/player-script-patch';
import { interceptPlayerVars } from '../src/features/force-high-audio-quality/player-vars';

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

test('Opus response patch keeps the best HIGH Opus stream and all video formats', () => {
  const response = JSON.stringify({
    streamingData: {
      adaptiveFormats: [
        {
          itag: 137,
          mimeType: 'video/mp4; codecs="avc1.640028"',
          bitrate: 4_000_000,
        },
        {
          itag: 140,
          mimeType: 'audio/mp4; codecs="mp4a.40.2"',
          audioQuality: 'AUDIO_QUALITY_MEDIUM',
          averageBitrate: 130_000,
        },
        {
          itag: 141,
          mimeType: 'audio/mp4; codecs="mp4a.40.2"',
          audioQuality: 'AUDIO_QUALITY_HIGH',
          averageBitrate: 258_000,
        },
        {
          itag: 251,
          mimeType: 'audio/webm; codecs="opus"',
          audioQuality: 'AUDIO_QUALITY_MEDIUM',
          averageBitrate: 145_000,
        },
        {
          itag: 774,
          mimeType: 'audio/webm; codecs="opus"',
          audioQuality: 'AUDIO_QUALITY_HIGH',
          averageBitrate: 287_000,
        },
      ],
    },
  });

  const result = patchPlayerResponseForOpus(response);
  expect(result.patched).toBe(true);
  expect(result.selectedItag).toBe('774');
  expect(result.error).toBeNull();

  const parsed = JSON.parse(result.source);
  expect(
    parsed.streamingData.adaptiveFormats.map((format: { itag: number }) =>
      format.itag,
    ),
  ).toEqual([137, 774]);
});

test('Opus response patch prefers non-DRC and otherwise falls back to best Opus', () => {
  const response = JSON.stringify({
    streamingData: {
      adaptiveFormats: [
        {
          itag: 251,
          mimeType: 'audio/webm; codecs="opus"',
          audioQuality: 'AUDIO_QUALITY_MEDIUM',
          averageBitrate: 145_000,
        },
        {
          itag: 777,
          mimeType: 'audio/webm; codecs="opus"',
          audioQuality: 'AUDIO_QUALITY_HIGH',
          averageBitrate: 300_000,
          isDrc: true,
        },
        {
          itag: 774,
          mimeType: 'audio/webm; codecs="opus"',
          audioQuality: 'AUDIO_QUALITY_HIGH',
          averageBitrate: 287_000,
        },
      ],
    },
  });

  const result = patchPlayerResponseForOpus(response);
  expect(result.selectedItag).toBe('774');
});

test('Opus response patch fails open when the response offers no Opus audio', () => {
  const response = JSON.stringify({
    streamingData: {
      adaptiveFormats: [
        {
          itag: 141,
          mimeType: 'audio/mp4; codecs="mp4a.40.2"',
          audioQuality: 'AUDIO_QUALITY_HIGH',
          averageBitrate: 258_000,
        },
      ],
    },
  });

  const result = patchPlayerResponseForOpus(response);
  expect(result.patched).toBe(false);
  expect(result.source).toBe(response);
  expect(result.selectedItag).toBeNull();
  expect(result.error).toBe('No Opus audio format offered');
});
