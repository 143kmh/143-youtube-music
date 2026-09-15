import type {
  SearchArtistProfile,
  SearchCatalog,
  SearchResultItem,
} from './youtube-music';
import type {
  AlbumCatalog,
  CatalogYouTubeMusicAdapter,
} from './youtube-music-catalog';

export type SongSearchFocus = Readonly<{
  kind: 'song';
  song: SearchResultItem;
  album: SearchResultItem | null;
  artist: SearchArtistProfile | null;
}>;

export type AlbumSearchFocus = Readonly<{
  kind: 'album';
  album: SearchResultItem;
  artist: SearchArtistProfile | null;
  tracks: readonly SearchResultItem[];
}>;

export type SearchFocus = SongSearchFocus | AlbumSearchFocus | null;

type ScoredItem = Readonly<{
  item: SearchResultItem;
  score: number;
}>;

const normalize = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokens = (value: string) =>
  normalize(value)
    .split(' ')
    .filter((token) => token.length > 1);

const overlapRatio = (left: string, right: string) => {
  const leftTokens = new Set(tokens(left));
  const rightTokens = new Set(tokens(right));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let common = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) common++;
  return common / Math.max(leftTokens.size, rightTokens.size);
};

const scoreItem = (query: string, item: SearchResultItem) => {
  const q = normalize(query);
  const title = normalize(item.title);
  if (!q || !title) return 0;
  if (q === title) return 120;

  let score = 0;
  if (q.includes(title)) {
    score = 82 + Math.min(14, (title.length / q.length) * 14);
    if (item.kind === 'song' || item.kind === 'album') score += 6;
  } else if (title.includes(q)) {
    score = 72 + Math.min(10, (q.length / title.length) * 10);
  } else {
    score = overlapRatio(q, title) * 68;
  }

  const subtitleOverlap = overlapRatio(q, item.subtitle);
  if (subtitleOverlap > 0) score += subtitleOverlap * 18;
  return score;
};

