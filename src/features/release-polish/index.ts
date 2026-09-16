import { createFeature, createRenderer } from '@/utils';

const VOLUME_STORAGE_KEY = 'ui143-volume';
const PLAY_NEXT_ICON =
  'M15 6H3v2h12V6Zm0 4H3v2h12v-2ZM3 16h8v-2H3v2Zm14-10v8.18A3 3 0 1 0 19 17V8h3V6h-5Z';

const STYLE = `
.ui143-topbar {
  top: 0 !important;
  left: var(--ui143-sidebar-width) !important;
  right: 0 !important;
  border-radius: 0 !important;
}

html[data-143-ui] #content.ytmusic-app-layout,
html[data-143-ui] ytmusic-app-layout #content {
  width: calc(100% - var(--ui143-sidebar-width)) !important;
  height: calc(100vh - var(--ui143-player-height)) !important;
  margin: 0 0 var(--ui143-player-height) var(--ui143-sidebar-width) !important;
  border-radius: 0 !important;
}

#ui143-home-page,
#ui143-search-page,
#ui143-library-page,
#ui143-library-collections,
#ui143-artist-page,
#ui143-album-page,
#ui143-now-playing {
  top: var(--ui143-topbar-height) !important;
  right: 0 !important;
  bottom: var(--ui143-player-height) !important;
  left: var(--ui143-sidebar-width) !important;
  border-radius: 0 !important;
}

#ui143-now-playing {
  background:
    radial-gradient(circle at 20% 16%, rgb(var(--ui143-now-playing-rgb) / .19), transparent 42%),
    radial-gradient(circle at 76% 72%, rgb(var(--ui143-now-playing-rgb) / .08), transparent 44%),
    linear-gradient(145deg, #0b0b0e 0%, #09090c 48%, #07080a 100%) !important;
}

.ui143-now-playing-wash {
  opacity: 0;
  transition: opacity 900ms ease, filter 900ms ease !important;
}

.ui143-now-playing-stage {
  grid-template-columns: minmax(350px, 42%) minmax(500px, 1fr) !important;
  align-items: start !important;
  gap: clamp(44px, 5vw, 92px) !important;
  padding: clamp(36px, 5vh, 76px) clamp(48px, 6vw, 104px) !important;
}

.ui143-now-playing-left {
  align-self: start !important;
  padding-top: clamp(48px, 7vh, 104px) !important;
}

.ui143-now-playing-art-shell {
  width: min(100%, 480px) !important;
  border: 0 !important;
  box-shadow:
    0 28px 78px rgba(0,0,0,.46),
    0 0 96px rgb(var(--ui143-now-playing-rgb) / .08) !important;
}

.ui143-now-playing-title { min-height: 2.2em; }

.ui143-now-playing-panel {
  height: min(82vh, 790px) !important;
  min-height: 470px !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  overflow: hidden !important;
}

.ui143-now-playing-header {
  min-height: 54px !important;
  padding: 4px 0 10px !important;
  border-bottom: 0 !important;
  background: transparent !important;
}

.ui143-now-playing-body,
.ui143-now-playing-pane { overflow: hidden !important; }

.ui143-now-playing-provider,
.ui143-now-playing-list-heading {
  padding-inline: 8px !important;
  color: rgba(255,255,255,.31) !important;
}

.ui143-now-playing-tab {
  background: transparent !important;
  box-shadow: none !important;
  color: rgba(255,255,255,.42) !important;
  transition: color 180ms ease, opacity 180ms ease, text-shadow 220ms ease !important;
}

.ui143-now-playing-tab:hover:not(:disabled) {
  background: transparent !important;
  color: rgba(255,255,255,.76) !important;
}

.ui143-now-playing-tab.is-active {
  background: transparent !important;
  box-shadow: none !important;
  color: #fff !important;
  text-shadow:
    0 0 16px rgb(var(--ui143-now-playing-rgb) / .38),
    0 0 34px rgb(var(--ui143-now-playing-rgb) / .14) !important;
}

.ui143-now-playing-tab:disabled,
.ui143-now-playing-tab.is-disabled {
  opacity: .24 !important;
  cursor: default !important;
  background: transparent !important;
  box-shadow: none !important;
  text-shadow: none !important;
}

.ui143-now-playing-close {
  width: 36px !important;
  height: 36px !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  color: rgba(255,255,255,.42) !important;
  font-size: 27px !important;
  font-weight: 300 !important;
  transition: color 160ms ease, transform 180ms ease !important;
}

.ui143-now-playing-close:hover {
  background: transparent !important;
  color: #fff !important;
  transform: scale(1.08) !important;
}

/* Match the synced-lyrics "fancy" presentation used in the YouTube surface.
   Real spacers keep even the first line in the same visual zone as later lines. */
.ui143-now-playing-lyrics {
  padding: 0 8px !important;
  scroll-behavior: smooth !important;
  mask-image: linear-gradient(to bottom, transparent 0, #000 9%, #000 91%, transparent 100%) !important;
}

.ui143-now-playing-lyrics::before,
.ui143-now-playing-lyrics::after {
  content: '';
  display: block;
  width: 100%;
  height: 42%;
  min-height: 42%;
  pointer-events: none;
}

.ui143-now-playing-lyric {
  padding: 2rem 1.5rem !important;
  color: #fff !important;
  font-family:
    Satoshi, Avenir, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif !important;
  font-size: clamp(2rem, 2.25vw, 3rem) !important;
  font-weight: 700 !important;
  line-height: 1.333 !important;
  opacity: .33 !important;
  transform: scale(.95) !important;
  transform-origin: 0 50% !important;
  text-shadow: none !important;
  transition:
    opacity 330ms ease,
    transform 220ms ease,
    color 330ms ease,
    text-shadow 500ms ease !important;
}

.ui143-now-playing-lyric.is-current {
  opacity: 1 !important;
  transform: scale(1) !important;
  text-shadow:
    0 0 1.2rem rgba(255,255,255,.20),
    0 0 2.2rem rgb(var(--ui143-now-playing-rgb) / .12) !important;
}

.ui143-now-playing-lyric.is-past,
.ui143-now-playing-lyric.is-upcoming {
  opacity: .33 !important;
  transform: scale(.95) !important;
}

.ui143-now-playing-lyric:hover:not(.is-current) {
  opacity: .58 !important;
}

.ui143-now-playing-list { padding: 0 0 18px !important; }
.ui143-now-playing-track {
  min-height: 66px !important;
  padding: 9px 8px !important;
  border-radius: 10px !important;
}
.ui143-now-playing-album-hero {
  padding-inline: 8px !important;
  border-bottom-color: rgba(255,255,255,.035) !important;
}
.ui143-now-playing-stars { opacity: .9 !important; }
.ui143-now-playing-star {
  animation-name: ui143-release-star-drift !important;
  animation-timing-function: ease-in-out !important;
  animation-iteration-count: infinite !important;
}

.ui143-player-utils .ui143-player-button[aria-label='Queue'] .ui143-player-icon,
.ui143-player-utils .ui143-player-button[aria-label='Play next'] .ui143-player-icon {
  width: 18px !important;
  height: 18px !important;
  transform: translate3d(0, -.25px, 0);
}

@keyframes ui143-release-star-drift {
  0%, 100% { opacity: .08; transform: translate3d(0, 0, 0) scale(.82); }
  35% { opacity: .42; transform: translate3d(4px, -3px, 0) scale(1.06); }
  68% { opacity: .22; transform: translate3d(-3px, 5px, 0) scale(.94); }
}

@media (max-width: 1100px) {
  .ui143-now-playing-stage {
    grid-template-columns: minmax(270px, 38%) minmax(360px, 1fr) !important;
    gap: 30px !important;
    padding: 30px !important;
  }
  .ui143-now-playing-left { padding-top: 34px !important; }
  .ui143-now-playing-art-shell { width: min(100%, 370px) !important; }
  .ui143-now-playing-panel {
    height: min(78vh, 680px) !important;
    min-height: 390px !important;
  }
}

@media (max-width: 820px) {
  .ui143-now-playing-stage {
    grid-template-columns: minmax(220px, 34%) minmax(300px, 1fr) !important;
    gap: 22px !important;
    padding: 22px !important;
  }
  .ui143-now-playing-left { padding-top: 24px !important; }
  .ui143-now-playing-art-shell { width: min(100%, 300px) !important; }
  .ui143-now-playing-lyric { font-size: clamp(1.65rem, 2.4vw, 2.35rem) !important; }
}

@media (max-height: 720px) {
  .ui143-now-playing-stage {
    padding-top: 24px !important;
    padding-bottom: 24px !important;
  }
  .ui143-now-playing-left { padding-top: 8px !important; }
  .ui143-now-playing-art-shell { width: min(100%, 310px) !important; }
  .ui143-now-playing-panel {
    height: calc(100vh - var(--ui143-topbar-height) - var(--ui143-player-height) - 28px) !important;
    min-height: 360px !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ui143-now-playing-star,
  .ui143-now-playing-lyric {
    animation: none !important;
    transition: none !important;
  }
}
`;

