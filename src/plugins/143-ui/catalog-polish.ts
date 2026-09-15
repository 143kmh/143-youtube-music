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

const variantChecks = [
  {
    requested: (value: string) => /(?:^|\s)(?:sped\s*up|speed\s*up|speedup)(?:\s|$)/iu.test(value),
    present: (value: string) => /(?:^|\s)(?:sped\s*up|speed\s*up|speedup)(?:\s|$)/iu.test(value),
  },
  {
    requested: (value: string) => /(?:^|\s)slowed(?:\s|$)/iu.test(value),
    present: (value: string) => /(?:^|\s)slowed(?:\s|$)/iu.test(value),
  },
  {
    requested: (value: string) => /(?:^|\s)reverb(?:\s|$)/iu.test(value),
    present: (value: string) => /(?:^|\s)reverb(?:\s|$)/iu.test(value),
  },
  {
    requested: (value: string) => /(?:^|\s)nightcore(?:\s|$)/iu.test(value),
    present: (value: string) => /(?:^|\s)nightcore(?:\s|$)/iu.test(value),
  },
  {
    requested: (value: string) => /(?:^|\s)remix(?:\s|$)/iu.test(value),
    present: (value: string) => /(?:^|\s)remix(?:\s|$)/iu.test(value),
  },
  {
    requested: (value: string) => /(?:^|\s)lyrics?(?:\s|$)|(?:^|\s)lyric\s+video(?:\s|$)/iu.test(value),
    present: (value: string) => /(?:^|\s)lyrics?(?:\s|$)|(?:^|\s)lyric\s+video(?:\s|$)/iu.test(value),
  },
  {
    requested: (value: string) => /(?:^|\s)live(?:\s|$)/iu.test(value),
    present: (value: string) => /(?:^|\s)live(?:\s|$)/iu.test(value),
  },
  {
    requested: (value: string) => /(?:^|\s)bass\s*boosted(?:\s|$)/iu.test(value),
    present: (value: string) => /(?:^|\s)bass\s*boosted(?:\s|$)/iu.test(value),
  },
  {
    requested: (value: string) => /(?:^|\s)8d(?:\s|$)/iu.test(value),
    present: (value: string) => /(?:^|\s)8d(?:\s|$)/iu.test(value),
  },
] as const;

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
  uniqueItems([
    ...(catalog.topResult?.kind === 'video' ? [catalog.topResult] : []),
    ...catalog.videos,
  ].filter((item) => item.videoId && !isEpisodeLike(item)));

const stripPopularity = (value: string) =>
  value
    .split(/\s*[•·]\s*/u)
    .filter(
      (part) =>
        !/(?:прослушиван|прослуховуван|views?|plays?)/iu.test(part),
    )
    .join(' • ')
    .trim();

const playableVideo = (item: SearchResultItem): SearchResultItem => ({
  ...item,
  kind: 'song',
  subtitle: (() => {
    const clean = stripPopularity(item.subtitle);
    if (/(?:^|\s)video(?:\s|$)/iu.test(clean)) return clean;
    return clean ? `Video • ${clean}` : 'Video';
  })(),
});

const literalSong = (item: SearchResultItem): SearchResultItem => ({
  ...item,
  subtitle: stripPopularity(item.subtitle),
});

const requestedVariantMatches = (query: string, item: SearchResultItem) => {
  const normalizedQuery = normalize(query);
  const haystack = normalize(`${item.title} ${item.subtitle}`);
  const requested = variantChecks.filter((check) => check.requested(normalizedQuery));
  return requested.length > 0 && requested.every((check) => check.present(haystack));
};

const literalScore = (query: string, item: SearchResultItem, index: number) => {
  const q = normalize(query);
  const title = normalize(item.title);
  const haystack = normalize(`${item.title} ${item.subtitle}`);
  const queryTokens = q.split(' ').filter((token) => token.length > 1);
  const matches = queryTokens.filter((token) => haystack.includes(token)).length;
  let score = queryTokens.length ? (matches / queryTokens.length) * 120 : 0;

  if (title === q) score += 220;
  else if (title.includes(q)) score += 170;
  else if (haystack.includes(q)) score += 110;
  if (queryTokens.length && matches === queryTokens.length) score += 90;
  if (requestedVariantMatches(query, item)) score += 150;
  if (/^video\b/iu.test(item.subtitle)) score += 20;

  return score - index / 1000;
};

const variantCatalog = (catalog: SearchCatalog): SearchCatalog => {
  const videos = cleanVideos(catalog);
  const rawSongs = uniqueItems([
    ...(catalog.topResult?.kind === 'song' ? [catalog.topResult] : []),
    ...catalog.songs,
  ]).filter((item) => item.kind === 'song' && item.videoId && !isEpisodeLike(item));
  const candidates = uniqueItems([
    ...videos.map(playableVideo),
    ...rawSongs.map(literalSong),
  ]);
  const strict = candidates.filter((item) => requestedVariantMatches(catalog.query, item));
  const pool = strict.length ? strict : candidates;
  const songs = pool
    .map((item, index) => ({ item, score: literalScore(catalog.query, item, index) }))
    .sort((left, right) => right.score - left.score)
    .map(({ item }) => item);

  return {
    ...catalog,
    // Variant searches are literal media searches. Keep only playable results
    // that match the requested version instead of falling back to an artist page.
    topResult: null,
    featuredArtist: null,
    songs,
    artists: [],
    albums: [],
    videos,
    playlists: [],
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