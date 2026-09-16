import { test, expect } from '@playwright/test';
import {
  interceptPlayerVars,
  findMusicPlayerProxy,
} from '../src/features/force-high-audio-quality/player-vars';

import { overrideAudioQuality } from '../src/features/force-high-audio-quality/preference';
import {
  readAudioDiagnostics,
  readPlaybackDetails,
} from '../src/features/force-high-audio-quality/diagnostics';

test('native preference becomes high, preserves subscriber gate, and restores exactly', () => {
  const config = {
    AUDIO_QUALITY: 'AUDIO_QUALITY_MEDIUM',
    IS_SUBSCRIBER: false,
  };
  const before = Object.getOwnPropertyDescriptor(config, 'AUDIO_QUALITY');
  const restore = overrideAudioQuality(config);
  expect(restore).not.toBeNull();
  expect(config.AUDIO_QUALITY).toBe('AUDIO_QUALITY_HIGH');
  expect(config.IS_SUBSCRIBER).toBe(false);
  restore!();
  expect(Object.getOwnPropertyDescriptor(config, 'AUDIO_QUALITY')).toEqual(
    before,
  );
  restore!();
  expect(config.AUDIO_QUALITY).toBe('AUDIO_QUALITY_MEDIUM');
});

test('YouTube settings writes survive Default and repeated enable/disable', () => {
  const config = { AUDIO_QUALITY: 'AUDIO_QUALITY_MEDIUM' };
  for (let i = 0; i < 3; i++) {
    const restore = overrideAudioQuality(config);
    Object.assign(config, { AUDIO_QUALITY: 'AUDIO_QUALITY_LOW' });
    expect(config.AUDIO_QUALITY).toBe('AUDIO_QUALITY_HIGH');
    restore!();
    expect(config.AUDIO_QUALITY).toBe('AUDIO_QUALITY_LOW');
  }
});

test('missing, frozen, read-only, and accessor contracts fail open', () => {
  const getter = () => 'AUDIO_QUALITY_LOW';
  const configs = [
    {},
    { AUDIO_QUALITY: 'unexpected-new-contract' },
    Object.freeze({ AUDIO_QUALITY: 'AUDIO_QUALITY_MEDIUM' }),
    Object.defineProperty({}, 'AUDIO_QUALITY', {
      configurable: true,
      value: 'AUDIO_QUALITY_LOW',
    }),
    Object.defineProperty({}, 'AUDIO_QUALITY', {
      configurable: true,
      get: getter,
    }),
  ];
  for (const config of configs) {
    const before = Object.getOwnPropertyDescriptors(config);
    expect(overrideAudioQuality(config)).toBeNull();
    expect(Object.getOwnPropertyDescriptors(config)).toEqual(before);
  }
});

test('cleanup does not overwrite a later owner of the preference', () => {
  const config = { AUDIO_QUALITY: 'AUDIO_QUALITY_MEDIUM' };
  const restore = overrideAudioQuality(config);
  Object.defineProperty(config, 'AUDIO_QUALITY', {
    value: 'replacement',
    writable: true,
  });
  restore!();
  expect(config.AUDIO_QUALITY).toBe('replacement');
});

const formats = [
  {
    itag: 140,
    mimeType: 'audio/mp4; codecs="mp4a.40.2"',
    averageBitrate: 129000,
    bitrate: 145000,
  },
  {
    itag: 141,
    mimeType: 'audio/mp4; codecs="mp4a.40.2"',
    averageBitrate: 256000,
  },
  { itag: 774, mimeType: 'audio/webm; codecs="opus"', averageBitrate: 258000 },
];

for (const [itag, codec, kbps] of [
  [140, 'mp4a.40.2', 129],
  [141, 'mp4a.40.2', 256],
  [774, 'opus', 258],
] as const) {
  test(`reports selected ${itag}, never substitutes a better advertised format`, () => {
    expect(
      readAudioDiagnostics({
        getStatsForNerds: () => ({
          codecs: `avc1.4d401e (134) / ${codec} (${itag})`,
        }),
        getPlayerResponse: () => ({
          streamingData: { adaptiveFormats: formats },
        }),
      }),
    ).toEqual({ itag, codec, approximateKbps: kbps });
  });
}

