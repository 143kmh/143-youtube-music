import type {
  SearchCatalog,
  SearchResultItem,
  YouTubeMusicAdapter,
} from './youtube-music';

const normalize = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isEpisodeLike = (item: SearchResultItem) => {
  const value = `${item.title} ${item.subtitle}`;
  return (
    /\b(?:podcast|episode|interview)\b/iu.test(value) ||
    /(?:^|[\s•·—–-])(?:подкаст|эпизод|епізод|выпуск|випуск|интервью)(?=$|[\s•·—–-])/iu.test(
      value,
    )
  );
};

const isVariantVideoQuery = (query: string) =>
  /(?:^|\s)(?:sped\s*up|speed\s*up|speedup|slowed|reverb|nightcore|remix|lyrics?|lyric\s+video|live|bass\s*boosted|8d)(?:\s|$)/iu.test(
    normalize(query),
  );

const exactArtistInSubtitle = (item: SearchResultItem, artist: string) => {
  const key = normalize(artist);
  if (!key) return true;

  return item.subtitle
    .split(/\s*[•·]\s*/u)
    .map(normalize)
    .some((part) => part === key);
};

const looseArtistInSubtitle = (item: SearchResultItem, artist: string) => {
  const key = normalize(artist);
  return !key || normalize(item.subtitle).includes(key);
};

const withArtistHint = (item: SearchResultItem, artist: string) => {
  if (!artist || item.kind !== 'song' || looseArtistInSubtitle(item, artist))
    return item;
  return {
    ...item,
    subtitle: item.subtitle ? `${item.subtitle} • ${artist}` : artist,
  };
};

const uniqueItems = (items: readonly SearchResultItem[]) => {
  const result: SearchResultItem[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const key = `${item.kind}:${item.videoId ?? item.browseId ?? `${item.title}\u0000${item.subtitle}`}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
};

const cleanVideos = (catalog: SearchCatalog) =>
  uniqueItems(catalog.videos.filter((item) => item.videoId && !isEpisodeLike(item)));

const playableVideo = (item: SearchResultItem): SearchResultItem => ({
  ...item,
  kind: 'song',
  subtitle: /(?:^|\s)video(?:\s|$)/iu.test(item.subtitle)
    ? item.subtitle
    : item.subtitle
      ? `Video • ${item.subtitle}`
      : 'Video',
});

const variantCatalog = (catalog: SearchCatalog): SearchCatalog => {
  const videos = cleanVideos(catalog);
  const promoted = videos.map(playableVideo);
  const songs = uniqueItems([
    ...promoted,
    ...catalog.songs.filter((item) => item.kind === 'song' && !isEpisodeLike(item)),
  ]);

  return {
    ...catalog,
    // Queries such as “pharaoh speedup” are requests for the exact variant,
    // not an invitation to replace the page with PHARAOH's artist profile.
    topResult: null,
    featuredArtist: null,
    songs,
    albums: [],
    videos,
    playlists: uniqueItems(
      catalog.playlists.filter((item) => !isEpisodeLike(item)),
    ),
  };
};

const cleanCatalog = (catalog: SearchCatalog, artist: string): SearchCatalog => ({
  ...catalog,
  topResult:
    catalog.topResult && !isEpisodeLike(catalog.topResult)
      ? catalog.topResult
      : null,
  songs: uniqueItems(
    catalog.songs
      .filter((item) => item.kind === 'song' && !isEpisodeLike(item))
      .map((item) => withArtistHint(item, artist)),
  ),
  albums: uniqueItems(
    catalog.albums.filter(
      (item) =>
        item.kind === 'album' &&
        !isEpisodeLike(item) &&
        exactArtistInSubtitle(item, artist),
    ),
  ),
  playlists: uniqueItems(
    catalog.playlists.filter((item) => !isEpisodeLike(item)),
  ),
  // Preserve OMV/UGC results in the adapter even when the current Search page
  // does not render a dedicated Videos shelf yet.
  videos: cleanVideos(catalog),
});

const queryArtistHint = (query: string) => {
  const trimmed = query.trim();
  const stripped = trimmed.replace(
    /\s+(?:albums?|альбом(?:ы|ов)?|singles?|сингл(?:ы|ов)?|releases?|релиз(?:ы|ов)?|songs?|tracks?|треки|песни)\s*$/iu,
    '',
  );
  return stripped === trimmed ? '' : stripped.trim();
};

const mergeCatalogs = (
  base: SearchCatalog,
  artist: string,
  extras: readonly SearchCatalog[],
): SearchCatalog => {
  const songs = uniqueItems([
    ...base.songs,
    ...extras.flatMap((catalog) => catalog.songs),
  ])
    .filter((item) => item.kind === 'song' && !isEpisodeLike(item))
    .map((item) => withArtistHint(item, artist));
  const albums = uniqueItems([
    ...base.albums,
    ...extras.flatMap((catalog) => catalog.albums),
  ]).filter(
    (item) =>
      item.kind === 'album' &&
      !isEpisodeLike(item) &&
      exactArtistInSubtitle(item, artist),
  );
  const videos = uniqueItems([
    ...base.videos,
    ...extras.flatMap((catalog) => catalog.videos),
  ]).filter((item) => item.videoId && !isEpisodeLike(item));

  return { ...base, songs, albums, videos };
};

/**
 * Keeps podcasts out of the 143 catalog while preserving YouTube Music's UGC
 * advantage. Variant queries (sped up/slowed/reverb/remix/etc.) promote video
 * results into the normal playable track list so the existing 143 queue and
 * transport can own them without a second playback engine.
 */
export const installCatalogPolish = (engine: YouTubeMusicAdapter) => {
  const rawSearchCatalog = engine.searchCatalog.bind(engine);

  engine.searchCatalog = async (query: string) => {
    const raw = await rawSearchCatalog(query);
    if (isVariantVideoQuery(query)) return variantCatalog(raw);

    const explicitHint = queryArtistHint(query);
    const artist =
      explicitHint ||
      raw.featuredArtist?.title?.trim() ||
      (raw.topResult?.kind === 'artist' ? raw.topResult.title.trim() : '');
    const cleaned = cleanCatalog(raw, artist);

    // Auxiliary requests are already narrow queries. Do not recursively enrich
    // them; just return the strict music result.
    if (explicitHint || !artist || !raw.featuredArtist) return cleaned;

    const requests = [
      `${artist} songs`,
      `${artist} треки`,
      `${artist} album`,
      `${artist} альбом`,
    ];
    const settled = await Promise.allSettled(
      requests.map((value) => rawSearchCatalog(value)),
    );
    const extras = settled.flatMap((entry) =>
      entry.status === 'fulfilled'
        ? [cleanCatalog(entry.value, artist)]
        : [],
    );

    return mergeCatalogs(cleaned, artist, extras);
  };
};