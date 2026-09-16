# Changelog

Notable changes to this YouTube Music desktop client are documented here.

The repository originated from `pear-devs/pear-desktop`. History from before the fork-specific cleanup remains available in Git history and in the upstream repository; the original MIT license and copyright notice are retained in [`license`](./license).

## Unreleased

- Replaced the legacy plugin runtime with the feature-based architecture under `src/features`.
- Removed the obsolete `src/plugins` tree and migrated core configuration to the feature namespace.
- Kept the custom 143 UI, Discord Rich Presence, high-quality audio/Opus support, and synced lyrics on the feature runtime.
- Removed unused upstream dependencies and stale plugin build paths.
- Rewrote project documentation for the current YouTube Music client.
- Removed stale Pear workflow, test, and source references.

## 3.12.0

This version is the baseline inherited from the upstream project before the fork-specific architecture and product cleanup.