test('audio-only SFN, bitrate fallback, and unknown future itags', () => {
  expect(
    readAudioDiagnostics({
      getStatsForNerds: () => ({ codecs: 'opus (999)' }),
      getPlayerResponse: () => ({
        streamingData: {
          adaptiveFormats: [
            {
              itag: 999,
              mimeType: 'audio/webm; codecs="opus"',
              bitrate: 257500,
            },
          ],
        },
      }),
    }),
  ).toEqual({ itag: 999, codec: 'opus', approximateKbps: 258 });
});

test('missing or ambiguous metadata does not fabricate bitrate', () => {
  for (const adaptiveFormats of [
    [],
    [formats[0]],
    [formats[1], { ...formats[1], averageBitrate: 220000 }],
  ]) {
    expect(
      readAudioDiagnostics({
        getStatsForNerds: () => ({ codecs: 'mp4a.40.2 (141)' }),
        getPlayerResponse: () => ({ streamingData: { adaptiveFormats } }),
      }),
    ).toEqual({ itag: 141, codec: 'mp4a.40.2', approximateKbps: null });
  }
});

test('no selected audio is unknown even when high-quality formats are available', () => {
  for (const codecs of ['', 'avc1.4d401e (134)', 'changed upstream syntax']) {
    expect(
      readAudioDiagnostics({
        getStatsForNerds: () => ({ codecs }),
        getPlayerResponse: () => ({
          streamingData: { adaptiveFormats: formats },
        }),
      }),
    ).toEqual({ itag: null, codec: null, approximateKbps: null });
  }
});

test('missing player and failing private APIs do not affect playback', () => {
  expect(readAudioDiagnostics(null)).toEqual({
    itag: null,
    codec: null,
    approximateKbps: null,
  });
  expect(
    readAudioDiagnostics({
      getStatsForNerds: () => {
        throw new Error('unavailable');
      },
    }),
  ).toEqual({ itag: null, codec: null, approximateKbps: null });
  expect(
    readAudioDiagnostics({
      getStatsForNerds: () => ({ codecs: 'opus (774)' }),
      getPlayerResponse: () => {
        throw new Error('unavailable');
      },
    }),
  ).toEqual({ itag: 774, codec: 'opus', approximateKbps: null });
});

test('track transitions do not borrow bitrate metadata from another track', () => {
  expect(
    readAudioDiagnostics({
      getStatsForNerds: () => ({
        codecs: 'opus (774)',
        video_id_and_cpn: 'old-track / nonce',
      }),
      getPlayerResponse: () => ({
        videoDetails: { videoId: 'new-track' },
        streamingData: { adaptiveFormats: formats },
      }),
    }),
  ).toEqual({ itag: 774, codec: 'opus', approximateKbps: null });
});

test('debug report separates entitlement, offered formats, and selected audio', () => {
  const api = {
    getStatsForNerds: () => ({ codecs: 'mp4a.40.2 (140)' }),
    getPlayerResponse: () => ({
      videoDetails: { videoId: 'test-track' },
      streamingData: {
        adaptiveFormats: formats.map((format) => ({
          ...format,
          url: 'secret-signed-url',
        })),
      },
    }),
  };
  const details = readPlaybackDetails(api, {
    IS_SUBSCRIBER: true,
    AUDIO_QUALITY: 'AUDIO_QUALITY_HIGH',
    TOKEN: 'secret-token',
  });
  expect(details.subscriber).toBe('yes');
  expect(details.offeredFormats).toContain('141 / mp4a.40.2 / ~256 kbps');
  expect(details.videoId).toBe('test-track');
  expect(readAudioDiagnostics(api).itag).toBe(140);
  expect(JSON.stringify(details)).not.toContain('secret');
});

test('debug report distinguishes false entitlement from unavailable metadata', () => {
  expect(readPlaybackDetails(null).subscriber).toBe('unknown');
  expect(readPlaybackDetails(null, { IS_SUBSCRIBER: false }).subscriber).toBe(
    'no',
  );
  expect(
    readPlaybackDetails({
      getPlayerResponse: () => {
        throw new Error();
      },
    }).offeredFormats,
  ).toBe('Unknown');
});

