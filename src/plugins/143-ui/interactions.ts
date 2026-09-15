import type { YouTubeMusicAdapter } from './youtube-music';

const NATIVE_POLISH_STYLE_ID = 'ui143-native-polish';

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

    html[data-143-ui] ytmusic-browse-response:has(ytmusic-immersive-header-renderer)
      ytmusic-immersive-header-renderer .content-container-wrapper {
      width: calc(100% - 48px) !important;
      max-width: none !important;
      margin-left: 24px !important;
      margin-right: 24px !important;
      box-sizing: border-box !important;
    }

    html[data-143-ui] ytmusic-browse-response:has(ytmusic-immersive-header-renderer)
      ytmusic-section-list-renderer > #contents,
    html[data-143-ui] ytmusic-browse-response:has(ytmusic-immersive-header-renderer)
      ytmusic-shelf-renderer > #contents {
      padding-left: 24px !important;
      padding-right: 24px !important;
      box-sizing: border-box !important;
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
  return () => style.remove();
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
