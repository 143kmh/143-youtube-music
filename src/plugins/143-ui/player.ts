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
  mute:
    'M4 9v6h4l5 4V5L8 9H4Zm12.3.3-1.4 1.4 1.3 1.3-1.3 1.3 1.4 1.4 1.3-1.3 1.3 1.3 1.4-1.4-1.3-1.3 1.3-1.3-1.4-1.4-1.3 1.3-1.3-1.3Z',
  heart:
    'M12 20.6 4.1 13A5.1 5.1 0 0 1 11.3 5.8l.7.72.7-.72A5.1 5.1 0 1 1 19.9 13L12 20.6Zm0-2.7 6.5-6.25A3.2 3.2 0 0 0 14 7.1l-2 2.05-2-2.05a3.2 3.2 0 0 0-4.5 4.55L12 17.9Z',
  heartFilled:
    'M12 20.6 4.1 13A5.1 5.1 0 0 1 11.3 5.8l.7.72.7-.72A5.1 5.1 0 1 1 19.9 13L12 20.6Z',
  playlist:
    'M4 5h10v1.8H4V5Zm0 5h10v1.8H4V10Zm0 5h7v1.8H4V15Zm13-2v-3h2v3h3v2h-3v3h-2v-3h-3v-2h3Z',
  mic: 'M12 14a3.5 3.5 0 0 0 3.5-3.5v-4a3.5 3.5 0 1 0-7 0v4A3.5 3.5 0 0 0 12 14Zm-6-3.5h2A4 4 0 0 0 12 14.5a4 4 0 0 0 4-4h2a6 6 0 0 1-5 5.92V20h3v2H8v-2h3v-3.58A6 6 0 0 1 6 10.5Z',
};

type StatefulElement = HTMLElement & {
  likeStatus?: string;
  repeatMode?: number | string;
};

const nativeBar = () => document.querySelector<HTMLElement>('ytmusic-player-bar');
const media = () => document.querySelector<HTMLVideoElement>('video');

const nativeElement = (...selectors: string[]) => {
  const bar = nativeBar();
  for (const selector of selectors) {
    const target = bar?.querySelector<HTMLElement>(selector);
    if (target) return target;
  }
  return null;
};