const addStars = () => {
  const container = document.querySelector<HTMLElement>('.ui143-now-playing-stars');
  if (!container) return;
  const count = container.querySelectorAll('.ui143-now-playing-star').length;
  if (count >= 96) return;
  const fragment = document.createDocumentFragment();
  for (let index = count; index < 96; index++) {
    const star = document.createElement('i');
    star.className = 'ui143-now-playing-star';
    const size = Math.random() < .84 ? 1 : 1.4 + Math.random() * 1.1;
    star.style.left = `${Math.random() * 100}%`;
    star.style.top = `${Math.random() * 100}%`;
    star.style.width = `${size}px`;
    star.style.height = `${size}px`;
    star.style.opacity = String(.07 + Math.random() * .3);
    star.style.animationDuration = `${10 + Math.random() * 18}s`;
    star.style.animationDelay = `${-Math.random() * 20}s`;
    fragment.append(star);
  }
  container.append(fragment);
};

type PlayerVolumeApi = HTMLElement & {
  setVolume?: (value: number) => void;
  getVolume?: () => number;
  isMuted?: () => boolean;
  mute?: () => void;
};

const readSavedVolume = () => {
  try {
    const raw = window.localStorage.getItem(VOLUME_STORAGE_KEY);
    if (raw === null) return null;
    const value = Number(raw);
    if (!Number.isFinite(value)) return null;
    return Math.max(0, Math.min(100, Math.round(value)));
  } catch {
    return null;
  }
};

