# 143 Music UI

## Boundaries

- `youtube-music.ts` is the single YouTube Music adapter/state boundary. It owns player/queue/bar/tab DOM lookup, native playback commands, SPA navigation, artist resolution, and playlist requests. `MusicState` contains plain data and never returns native elements to a view.
- `player.ts` renders metadata and transport from one subscription. It owns gesture previews, commits one seek per gesture, and cancels a seek if the track changes. `interactions.ts` delegates native row behavior to the adapter.
- `playlist-picker.ts` owns only the dialog. It captures the video ID at opening and rejects stale UI completions when the dialog is closed or replaced.
- `karaoke.ts` is the embedded lyrics bridge behind the adapter lifecycle. It reuses the existing lyric providers/rendering, unregisters its own listeners, and does not enable the upstream plugin.
- `desktop.ts` provides narrow settings/window IPC. `settings.ts` renders the settings dialog and window controls. Audio settings go through the existing config lifecycle; the playback adapter does not select streams or rewrite player responses.

The adapter uses one 100 ms sampler to support delayed/replaced YouTube Music nodes. Subscriptions publish only changed snapshots. Native state remains authoritative after custom and external controls. Dispose stops the sampler and invalidates artist requests. Search, artists and library routes use `ytmusic-app.navigate`; there is no full-page navigation fallback. A missing app means the command returns false.

## Shell migration

With `143-ui` enabled, Windows/Linux use a frameless Electron window and 143 controls. macOS keeps native window controls. The native menu bar is removed from the Windows/Linux window; **Settings → Advanced settings** retains access to the existing commands during migration. Changing the UI plugin requires a restart because window decorations are chosen at creation.

The player/page styling is retained. Pear's plugin infrastructure, configuration, authentication, and the embedded lyrics implementation still exist; this stage does not remove those dependencies.

## Validation

Run `pnpm typecheck`, `pnpm build`, and `pnpm test`. Adapter tests use a DOM/API fixture to cover navigation without changing the playing track, controls, native reconciliation, missing/late nodes, queue artist identity, late requests, seek gestures, and disposal. The Electron smoke test uses an isolated profile and checks settings persistence and maximize/restore with the production preload configuration.

The player-script test fixture now contains the `this.videoTrack` marker required by the unchanged transformer; a separate negative test verifies fail-open behavior without it. No `force-high-audio-quality` implementation is changed.

Before release, verify signed-in Premium playback: sustained selected AAC 141 and experimental Opus 774, search/artist transitions during playback, unavailable HQ fallback, shuffle/repeat, queue, lyrics and adding to a writable playlist. Automated fixtures and a signed-out Electron smoke test do not prove live Premium stream selection. YouTube Music's private DOM/API contracts may change.

## Audited exceptions to the boundary

The shell uses typed `navigateSection` commands; `FEmusic_*` IDs and route translation stay in the adapter. Artist browse IDs in player state are opaque identifiers passed back to `navigateArtist`, not interpreted by the view.

Intentional remaining integration points:

- CSS in `style.css`, `player.css`, and `interactions.css` targets native YouTube Music elements for appearance, visibility and layout. `player-polish.css` styles the embedded lyrics markup. Moving CSS selectors into a playback service would not remove that rendering dependency.
- `index.ts` receives `MusicPlayer` from the plugin lifecycle and forwards it to `engine.attachPlayer`. It does not invoke native playback methods. Its backend `synced-lyrics:fetch` handler transports provider requests through Electron; it does not interpret YouTube Music endpoints or metadata.
- `karaoke.ts` is a compatibility/service bridge, not a normal UI component. It attaches the existing lyrics renderer and manages player and IPC listeners. The reused `synced-lyrics` implementation still reads native time, seeks on line clicks, listens to video changes and mounts into the native lyrics tab. This is a real temporary exception to complete UI/engine separation; changing it would require a separate migration of the shared lyrics implementation.
- The reused `synced-lyrics/providers/YTMusic.ts` owns native `networkManager` `/next` and proxied browse requests. It is already a provider service; duplicating that implementation in the 143 adapter is unnecessary.
- Settings talk only to the 143 desktop IPC service. The desktop service uses existing configuration and audio-diagnostics IPC, not the internal YouTube Music DOM/API.
