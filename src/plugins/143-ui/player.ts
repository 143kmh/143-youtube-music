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
  shuffle: 'M16.7 3.3 20.4 7l-3.7 3.7-1.4-1.4L16.6 8H15c-2.1 0-3.5.9-4.8 2.7l-1.1 1.6C7.5 14.8 5.4 16 2.5 16H2v-2h.5c2.1 0 3.5-.9 4.8-2.7l1.1-1.6C10 7.2 12.1 6 15 6h1.6l-1.3-1.3 1.4-1.4ZM2 7h.5c2.7 0 4.7 1.1 6.3 3.2l-1.2 1.7C6.3 10 4.8 9 2.5 9H2V7Zm13.3 6.3 1.4-1.4 3.7 3.7-3.7 3.7-1.4-1.4 1.3-1.3H15c-1.7 0-3-.4-4.1-1.1l1.2-1.7c.8.5 1.7.8 2.9.8h1.6l-1.3-1.3Z',
  repeat: 'M17 3.6 20.4 7 17 10.4 15.6 9l1-1H8a4 4 0 0 0-4 4v1H2v-1a6 6 0 0 1 6-6h8.6l-1-1L17 3.6ZM7 20.4 3.6 17 7 13.6 8.4 15l-1 1H16a4 4 0 0 0 4-4v-1h2v1a6 6 0 0 1-6 6H7.4l1 1L7 20.4Z',
  volume: 'M4 9v6h4l5 4V5L8 9H4Zm11.5-.7a5 5 0 0 1 0 7.4l1.4 1.4a7 7 0 0 0 0-10.2l-1.4 1.4Z',
  mute: 'M4 9v6h4l5 4V5L8 9H4Zm12.3.3-1.4 1.4 1.3 1.3-1.3 1.3 1.4 1.4 1.3-1.3 1.3 1.3 1.4-1.4-1.3-1.3 1.3-1.3-1.4-1.4-1.3 1.3-1.3-1.3Z',
};

const nativeBar = () => document.querySelector<HTMLElement>('ytmusic-player-bar');
const media = () => document.querySelector<HTMLVideoElement>('video');

const nativeClick = (...selectors: string[]) => {
  const bar = nativeBar();
  for (const selector of selectors) {
    const target = bar?.querySelector<HTMLElement>(selector);
    if (target) {
      target.click();
      return true;
    }
  }
  return false;
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
  el.replaceChildren(svg(icons[icon]));
};

export const mountPlayer = () => {
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
  meta.append(art, copy);

  const center = document.createElement('div');
  center.className = 'ui143-player-center';
  const transport = document.createElement('div');
  transport.className = 'ui143-player-transport';

  const shuffle = button('Shuffle', 'shuffle');
  const previous = button('Previous', 'previous');
  const play = button('Play', 'play', 'ui143-player-play');
  const next = button('Next', 'next');
  const repeat = button('Repeat', 'repeat');

  shuffle.addEventListener('click', () => nativeClick('.shuffle', '#shuffle-button'));
  previous.addEventListener('click', () => nativeClick('.previous-button', '#previous-button'));
  next.addEventListener('click', () => nativeClick('.next-button', '#next-button'));
  repeat.addEventListener('click', () => nativeClick('.repeat', '#repeat-button'));
  play.addEventListener('click', async () => {
    if (nativeClick('#play-pause-button', '.play-pause-button')) return;
    const current = media();
    if (!current) return;
    if (current.paused) await current.play();
    else current.pause();
  });

  transport.append(shuffle, previous, play, next, repeat);

  const timeline = document.createElement('div');
  timeline.className = 'ui143-player-timeline';
  const elapsed = document.createElement('span');
  elapsed.className = 'ui143-player-time';
  elapsed.textContent = '0:00';
  const progress = document.createElement('input');
  progress.className = 'ui143-player-range ui143-player-progress';
  progress.type = 'range';
  progress.min = '0';
  progress.max = '1000';
  progress.step = '1';
  progress.value = '0';
  const duration = document.createElement('span');
  duration.className = 'ui143-player-time';
  duration.textContent = '0:00';
  timeline.append(elapsed, progress, duration);
  center.append(transport, timeline);

  const utilities = document.createElement('div');
  utilities.className = 'ui143-player-utils';
  const volumeButton = button('Mute', 'volume');
  const volume = document.createElement('input');
  volume.className = 'ui143-player-range ui143-player-volume';
  volume.type = 'range';
  volume.min = '0';
  volume.max = '100';
  volume.step = '1';
  volume.value = '100';
  utilities.append(volumeButton, volume);

  progress.addEventListener('input', () => {
    const current = media();
    if (!current || !Number.isFinite(current.duration) || current.duration <= 0) return;
    current.currentTime = (Number(progress.value) / 1000) * current.duration;
  });

  volume.addEventListener('input', () => {
    const current = media();
    if (!current) return;
    const value = Number(volume.value) / 100;
    current.volume = value;
    current.muted = value === 0;
  });

  volumeButton.addEventListener('click', () => {
    const current = media();
    if (!current) return;
    current.muted = !current.muted;
  });

  root.append(meta, center, utilities);
  document.body.append(root);

  const sync = () => {
    const bar = nativeBar();
    if (bar) {
      const titleText =
        bar.querySelector<HTMLElement>('.title.ytmusic-player-bar')?.textContent?.trim() ??
        bar.querySelector<HTMLElement>('.title')?.textContent?.trim() ??
        '';
      const artistText =
        bar.querySelector<HTMLElement>('.byline.ytmusic-player-bar')?.textContent?.trim() ??
        bar.querySelector<HTMLElement>('.byline')?.textContent?.trim() ??
        '';
      const image =
        bar.querySelector<HTMLImageElement>('.thumbnail-image-wrapper img') ??
        bar.querySelector<HTMLImageElement>('yt-img-shadow img') ??
        bar.querySelector<HTMLImageElement>('img');

      title.textContent = titleText || 'Nothing playing';
      artist.textContent = artistText;
      if (image?.src && art.src !== image.src) art.src = image.src;
    }

    const current = media();
    if (!current) return;

    const currentDuration = Number.isFinite(current.duration) ? current.duration : 0;
    const currentTime = Number.isFinite(current.currentTime) ? current.currentTime : 0;
    const progressValue = currentDuration > 0 ? (currentTime / currentDuration) * 1000 : 0;
    progress.value = String(progressValue);
    progress.style.setProperty('--ui143-range-progress', `${currentDuration > 0 ? (currentTime / currentDuration) * 100 : 0}%`);
    elapsed.textContent = formatTime(currentTime);
    duration.textContent = formatTime(currentDuration);

    setIcon(play, current.paused ? 'play' : 'pause');
    play.setAttribute('aria-label', current.paused ? 'Play' : 'Pause');
    play.title = current.paused ? 'Play' : 'Pause';

    const volumeValue = current.muted ? 0 : Math.round(current.volume * 100);
    volume.value = String(volumeValue);
    volume.style.setProperty('--ui143-range-progress', `${volumeValue}%`);
    setIcon(volumeButton, volumeValue === 0 ? 'mute' : 'volume');
  };

  const interval = window.setInterval(sync, 250);
  sync();

  return () => {
    window.clearInterval(interval);
    root.remove();
  };
};
