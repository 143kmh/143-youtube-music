type PlaybackController = {
  policy?: object;
};

type PlaybackInitialize = (
  this: PlaybackController,
  ...args: unknown[]
) => unknown;

type PatchedMethod = {
  owner: object;
  descriptor: PropertyDescriptor;
  wrapped: PlaybackInitialize;
};

type ChangedPolicy = {
  policy: object;
  key: string;
  original: boolean;
};

export type DirectPlaybackPatchEvent = {
  policyKey: string;
  before: boolean;
  after: boolean;
};

export type DirectPlaybackStatus = {
  hookFound: boolean;
  policyKey: string | null;
  applications: number;
  lastBefore: boolean | null;
  lastAfter: boolean | null;
};

export type DirectPlaybackPolicyPatcher = {
  scan: (roots: unknown[]) => boolean;
  restore: () => void;
  getStatus: () => DirectPlaybackStatus;
};

const isObject = (value: unknown): value is object =>
  (typeof value === 'object' && value !== null) || typeof value === 'function';

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Identify the minified policy field that selects YouTube's server-ABR path.
 *
 * The field name itself is intentionally not hard-coded. In the player build
 * inspected on 2026-09-14 it was `policy.K`, but minifier output is unstable.
 * The surrounding controller contract is much more descriptive: the same
 * initialize method owns audio/video tracks, the manifest state and the media
 * clock, and tests the policy both positively and negatively.
 */
export const detectServerAbrPolicyKey = (source: string): string | null => {
  if (
    !source.includes('this.policy.') ||
    !source.includes('this.audioTrack') ||
    !source.includes('this.videoTrack') ||
    !source.includes('this.XK') ||
    !source.includes('this.getCurrentTime')
  ) {
    return null;
  }

  const keys = [
    ...source.matchAll(/this\.policy\.([A-Za-z_$][\w$]*)/g),
  ].map((match) => match[1]);

  for (const key of new Set(keys)) {
    const escaped = escapeRegExp(key);
    const occurrences = source.match(
      new RegExp(`this\\.policy\\.${escaped}\\b`, 'g'),
    )?.length;
    if ((occurrences ?? 0) < 3) continue;

    const positive = new RegExp(
      `this\\.policy\\.${escaped}\\s*&&`,
    ).test(source);
    const negative = new RegExp(
      `this\\.policy\\.${escaped}\\s*\\|\\|`,
    ).test(source);
    if (positive && negative) return key;
  }

  return null;
};

const getFunctionSource = (value: unknown): string | null => {
  if (typeof value !== 'function') return null;
  try {
    return Function.prototype.toString.call(value);
  } catch {
    return null;
  }
};

const safeDescriptors = (value: object): PropertyDescriptorMap | null => {
  try {
    return Object.getOwnPropertyDescriptors(value);
  } catch {
    return null;
  }
};

const safePrototype = (value: object): object | null => {
  try {
    return Object.getPrototypeOf(value) as object | null;
  } catch {
    return null;
  }
};