const saveVolume = (value: number) => {
  if (!Number.isFinite(value)) return;
  try {
    window.localStorage.setItem(
      VOLUME_STORAGE_KEY,
      String(Math.max(0, Math.min(100, Math.round(value)))),
    );
  } catch {
    // Playback keeps working even if this profile blocks local storage.
  }
};

const restoreVolume = () => {
  const saved = readSavedVolume();
  if (saved === null) return true;
  const player = document.querySelector<PlayerVolumeApi>('#movie_player');
  if (!player?.setVolume) return false;
  const wasMuted = player.isMuted?.() ?? true;
  player.setVolume(saved);
  if (wasMuted) player.mute?.();
  return true;
};

const playNextButton = () =>
  document.querySelector<HTMLButtonElement>(
    "#ui143-player .ui143-player-utils button[aria-label='Play next'], #ui143-player .ui143-player-utils button[aria-label='Queue']",
  );

const polishPlayNext = () => {
  const control = playNextButton();
  if (!control) return false;
  // Keep the semantic Queue label so the Now Playing feature owns the click,
  // while the tooltip and icon present it as Play next in the 143 UI.
  control.setAttribute('aria-label', 'Queue');
  control.title = 'Play next';
  control.querySelector<SVGPathElement>('svg path')?.setAttribute('d', PLAY_NEXT_ICON);
  return true;
};

const closeListeningSurface = () => {
  const home = document.getElementById('ui143-home-page');
  if (home) home.hidden = true;
  const nowPlaying = document.getElementById('ui143-now-playing');
  if (nowPlaying && !nowPlaying.hidden) {
    nowPlaying
      .querySelector<HTMLButtonElement>('.ui143-now-playing-close')
      ?.click();
  }
};

const renderer = createRenderer<{
  styleSheet: CSSStyleSheet | null;
  starTimer: number | null;
  volumeTimer: number | null;
  inputHandler: ((event: Event) => void) | null;
  clickHandler: ((event: MouseEvent) => void) | null;
}>({
  styleSheet: null,
  starTimer: null,
  volumeTimer: null,
  inputHandler: null,
  clickHandler: null,

  async start() {
    this.styleSheet = new CSSStyleSheet();
    await this.styleSheet.replace(STYLE);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, this.styleSheet];

    addStars();
    polishPlayNext();
    this.starTimer = window.setInterval(addStars, 1000);

    if (!restoreVolume()) {
      this.volumeTimer = window.setInterval(() => {
        polishPlayNext();
        if (!restoreVolume()) return;
        if (this.volumeTimer !== null) window.clearInterval(this.volumeTimer);
        this.volumeTimer = null;
      }, 250);
    }

    this.inputHandler = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (!target.matches('#ui143-player .ui143-player-volume')) return;
      saveVolume(Number(target.value));
    };
    document.addEventListener('input', this.inputHandler, true);

    this.clickHandler = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const nav = target.closest<HTMLElement>('.ui143-nav-item[data-key]');
      if (nav && ['library', 'playlists', 'songs'].includes(nav.dataset.key ?? '')) {
        // Do not own Library navigation here. Just remove surfaces that could
        // visually cover the real 143 Library and let 143-ui handle the click.
        closeListeningSurface();
      }
    };
    document.addEventListener('click', this.clickHandler, true);
  },

  stop() {
    if (this.starTimer !== null) window.clearInterval(this.starTimer);
    if (this.volumeTimer !== null) window.clearInterval(this.volumeTimer);
    this.starTimer = null;
    this.volumeTimer = null;
    if (this.inputHandler)
      document.removeEventListener('input', this.inputHandler, true);
    if (this.clickHandler)
      document.removeEventListener('click', this.clickHandler, true);
    this.inputHandler = null;
    this.clickHandler = null;
    if (this.styleSheet) {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
        (sheet) => sheet !== this.styleSheet,
      );
      this.styleSheet = null;
    }
  },
});

export default createFeature({
  name: () => 'Release Polish',
  description: () => 'Final layout and now-playing polish for 143 Music.',
  config: { enabled: true },
  renderer,
});
