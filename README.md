<div align="center">
  <img src="./assets/143-music-icon.png" width="128" height="128" alt="143 Music icon">

# 143 Music

**A lightweight YouTube Music desktop client with a custom UI and forced Opus audio.**

[**English**](./README.md) · [**Русский**](./README_RU.md)

143 Music keeps the YouTube Music catalog, recommendations and account system, but replaces much of the desktop experience with its own cleaner interface and desktop features.

It is designed for low background load and gives you direct control over audio quality, including forced Opus playback when YouTube provides it.

[**Download 143 Music for Windows →**](https://github.com/143kmh/143-youtube-music/releases)

</div>

> [!NOTE]
> There is no public binary release yet. When the first release is published, the button above will contain a ready-to-install Windows `.exe`.

> [!IMPORTANT]
> 143 Music is an unofficial project. It is not affiliated with, authorized by, endorsed by, or otherwise officially connected with Google LLC or YouTube. Google, YouTube, YouTube Music, and related marks belong to their respective owners.

## Why 143 Music?

- **Lightweight in everyday use** — inactive views stop doing unnecessary work and background polling is reduced.
- **Forced Opus audio** — 143 Music can select the best Opus stream YouTube provides instead of staying on the lower-quality desktop fallback.
- **Custom desktop UI** — Home, search, artists, albums, playlists, queue, player controls, Now Playing, lyrics and settings.

### Why Opus?

In our testing, normal desktop YouTube Music often selected about **128–130 kbps AAC-LC**. With Opus enabled, 143 Music can use the higher-quality Opus stream YouTube already provides, including **itag 774** on eligible Premium playback.

Opus is more efficient than AAC-LC at similar bitrates, and the available Opus stream can also run at roughly twice the bitrate. That means less aggressive compression, fewer artifacts and better preserved detail. It is still lossy audio, but it is a clear upgrade over the 128 kbps AAC fallback when the higher-quality stream is available.

## Highlights

- **Low-overhead custom UI**
- **Forced Opus playback**
- **143 UI** — custom sidebar, Home, search, library, artist, album and playlist pages
- **Custom Now Playing** — artwork, synced lyrics, current playlist / Up Next and full album
- **Personalized Home** — your real YouTube Music recommendations in the 143 Music UI
- **Synced lyrics**
- **Google account controls**
- **Discord Rich Presence**
- **OBS Now Playing overlay**
- **Offline / local library** — Opus, FLAC, M4A, MP3, OGG, WebM, WAV and AAC
- **Desktop integration** — media controls, tray and persistent settings

> 143 Music is lightweight in **runtime behavior and idle overhead**. It is still an Electron application, so the installed size includes Electron/Chromium.

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

Some Windows 11 systems with **Smart App Control** enabled can block unknown unsigned apps without offering **Run anyway**. In that case, use a source build or wait for a signed release rather than disabling Windows security.

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
3. In **Settings**, choose your audio mode, accent color and Discord Rich Presence options.
4. Enable **Opus** if you want the best Opus stream YouTube makes available to your session.
5. Click the artwork or use Karaoke / Queue to open the custom **Now Playing** screen.

YouTube Music Premium is required for Premium-only playback modes and high-quality streams when YouTube provides them.

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

Some integrations depend on private YouTube Music DOM/player behavior and may need updates when YouTube changes its internals.

## Attribution

This repository originated from the open-source desktop client maintained in `pear-devs/pear-desktop` and contains substantial code derived from that project. The original MIT license and copyright notice are retained in [`license`](./license).

## License

MIT. See [`license`](./license).
