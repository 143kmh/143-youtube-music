import type { YouTubeMusicAdapter } from './youtube-music';

const NATIVE_POLISH_STYLE_ID = 'ui143-native-polish';
const HIDDEN_SHELF_CLASS = 'ui143-native-shelf-hidden';

const normalizeShelfTitle = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const shouldHideNativeArtistShelf = (value: string) => {
  const title = normalizeShelfTitle(value);
  if (!title) return false;
  return /^(?:albums?|альбомы?|singles?(?: and | & )?releases?|синглы(?: и)? выпуски|videos?|видео|podcasts?|подкасты?|episodes?|эпизоды?|выпуски?)$/iu.test(
    title,
  );
};

const mountNativePolish = () => {
  document.getElementById(NATIVE_POLISH_STYLE_ID)?.remove();
  const style = document.createElement('style');
  style.id = NATIVE_POLISH_STYLE_ID;
  style.textContent = `
    /* Keep the 143 shell visually continuous over immersive artist headers. */
    .ui143-topbar {
      background: #121212 !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }

    /* Native artist pages still provide the data/rendering, but should use the
       full 143 content width instead of YouTube Music's centered desktop gutter. */
    html[data-143-ui] ytmusic-browse-response:has(ytmusic-immersive-header-renderer),
    html[data-143-ui] ytmusic-browse-response:has(ytmusic-immersive-header-renderer) #browse-page,
    html[data-143-ui] ytmusic-browse-response:has(ytmusic-immersive-header-renderer) #content-wrapper,
    html[data-143-ui] ytmusic-browse-response:has(ytmusic-immersive-header-renderer) #single-column-browse-results {
      width: 100% !important;
      max-width: none !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
      box-sizing: border-box !important;
    }

    html[data-143-ui] ytmusic-browse-response:has(ytmusic-immersive-header-renderer) {
      --ytmusic-content-width: 100% !important;
      --ytmusic-page-padding: 24px !important;
    }

    /* The native hero was effectively half a screen tall. Keep it as a compact
       banner so the eye lands on Top tracks without losing the artist image. */
    html[data-143-ui] ytmusic-browse-response:has(ytmusic-immersive-header-renderer)
      ytmusic-immersive-header-renderer {
      position: relative !important;
      height: clamp(270px, 31vh, 330px) !important;
      min-height: 270px !important;
      max-height: 330px !important;
      overflow: hidden !important;
    }

    html[data-143-ui] ytmusic-browse-response:has(ytmusic-immersive-header-renderer)
      .image.ytmusic-immersive-header-renderer {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      min-height: 0 !important;
      margin: 0 !important;
      overflow: hidden !important;
    }

    html[data-143-ui] ytmusic-browse-response:has(ytmusic-immersive-header-renderer)
      .image.ytmusic-immersive-header-renderer img,
    html[data-143-ui] ytmusic-browse-response:has(ytmusic-immersive-header-renderer)
      .image.ytmusic-immersive-header-renderer yt-img-shadow {
      width: 100% !important;
      height: 100% !important;
      object-fit: cover !important;
      object-position: center 34% !important;
    }

    html[data-143-ui] ytmusic-browse-response:has(ytmusic-immersive-header-renderer)
      ytmusic-immersive-header-renderer .content-container-wrapper {
      position: relative !important;
      z-index: 2 !important;
      width: 100% !important;
      max-width: none !important;
      height: 100% !important;
      min-height: 0 !important;
      display: flex !important;
      align-items: flex-end !important;
      margin: 0 !important;
      box-sizing: border-box !important;
    }

    html[data-143-ui] ytmusic-browse-response:has(ytmusic-immersive-header-renderer)
      ytmusic-immersive-header-renderer .content-container {
      width: 100% !important;
      padding: 0 24px 18px !important;
      box-sizing: border-box !important;
    }

    html[data-143-ui] ytmusic-browse-response:has(ytmusic-immersive-header-renderer)
      ytmusic-immersive-header-renderer .gradient-container {
      position: absolute !important;
      inset: 0 !important;
      background: linear-gradient(180deg, transparent 28%, rgba(0, 0, 0, 0.18) 58%, rgba(0, 0, 0, 0.9) 100%) !important;
      pointer-events: none !important;
    }

    /* Merch/social copy is useful on youtube.com, but in 143 Music it makes the
       compact hero taller and pushes playback content below the fold. */
    html[data-143-ui] ytmusic-browse-response:has(ytmusic-immersive-header-renderer)
      ytmusic-immersive-header-renderer .description-container {
      display: none !important;
    }

    html[data-143-ui] ytmusic-browse-response:has(ytmusic-immersive-header-renderer)
      ytmusic-section-list-renderer > #contents,
    html[data-143-ui] ytmusic-browse-response:has(ytmusic-immersive-header-renderer)
      ytmusic-shelf-renderer > #contents {
      padding-left: 24px !important;
      padding-right: 24px !important;
      box-sizing: border-box !important;
    }

    /* The current native album/singles/video shelves render badly inside our
       shell. Hide those fallback shelves until they are replaced by 143 views. */
    html[data-143-ui] .${HIDDEN_SHELF_CLASS} {
      display: none !important;
    }

    /* 143 Music is a music player. Keep podcast / episode surfaces out of the
       native fallback pages as well as our own search results. */
    html[data-143-ui] ytmusic-podcast-show,
    html[data-143-ui] ytmusic-podcast-detail-page,
    html[data-143-ui] ytmusic-podcast-shelf-renderer,
    html[data-143-ui] ytmusic-two-row-item-renderer:has(a[href*="/podcast/"]),
    html[data-143-ui] ytmusic-responsive-list-item-renderer:has(a[href*="/podcast/"]),
    html[data-143-ui] ytmusic-two-row-item-renderer:has(a[href*="MPSP"]),
    html[data-143-ui] ytmusic-responsive-list-item-renderer:has(a[href*="MPSP"]),
    html[data-143-ui] ytmusic-guide-entry-renderer:has(a[href*="/podcast/"]) {
      display: none !important;
    }
  `;
  document.head.append(style);

  let scheduled = false;
  const polishArtistShelves = () => {
    scheduled = false;
    const artistPage = document.querySelector<HTMLElement>(
      'ytmusic-browse-response:has(ytmusic-immersive-header-renderer)',
    );
    for (const shelf of document.querySelectorAll<HTMLElement>(
      `.${HIDDEN_SHELF_CLASS}`,
    )) {
      if (!artistPage?.contains(shelf)) shelf.classList.remove(HIDDEN_SHELF_CLASS);
    }
    if (!artistPage) return;

    for (const shelf of artistPage.querySelectorAll<HTMLElement>(
      'ytmusic-carousel-shelf-renderer, ytmusic-shelf-renderer',
    )) {
      const heading = shelf.querySelector<HTMLElement>(
        '#title, .title, .headline, h2',
      );
      shelf.classList.toggle(
        HIDDEN_SHELF_CLASS,
        shouldHideNativeArtistShelf(heading?.textContent ?? ''),
      );
    }
  };
  const schedulePolish = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(polishArtistShelves);
  };
  const observer = new MutationObserver(schedulePolish);
  observer.observe(document.body, { childList: true, subtree: true });
  schedulePolish();

  return () => {
    observer.disconnect();
    style.remove();
    for (const shelf of document.querySelectorAll<HTMLElement>(
      `.${HIDDEN_SHELF_CLASS}`,
    ))
      shelf.classList.remove(HIDDEN_SHELF_CLASS);
  };
};