const nativeClick = (...selectors: string[]) => {
  const target = nativeElement(...selectors);
  if (!target) return false;
  target.click();
  return true;
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

const setActive = (el: HTMLButtonElement, active: boolean) => {
  el.classList.toggle('is-active', active);
  el.setAttribute('aria-pressed', String(active));
};

const readPressed = (target: HTMLElement | null): boolean | null => {
  if (!target) return null;
  const candidates = [
    target,
    target.closest<HTMLElement>('[aria-pressed], [aria-checked]'),
  ];
  for (const element of candidates) {
    if (!element) continue;
    const pressed = element.getAttribute('aria-pressed');
    if (pressed === 'true') return true;
    if (pressed === 'false') return false;
    const checked = element.getAttribute('aria-checked');
    if (checked === 'true') return true;
    if (checked === 'false') return false;
  }
  return null;
};

const getLikeButton = () => {
  const bar = nativeBar();
  const renderer = bar?.querySelector<HTMLElement>('ytmusic-like-button-renderer');
  if (!renderer) return null;
  return (
    renderer.querySelector<HTMLElement>('#button-shape-like button') ??
    renderer.querySelector<HTMLElement>('#like-button button') ??
    renderer.querySelector<HTMLElement>('button') ??
    renderer.querySelector<HTMLElement>('tp-yt-paper-icon-button')
  );
};

const readLikeState = (): boolean | null => {
  const renderer = nativeBar()?.querySelector<StatefulElement>(
    'ytmusic-like-button-renderer',
  );
  const raw = String(
    renderer?.likeStatus ??
      renderer?.getAttribute('like-status') ??
      renderer?.getAttribute('likestatus') ??
      '',
  ).toUpperCase();

  if (raw.includes('LIKE') && !raw.includes('INDIFFERENT')) return true;
  if (raw.includes('INDIFFERENT') || raw.includes('DISLIKE')) return false;
  return readPressed(getLikeButton());
};

const openPlaylistPicker = () => {
  const bar = nativeBar();
  const menuButton =
    bar?.querySelector<HTMLElement>('ytmusic-menu-renderer #button-shape button') ??
    bar?.querySelector<HTMLElement>('ytmusic-menu-renderer #button') ??
    bar?.querySelector<HTMLElement>('ytmusic-menu-renderer button') ??
    bar?.querySelector<HTMLElement>('[aria-label*="More" i]');
  if (!menuButton) return;

  menuButton.click();

  const clickSaveItem = () => {
    const items = Array.from(
      document.querySelectorAll<HTMLElement>(
        'ytmusic-menu-service-item-renderer, ytmusic-menu-navigation-item-renderer, tp-yt-paper-item, ytd-menu-service-item-renderer',
      ),
    );
    const target = items.find((item) => {
      const text = item.textContent?.replaceAll(/\s+/g, ' ').trim() ?? '';
      return /save to playlist|add to playlist|сохранить в плейлист|добавить в плейлист|зберегти в плейлист|додати (до|в) плейлист/i.test(
        text,
      );
    });
    if (!target) return false;
    target.click();
    return true;
  };

  let attempts = 0;
  const retry = () => {
    attempts += 1;
    if (clickSaveItem() || attempts >= 8) return;
    window.setTimeout(retry, 50);
  };
  window.setTimeout(retry, 20);
};

const lyricsTab = () =>
  document.querySelector<HTMLElement>(
    '#tabsContent > .tab-header:nth-of-type(2)',
  );

const defaultPlayerTab = () =>
  document.querySelector<HTMLElement>(
    '#tabsContent > .tab-header:nth-of-type(1)',
  );

const getArtistLinks = () => {
  const byline =
    nativeBar()?.querySelector<HTMLElement>('.byline.ytmusic-player-bar') ??
    nativeBar()?.querySelector<HTMLElement>('.byline');
  if (!byline) return [];

  const links = Array.from(byline.querySelectorAll<HTMLAnchorElement>('a[href]'));
  const artistLinks = links.filter((link) => {
    const href = link.getAttribute('href') ?? '';
    return href.includes('/channel/') || /\/browse\/UC[\w-]+/.test(href);
  });

  return artistLinks.length > 0 ? artistLinks : links.slice(0, 1);
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

  let shuffleState = false;
  let shuffleTouched = false;
  let repeatState: 0 | 1 | 2 = 0;
  let repeatTouched = false;
  let desiredPlaying: boolean | null = null;

  shuffle.addEventListener('click', () => {
    shuffleTouched = true;
    shuffleState = !shuffleState;
    setActive(shuffle, shuffleState);
    nativeClick('#shuffle-button', '.shuffle');
  });
  previous.addEventListener('click', () =>
    nativeClick('#previous-button', '.previous-button'),
  );
  next.addEventListener('click', () => nativeClick('#next-button', '.next-button'));
  repeat.addEventListener('click', () => {
    repeatTouched = true;
    repeatState = (((repeatState + 1) % 3) as 0 | 1 | 2);
    setActive(repeat, repeatState !== 0);
    setIcon(repeat, repeatState === 2 ? 'repeatOne' : 'repeat');
    repeat.title =
      repeatState === 0
        ? 'Repeat off'
        : repeatState === 1
          ? 'Repeat all'
          : 'Repeat one';
    nativeClick('#repeat-button', '.repeat');
  });

  const renderPlayState = (playing: boolean) => {
    setIcon(play, playing ? 'pause' : 'play');
    play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    play.title = playing ? 'Pause' : 'Play';
  };

  play.addEventListener('click', () => {
    const current = media();
    if (!current) return;

    const currentlyPlaying = desiredPlaying ?? !current.paused;
    desiredPlaying = !currentlyPlaying;
    renderPlayState(desiredPlaying);

    if (desiredPlaying) {
      void current.play().catch(() => {
        if (desiredPlaying === true) {
          desiredPlaying = null;
          renderPlayState(!current.paused);
        }
      });
    } else {
      current.pause();
    }
  });

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
  const like = button('Add to liked songs', 'heart');
  const playlist = button('Add to playlist', 'playlist');
  const karaoke = button('Karaoke', 'mic');
  const utilityDivider = document.createElement('span');
  utilityDivider.className = 'ui143-player-utils-divider';
  const volumeButton = button('Mute', 'volume');
  const volume = document.createElement('input');
  volume.className = 'ui143-player-range ui143-player-volume';
  volume.type = 'range';
  volume.min = '0';
  volume.max = '100';
  volume.step = '1';
  volume.value = '100';
  utilities.append(like, playlist, karaoke, utilityDivider, volumeButton, volume);

  let likedState = false;
  let likeTouched = false;
  let activeSongKey = '';

  like.addEventListener('click', () => {
    const nativeLike = getLikeButton();
    if (!nativeLike) return;
    likeTouched = true;
    likedState = !likedState;
    setActive(like, likedState);
    setIcon(like, likedState ? 'heartFilled' : 'heart');
    like.title = likedState ? 'Remove from liked songs' : 'Add to liked songs';
    nativeLike.click();
  });

  playlist.addEventListener('click', openPlaylistPicker);

  karaoke.addEventListener('click', () => {
    const lyrics = lyricsTab();
    if (!lyrics) return;
    const isActive = lyrics.getAttribute('aria-selected') === 'true';
    if (isActive) defaultPlayerTab()?.click();
    else lyrics.click();
    setActive(karaoke, !isActive);
  });

  let scrubbing = false;
  let previewTime = 0;
  let seekFrame = 0;

  const setProgressVisual = (ratio: number) => {
    const clamped = Math.max(0, Math.min(1, ratio));
    progress.value = String(Math.round(clamped * 1000));
    progressFill.style.width = `${clamped * 100}%`;
  };

  const previewSeek = () => {
    const current = media();
    if (!current || !Number.isFinite(current.duration) || current.duration <= 0) return;
    const ratio = Number(progress.value) / 1000;
    previewTime = ratio * current.duration;
    setProgressVisual(ratio);
    elapsed.textContent = formatTime(previewTime);

    window.cancelAnimationFrame(seekFrame);
    seekFrame = window.requestAnimationFrame(() => {
      const activeMedia = media();
      if (activeMedia && Number.isFinite(activeMedia.duration)) {
        activeMedia.currentTime = previewTime;
      }
    });
  };

  progress.addEventListener('pointerdown', () => {
    scrubbing = true;
    progressWrap.classList.add('is-scrubbing');
  });
  progress.addEventListener('input', previewSeek);
  progress.addEventListener('change', () => {
    previewSeek();
    scrubbing = false;
    progressWrap.classList.remove('is-scrubbing');
  });

  const finishScrub = () => {
    if (!scrubbing) return;
    scrubbing = false;
    progressWrap.classList.remove('is-scrubbing');
  };
  window.addEventListener('pointerup', finishScrub);
  window.addEventListener('pointercancel', finishScrub);

  volume.addEventListener('input', () => {
    const current = media();
    if (!current) return;
    const value = Number(volume.value) / 100;
    current.volume = value;
    current.muted = value === 0;
    volume.style.setProperty('--ui143-range-progress', `${value * 100}%`);
  });

  volumeButton.addEventListener('click', () => {
    const current = media();
    if (!current) return;
    current.muted = !current.muted;
  });

  root.append(meta, center, utilities);
  document.body.append(root);

  let lastArtistKey = '';

  const syncMetadata = () => {
    const bar = nativeBar();
    let titleText = '';
    if (bar) {
      titleText =
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
      if (image?.src && art.src !== image.src) art.src = image.src;

      const artistLinks = getArtistLinks();
      const artistKey = artistLinks
        .map((link) => `${link.textContent?.trim() ?? ''}|${link.href}`)
        .join('::');
      if (artistKey !== lastArtistKey) {
        lastArtistKey = artistKey;
        artist.replaceChildren();

        if (artistLinks.length > 0) {
          artistLinks.forEach((link, index) => {
            if (index > 0) {
              const separator = document.createElement('span');
              separator.className = 'ui143-player-artist-separator';
              separator.textContent = ', ';
              artist.append(separator);
            }
            const anchor = document.createElement('a');
            anchor.href = link.href;
            anchor.textContent = link.textContent?.trim() ?? '';
            anchor.className = 'ui143-player-artist-link';
            anchor.addEventListener('click', (event) => event.stopPropagation());
            artist.append(anchor);
          });
        } else {
          artist.textContent = artistText;
        }
      }
    }

    if (!shuffleTouched) {
      const detectedShuffle = readPressed(
        nativeElement('#shuffle-button', '.shuffle'),
      );
      if (detectedShuffle !== null) shuffleState = detectedShuffle;
    }
    setActive(shuffle, shuffleState);

    if (!repeatTouched) {
      const nativeRepeat = nativeElement(
        '#repeat-button',
        '.repeat',
      ) as StatefulElement | null;
      const repeatMode = nativeRepeat?.repeatMode;
      if (repeatMode !== undefined && repeatMode !== null) {
        const raw = String(repeatMode).toLowerCase();
        if (raw === '2' || raw.includes('one')) repeatState = 2;
        else if (raw === '1' || raw.includes('all')) repeatState = 1;
        else repeatState = 0;
      } else {
        const detectedRepeat = readPressed(nativeRepeat);
        if (detectedRepeat !== null) repeatState = detectedRepeat ? 1 : 0;
      }
    }
    setActive(repeat, repeatState !== 0);
    setIcon(repeat, repeatState === 2 ? 'repeatOne' : 'repeat');

    const songKey = `${location.pathname}|${new URLSearchParams(location.search).get('v') ?? ''}|${titleText}`;
    if (songKey !== activeSongKey) {
      activeSongKey = songKey;
      likeTouched = false;
      const detectedLike = readLikeState();
      if (detectedLike !== null) likedState = detectedLike;
    } else if (!likeTouched) {
      const detectedLike = readLikeState();
      if (detectedLike !== null) likedState = detectedLike;
    }
    setActive(like, likedState);
    setIcon(like, likedState ? 'heartFilled' : 'heart');

    const lyrics = lyricsTab();
    const karaokeAvailable = Boolean(lyrics);
    karaoke.disabled = !karaokeAvailable;
    karaoke.classList.toggle('is-disabled', !karaokeAvailable);
    setActive(karaoke, lyrics?.getAttribute('aria-selected') === 'true');
  };

  let animationFrame = 0;
  const syncFrame = () => {
    const current = media();
    if (current) {
      const currentDuration = Number.isFinite(current.duration) ? current.duration : 0;
      const currentTime = Number.isFinite(current.currentTime) ? current.currentTime : 0;

      if (!scrubbing) {
        setProgressVisual(currentDuration > 0 ? currentTime / currentDuration : 0);
        elapsed.textContent = formatTime(currentTime);
      }
      duration.textContent = formatTime(currentDuration);

      const actualPlaying = !current.paused;
      if (desiredPlaying !== null && actualPlaying === desiredPlaying) {
        desiredPlaying = null;
      }
      renderPlayState(desiredPlaying ?? actualPlaying);
      progressWrap.classList.toggle('is-playing', desiredPlaying ?? actualPlaying);

      const volumeValue = current.muted ? 0 : Math.round(current.volume * 100);
      volume.value = String(volumeValue);
      volume.style.setProperty('--ui143-range-progress', `${volumeValue}%`);
      setIcon(volumeButton, volumeValue === 0 ? 'mute' : 'volume');
    }

    animationFrame = window.requestAnimationFrame(syncFrame);
  };

  const metadataInterval = window.setInterval(syncMetadata, 200);
  syncMetadata();
  syncFrame();

  return () => {
    window.clearInterval(metadataInterval);
    window.cancelAnimationFrame(animationFrame);
    window.cancelAnimationFrame(seekFrame);
    window.removeEventListener('pointerup', finishScrub);
    window.removeEventListener('pointercancel', finishScrub);
    root.remove();
  };
};
