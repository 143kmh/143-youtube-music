const CUSTOM_ARTIST_SELECTOR = '.ui143-player-artist-link';
const CUSTOM_ART_SELECTOR = '.ui143-player-art';
const CUSTOM_META_SELECTOR = '.ui143-player-meta';
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

const currentTitle = () =>
  nativeBar()?.querySelector<HTMLElement>('.title.ytmusic-player-bar')?.textContent?.trim() ??
  nativeBar()?.querySelector<HTMLElement>('.title')?.textContent?.trim() ??
  '';

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

  document.addEventListener('click', onClick, true);
  return () => document.removeEventListener('click', onClick, true);
};