export const createDirectPlaybackPolicyPatcher = (
  shouldDisableServerAbr: () => boolean,
  onApplied?: (event: DirectPlaybackPatchEvent) => void,
): DirectPlaybackPolicyPatcher => {
  const patched: PatchedMethod[] = [];
  const changedPolicies: ChangedPolicy[] = [];
  const patchedOwners = new Set<object>();
  const changedPolicyObjects = new Set<object>();

  let policyKey: string | null = null;
  let applications = 0;
  let lastBefore: boolean | null = null;
  let lastAfter: boolean | null = null;

  const patchOwner = (owner: object): boolean => {
    if (patchedOwners.has(owner)) return false;

    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(owner, 'initialize');
    } catch {
      return false;
    }

    const original = descriptor?.value as PlaybackInitialize | undefined;
    if (
      typeof original !== 'function' ||
      descriptor?.configurable !== true ||
      descriptor.writable !== true
    ) {
      return false;
    }

    const source = getFunctionSource(original);
    if (!source) return false;
    const detectedKey = detectServerAbrPolicyKey(source);
    if (!detectedKey) return false;

    const wrapped: PlaybackInitialize = function (...args) {
      if (shouldDisableServerAbr() && isObject(this?.policy)) {
        try {
          const before = Reflect.get(this.policy, detectedKey);
          if (before === true) {
            if (!changedPolicyObjects.has(this.policy)) {
              changedPolicyObjects.add(this.policy);
              changedPolicies.push({
                policy: this.policy,
                key: detectedKey,
                original: true,
              });
            }
            Reflect.set(this.policy, detectedKey, false);
            const after = Reflect.get(this.policy, detectedKey);
            lastBefore = before;
            lastAfter = typeof after === 'boolean' ? after : null;
            if (after === false) {
              applications++;
              onApplied?.({
                policyKey: detectedKey,
                before,
                after,
              });
            }
          }
        } catch {
          // Private player state changed. Fail open and let native playback run.
        }
      }
      return Reflect.apply(original, this, args);
    };

    try {
      Object.defineProperty(owner, 'initialize', { ...descriptor, value: wrapped });
    } catch {
      return false;
    }

    patchedOwners.add(owner);
    patched.push({ owner, descriptor, wrapped });
    policyKey ??= detectedKey;
    return true;
  };

  const inspectPrototypeChain = (value: object) => {
    let current: object | null = value;
    for (let depth = 0; current && depth < 6; depth++) {
      patchOwner(current);
      current = safePrototype(current);
    }
  };

  const scan = (roots: unknown[]): boolean => {
    if (patched.length > 0) return true;

    const queue: { value: object; depth: number }[] = [];
    const visited = new Set<object>();
    for (const root of roots) {
      if (isObject(root)) queue.push({ value: root, depth: 0 });
    }

    // The controller is an implementation detail hanging off the public player
    // graph. Keep the search bounded. Data properties are preferred; a limited
    // number of own accessors are also read because current YouTube player
    // revisions hide parts of the internal controller graph behind getters.
    // Getter failures are ignored and never affect native playback.
    const maxNodes = 7000;
    const maxDepth = 9;
    const maxAccessorReads = 384;
    let visitedNodes = 0;
    let accessorReads = 0;

    while (queue.length > 0 && visitedNodes < maxNodes) {
      const next = queue.shift();
      if (!next || visited.has(next.value)) continue;
      visited.add(next.value);
      visitedNodes++;

      inspectPrototypeChain(next.value);
      if (patched.length > 0) return true;
      if (next.depth >= maxDepth) continue;

      const descriptors = safeDescriptors(next.value);
      if (!descriptors) continue;

      let childCount = 0;
      for (const descriptor of Object.values(descriptors)) {
        if (childCount >= 400) break;

        if ('value' in descriptor && isObject(descriptor.value)) {
          childCount++;
          queue.push({ value: descriptor.value, depth: next.depth + 1 });
          continue;
        }

        if (
          typeof descriptor.get === 'function' &&
          accessorReads < maxAccessorReads &&
          next.depth <= 5
        ) {
          accessorReads++;
          try {
            const child = Reflect.apply(descriptor.get, next.value, []);
            if (isObject(child)) {
              childCount++;
              queue.push({ value: child, depth: next.depth + 1 });
            }
          } catch {
            // Some browser/player accessors throw outside their expected state.
          }
        }
      }
    }

    return false;
  };

  const restore = () => {
    for (const { owner, descriptor, wrapped } of patched.reverse()) {
      try {
        if (Object.getOwnPropertyDescriptor(owner, 'initialize')?.value === wrapped) {
          Object.defineProperty(owner, 'initialize', descriptor);
        }
      } catch {
        // Another player revision may already own this method; don't overwrite it.
      }
    }
    patched.length = 0;
    patchedOwners.clear();

    for (const { policy, key, original } of changedPolicies.reverse()) {
      try {
        if (Reflect.get(policy, key) === false) Reflect.set(policy, key, original);
      } catch {
        // The old playback controller may already have been disposed.
      }
    }
    changedPolicies.length = 0;
    changedPolicyObjects.clear();
    policyKey = null;
    applications = 0;
    lastBefore = null;
    lastAfter = null;
  };

  return {
    scan,
    restore,
    getStatus: () => ({
      hookFound: patched.length > 0,
      policyKey,
      applications,
      lastBefore,
      lastAfter,
    }),
  };
};
