import { createFeature, createRenderer } from '@/utils';

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

.ui143-now-playing-tab:disabled,
.ui143-now-playing-tab.is-disabled {
  opacity: .28 !important;
  cursor: default !important;
  background: transparent !important;
  box-shadow: none !important;
}

.ui143-now-playing-lyrics {
  padding: 30% 8px 38% !important;
  scroll-behavior: auto !important;
  mask-image: linear-gradient(to bottom, transparent 0, #000 10%, #000 90%, transparent 100%) !important;
}

.ui143-now-playing-lyric {
  padding: 17px 4px !important;
  font-size: clamp(23px, 2vw, 36px) !important;
  line-height: 1.34 !important;
  transition:
    color 700ms ease,
    opacity 700ms ease,
    transform 850ms cubic-bezier(.22,.7,.2,1),
    text-shadow 850ms ease !important;
}

.ui143-now-playing-lyric.is-current { transform: translate3d(0, -3px, 0) !important; }
.ui143-now-playing-lyric.is-past {
  opacity: .45;
  transform: translate3d(0, -2px, 0) !important;
}
.ui143-now-playing-lyric.is-upcoming {
  opacity: .76;
  transform: translate3d(0, 4px, 0) !important;
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
  .ui143-now-playing-lyric { font-size: clamp(19px, 2.4vw, 28px) !important; }
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

const scrollAnimations = new WeakMap<HTMLElement, number>();

const settleLyrics = () => {
  const current = document.querySelector<HTMLElement>(
    '#ui143-now-playing:not([hidden]) .ui143-now-playing-lyric.is-current',
  );
  const scroll = current?.closest<HTMLElement>('.ui143-now-playing-lyrics');
  if (!current || !scroll) return;
  if (scroll.dataset.releaseLyric === current.dataset.index) return;
  scroll.dataset.releaseLyric = current.dataset.index ?? '';

  const previous = scrollAnimations.get(scroll);
  if (previous !== undefined) cancelAnimationFrame(previous);

  // Cancel the browser's own scrollIntoView animation first. From here on the
  // active line is kept in one calm visual zone instead of creeping upward.
  scroll.scrollTo({ top: scroll.scrollTop, behavior: 'auto' });
  const start = scroll.scrollTop;
  const desired = Math.max(
    0,
    current.offsetTop - scroll.clientHeight * 0.42 + current.offsetHeight / 2,
  );
  const distance = desired - start;
  if (Math.abs(distance) < 2) return;
  const started = performance.now();
  const duration = 1100;

  const frame = (now: number) => {
    const progress = Math.min(1, (now - started) / duration);
    const eased = 1 - Math.pow(1 - progress, 4);
    scroll.scrollTop = start + distance * eased;
    if (progress < 1) {
      scrollAnimations.set(scroll, requestAnimationFrame(frame));
    } else {
      scrollAnimations.delete(scroll);
    }
  };
  scrollAnimations.set(scroll, requestAnimationFrame(frame));
};

const renderer = createRenderer<{
  styleSheet: CSSStyleSheet | null;
  starTimer: number | null;
  lyricsTimer: number | null;
}>({
  styleSheet: null,
  starTimer: null,
  lyricsTimer: null,

  async start() {
    this.styleSheet = new CSSStyleSheet();
    await this.styleSheet.replace(STYLE);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, this.styleSheet];
    addStars();
    this.starTimer = window.setInterval(addStars, 1000);
    this.lyricsTimer = window.setInterval(settleLyrics, 120);
  },

  stop() {
    if (this.starTimer !== null) window.clearInterval(this.starTimer);
    if (this.lyricsTimer !== null) window.clearInterval(this.lyricsTimer);
    this.starTimer = null;
    this.lyricsTimer = null;
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
