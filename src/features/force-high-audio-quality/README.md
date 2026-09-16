# Force High Audio Quality

Prefer YouTube Music's native Premium high-quality audio through its own runtime
preference. No transcoding, extra media downloads, replacement player, client
spoofing, cookie changes, or DOM quality controls.

## Use

Enable **Plugins > Force High Audio Quality**, select **High / Maximum available**,
then reload the page and open a track. The plugin defaults to disabled; its mode
defaults to Maximum when enabled. **Default** removes the override and returns
control to YouTube Music's own setting. Disabling the plugin also restores it.

Preferences apply when YouTube Music constructs a new playback or preload.
An already-playing or preloaded track retains its previous selection. Reloading
clears these preloads; the plugin deliberately avoids restarting playback or
reconstructing the queue. When testing immediately after launch, open a track
after the page has finished loading.

**Show current audio stream** reports the selected itag and codec from the native
Stats for Nerds API. Approximate bitrate comes from `averageBitrate`, or `bitrate`
when the former is absent, in the matching audio format in the current player
response. It is not measured network throughput. Missing or ambiguous metadata
is **Unknown**, never a guessed 256 kbps. Different track IDs during transitions
also suppress the bitrate estimate.

## Investigation and selection point

Inspected upstream Pear commit
`0fd8cbf1f380ea61818bb9b388c1076f20d7db1a` and the public YouTube Music bundles
served on 2026-09-14:

