import type { MusicPlayerAppElement } from '@/types/music-player-app-element';

const CUSTOM_ARTIST_SELECTOR = 'a.ui143-player-artist-link';
const CUSTOM_ART_SELECTOR = '.ui143-player-art';
const CUSTOM_META_SELECTOR = '.ui143-player-meta';
const SEARCH_FORM_SELECTOR = '.ui143-search';
const TRACK_ROW_SELECTOR = [
  'ytmusic-responsive-list-item-renderer',
  'ytmusic-player-queue-item',
].join(',');

const nativeBar = () => document.querySelector<HTMLElement>('ytmusic-player-bar');
const musicApp = () =>
  document.querySelector<MusicPlayerAppElement>('ytmusic-app');

const normalizedHref = (href: string) => {
  try {
    const url = new URL(href, window.location.origin);
    return `${url.pathname}${url.search}`;
  } catch {
    return href;
  }
};

const currentTitle = () =>
  nativeBar()?.querySelector<HTMLElement>('.title.ytmusic-player-bar')?.textContent?.trim() ??
  nativeBar()?.querySelector<HTMLElement>('.title')?.textContent?.trim() ??
  '';

const currentVideoId = () => {
  const api = document.querySelector<
    HTMLElement & { getVideoData?: () => { video_id?: string } }
  >('#movie_player');
  try {
    return api?.getVideoData?.()?.video_id ?? '';
  } catch {
    return '';
  }
};

const currentTrackRoots = () => {
  const roots = [
    ...Array.from(
      document.querySelectorAll<HTMLElement>(
        'ytmusic-player-queue-item[selected], ytmusic-player-queue-item[play-button-state="playing"], ytmusic-responsive-list-item-renderer[play-button-state="playing"]',
      ),
    ),
  ];

  const title = currentTitle().toLocaleLowerCase();
  if (title) {
    const matching = Array.from(
      document.querySelectorAll<HTMLElement>(TRACK_ROW_SELECTOR),
    ).find((row) => (row.textContent ?? '').toLocaleLowerCase().includes(title));
    if (matching) roots.unshift(matching);
  }

  const bar = nativeBar();
  if (bar) roots.push(bar);
  return Array.from(new Set(roots));
};

