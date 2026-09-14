import type { MusicPlayer } from '@/types/music-player';

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
  queue:
    'M4 5h12v2H4V5Zm0 6h12v2H4v-2Zm0 6h8v2H4v-2Zm14-4.2V17a2.5 2.5 0 1 1-1.6-2.33V12l4.6-1.15v1.9l-3 .75v-.7Z',
};

type StatefulElement = HTMLElement & {
  likeStatus?: string;
  repeatMode?: number | string;
};

const nativeBar = () => document.querySelector<HTMLElement>('ytmusic-player-bar');
const media = () => document.querySelector<HTMLVideoElement>('video');
const playerApi = () =>
  document.querySelector<HTMLElement & MusicPlayer>('#movie_player');

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
  for (const element of [
    target,
    target.closest<HTMLElement>('[aria-pressed], [aria-checked]'),
  ]) {
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
  const renderer = nativeBar()?.querySelector<HTMLElement>(
    'ytmusic-like-button-renderer',
  );
  return (
    renderer?.querySelector<HTMLElement>('#button-shape-like button') ??
    renderer?.querySelector<HTMLElement>('#like-button button') ??
    renderer?.querySelector<HTMLElement>('button') ??
    renderer?.querySelector<HTMLElement>('tp-yt-paper-icon-button') ??
    null
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

const currentTitleText = () =>
  nativeBar()?.querySelector<HTMLElement>('.title.ytmusic-player-bar')?.textContent?.trim() ??
  nativeBar()?.querySelector<HTMLElement>('.title')?.textContent?.trim() ??
  '';

const currentTrackRoots = () => {
  const title = currentTitleText().toLocaleLowerCase();
  const preferredSelectors = [
    'ytmusic-player-queue-item[selected]',
    'ytmusic-player-queue-item[play-button-state="playing"]',
    'ytmusic-responsive-list-item-renderer[play-button-state="playing"]',
  ];
  const roots = preferredSelectors
    .flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector)));

  if (title) {
    const queueItems = Array.from(
      document.querySelectorAll<HTMLElement>(
        'ytmusic-player-queue-item, ytmusic-responsive-list-item-renderer',
      ),
    );
    const matching = queueItems.find((item) =>
      (item.textContent ?? '').toLocaleLowerCase().includes(title),
    );
    if (matching) roots.unshift(matching);
  }

  const bar = nativeBar();
  if (bar) roots.push(bar);
  return Array.from(new Set(roots));
};

const isArtistHref = (href: string) =>
  href.includes('/channel/') || /\/browse\/UC[\w-]+/.test(href);