const unique = (items: readonly SearchResultItem[]) => {
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

const candidatesForKind = (
  catalog: SearchCatalog,
  kind: SearchResultItem['kind'],
) =>
  unique([
    ...(catalog.topResult?.kind === kind ? [catalog.topResult] : []),
    ...(kind === 'song'
      ? catalog.songs
      : kind === 'album'
        ? catalog.albums
        : kind === 'artist'
          ? catalog.artists
          : []),
  ]);

const bestForKind = (
  query: string,
  catalog: SearchCatalog,
  kind: 'song' | 'album' | 'artist',
): ScoredItem | null => {
  let best: ScoredItem | null = null;
  for (const item of candidatesForKind(catalog, kind)) {
    const score = scoreItem(query, item);
    if (!best || score > best.score) best = { item, score };
  }
  return best;
};

const artistItemFromProfile = (profile: SearchArtistProfile): SearchResultItem => ({
  kind: 'artist',
  title: profile.title,
  subtitle: profile.monthlyListeners || profile.subscribers,
  artwork: profile.avatar,
  browseId: profile.browseId,
});

const pickArtistItem = (
  query: string,
  song: SearchResultItem,
  catalog: SearchCatalog,
) => {
  const candidates = unique([
    ...(catalog.featuredArtist ? [artistItemFromProfile(catalog.featuredArtist)] : []),
    ...candidatesForKind(catalog, 'artist'),
  ]).filter((item) => item.browseId);
  if (!candidates.length) return null;

  const subtitle = normalize(song.subtitle);
  const q = normalize(query);
  const ranked = candidates
    .map((item, index) => {
      const name = normalize(item.title);
      const subtitleIndex = name ? subtitle.indexOf(name) : -1;
      const queryIndex = name ? q.indexOf(name) : -1;
      const relationScore =
        subtitleIndex >= 0
          ? 300 - subtitleIndex
          : queryIndex >= 0
            ? 200 - queryIndex
            : scoreItem(query, item);
      return { item, index, relationScore };
    })
    .sort(
      (left, right) =>
        right.relationScore - left.relationScore || left.index - right.index,
    );
  return ranked[0]?.item ?? null;
};

const artistRemainder = (query: string, title: string) => {
  const q = normalize(query);
  const song = normalize(title);
  if (!q || !song || !q.includes(song)) return '';
  return q.replace(song, ' ').replace(/\s+/g, ' ').trim();
};

const loadArtistProfile = async (
  engine: CatalogYouTubeMusicAdapter,
  item: SearchResultItem | null,
  fallback: SearchArtistProfile | null,
) => {
  if (!item?.browseId) return fallback;
  if (fallback?.browseId === item.browseId) return fallback;
  try {
    return (await engine.getArtistCatalog(item.browseId, item.title)).profile;
  } catch (error) {
    console.warn('[143 Music] Could not resolve search artist context', error);
    return fallback;
  }
};

const albumItemFromCatalog = (catalog: AlbumCatalog): SearchResultItem => ({
  kind: 'album',
  title: catalog.title,
  subtitle:
    catalog.subtitle ||
    [catalog.artists.map((artist) => artist.name).join(', '), catalog.year]
      .filter(Boolean)
      .join(' • '),
  artwork: catalog.artwork,
  browseId: catalog.browseId,
});

const catalogContainsSong = (catalog: AlbumCatalog, song: SearchResultItem) =>
  Boolean(
    song.videoId &&
      catalog.tracks.some((track) => track.videoId === song.videoId),
  );

const resolveSongAlbum = async (
  engine: CatalogYouTubeMusicAdapter,
  query: string,
  song: SearchResultItem,
  artist: SearchArtistProfile | null,
  initial: SearchCatalog,
) => {
  const albumCandidates = [...candidatesForKind(initial, 'album')];
  const searchQueries = unique(
    [
      artist?.title ? `${artist.title} ${song.title}` : '',
      artist?.title ? `${artist.title} ${song.title} album` : '',
      artist?.title ? `${artist.title} ${song.title} альбом` : '',
      `${song.title} album`,
    ]
      .filter(Boolean)
      .map((title) => ({
        kind: 'album' as const,
        title,
        subtitle: '',
        artwork: '',
      })),
  ).map((item) => item.title);

  const settled = await Promise.allSettled(
    searchQueries.map((searchQuery) => engine.searchCatalog(searchQuery)),
  );
  for (const entry of settled) {
    if (entry.status !== 'fulfilled') continue;
    albumCandidates.push(...entry.value.albums);
    if (entry.value.topResult?.kind === 'album')
      albumCandidates.push(entry.value.topResult);
  }

  const candidates = unique(albumCandidates).filter((item) => item.browseId);
  const artistKey = normalize(artist?.title ?? '');
  candidates.sort((left, right) => {
    const leftArtist = artistKey && normalize(left.subtitle).includes(artistKey) ? 1 : 0;
    const rightArtist = artistKey && normalize(right.subtitle).includes(artistKey) ? 1 : 0;
    if (leftArtist !== rightArtist) return rightArtist - leftArtist;
    return scoreItem(query, right) - scoreItem(query, left);
  });

  let fallback: SearchResultItem | null = null;
  for (const candidate of candidates.slice(0, 8)) {
    if (!candidate.browseId) continue;
    try {
      const album = await engine.getAlbumCatalog(candidate.browseId, candidate.title);
      const item = albumItemFromCatalog(album);
      fallback ??= item;
      if (catalogContainsSong(album, song)) return item;
    } catch {
      // One bad candidate must not kill search.
    }
  }
  return fallback;
};

const resolveSongArtist = async (
  engine: CatalogYouTubeMusicAdapter,
  query: string,
  song: SearchResultItem,
  catalog: SearchCatalog,
) => {
  let artistItem = pickArtistItem(query, song, catalog);
  const remainder = artistRemainder(query, song.title);

  if (remainder) {
    try {
      const artistSearch = await engine.searchCatalog(remainder);
      const exact = bestForKind(remainder, artistSearch, 'artist');
      if (exact && exact.score >= 76) artistItem = exact.item;
    } catch {
      // Keep the artist inferred from the original response.
    }
  }

  return loadArtistProfile(engine, artistItem, catalog.featuredArtist);
};

export const detectSearchIntent = (catalog: SearchCatalog) => {
  const song = bestForKind(catalog.query, catalog, 'song');
  const album = bestForKind(catalog.query, catalog, 'album');
  const artist = bestForKind(catalog.query, catalog, 'artist');
  const choices = [
    song && { kind: 'song' as const, ...song },
    album && { kind: 'album' as const, ...album },
    artist && { kind: 'artist' as const, ...artist },
  ].filter(Boolean) as Array<{
    kind: 'song' | 'album' | 'artist';
    item: SearchResultItem;
    score: number;
  }>;
  choices.sort((left, right) => right.score - left.score);
  const best = choices[0];
  if (!best || best.score < 70) return null;
  return best;
};

export const resolveSearchFocus = async (
  engine: CatalogYouTubeMusicAdapter,
  catalog: SearchCatalog,
): Promise<SearchFocus> => {
  const intent = detectSearchIntent(catalog);
  if (!intent || intent.kind === 'artist') return null;

  if (intent.kind === 'song') {
    const artist = await resolveSongArtist(engine, catalog.query, intent.item, catalog);
    const album = await resolveSongAlbum(
      engine,
      catalog.query,
      intent.item,
      artist,
      catalog,
    );
    return { kind: 'song', song: intent.item, album, artist };
  }

  if (!intent.item.browseId) return null;
  try {
    const albumCatalog = await engine.getAlbumCatalog(
      intent.item.browseId,
      intent.item.title,
    );
    const album = albumItemFromCatalog(albumCatalog);
    const mainArtist = albumCatalog.artists[0];
    let artist: SearchArtistProfile | null = null;
    if (mainArtist?.browseId) {
      artist = await loadArtistProfile(
        engine,
        {
          kind: 'artist',
          title: mainArtist.name,
          subtitle: '',
          artwork: '',
          browseId: mainArtist.browseId,
        },
        null,
      );
    } else {
      const candidate = bestForKind(catalog.query, catalog, 'artist');
      artist = await loadArtistProfile(
        engine,
        candidate?.item ?? null,
        catalog.featuredArtist,
      );
    }
    return {
      kind: 'album',
      album,
      artist,
      tracks: albumCatalog.tracks,
    };
  } catch (error) {
    console.warn('[143 Music] Could not resolve album search context', error);
    return null;
  }
};