const getNativeArtistLinks = () => {
  const links: HTMLAnchorElement[] = [];
  const seen = new Set<string>();

  for (const root of currentTrackRoots()) {
    for (const link of Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
      const href = link.getAttribute('href') ?? '';
      const text = link.textContent?.replaceAll(/\s+/g, ' ').trim() ?? '';
      if (!text || !(href.includes('/channel/') || /\/browse\/UC[\w-]+/.test(href))) {
        continue;
      }
      const key = `${normalizedHref(link.href)}|${text.toLocaleLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push(link);
    }
  }
  return links;
};

const openArtistWithoutReload = (customLink: HTMLAnchorElement) => {
  const wantedHref = normalizedHref(customLink.href);
  const wantedText = customLink.textContent?.trim() ?? '';
  const candidates = getNativeArtistLinks();
  const target =
    candidates.find((link) => normalizedHref(link.href) === wantedHref) ??
    candidates.find((link) => (link.textContent?.trim() ?? '') === wantedText);

  target?.click();
};

const openNowPlaying = () => {
  const bar = nativeBar();
  const target =
    bar?.querySelector<HTMLElement>('.thumbnail-image-wrapper') ??
    bar?.querySelector<HTMLElement>('#thumbnail') ??
    bar?.querySelector<HTMLElement>('.thumbnail');
  target?.click();
};

const isInteractiveTrackChild = (target: Element, row: Element) => {
  const interactive = target.closest(
    [
      'a',
      'button',
      'input',
      'textarea',
      'select',
      '[role="button"]',
      'tp-yt-paper-icon-button',
      'yt-icon-button',
      'ytmusic-menu-renderer',
      'ytmusic-like-button-renderer',
    ].join(','),
  );
  return Boolean(interactive && row.contains(interactive));
};

const isInteractivePlayerChild = (target: Element, meta: Element) => {
  const interactive = target.closest('a, button, input, [role="button"]');
  return Boolean(interactive && meta.contains(interactive));
};

const playTrackRow = (row: HTMLElement) => {
  const watchLink =
    row.querySelector<HTMLAnchorElement>('a[href*="/watch"]') ??
    row
      .querySelector<HTMLElement>('#video-title, .title, .title-column')
      ?.closest<HTMLAnchorElement>('a[href]');

  if (watchLink) {
    watchLink.click();
    return;
  }

  const playButton =
    row.querySelector<HTMLElement>('ytmusic-play-button-renderer button') ??
    row.querySelector<HTMLElement>('ytmusic-play-button-renderer') ??
    row.querySelector<HTMLElement>('[data-id="play-button"]');
  playButton?.click();
};

const navigateSearchWithoutReload = (query: string) => {
  const app = musicApp();
  if (!app) return;

  const route = new URL('/search', window.location.origin);
  route.searchParams.set('q', query);
  app.navigate(`${route.pathname}${route.search}`);
};

const syncIdlePlayerState = () => {
  const root = document.querySelector<HTMLElement>('#ui143-player');
  if (!root) return;

  const hasTrack = Boolean(currentVideoId() || currentTitle());
  root.classList.toggle('is-idle', !hasTrack);

  const meta = root.querySelector<HTMLElement>('.ui143-player-meta');
  const art = root.querySelector<HTMLImageElement>('.ui143-player-art');
  if (!meta || !art) return;

  let placeholder = meta.querySelector<HTMLElement>(
    '.ui143-player-art-placeholder',
  );
  if (!placeholder) {
    placeholder = document.createElement('div');
    placeholder.className = 'ui143-player-art-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.textContent = '♪';
    meta.insertBefore(placeholder, art);
  }
};

export const mountInteractions = () => {
  const onSubmit = (event: SubmitEvent) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches(SEARCH_FORM_SELECTOR)) {
      return;
    }

    const input = form.querySelector<HTMLInputElement>('input[type="search"]');
    const query = input?.value.trim() ?? '';
    if (!query) return;

    // The old 143 shell used location.assign(), which reloaded the entire
    // YouTube Music page and killed the current playback. Use the app's own SPA
    // navigation instead so searching behaves like native YouTube Music.
    event.preventDefault();
    event.stopImmediatePropagation();
    navigateSearchWithoutReload(query);
  };

  const onClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const artistLink = target.closest<HTMLAnchorElement>(CUSTOM_ARTIST_SELECTOR);
    if (artistLink) {
      event.preventDefault();
      event.stopPropagation();
      openArtistWithoutReload(artistLink);
      return;
    }

    // player-polish renders artist credits as buttons with their real browseId.
    // They already use ytmusic-app.navigate() directly. Do not hijack those
    // buttons in the document capture handler.
    if (target.closest('.ui143-player-artist-button')) return;

    if (target.closest(CUSTOM_ART_SELECTOR)) {
      event.preventDefault();
      event.stopPropagation();
      openNowPlaying();
      return;
    }

    const meta = target.closest<HTMLElement>(CUSTOM_META_SELECTOR);
    if (meta && !isInteractivePlayerChild(target, meta)) {
      event.preventDefault();
      event.stopPropagation();
      openNowPlaying();
      return;
    }

    const row = target.closest<HTMLElement>(TRACK_ROW_SELECTOR);
    if (!row || isInteractiveTrackChild(target, row)) return;

    event.preventDefault();
    playTrackRow(row);
  };

  document.addEventListener('submit', onSubmit, true);
  document.addEventListener('click', onClick, true);

  const idleInterval = window.setInterval(syncIdlePlayerState, 200);
  syncIdlePlayerState();

  return () => {
    document.removeEventListener('submit', onSubmit, true);
    document.removeEventListener('click', onClick, true);
    window.clearInterval(idleInterval);
  };
};