const getArtistLinks = () => {
  const result: HTMLAnchorElement[] = [];
  const seen = new Set<string>();

  for (const root of currentTrackRoots()) {
    for (const link of Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
      const href = link.getAttribute('href') ?? '';
      const text = link.textContent?.replaceAll(/\s+/g, ' ').trim() ?? '';
      if (!text || !isArtistHref(href)) continue;
      const key = `${new URL(link.href, location.origin).pathname}|${text.toLocaleLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(link);
    }
  }

  return result;
};

const SAVE_TO_PLAYLIST_RE =
  /save to playlist|add to playlist|сохранить в плейлист|добавить в плейлист|зберегти (до|в|у) плейлист|додати (до|в|у) плейлист/i;

const findSaveToPlaylistItem = () => {
  const items = Array.from(
    document.querySelectorAll<HTMLElement>(
      'ytmusic-menu-service-item-renderer, ytmusic-menu-navigation-item-renderer, tp-yt-paper-item, ytd-menu-service-item-renderer',
    ),
  );
  return (
    items.find((item) =>
      SAVE_TO_PLAYLIST_RE.test(
        item.textContent?.replaceAll(/\s+/g, ' ').trim() ?? '',
      ),
    ) ?? null
  );
};

const findCurrentTrackMenuButton = () => {
  const selectors = [
    'ytmusic-menu-renderer #button-shape button',
    'ytmusic-menu-renderer #button',
    'ytmusic-menu-renderer button',
    '[aria-label*="More actions" i]',
    '[aria-label*="More" i]',
    '[aria-label*="Ещё" i]',
    '[aria-label*="Додатков" i]',
  ];

  for (const root of currentTrackRoots()) {
    for (const selector of selectors) {
      const button = root.querySelector<HTMLElement>(selector);
      if (button) return button;
    }
  }
  return null;
};

const openPlaylistPicker = () => {
  const alreadyOpen = findSaveToPlaylistItem();
  if (alreadyOpen) {
    alreadyOpen.click();
    return;
  }

  const menuButton = findCurrentTrackMenuButton();
  if (!menuButton) return;
  menuButton.click();

  let attempts = 0;
  const retry = () => {
    const target = findSaveToPlaylistItem();
    if (target) {
      target.click();
      return;
    }
    attempts += 1;
    if (attempts < 40) window.setTimeout(retry, 50);
  };
  window.setTimeout(retry, 30);
};

const tabHeader = (index: number) =>
  document.querySelector<HTMLElement>(
    `#tabsContent > .tab-header:nth-of-type(${index})`,
  );
const queueTab = () => tabHeader(1);
const lyricsTab = () => tabHeader(2);
const defaultPlayerTab = () => tabHeader(1);

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
  previous.addEventListener('click', () => {
    const api = playerApi();
    if (api) api.previousVideo();
    else nativeClick('#previous-button', '.previous-button');
  });
  next.addEventListener('click', () => {
    const api = playerApi();
    if (api) api.nextVideo();
    else nativeClick('#next-button', '.next-button');
  });
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
    const api = playerApi();
    const current = media();
    const actualPlaying = api ? api.getPlayerState() === 1 : Boolean(current && !current.paused);
    const currentlyPlaying = desiredPlaying ?? actualPlaying;
    desiredPlaying = !currentlyPlaying;
    renderPlayState(desiredPlaying);

    if (api) {
      if (desiredPlaying) api.playVideo();
      else api.pauseVideo();
      return;
    }
    if (!current) return;
    if (desiredPlaying) void current.play();
    else current.pause();
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
  queue.addEventListener('click', () => {
    const target = queueTab();
    if (!target) return;
    target.click();
  });

  let scrubbing = false;
  let previewTime = 0;

  const setProgressVisual = (ratio: number) => {
    const clamped = Math.max(0, Math.min(1, ratio));
    progress.value = String(Math.round(clamped * 1000));
    progressFill.style.width = `${clamped * 100}%`;
  };

  const durationSeconds = () => {
    const api = playerApi();
    const value = api?.getDuration() ?? media()?.duration ?? 0;
    return Number.isFinite(value) ? value : 0;
  };

  const updateSeekPreview = () => {
    const total = durationSeconds();
    if (total <= 0) return;
    const ratio = Number(progress.value) / 1000;
    previewTime = ratio * total;
    setProgressVisual(ratio);
    elapsed.textContent = formatTime(previewTime);
  };

  const commitSeek = () => {
    updateSeekPreview();
    const api = playerApi();
    if (api) api.seekTo(previewTime);
    else {
      const current = media();
      if (current) current.currentTime = previewTime;
    }
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
  window.addEventListener('pointercancel', finishScrub);

  let volumeDragging = false;
  let lastNonZeroVolume = 100;

  const applyVolume = (value: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(value)));
    const api = playerApi();
    if (api) {
      if (clamped === 0) {
        api.mute();
      } else {
        api.setVolume(clamped);
        api.unMute();
        lastNonZeroVolume = clamped;
      }
    } else {
      const current = media();
      if (current) {
        current.volume = clamped / 100;
        current.muted = clamped === 0;
      }
    }
    volume.value = String(clamped);
    volume.style.setProperty('--ui143-range-progress', `${clamped}%`);
    setIcon(volumeButton, clamped === 0 ? 'mute' : 'volume');
  };

  volume.addEventListener('pointerdown', () => {
    volumeDragging = true;
  });
  volume.addEventListener('input', () => applyVolume(Number(volume.value)));
  const finishVolume = () => {
    volumeDragging = false;
  };
  volume.addEventListener('change', finishVolume);
  window.addEventListener('pointerup', finishVolume);

  volumeButton.addEventListener('click', () => {
    const api = playerApi();
    if (api) {
      if (api.isMuted() || api.getVolume() === 0) {
        api.setVolume(lastNonZeroVolume || 100);
        api.unMute();
      } else {
        lastNonZeroVolume = api.getVolume();
        api.mute();
      }
      return;
    }
    const current = media();
    if (current) current.muted = !current.muted;
  });

  root.append(meta, center, utilities);
  document.body.append(root);

  let lastArtistKey = '';

  const syncMetadata = () => {
    const bar = nativeBar();
    let titleText = '';
    if (bar) {
      titleText = currentTitleText();
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
      if (artistKey !== lastArtistKey || artist.childElementCount === 0) {
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
            artist.append(anchor);
          });
        } else {
          artist.textContent = artistText;
        }
      }
    }

    if (!shuffleTouched) {
      const detected = readPressed(nativeElement('#shuffle-button', '.shuffle'));
      if (detected !== null) shuffleState = detected;
    }
    setActive(shuffle, shuffleState);

    if (!repeatTouched) {
      const nativeRepeat = nativeElement('#repeat-button', '.repeat') as StatefulElement | null;
      const rawMode = nativeRepeat?.repeatMode;
      if (rawMode !== undefined && rawMode !== null) {
        const raw = String(rawMode).toLowerCase();
        if (raw === '2' || raw.includes('one')) repeatState = 2;
        else if (raw === '1' || raw.includes('all')) repeatState = 1;
        else repeatState = 0;
      } else {
        const detected = readPressed(nativeRepeat);
        if (detected !== null) repeatState = detected ? 1 : 0;
      }
    }
    setActive(repeat, repeatState !== 0);
    setIcon(repeat, repeatState === 2 ? 'repeatOne' : 'repeat');

    const songKey = `${location.pathname}|${new URLSearchParams(location.search).get('v') ?? ''}|${titleText}`;
    if (songKey !== activeSongKey) {
      activeSongKey = songKey;
      likeTouched = false;
    }
    if (!likeTouched) {
      const detectedLike = readLikeState();
      if (detectedLike !== null) likedState = detectedLike;
    }
    setActive(like, likedState);
    setIcon(like, likedState ? 'heartFilled' : 'heart');

    const lyrics = lyricsTab();
    karaoke.disabled = !lyrics;
    karaoke.classList.toggle('is-disabled', !lyrics);
    setActive(karaoke, lyrics?.getAttribute('aria-selected') === 'true');
    setActive(queue, queueTab()?.getAttribute('aria-selected') === 'true');
  };

  let animationFrame = 0;
  const syncFrame = () => {
    const api = playerApi();
    const current = media();
    const totalRaw = api?.getDuration() ?? current?.duration ?? 0;
    const timeRaw = api?.getCurrentTime() ?? current?.currentTime ?? 0;
    const total = Number.isFinite(totalRaw) ? totalRaw : 0;
    const now = Number.isFinite(timeRaw) ? timeRaw : 0;

    if (!scrubbing) {
      setProgressVisual(total > 0 ? now / total : 0);
      elapsed.textContent = formatTime(now);
    }
    duration.textContent = formatTime(total);

    const actualPlaying = api ? api.getPlayerState() === 1 : Boolean(current && !current.paused);
    if (desiredPlaying !== null && actualPlaying === desiredPlaying) desiredPlaying = null;
    const shownPlaying = desiredPlaying ?? actualPlaying;
    renderPlayState(shownPlaying);
    progressWrap.classList.toggle('is-playing', shownPlaying);

    if (!volumeDragging) {
      let shownVolume = 100;
      if (api) {
        const logicalVolume = api.getVolume();
        if (logicalVolume > 0) lastNonZeroVolume = logicalVolume;
        shownVolume = api.isMuted() ? 0 : logicalVolume;
      } else if (current) {
        shownVolume = current.muted ? 0 : Math.round(current.volume * 100);
      }
      volume.value = String(shownVolume);
      volume.style.setProperty('--ui143-range-progress', `${shownVolume}%`);
      setIcon(volumeButton, shownVolume === 0 ? 'mute' : 'volume');
    }

    animationFrame = window.requestAnimationFrame(syncFrame);
  };

  const metadataInterval = window.setInterval(syncMetadata, 250);
  syncMetadata();
  syncFrame();

  return () => {
    window.clearInterval(metadataInterval);
    window.cancelAnimationFrame(animationFrame);
    window.removeEventListener('pointerup', finishScrub);
    window.removeEventListener('pointercancel', finishScrub);
    window.removeEventListener('pointerup', finishVolume);
    root.remove();
  };
};