test('native load, cue, preload and enqueue receive high without changing other arguments', () => {
  for (const method of [
    'loadVideoByPlayerVars',
    'cueVideoByPlayerVars',
    'preloadVideoByPlayerVars',
    'enqueueVideoByPlayerVars',
  ] as const) {
    let received: unknown[] = [];
    let receiver: unknown;
    const promise = Promise.resolve('native result');
    const original = function (this: unknown, ...args: unknown[]) {
      receiver = this;
      received = args;
      return promise;
    };
    const api = { [method]: original };
    const vars = Object.freeze({
      video_id: 'track',
      start: 42,
      player_params: 'original',
      list: 'queue',
      aac_high: false,
      prefer_low_quality_audio: true,
    });
    let maximum = true;
    let applied = 0;
    const restore = interceptPlayerVars(
      api,
      () => maximum,
      () => {
        applied++;
      },
    );
    expect(api[method](vars, 1, false)).toBe(promise);
    expect(receiver).toBe(api);
    expect(received).toEqual([
      { ...vars, aac_high: true, prefer_low_quality_audio: false },
      1,
      false,
    ]);
    expect(vars.aac_high).toBe(false);
    expect(applied).toBe(1);
    maximum = false;
    api[method](vars);
    expect(received[0]).toBe(vars);
    expect(applied).toBe(1);
    restore();
    expect(api[method]).toBe(original);
  }
});

test('native interception skips unknown contracts and preserves native errors', () => {
  const error = new Error('native error');
  const api = {
    loadVideoByPlayerVars: () => {
      throw error;
    },
  };
  const restore = interceptPlayerVars(
    api,
    () => true,
    () => {},
  );
  expect(() => api.loadVideoByPlayerVars()).toThrow(error);
  const replacement = () => {};
  api.loadVideoByPlayerVars = replacement as typeof api.loadVideoByPlayerVars;
  restore();
  expect(api.loadVideoByPlayerVars).toBe(replacement);
  const frozen = Object.freeze({ cueVideoByPlayerVars: () => {} });
  expect(() =>
    interceptPlayerVars(
      frozen,
      () => true,
      () => {},
    ),
  ).not.toThrow();
});

test('patch shared Music proxy, since it retains old movie_player function references', () => {
  let received: unknown;
  const moviePlayer = {
    loadVideoByPlayerVars: (vars: unknown) => {
      received = vars;
    },
  };
  const captured = moviePlayer.loadVideoByPlayerVars;
  const proxy = {
    loadVideoByPlayerVars: (vars: unknown) => captured.call(moviePlayer, vars),
  };
  let calls = 0;
  let incoming: unknown;
  const stopWrongTarget = interceptPlayerVars(
    moviePlayer,
    () => true,
    () => {
      calls++;
    },
  );
  proxy.loadVideoByPlayerVars({ aac_high: false });
  expect(calls).toBe(0);
  expect(received).toEqual({ aac_high: false });
  stopWrongTarget();
  const target = findMusicPlayerProxy({
    polymerController: { playerApi: proxy },
  });
  expect(target).toBe(proxy);
  const restore = interceptPlayerVars(
    target!,
    () => true,
    (value) => {
      calls++;
      incoming = value;
    },
  );
  proxy.loadVideoByPlayerVars({ aac_high: false });
  expect(calls).toBe(1);
  expect(incoming).toBe(false);
  expect(received).toEqual({ aac_high: true, prefer_low_quality_audio: false });
  restore();
  proxy.loadVideoByPlayerVars({ aac_high: false });
  expect(received).toEqual({ aac_high: false });
});

test('Music proxy discovery supports component versions and waits for readiness', () => {
  const proxy = { loadVideoByPlayerVars: () => {} };
  expect(findMusicPlayerProxy(null)).toBeNull();
  expect(findMusicPlayerProxy({ polymerController: {} })).toBeNull();
  expect(findMusicPlayerProxy({ playerApi: proxy })).toBe(proxy);
  expect(findMusicPlayerProxy({ inst: { playerApi: proxy } })).toBe(proxy);
});
