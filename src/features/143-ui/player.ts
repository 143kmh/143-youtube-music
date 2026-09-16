import { mountPlaylistPicker } from './playlist-picker';

import type { YouTubeMusicAdapter } from './youtube-music';

const PLAYER_ROOT_ID = 'ui143-player';

const svg = (path: string, viewBox = '0 0 24 24') => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', viewBox);
  el.setAttribute('aria-hidden', 'true');
  el.classList.add('ui143-player-icon');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', path);
  el.append(p);
  return el;
};

const icons = {
  play: 'M8 5v14l11-7L8 5Z',
  pause: 'M7 5h4v14H7V5Zm6 0h4v14h-4V5Z',
  previous: 'M6 5h2v14H6V5Zm3 7 9-7v14l-9-7Z',
  next: 'M16 5h2v14h-2V5ZM6 5l9 7-9 7V5Z',
  shuffle:
    'M16.7 3.3 20.4 7l-3.7 3.7-1.4-1.4L16.6 8H15c-2.1 0-3.5.9-4.8 2.7l-1.1 1.6C7.5 14.8 5.4 16 2.5 16H2v-2h.5c2.1 0 3.5-.9 4.8-2.7l1.1-1.6C10 7.2 12.1 6 15 6h1.6l-1.3-1.3 1.4-1.4ZM2 7h.5c2.7 0 4.7 1.1 6.3 3.2l-1.2 1.7C6.3 10 4.8 9 2.5 9H2V7Zm13.3 6.3 1.4-1.4 3.7 3.7-3.7 3.7-1.4-1.4 1.3-1.3H15c-1.7 0-3-.4-4.1-1.1l1.2-1.7c.8.5 1.7.8 2.9.8h1.6l-1.3-1.3Z',
  repeat:
    'M17 3.6 20.4 7 17 10.4 15.6 9l1-1H8a4 4 0 0 0-4 4v1H2v-1a6 6 0 0 1 6-6h8.6l-1-1L17 3.6ZM7 20.4 3.6 17 7 13.6 8.4 15l-1 1H16a4 4 0 0 0 4-4v-1h2v1a6 6 0 0 1-6 6H7.4l1 1L7 20.4Z',
  repeatOne:
    'M17 3.6 20.4 7 17 10.4 15.6 9l1-1H8a4 4 0 0 0-4 4v1H2v-1a6 6 0 0 1 6-6h8.6l-1-1L17 3.6ZM7 20.4 3.6 17 7 13.6 8.4 15l-1 1H16a4 4 0 0 0 4-4v-1h2v1a6 6 0 0 1-6 6H7.4l1 1L7 20.4ZM11.2 9.3h1.4v5.4h-1.6v-3.8l-1 .55-.65-1.15 1.85-1Z',
  volume:
    'M4 9v6h4l5 4V5L8 9H4Zm11.5-.7a5 5 0 0 1 0 7.4l1.4 1.4a7 7 0 0 0 0-10.2l-1.4 1.4Z',
  mute: 'M4 9v6h4l5 4V5L8 9H4Zm12.3.3-1.4 1.4 1.3 1.3-1.3 1.3 1.4 1.4 1.3-1.3 1.3 1.3 1.4-1.4-1.3-1.3 1.3-1.3-1.4-1.4-1.3 1.3-1.3-1.3Z',
  heart:
    'M12 20.6 4.1 13A5.1 5.1 0 0 1 11.3 5.8l.7.72.7-.72A5.1 5.1 0 1 1 19.9 13L12 20.6Zm0-2.7 6.5-6.25A3.2 3.2 0 0 0 14 7.1l-2 2.05-2-2.05a3.2 3.2 0 0 0-4.5 4.55L12 17.9Z',
  heartFilled:
    'M12 20.6 4.1 13A5.1 5.1 0 0 1 11.3 5.8l.7.72.7-.72A5.1 5.1 0 1 1 19.9 13L12 20.6Z',
  playlist:
    'M4 5h10v1.8H4V5Zm0 5h10v1.8H4V10Zm0 5h7v1.8H4V15Zm13-2v-3h2v3h3v2h-3v3h-2v-3h-3v-2h3Z',
  mic: 'M12 14a3.5 3.5 0 0 0 3.5-3.5v-4a3.5 3.5 0 1 0-7 0v4A3.5 3.5 0 0 0 12 14Zm-6-3.5h2A4 4 0 0 0 12 14.5a4 4 0 0 0 4-4h2a6 6 0 0 1-5 5.92V20h3v2H8v-2h3v-3.58A6 6 0 0 1 6 10.5Z',
  queue:
    'M4 5h12v2H4V5Zm0 6h12v2H4v-2Zm0 6h8v2H4v-2Zm14-4.2V17a2.5 2.5 0 1 1-1.6-2.33V12l4.6-1.15v1.9l-3 .75v-.7Z',
};

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${mins}:${secs}`;
};

const button = (label: string, icon: keyof typeof icons, className = '') => {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `ui143-player-button ${className}`.trim();
  el.setAttribute('aria-label', label);
  el.title = label;
  el.append(svg(icons[icon]));
  return el;
};

const setIcon = (el: HTMLButtonElement, icon: keyof typeof icons) => {
  if (el.dataset.icon === icon) return;
  el.dataset.icon = icon;
  el.replaceChildren(svg(icons[icon]));
};

const setActive = (el: HTMLButtonElement, active: boolean) => {
  if (el.classList.contains('is-active') !== active) el.classList.toggle('is-active', active);
  if (el.getAttribute('aria-pressed') !== String(active)) el.setAttribute('aria-pressed', String(active));
};

const setText = (el: HTMLElement, value: string) => {
  if (el.textContent !== value) el.textContent = value;
};

export const mountPlayer = (
  engine: YouTubeMusicAdapter,
  onOpenArtist?: (name: string, browseId: string) => void,
) => {
  const picker = mountPlaylistPicker(engine);
  document.getElementById(PLAYER_ROOT_ID)?.remove();

  const root = document.createElement('div');
  root.id = PLAYER_ROOT_ID;
  root.className = 'ui143-player';

  const meta = document.createElement('div');
  meta.className = 'ui143-player-meta';
  const art = document.createElement('img');
  art.className = 'ui143-player-art';
  art.alt = '';
  const copy = document.createElement('div');
  copy.className = 'ui143-player-copy';
  const title = document.createElement('div');
  title.className = 'ui143-player-title';
  const artist = document.createElement('div');
  artist.className = 'ui143-player-artist';
  copy.append(title, artist);

  const like = button('Add to liked songs', 'heart');
  const playlist = button('Add to playlist', 'playlist');
  const metaActions = document.createElement('div');
  metaActions.className = 'ui143-player-meta-actions';
  metaActions.append(like, playlist);
  meta.append(art, copy, metaActions);

  const center = document.createElement('div');
  center.className = 'ui143-player-center';
  const transport = document.createElement('div');
  transport.className = 'ui143-player-transport';

  const shuffle = button('Shuffle', 'shuffle');
  const previous = button('Previous', 'previous');
  const play = button('Play', 'play', 'ui143-player-play');
  const next = button('Next', 'next');
  const repeat = button('Repeat', 'repeat');

  shuffle.addEventListener('click', () => engine.toggleShuffle());
  previous.addEventListener('click', () => engine.previous());
  next.addEventListener('click', () => engine.next());
  repeat.addEventListener('click', () => engine.cycleRepeat());

  const renderPlayState = (playing: boolean) => {
    setIcon(play, playing ? 'pause' : 'play');
    play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    play.title = playing ? 'Pause' : 'Play';
  };

  play.addEventListener('click', () => engine.togglePlayback());

  transport.append(shuffle, previous, play, next, repeat);

  const timeline = document.createElement('div');
  timeline.className = 'ui143-player-timeline';
  const elapsed = document.createElement('span');
  elapsed.className = 'ui143-player-time';
  elapsed.textContent = '0:00';
  const progressWrap = document.createElement('div');
  progressWrap.className = 'ui143-player-progress-wrap';
  const progressVisual = document.createElement('div');
  progressVisual.className = 'ui143-player-progress-visual';
  const progressFill = document.createElement('div');
  progressFill.className = 'ui143-player-progress-fill';
  progressVisual.append(progressFill);
  const progress = document.createElement('input');
  progress.className = 'ui143-player-range ui143-player-progress';
  progress.type = 'range';
  progress.min = '0';
  progress.max = '1000';
  progress.step = '1';
  progress.value = '0';
  progressWrap.append(progressVisual, progress);
  const duration = document.createElement('span');
  duration.className = 'ui143-player-time';
  duration.textContent = '0:00';
  timeline.append(elapsed, progressWrap, duration);
  center.append(transport, timeline);

  const utilities = document.createElement('div');
  utilities.className = 'ui143-player-utils';
  const karaoke = button('Karaoke', 'mic');
  const queue = button('Queue', 'queue');
  const volumeButton = button('Mute', 'volume');
  const volume = document.createElement('input');
  volume.className = 'ui143-player-range ui143-player-volume';
  volume.type = 'range';
  volume.min = '0';
  volume.max = '100';
  volume.step = '1';
  volume.value = '100';
  utilities.append(karaoke, queue, volumeButton, volume);

  like.addEventListener('click', () => engine.toggleLike());
  playlist.addEventListener('click', () => {
    return picker.open();
  });
  karaoke.addEventListener('click', () => engine.toggleLyrics());
  queue.addEventListener('click', () => engine.openQueue());

  let scrubbing = false;
  let previewTime = 0;
  let pendingSeek = false;
  let seekTrackId = '';
  let seekDuration = 0;

  const setProgressVisual = (ratio: number) => {
    const clamped = Math.max(0, Math.min(1, ratio));
    progress.value = String(Math.round(clamped * 1000));
    progressFill.style.width = `${clamped * 100}%`;
  };

  const durationSeconds = () => engine.getState().duration;

  const updateSeekPreview = () => {
    const total = pendingSeek ? seekDuration : durationSeconds();
    if (total <= 0) return;
    if (!pendingSeek) {
      seekTrackId = engine.getState().track.id;
      seekDuration = total;
    }
    pendingSeek = true;
    const ratio = Number(progress.value) / 1000;
    previewTime = ratio * total;
    setProgressVisual(ratio);
    elapsed.textContent = formatTime(previewTime);
  };

  const commitSeek = () => {
    if (
      pendingSeek &&
      seekTrackId === engine.getState().track.id &&
      seekDuration === durationSeconds()
    )
      engine.seek(previewTime);
    pendingSeek = false;
    scrubbing = false;
    progressWrap.classList.remove('is-scrubbing');
  };

  progress.addEventListener('pointerdown', () => {
    scrubbing = true;
    progressWrap.classList.add('is-scrubbing');
  });
  // Preview only while dragging. A single seek is committed on release/change,
  // avoiding dozens of decoder flushes and the torn audio they caused.
  progress.addEventListener('input', updateSeekPreview);
  progress.addEventListener('change', commitSeek);

  const finishScrub = () => {
    if (!scrubbing) return;
    commitSeek();
  };
  window.addEventListener('pointerup', finishScrub);
  const cancelScrub = () => {
    pendingSeek = false;
    scrubbing = false;
    progressWrap.classList.remove('is-scrubbing');
  };
  window.addEventListener('pointercancel', cancelScrub);

  let volumeDragging = false;
  const renderVolume = (shownVolume: number) => {
    volume.value = String(shownVolume);
    volume.style.setProperty('--ui143-range-progress', shownVolume + '%');
    setIcon(volumeButton, shownVolume === 0 ? 'mute' : 'volume');
  };
  volume.addEventListener('pointerdown', () => {
    volumeDragging = true;
  });
  volume.addEventListener('input', () => {
    engine.setVolume(Number(volume.value));
    renderVolume(Number(volume.value));
  });
  const finishVolume = () => {
    volumeDragging = false;
    const state = engine.getState();
    renderVolume(state.muted ? 0 : state.volume);
  };
  volume.addEventListener('change', finishVolume);
  window.addEventListener('pointerup', finishVolume);

  volumeButton.addEventListener('click', () => engine.toggleMute());

  root.append(meta, center, utilities);
  document.body.append(root);

  const placeholder = document.createElement('div');
  placeholder.className = 'ui143-player-art-placeholder';
  placeholder.setAttribute('aria-hidden', 'true');
  placeholder.textContent = '♪';
  meta.insertBefore(placeholder, art);
  let artistKey = '';
  let lastControls: ReturnType<YouTubeMusicAdapter['getState']> | undefined;
  const unsubscribe = engine.subscribe((state) => {
    const track = state.track;
    if (pendingSeek && seekTrackId !== track.id) cancelScrub();
    if (!scrubbing) {
      setProgressVisual(state.duration > 0 ? state.time / state.duration : 0);
      setText(elapsed, formatTime(state.time));
    }
    const controlKeys = ['track', 'playing', 'duration', 'volume', 'muted', 'liked', 'shuffle', 'repeat', 'lyricsAvailable', 'lyricsActive', 'queueActive'] as const;
    if (lastControls && controlKeys.every((key) => lastControls![key] === state[key])) return;
    lastControls = state;
    progress.disabled = state.duration <= 0;
    root.classList.toggle('is-idle', !track.id && !track.title);
    setText(title, track.title || 'Nothing playing');
    if (track.artwork) {
      if (art.getAttribute('src') !== track.artwork) art.src = track.artwork;
    } else art.removeAttribute('src');
    const key = JSON.stringify([track.artists, track.byline]);
    if (key !== artistKey) {
      artistKey = key;
      artist.replaceChildren();
      if (!track.artists.length) artist.textContent = track.byline;
      track.artists.forEach((entry, index) => {
        if (index) {
          const separator = document.createElement('span');
          separator.className = 'ui143-player-artist-separator';
          separator.textContent = ', ';
          artist.append(separator);
        }
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'ui143-player-artist-link ui143-player-artist-button';
        link.textContent = entry.name;
        link.title = 'Open ' + entry.name;
        link.addEventListener('click', () => {
          if (onOpenArtist) onOpenArtist(entry.name, entry.browseId);
          else engine.navigateArtist(entry.browseId);
        });
        artist.append(link);
      });
    }
    setActive(shuffle, state.shuffle === true);
    setActive(repeat, state.repeat !== null && state.repeat !== 0);
    setIcon(repeat, state.repeat === 2 ? 'repeatOne' : 'repeat');
    repeat.title =
      state.repeat === 2
        ? 'Repeat one'
        : state.repeat === 1
          ? 'Repeat all'
          : 'Repeat off';
    repeat.setAttribute('aria-label', repeat.title);
    setActive(like, state.liked === true);
    setIcon(like, state.liked ? 'heartFilled' : 'heart');
    like.title = state.liked ? 'Remove from liked songs' : 'Add to liked songs';
    like.setAttribute('aria-label', like.title);
    karaoke.disabled = !state.lyricsAvailable;
    karaoke.classList.toggle('is-disabled', !state.lyricsAvailable);
    setActive(karaoke, state.lyricsActive);
    setActive(queue, state.queueActive);
    setText(duration, formatTime(state.duration));
    renderPlayState(state.playing);
    progressWrap.classList.toggle('is-playing', state.playing);
    if (!volumeDragging) {
      const shownVolume = state.muted ? 0 : state.volume;
      renderVolume(shownVolume);
    }
  });

  return () => {
    unsubscribe();
    picker.dispose();
    window.removeEventListener('pointerup', finishScrub);
    window.removeEventListener('pointercancel', cancelScrub);
    window.removeEventListener('pointerup', finishVolume);
    root.remove();
  };
};
