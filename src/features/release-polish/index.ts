import { createFeature, createRenderer } from '@/utils';

const STYLE = `
#ui143-now-playing {
  border-radius: 0 !important;
  background:
    radial-gradient(circle at 20% 16%, rgb(var(--ui143-now-playing-rgb) / .19), transparent 42%),
    radial-gradient(circle at 76% 72%, rgb(var(--ui143-now-playing-rgb) / .08), transparent 44%),
    linear-gradient(145deg, #0b0b0e 0%, #09090c 48%, #07080a 100%) !important;
}

.ui143-now-playing-stage {
  grid-template-columns: minmax(350px, 42%) minmax(500px, 1fr) !important;
  gap: clamp(44px, 5vw, 92px) !important;
  padding: clamp(36px, 5vh, 76px) clamp(48px, 6vw, 104px) !important;
}

.ui143-now-playing-art-shell {
  width: min(100%, 480px) !important;
}

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
.ui143-now-playing-pane {
  overflow: hidden !important;
}

.ui143-now-playing-provider,
.ui143-now-playing-list-heading {
  padding-inline: 8px !important;
  color: rgba(255,255,255,.31) !important;
}

.ui143-now-playing-lyrics {
  padding: 28% 8px 34% !important;
  mask-image: linear-gradient(to bottom, transparent 0, #000 10%, #000 90%, transparent 100%) !important;
}

.ui143-now-playing-lyric {
  padding-inline: 4px !important;
  font-size: clamp(23px, 2vw, 36px) !important;
}

.ui143-now-playing-list {
  padding: 0 0 18px !important;
}

.ui143-now-playing-track {
  min-height: 66px !important;
  padding: 9px 8px !important;
  border-radius: 10px !important;
}

.ui143-now-playing-album-hero {
  padding-inline: 8px !important;
  border-bottom-color: rgba(255,255,255,.035) !important;
}

.ui143-now-playing-stars {
  opacity: .9 !important;
}

.ui143-now-playing-star {
  animation-name: ui143-release-star-drift !important;
  animation-timing-function: ease-in-out !important;
  animation-iteration-count: infinite !important;
}

@keyframes ui143-release-star-drift {
  0%, 100% { opacity: .08; transform: translate3d(0, 0, 0) scale(.82); }
  35% { opacity: .42; transform: translate3d(4px, -3px, 0) scale(1.06); }
  68% { opacity: .22; transform: translate3d(-3px, 5px, 0) scale(.94); }
}
`;

const LIBRARY_ROUTES: Record<string, string> = {
  library: '/library',
  playlists: '/library/playlists',
  songs: '/library/songs',
  albums: '/library/albums',
  artists: '/library/artists',
};

const submitArtistSearch = (name: string) => {
  const value = name.trim();
  if (!value) return;
  const input = document.getElementById('ui143-search') as HTMLInputElement | null;
  const form = input?.closest<HTMLFormElement>('form');
  if (!input || !form) return;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  form.requestSubmit();
};

const ensureLibraryRoute = (route: string, attempt = 0) => {
  if (window.location.pathname === route) return;
  const app = document.querySelector<HTMLElement & { navigate?: (url: string) => void }>(
    'ytmusic-app',
  );
  if (typeof app?.navigate === 'function') {
    app.navigate(route);
    return;
  }
  if (attempt >= 30) return;
  window.setTimeout(() => ensureLibraryRoute(route, attempt + 1), 100);
};

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

const renderer = createRenderer<{
  styleSheet: CSSStyleSheet | null;
  clickHandler: ((event: MouseEvent) => void) | null;
  timer: number | null;
}>({
  styleSheet: null,
  clickHandler: null,
  timer: null,

  async start() {
    this.styleSheet = new CSSStyleSheet();
    await this.styleSheet.replace(STYLE);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, this.styleSheet];

    this.clickHandler = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (target.closest('#ui143-account-button')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void window.ipcRenderer.invoke('143:auth:sign-in', 'channel');
        return;
      }

      if (
        target.closest('#ui143-player .ui143-player-art') ||
        target.closest('#ui143-player .ui143-player-title')
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        document
          .querySelector<HTMLButtonElement>('#ui143-player button[aria-label="Karaoke"]')
          ?.click();
        return;
      }

      const artistButton = target.closest<HTMLElement>('.ui143-player-artist-button');
      if (artistButton) {
        const name = artistButton.textContent?.trim() ?? '';
        window.setTimeout(() => {
          const page = document.getElementById('ui143-artist-page');
          if (!page || page.hidden) submitArtistSearch(name);
        }, 450);
        return;
      }

      const artistText = target.closest<HTMLElement>(
        '.ui143-player-artist, .ui143-now-playing-artist',
      );
      if (artistText && !artistText.querySelector('.ui143-player-artist-button')) {
        const name = artistText.textContent?.trim() ?? '';
        if (name) {
          event.preventDefault();
          event.stopImmediatePropagation();
          submitArtistSearch(name);
        }
        return;
      }

      const nav = target.closest<HTMLElement>('.ui143-nav-item[data-key]');
      const route = nav?.dataset.key ? LIBRARY_ROUTES[nav.dataset.key] : undefined;
      if (route) window.setTimeout(() => ensureLibraryRoute(route), 60);
    };
    document.addEventListener('click', this.clickHandler, true);

    addStars();
    this.timer = window.setInterval(addStars, 1000);
  },

  stop() {
    if (this.clickHandler)
      document.removeEventListener('click', this.clickHandler, true);
    this.clickHandler = null;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
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
  description: () => 'Final navigation and full-page now-playing polish for 143 Music.',
  config: { enabled: true },
  renderer,
});
