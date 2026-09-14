const CUSTOM_ARTIST_SELECTOR = '.ui143-player-artist-link';
const CUSTOM_ART_SELECTOR = '.ui143-player-art';
const TRACK_ROW_SELECTOR = [
  'ytmusic-responsive-list-item-renderer',
  'ytmusic-player-queue-item',
].join(',');

const nativeBar = () => document.querySelector<HTMLElement>('ytmusic-player-bar');

const normalizedHref = (href: string) => {
  try {
    const url = new URL(href, window.location.origin);
    return `${url.pathname}${url.search}`;
  } catch {
    return href;
  }
};

const getNativeArtistLinks = () => {
  const byline =
    nativeBar()?.querySelector<HTMLElement>('.byline.ytmusic-player-bar') ??
    nativeBar()?.querySelector<HTMLElement>('.byline');
  if (!byline) return [];

  const links = Array.from(byline.querySelectorAll<HTMLAnchorElement>('a[href]'));
  const artists = links.filter((link) => {
    const href = link.getAttribute('href') ?? '';
    return href.includes('/channel/') || /\/browse\/UC[\w-]+/.test(href);
  });
  return artists.length > 0 ? artists : links;
};

const openArtistWithoutReload = (customLink: HTMLAnchorElement) => {
  const wantedHref = normalizedHref(customLink.href);
  const wantedText = customLink.textContent?.trim() ?? '';
  const candidates = getNativeArtistLinks();
  const target =
    candidates.find(
      (link) => normalizedHref(link.href) === wantedHref,
    ) ??
    candidates.find(
      (link) => (link.textContent?.trim() ?? '') === wantedText,
    );

  // Important: click the original Polymer/YouTube Music endpoint instead of
  // navigating the copied href. That keeps the current playback session alive.
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

export const mountInteractions = () => {
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

    if (target.closest(CUSTOM_ART_SELECTOR)) {
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

  // Capture first so copied artist links never fall through to a hard page load.
  document.addEventListener('click', onClick, true);

  return () => {
    document.removeEventListener('click', onClick, true);
  };
};
