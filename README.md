# 143 Music

143 Music is an unofficial desktop client for YouTube Music built with Electron.

The project is focused on a cleaner desktop experience, a custom UI, high-quality audio controls, Discord Rich Presence, and synced lyrics while keeping the codebase small enough to maintain directly.

> [!IMPORTANT]
> This project is not affiliated with, authorized by, endorsed by, or otherwise officially connected with Google LLC or YouTube. Google, YouTube, YouTube Music, and related marks belong to their respective owners.

## Features

- Custom desktop UI with its own navigation, player, queue, search, library, artist, album, playlist, and settings surfaces.
- High-quality audio feature with AAC 141 support and experimental Opus 774 selection for supported YouTube Music Premium playback.
- Discord Rich Presence.
- Synced lyrics integrated into the custom player experience.
- Native desktop window integration, media controls, tray support, and persistent settings.

## Architecture

The app uses a feature-based runtime.

- `src/features/143-ui` contains the custom desktop shell, playback adapter, Discord integration, settings, and the lyrics bridge.
- `src/features/force-high-audio-quality` contains the audio-selection and player-script logic.
- `src/features/synced-lyrics` contains the shared lyrics providers, parsers, and renderer used by the UI feature.
- `src/core/features.ts` registers the core features.
- `src/core/main-features.ts` and `src/core/renderer-features.ts` manage feature startup, configuration, and teardown in their Electron contexts.
- `vite-plugins/feature-context-splitter.mts` splits feature code by runtime context during the build.

Features are defined with `createFeature` and live under `src/features`. The old plugin directory/runtime is not used.

## Development

Requirements:

- Node.js 22 or newer
- pnpm 11 or newer

```bash
git clone https://github.com/143kmh/143-youtube-music.git
cd 143-youtube-music
pnpm install --frozen-lockfile
pnpm dev
```

For a production build:

```bash
pnpm build
```

To preview the production build locally:

```bash
pnpm start
```

Useful package targets:

```bash
pnpm dist:win
pnpm dist:linux
pnpm dist:mac
pnpm dist:mac:arm64
```

Additional platform-specific targets are defined in `package.json`.

## Validation

For normal local changes, build the project before committing:

```bash
pnpm build
```

When a runtime check is useful, preview the built application with:

```bash
pnpm start
```

Live YouTube Music behavior can depend on private DOM and player APIs and may change independently of this repository.

## Attribution

This repository originated from the open-source desktop client maintained in `pear-devs/pear-desktop` and contains substantial code derived from that project. The original MIT license and copyright notice are retained in [`license`](./license).

## License

MIT. See [`license`](./license).
