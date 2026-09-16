<div align="center">
  <img src="./assets/143-music-icon.png" width="128" height="128" alt="143 Music icon">

# 143 Music

**A cleaner desktop client for YouTube Music.**

143 Music keeps YouTube Music as the music service, but replaces much of the desktop experience with its own interface, player and desktop features.

[**Download 143 Music for Windows →**](https://github.com/143kmh/143-youtube-music/releases)

</div>

> [!NOTE]
> There is no public binary release yet. When the first release is published, the button above will contain the ready-to-install Windows build. Until then, use the **Build it yourself** instructions below.

> [!IMPORTANT]
> 143 Music is an unofficial project. It is not affiliated with, authorized by, endorsed by, or otherwise officially connected with Google LLC or YouTube. Google, YouTube, YouTube Music, and related marks belong to their respective owners.

## What is 143 Music?

143 Music is an Electron desktop client built around YouTube Music. The goal is simple: keep the YouTube Music catalog, recommendations, account and playback engine, while making the desktop app feel like a proper standalone music player.

Instead of reskinning one page, 143 Music provides its own shell for the main parts of the experience: Home, search, artists, albums, playlists, queue, player controls, Now Playing, lyrics and settings.

## Highlights

- **143 UI** — custom sidebar, Home, search, library, artist, album and playlist pages.
- **Custom Now Playing** — artwork, synced lyrics, current playlist / Up Next and the full album in one screen.
- **Personalized Home** — uses your real YouTube Music recommendations but renders them in the 143 Music UI.
- **High-quality audio controls** — YouTube Music default, Premium HQ AAC and experimental Premium HQ Opus selection.
- **Synced lyrics** — integrated directly into the custom interface.
- **Google account controls** — sign in and switch accounts from the 143 Music top bar using the existing YouTube Music session.
- **Discord Rich Presence** — show what you are listening to in Discord.
- **OBS Now Playing overlay** — a transparent local Browser Source for streamers.
- **Offline / local library** — import and play local Opus, FLAC, M4A, MP3, OGG, WebM and WAV files without an internet connection.
- **Desktop integration** — media controls, tray support, persistent settings and a native desktop window.

## Installation — Windows

### Normal installation

1. Open the [**Releases page**](https://github.com/143kmh/143-youtube-music/releases).
2. Open the newest release.
3. Download the Windows installer (`.exe`).
4. Run the downloaded file.
5. Install 143 Music like any normal Windows application.
6. Open **143 Music**.
7. Click the account button in the top-right corner and sign in to your Google / YouTube Music account.
8. Play something. That's it.

If Windows shows an **Unknown publisher / SmartScreen** warning on an unsigned community build, make sure the file came from this repository before continuing.

### If the Releases page is empty

That means a ready-made build has not been published yet. You can either wait for the first release or build the app from source using the instructions below.

## Build it yourself

You need:

- **Windows 10 or Windows 11**
- **Node.js 22 or newer**
- **pnpm 11 or newer**
- **Git**

Open **PowerShell** and run these commands one by one:

```powershell
git clone https://github.com/143kmh/143-youtube-music.git
cd 143-youtube-music
pnpm install --frozen-lockfile
pnpm dist:win
```

When it finishes, open the `pack` folder inside the project. The Windows installer / packaged application will be there.

If you only want to run 143 Music locally without creating an installer:

```powershell
pnpm build
pnpm start
```

## First launch

When 143 Music opens:

1. Use the **account button** in the top-right corner to sign in or switch Google accounts.
2. Open **Home** to load your YouTube Music recommendations.
3. Use **Settings** to choose the audio mode, accent color, Discord Rich Presence options and other desktop preferences.
4. Click the artwork or use Karaoke / Queue controls to open the custom **Now Playing** screen.

YouTube Music Premium is required for YouTube Music features that are Premium-only, including the corresponding high-quality playback modes.

## OBS overlay

143 Music includes a local Now Playing overlay for OBS.

1. Keep 143 Music running.
2. In OBS, add a **Browser Source**.
3. Use this URL:

```text
http://127.0.0.1:14321/overlay
```

4. Start with a source size of **520 × 140**.
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
pnpm dev          # development mode
pnpm build        # production build
pnpm start        # preview the production build
pnpm dist:win     # Windows package
pnpm dist:linux   # Linux package
pnpm dist:mac     # macOS x64 package
pnpm dist:mac:arm64
```

Live YouTube Music behavior depends partly on private YouTube Music DOM and player APIs. Google can change those independently of this project, so some integrations may occasionally need updates.

## Attribution

This repository originated from the open-source desktop client maintained in `pear-devs/pear-desktop` and contains substantial code derived from that project. The original MIT license and copyright notice are retained in [`license`](./license).

## License

MIT. See [`license`](./license).
