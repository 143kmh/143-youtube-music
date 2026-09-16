const STYLE_ID = 'ui143-hover-stability';

const normalize = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const mountStyle = () => {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    :where(
      .ui143-artist-track,
      .ui143-artist-card,
      .ui143-search-featured-artist-card,
      .ui143-search-top-track,
      .ui143-search-song,
      .ui143-search-card,
      .ui143-search-focus-card,
      .ui143-library-song,
      .ui143-library-playlist,
      .ui143-library-collection-card,
      .ui143-library-detail-track,
      .ui143-playlist-track
    ) {
      transform: none !important;
      transition: none !important;
      isolation: isolate;
    }
    :where(
      .ui143-artist-track,
      .ui143-artist-card,
      .ui143-search-featured-artist-card,
      .ui143-search-top-track,
      .ui143-search-song,
      .ui143-search-card,
      .ui143-search-focus-card,
      .ui143-library-song,
      .ui143-library-playlist,
      .ui143-library-collection-card,
      .ui143-library-detail-track,
      .ui143-playlist-track
    ) img {
      pointer-events: none;
      user-select: none;
      -webkit-user-drag: none;
    }
    .ui143-search-featured-artist-card:hover .ui143-search-artist-avatar {
      border-color: #1a1a1a !important;
    }
    #ui143-library-collections .ui143-library-detail-track-art img {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: cover;
    }
  `;
  document.head.append(style);
  return () => style.remove();
};

const routeLikedSystemCard = (event: MouseEvent) => {
  if (!(event.target instanceof Element)) return;
  const card = event.target.closest<HTMLElement>('.ui143-library-playlist');
  if (!card) return;
  const title = normalize(card.querySelector<HTMLElement>('strong')?.textContent ?? '');
  const systemLiked =
    /^(liked songs|liked music|your likes)$/u.test(title) ||
    /(?:понравив|вподобан|улюблен|сподоб)/u.test(title);
  if (!systemLiked) return;

  const nav = document.querySelector<HTMLButtonElement>(
    '.ui143-nav-item[data-key="songs"]',
  );
  if (!nav) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  queueMicrotask(() => nav.click());
};

const labelArtistMetrics = () => {
  for (const metrics of document.querySelectorAll<HTMLElement>('.ui143-artist-metrics')) {
    const spans = [...metrics.querySelectorAll<HTMLSpanElement>(':scope > span')];
    for (const [index, span] of spans.entries()) {
      if (span.dataset.ui143Labeled === 'true') continue;
      const value = span.textContent?.trim() ?? '';
      if (!value) continue;
      if (/subscriber|monthly|listener|подпис|слушател|підпис|слухач/iu.test(value)) {
        span.dataset.ui143Labeled = 'true';
        continue;
      }
      const label = index === 0 ? 'Subscribers' : 'Monthly listeners';
      span.textContent = `${label} · ${value}`;
      span.dataset.ui143Labeled = 'true';
    }
  }
};

const fillAlbumTrackArtwork = () => {
  const album = document.querySelector<HTMLImageElement>(
    '#ui143-library-collections .ui143-library-detail-art img',
  )?.src;
  if (!album) return;

  for (const art of document.querySelectorAll<HTMLElement>(
    '#ui143-library-collections .ui143-library-detail-track-art',
  )) {
    if (art.querySelector('img')) continue;
    const image = document.createElement('img');
    image.src = album;
    image.alt = '';
    image.loading = 'lazy';
    art.replaceChildren(image);
  }
};

export const installDomPolish = () => {
  document.getElementById(STYLE_ID)?.remove();
  const removeStyle = mountStyle();
  const polish = () => {
    labelArtistMetrics();
    fillAlbumTrackArtwork();
  };
  const observer =
    typeof MutationObserver === 'undefined' ? null : new MutationObserver(polish);
  observer?.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', routeLikedSystemCard, true);
  polish();

  return () => {
    removeStyle();
    observer?.disconnect();
    document.removeEventListener('click', routeLikedSystemCard, true);
  };
};
