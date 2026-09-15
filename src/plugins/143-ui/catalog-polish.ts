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

const cleanCatalog = (catalog: SearchCatalog, artist: string): SearchCatalog => ({
  ...catalog,
  topResult:
    catalog.topResult && !isEpisodeLike(catalog.topResult)
      ? catalog.topResult
      : null,
  songs: uniqueItems(
    catalog.songs.filter(
      (item) =>
        item.kind === 'song' &&
        !isEpisodeLike(item) &&
        looseArtistInSubtitle(item, artist),
    ),
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
  videos: [],
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
  ]).filter(
    (item) =>
      item.kind === 'song' &&
      !isEpisodeLike(item) &&
      looseArtistInSubtitle(item, artist),
  );
  const albums = uniqueItems([
    ...base.albums,
    ...extras.flatMap((catalog) => catalog.albums),
  ]).filter(
    (item) =>
      item.kind === 'album' &&
      !isEpisodeLike(item) &&
      exactArtistInSubtitle(item, artist),
  );

  return { ...base, songs, albums, videos: [] };
};

/**
 * Keeps the 143 catalog music-only and makes artist searches useful enough for
 * the custom Search/Artist pages. This wraps the adapter's public catalog API;
 * it does not touch playback, stream selection, or force-high-audio-quality.
 */
export const installCatalogPolish = (engine: YouTubeMusicAdapter) => {
  const rawSearchCatalog = engine.searchCatalog.bind(engine);

  engine.searchCatalog = async (query: string) => {
    const raw = await rawSearchCatalog(query);
    const explicitHint = queryArtistHint(query);
    const artist =
      explicitHint ||
      raw.featuredArtist?.title?.trim() ||
      (raw.topResult?.kind === 'artist' ? raw.topResult.title.trim() : '');
    const cleaned = cleanCatalog(raw, artist);

    // Auxiliary requests are already narrow queries. Do not recursively enrich
    // them; just return the strict, music-only result.
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
