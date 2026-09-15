import { expect, test } from '@playwright/test';

import { patchPlayerScript } from '../src/features/force-high-audio-quality/player-script-patch';

const makeSource = (key = 'K') => `
class Pmt {
  initialize(K,H,r) {
    K=K||0;
    this.policy.${key}||(H=DTN(this.Zb),this.audioTrack,this.videoTrack);
    this.policy.${key}&&qx(this);
    this.XK.isManifestless&&wb1(this.cL);
    H=isNaN(this.getCurrentTime())?0:this.getCurrentTime();
    this.policy.${key}&&Pep(this.fQ,{sO:1});
  }
}
`;

test('patches the playback initialize structurally and detects the current minified key', () => {
  const result = patchPlayerScript(makeSource());
  expect(result.patched).toBe(true);
  expect(result.policyKey).toBe('K');
  expect(result.source).toContain(
    'globalThis.__YT143_FORCE_DIRECT_HQ__===true',
  );
  expect(result.source).toContain('this.policy.K=false');
});

test('survives a minifier rename of the server-ABR policy key', () => {
  const result = patchPlayerScript(makeSource('zz'));
  expect(result.patched).toBe(true);
  expect(result.policyKey).toBe('zz');
  expect(result.source).toContain('this.policy.zz=false');
});

test('does not rewrite unrelated initialize methods', () => {
  const source = 'class Other{initialize(){this.policy.K&&go();}}';
  expect(patchPlayerScript(source)).toEqual({
    source,
    policyKey: null,
    patched: false,
  });
});

test('fails open when the videoTrack structural marker is missing', () => {
  const source = makeSource().replace('this.videoTrack', 'H.videoTrack');
  expect(patchPlayerScript(source)).toEqual({
    source,
    policyKey: null,
    patched: false,
  });
});

test('injects before the original initialize body', () => {
  const result = patchPlayerScript(makeSource());
  const injection = result.source.indexOf(
    'globalThis.__YT143_FORCE_DIRECT_HQ__',
  );
  const originalFirstStatement = result.source.indexOf('K=K||0');
  expect(injection).toBeGreaterThan(-1);
  expect(injection).toBeLessThan(originalFirstStatement);
});
