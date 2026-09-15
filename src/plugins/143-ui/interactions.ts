import type { YouTubeMusicAdapter } from './youtube-music';

export const mountInteractions = (engine: YouTubeMusicAdapter) => {
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
  return () => document.removeEventListener('click', onClick, true);
};
