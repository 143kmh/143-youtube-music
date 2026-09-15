import type { YouTubeMusicAdapter } from './youtube-music';

export const mountInteractions = (engine: YouTubeMusicAdapter) => {
  const onClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const meta = target.closest('.ui143-player-meta');
    const interactive = target.closest('a, button, input, [role="button"]');
    if (meta && (!interactive || !meta.contains(interactive))) {
      event.preventDefault();
      engine.openNowPlaying();
      return;
    }
    engine.handleTrackClick(event);
  };
  document.addEventListener('click', onClick, true);
  return () => document.removeEventListener('click', onClick, true);
};