- [Pear source](https://github.com/pear-devs/pear-desktop/tree/0fd8cbf1f380ea61818bb9b388c1076f20d7db1a)
- [YouTube Music application bundle](https://music.youtube.com/s/0b7b0d67/music_polymer_inlined_html.js)
- [YouTube player bundle](https://music.youtube.com/s/player/8c3fda2d/player_es6.vflset/uk_UA/base.js)
- [Google's description of audio quality](https://support.google.com/youtubemusic/answer/9076559)

Pear discovers `src/plugins/*/index.ts` through `vite-plugins/plugin-importer.mts`
(the glob in `pluginVirtualModuleGenerator`). `createPlugin` defines menu,
backend and renderer lifecycles. Its loader splits these for the Electron main
process and page renderer. `onPlayerApiReady` provides the native player API,
including when enabling a plugin at runtime. No manual registration is needed.

The existing `quality-changer` calls `getAvailableQualityLevels`,
`setPlaybackQualityRange` and `setPlaybackQuality`: these are video-resolution
controls. `video-toggle` changes presentation/playback mode, and `playback-speed`
changes playback rate. Neither supplies the audio-quality preference needed here.

In the inspected application bundle:

1. `xm` is the shared configuration object, taken from `window.yt.config_` or
   `window.ytcfg.data_`. `zm` reads it and `ym` writes it.
2. `handleMusicUpdateAudioQualityCommand` writes the `AUDIO_QUALITY` key.
3. `Nob`, the shared player-vars builder, reads that key. It sets `aac_high` to
   true only when the preference is `AUDIO_QUALITY_HIGH` and `IS_SUBSCRIBER` is
   truthy. It independently sets `prefer_low_quality_audio` for the Low setting.
   This builder is also used for preloading.
4. The player bundle consumes `aac_high` into its internal high-audio policy.
   Its format-selection code checks `AUDIO_QUALITY_HIGH` in native audio-format
   metadata, can prioritize high-quality AAC, and avoids the normal-quality
   downgrade branch when the high-audio policy is active. Eligible formats still
   come from YouTube and remain subject to account, track and player capability.

The native `/youtubei/v1/player` request builder is `RPH`; its playback context is
built by `qgM`. This path includes normal context, playback parameters and service
integrity handling. `aac_high` is a **player variable**, not an invented JSON
field to append to this request. Server entitlement determines what formats can
be supplied; the player policy determines the preference among playable formats.
The plugin leaves the request and all authentication to the native player.

The player bundle also contains the feature-gated `setUserAudioQualitySetting`
API. Its setter can be a no-op when that experiment is off and writes persistent
YouTube player storage. This implementation uses the directly observed Music
preference path instead, without changing experiment flags.

The runtime preference change is a temporary accessor on the existing writable,
configurable `AUDIO_QUALITY` property. Reads return High; ordinary writes retain
the underlying value for restoration. This survives Music settings updates and
uses the same subscriber gate and playback/preload builder. Unknown contracts
(missing property, unfamiliar value, read-only property, existing accessor) fail open and show
**Unavailable (using normal playback)** in diagnostics. Cleanup leaves a later
replacement of the property untouched.

Private APIs may change. The plugin uses no minified names, format-ID allowlist,
hard-coded 256 kbps assumption, stream filtering, or response rewriting. Maximum
means the native High preference; it does not promise to rank all future codecs
independently of YouTube's own policy. If YouTube offers no high-quality format,
its normal playback remains available.

## Validation and limits

- Focused tests: `pnpm exec playwright test tests/force-high-audio-quality.test.ts`.
- Type checking: `pnpm typecheck`.
- Plugin lint: `pnpm exec oxlint --type-aware src/plugins/force-high-audio-quality`.
- Build: `pnpm build`.
- Eighteen focused tests pass. Plugin lint/format checks, project type checking,
  and the production build pass. The repository-wide `pnpm check` stops on
  formatting violations in 17 unchanged upstream files; those unrelated files
  were left untouched. Repository lint also reports existing warnings elsewhere.
- The actual player-vars construction fragment from the downloaded Music bundle
  was executed locally with the override. High for subscribers, the subscriber
  gate, clearing the Low preference, unchanged start/player parameters and
  restoration all passed.
- A direct **unauthenticated** WEB_REMIX `/youtubei/v1/player` metadata probe
  returned `LOGIN_REQUIRED`. No authenticated Pear/browser session was exposed
  to this task. No signed-in network trace or Premium playback result has been
  collected; the success criterion is **not yet verified**.

## Premium acceptance test

1. Use your normal Premium login in a Pear build containing this plugin.
2. In Default, open a known Premium-eligible art track and record native Stats
   for Nerds plus **Show current audio stream**.
3. Select Maximum, reload, wait for the page to load, then reopen that track.
   Confirm `AUDIO_QUALITY` is High in the runtime configuration. Do not change
   `IS_SUBSCRIBER` or authentication.
4. Compare the selected audio in Stats for Nerds. Expect 141 / mp4a.40.2 / roughly
   256 kbps, or another high-quality native format supplied for that account.
   An available 141 in response metadata alone is not a pass: selection must
   move away from 140 when a playable Premium stream is available.
5. Exercise next track, autoplay and gapless transitions. Test a track with no
   high-quality version and confirm normal playback. Test Default and disable,
   reloading each time to clear cached/preloaded selections.
6. If 140 persists, inspect the native player/onesie/SABR requests in Developer
   Tools. Check account entitlement, format availability, effective preference,
   and whether a previously prepared stream was reused. Keep credentials and
   signed media URLs out of shared logs. Do not add request fields speculatively.

This is an in-tree Pear plugin, compiled into the app. It is not a standalone
extension file installable into an arbitrary existing release. Apply the patch
to the matching source revision, install dependencies, and rebuild Pear.

## First user playback result

The initial user screenshot reports itag 140 / mp4a.40.2 / approximately 130 kbps with Maximum active. The requested Premium selection has not been achieved in that test. Expanded diagnostics now show the native subscriber flag, effective runtime preference, track ID, and offered audio formats separately from the selected stream. These fields identify whether further work should focus on entitlement/availability or selection. No playback-policy change is included in this diagnostic update.

## Direct native player-vars update

The second user screenshot confirms IS_SUBSCRIBER=true, effective AUDIO_QUALITY_HIGH, and offered high-quality 141 and 774 formats while 140 remains selected. This rules out missing Premium metadata for that track, but does not identify the exact cause of selection failure.

The plugin now also wraps loadVideoByPlayerVars, cueVideoByPlayerVars, preloadVideoByPlayerVars and enqueueVideoByPlayerVars when those methods are writable and configurable. In Maximum mode on a recognized subscriber session, the original argument is shallow-copied with aac_high=true and prefer_low_quality_audio=false. All other arguments, the receiver, return value and native exceptions are preserved. Default passes through unchanged; disable restores the methods. No requests or media responses are rebuilt. Diagnostics count patched calls; a zero count after selecting a different track indicates that this exposed API path was not intercepted.

This update is a testable selection-path correction, not a confirmed Premium playback fix. The separate feature-gated setUserAudioQualitySetting API was investigated, including its SABR field, but its High enum value was not verified, so no guessed numeric value or experiment flag is written.

## PlayerProxy correction

The next screenshot showed SABR playback and zero patched calls. Inspection of the Music bundle located lob, which captures an original movie_player method in a closure before Pear's hook runs. Changing the DOM player's method cannot change that captured reference. The interceptor now targets the shared playerApi on the ytmusic-player component controller (polymerController, inst, or legacy host), checking once per second for asynchronous initialization or replacement. Default/disable restores hooks; disable also clears the timer. This reads the component object without manipulating its DOM.

Diagnostics now include Music PlayerProxy found and Last incoming aac_high. The latter distinguishes a missing preference from a high preference already being sent but ignored by downstream selection. A regression test models the captured-reference failure. Actual Premium selection remains unconfirmed until the updated build is run on the user's session.

## Live debugger investigation — 2026-09-14

Status: the Premium playback success criterion is NOT met. The existing plugin must be treated as experimental; Maximum is a requested preference, not a verified stream quality.

The user's actual signed-in Pear session was inspected through a loopback-only Electron debugger. Native playback used SABR. The runtime reported Premium metadata and offered 141/774 while Stats for Nerds selected 140 (and, during experiments, 251).

Temporarily enabling html5_enable_audio_quality_setting and html5_enable_audio_quality_setting_feature in the document's serialized player configuration BEFORE player creation changed hasHqaAudioTrack from false to true and getAudioQualitySettingState from 1 to 0. This did not produce high-quality playback. Late flag changes are therefore not equivalent to initialization-time changes, but early flags alone are not a solution.

Sanitized outgoing SABR observations: preferred_audio_format_ids contained [141, 140] or [774, 251, 250]. ClientAbrState field 73 reflected the value set via the native audio-setting API. Controlled trials of values 1, 3, 4 and 30, including fresh page loads, did not establish a working High value. These values have NOT been mapped to verified semantics. The original effective value 2 was restored.

Temporary request-only trials also failed: retaining only 141 in preferred audio formats did not secure high-quality playback; appending the reverse-engineered min/max audio quality fields 24/25 with HIGH=30 did not secure it either. Their acceptance by the server is unverified. No binary payload manipulation, numeric setting guess or experiment flag has been added to the plugin.

This narrows the problem to selection downstream of the Music preference and format metadata. The exact server-side reason remains unknown. Merely listing 141/774, counting intercepted calls or reporting AUDIO_QUALITY_HIGH is insufficient evidence of success. A fix must still demonstrate sustained selected 141/774 on eligible tracks, with Default/disable and unavailable-stream fallback validated.

No cookies, authorization headers or signed playback URLs are included in this report. Debugging helpers are local development artifacts, not plugin dependencies.