export const mountInteractions = (engine: YouTubeMusicAdapter) => {
  const removeNativePolish = mountNativePolish();

  const openCurrentTrack = () => {
    const id = engine.getState().track.id;
    if (!id) return false;
    return engine.navigate('/watch?v=' + encodeURIComponent(id));
  };

  const openLyricsFromAnywhere = () => {
    const trackId = engine.getState().track.id;
    if (!trackId) return;

    if (window.location.pathname === '/watch') {
      engine.toggleLyrics();
      return;
    }

    if (!openCurrentTrack()) return;
    const toggleWhenRouted = (attempt = 0) => {
      if (engine.getState().track.id !== trackId) return;
      if (window.location.pathname === '/watch' || attempt >= 20) {
        engine.toggleLyrics();
        return;
      }
      window.setTimeout(() => toggleWhenRouted(attempt + 1), 50);
    };
    window.setTimeout(toggleWhenRouted, 0);
  };

  const onClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const karaoke = target.closest(
      '.ui143-player-utils button[aria-label="Karaoke"]',
    );
    if (karaoke) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openLyricsFromAnywhere();
      return;
    }

    const meta = target.closest('.ui143-player-meta');
    const interactive = target.closest('a, button, input, [role="button"]');
    if (meta && (!interactive || !meta.contains(interactive))) {
      event.preventDefault();
      event.stopPropagation();
      openCurrentTrack();
      return;
    }
    engine.handleTrackClick(event);
  };
  document.addEventListener('click', onClick, true);
  return () => {
    document.removeEventListener('click', onClick, true);
    removeNativePolish();
  };
};
