<div align="center">
  <img src="./assets/143-music-icon.png" width="128" height="128" alt="143 Music icon">

# 143 Music

**A lightweight YouTube Music desktop client with a custom UI and an experimental forced-Opus mode.**

[**English**](./README.md) · [**Русский**](./README_RU.md)

143 Music keeps the YouTube Music catalog, recommendations and account system, but replaces much of the desktop experience with its own cleaner interface and desktop features.

It is designed to stay light in everyday use: inactive views stop doing background work, unnecessary polling is avoided, and the custom UI only refreshes what it actually needs.

[**Download 143 Music for Windows →**](https://github.com/143kmh/143-youtube-music/releases)

</div>

> [!NOTE]
> There is no public binary release yet. When the first release is published, the button above will contain a ready-to-install Windows `.exe`.

> [!IMPORTANT]
> 143 Music is an unofficial project. It is not affiliated with, authorized by, endorsed by, or otherwise officially connected with Google LLC or YouTube. Google, YouTube, YouTube Music, and related marks belong to their respective owners.

## Why 143 Music?

143 Music is built around two ideas: **a faster, cleaner desktop experience** and **better control over YouTube Music audio quality**.

The application uses YouTube Music as the service and playback source, while the 143 shell handles Home, search, artists, albums, playlists, queue, player controls, Now Playing, lyrics and settings. The UI has been tuned to reduce idle CPU work instead of constantly polling hidden screens and rebuilding state in the background.

### High-quality audio and forced Opus

143 Music includes a dedicated experimental **Opus mode**.

When Opus mode is enabled, 143 Music keeps YouTube's native player response and signed media URLs, but changes the audio candidate list before YouTube's player chooses a stream. If YouTube offers Opus audio, 143 Music prefers the best available Opus candidate — prioritizing `AUDIO_QUALITY_HIGH`, non-DRC audio and the highest reported bitrate. On eligible Premium playback this can include **itag 774**.

This is not transcoding and it does not create higher-quality audio that YouTube did not provide. The mode can only select from streams actually offered for your account, track and player session. If no Opus stream is available, playback falls back safely. Because this depends on private YouTube Music/player behavior, Opus mode is considered experimental and may need updates when YouTube changes its internals.

For users who do not want the experimental Opus path, 143 Music also supports YouTube Music's normal playback and native Premium high-quality mode.

## Highlights

- **Low-overhead custom UI** — background work is reduced when views are closed or inactive.
- **Forced Opus mode** — experimentally prefers the best Opus stream actually offered by YouTube Music, including high-quality Opus when available.
- **143 UI** — custom sidebar, Home, search, library, artist, album and playlist pages.
- **Custom Now Playing** — artwork, synced lyrics, current playlist / Up Next and the full album in one screen.
- **Personalized Home** — uses your real YouTube Music recommendations but renders them in the 143 Music UI.
- **Synced lyrics** — integrated directly into the custom interface.
- **Google account controls** — sign in and switch accounts from the 143 Music top bar using the existing YouTube Music session.
- **Discord Rich Presence** — show what you are listening to in Discord.
- **OBS Now Playing overlay** — a transparent local Browser Source for streamers.
- **Offline / local library** — import and play local Opus, FLAC, M4A, MP3, OGG, WebM, WAV and AAC files without an internet connection.
- **Desktop integration** — media controls, tray support, persistent settings and a native desktop window.

> 143 Music is optimized to be lightweight in **runtime behavior and idle overhead**. It is still an Electron application, so the installed size includes the Electron/Chromium runtime.

## Install on Windows

### 1. Download

1. Open the [**Releases page**](https://github.com/143kmh/143-youtube-music/releases).
2. Open the newest release.
3. Download the file named similar to:

```text
143-Music-Setup-<version>-x64.exe
```

4. Double-click the downloaded `.exe`.
5. Choose the installation folder if you want to change it.
6. Click **Install**.
7. Launch **143 Music**.
8. Click the account button in the top-right corner and sign in to Google / YouTube Music.

That is all you need for a normal installation.

## Windows says "Windows protected your PC"

This can happen with the first public releases because the installer is currently **not digitally signed**.

For the normal Microsoft Defender SmartScreen warning, this does **not** mean Windows found a virus. It means Windows does not yet recognize the publisher/file and the app has little or no reputation.

If you downloaded the installer from this repository's official **Releases** page:

1. Run the installer.
2. If the blue **Windows protected your PC** window appears, click **More info**.
3. Check that the app name is **143 Music**.
4. Click **Run anyway**.
5. Continue the installation normally.

### Important difference: SmartScreen warning vs antivirus detection

A blue **Windows protected your PC** / **Unknown publisher** screen is the unsigned-app reputation warning described above.

If Windows Security instead says that it has detected actual **malware**, a **trojan**, or a **potentially unwanted application**, do not blindly disable Defender or add a global exclusion. Check that the file came from the official Releases page and report the detection so the build can be investigated.

Some Windows 11 systems with **Smart App Control** enabled can block unknown unsigned apps without offering **Run anyway**. There is no clean per-app bypass for that mode. In that case, do not disable Windows security just for 143 Music; use a source build or wait for a signed release.

## If the Releases page is empty

A ready-made installer has not been published yet. You can build the application yourself.

### Build it yourself

You need:

- Windows 10 or Windows 11
- Node.js 22 or newer
- pnpm 11 or newer
- Git

Open **PowerShell** and run:

```powershell
git clone https://github.com/143kmh/143-youtube-music.git
cd 143-youtube-music
pnpm install --frozen-lockfile
pnpm dist:win
```

The finished installer will be placed in the `pack` folder.

If you only want to run 143 Music locally without creating an installer:

```powershell
pnpm build
pnpm start
```

## First launch

1. Use the **account button** in the top-right corner to sign in or switch Google accounts.
2. Open **Home** to load your YouTube Music recommendations.
3. Use **Settings** to choose the audio mode, accent color, Discord Rich Presence options and other desktop preferences.
4. If you have YouTube Music Premium and want the experimental highest-quality path, enable **Opus** in the audio-quality settings and start a new track.
5. Click the artwork or use Karaoke / Queue controls to open the custom **Now Playing** screen.

YouTube Music Premium is required for YouTube Music features that are Premium-only, including corresponding high-quality playback modes and access to high-quality streams when YouTube offers them.

## OBS overlay

143 Music includes a local Now Playing overlay for OBS.

1. Keep 143 Music running.
2. In OBS, add a **Browser Source**.
3. Use:

```text
http://127.0.0.1:14321/overlay
```

4. Start with **520 × 140**.
5. Leave custom CSS empty.

The overlay is served only from your own computer and shows the current artwork, title, artist, album, playback state and progress.

## Local / offline library

Open **Downloads** in the sidebar and choose **Import audio**. Imported files are copied into the 143 Music offline library and can be played without an internet connection.

Supported local formats include Opus, FLAC, M4A, MP3, OGG, WebM, WAV and AAC.

The local library does **not** extract or download protected YouTube Music streams.

## Development

The app uses a feature-based runtime. Most product functionality lives under `src/features` and is registered from `src/core/features.ts`.

Useful commands:

```bash
pnpm dev
pnpm build
pnpm start
pnpm dist:win
pnpm dist:linux
pnpm dist:mac
pnpm dist:mac:arm64
```

Live YouTube Music behavior depends partly on private YouTube Music DOM and player APIs. Google can change those independently of this project, so some integrations may occasionally need updates.

## Attribution

This repository originated from the open-source desktop client maintained in `pear-devs/pear-desktop` and contains substantial code derived from that project. The original MIT license and copyright notice are retained in [`license`](./license).

## License

MIT. See [`license`](./license).
