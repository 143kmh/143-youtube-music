import { expect, test } from '@playwright/test';

import {
  createDirectPlaybackPolicyPatcher,
  detectServerAbrPolicyKey,
} from '../src/plugins/force-high-audio-quality/direct-playback';

const initializeSource = `function initialize(K,H,r){
  K=K||0;
  this.policy.K||(H=DTN(this.Zb),this.audioTrack,H.videoTrack);
  this.policy.K&&qx(this);
  this.XK.isManifestless&&wb1(this.cL);
  H=isNaN(this.getCurrentTime())?0:this.getCurrentTime();
  this.policy.K?serverAbr(this.fQ):direct(this.audioTrack,this.videoTrack);
  this.policy.K&&serverAbr(this.fQ,{sO:1});
}`;

test('detects the server-ABR policy structurally, without hard-coding its name', () => {
  expect(detectServerAbrPolicyKey(initializeSource)).toBe('K');
  expect(
    detectServerAbrPolicyKey(initializeSource.replaceAll('policy.K', 'policy.zz')),
  ).toBe('zz');
});

test('does not match unrelated initialize methods', () => {
  expect(
    detectServerAbrPolicyKey(
      'function initialize(){this.policy.K&&go();this.policy.K||stop()}',
    ),
  ).toBeNull();
});

test('Maximum disables server-ABR before native initialize and records diagnostics', () => {
  let seenDuringInitialize: unknown;
  let maximum = true;

  const initialize = new Function(
    `return (${initializeSource})`,
  )() as (this: unknown) => void;

  const prototype = {
    initialize,
  };
  const controller = Object.create(prototype) as {
    policy: { K: boolean };
    audioTrack: object;
    videoTrack: object;
    XK: { isManifestless: boolean };
    Zb: object;
    cL: object;
    fQ: object;
    getCurrentTime: () => number;
  };
  controller.policy = { K: true };
  controller.audioTrack = {};
  controller.videoTrack = {};
  controller.XK = { isManifestless: false };
  controller.Zb = {};
  controller.cL = {};
  controller.fQ = {};
  controller.getCurrentTime = () => 0;

  // The synthetic source references helpers only when initialize executes.
  // Replace it with the same structural signature and a side-effect body after
  // the detector has a real Function#toString contract to inspect.
  Object.defineProperty(prototype, 'initialize', {
    configurable: true,
    writable: true,
    value: function initialize(this: typeof controller) {
      // Structural markers retained deliberately for detector coverage.
      void this.audioTrack;
      void this.videoTrack;
      void this.XK;
      void this.getCurrentTime;
      this.policy.K || void 0;
      this.policy.K && void 0;
      this.policy.K && void 0;
      seenDuringInitialize = this.policy.K;
    },
  });

  const patcher = createDirectPlaybackPolicyPatcher(() => maximum);
  expect(patcher.scan([controller])).toBe(true);
  expect(patcher.getStatus().hookFound).toBe(true);
  expect(patcher.getStatus().policyKey).toBe('K');

  controller.initialize();
  expect(seenDuringInitialize).toBe(false);
  expect(controller.policy.K).toBe(false);
  expect(patcher.getStatus()).toMatchObject({
    applications: 1,
    lastBefore: true,
    lastAfter: false,
  });

  patcher.restore();
  expect(controller.policy.K).toBe(true);

  maximum = false;
});

test('Default leaves native server-ABR policy untouched', () => {
  let seenDuringInitialize: unknown;
  const prototype = {
    initialize: function initialize(this: {
      policy: { anyName: boolean };
      audioTrack: object;
      videoTrack: object;
      XK: object;
      getCurrentTime: () => number;
    }) {
      void this.audioTrack;
      void this.videoTrack;
      void this.XK;
      void this.getCurrentTime;
      this.policy.anyName || void 0;
      this.policy.anyName && void 0;
      this.policy.anyName && void 0;
      seenDuringInitialize = this.policy.anyName;
    },
  };
  const controller = Object.assign(Object.create(prototype), {
    policy: { anyName: true },
    audioTrack: {},
    videoTrack: {},
    XK: {},
    getCurrentTime: () => 0,
  });

  const patcher = createDirectPlaybackPolicyPatcher(() => false);
  expect(patcher.scan([controller])).toBe(true);
  controller.initialize();
  expect(seenDuringInitialize).toBe(true);
  expect(controller.policy.anyName).toBe(true);
  expect(patcher.getStatus().applications).toBe(0);
});
