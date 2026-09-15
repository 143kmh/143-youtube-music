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

type ResolvedSongAlbum = Readonly<{
  item: SearchResultItem;
  catalog: AlbumCatalog;
}>;

const normalize = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isVariantVideoQuery = (query: string) =>
  /(?:^|\s)(?:sped\s*up|speed\s*up|speedup|slowed|reverb|nightcore|remix|lyrics?|lyric\s+video|live|bass\s*boosted|8d)(?:\s|$)/iu.test(
    normalize(query),
  );

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

  if (item.kind === 'song' && q.includes(title)) {
    const titleTokens = new Set(tokens(title));
    const remainder = tokens(q).filter((token) => !titleTokens.has(token));
    if (remainder.length) {
      const subtitleTokens = new Set(tokens(item.subtitle));
      const matched = remainder.filter((token) => subtitleTokens.has(token)).length;
      score += (matched / remainder.length) * 34;
    }
  }

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

const artistCandidates = (catalog: SearchCatalog) =>
  unique([
    ...(catalog.featuredArtist ? [artistItemFromProfile(catalog.featuredArtist)] : []),
    ...candidatesForKind(catalog, 'artist'),
  ]).filter((item) => item.browseId);

const pickArtistItem = (
  query: string,
  song: SearchResultItem,
  catalog: SearchCatalog,
) => {
  const candidates = artistCandidates(catalog);
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

const artistAnchoredToQuery = (query: string, catalog: SearchCatalog) => {
  const key = normalize(query);
  if (!key) return null;
  const candidates = artistCandidates(catalog);
  return (
    candidates.find((item) => normalize(item.title) === key) ??
    candidates.find((item) => {
      const name = normalize(item.title);
      return Boolean(name && (key.startsWith(`${name} `) || key.endsWith(` ${name}`)));
    }) ??
    null
  );
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

const isFullAlbumCandidate = (item: SearchResultItem) => {
  const subtitle = normalize(item.subtitle);
  if (!subtitle) return true;
  if (/(?:^|\s)(?:single|сингл|ep|e p)(?:\s|$)/iu.test(subtitle)) return false;
  return /(?:^|\s)(?:album|альбом)(?:\s|$)/iu.test(subtitle);
};

const catalogContainsSong = (catalog: AlbumCatalog, song: SearchResultItem) => {
  const title = normalize(song.title);
  return catalog.tracks.some(
    (track) =>
      Boolean(song.videoId && track.videoId === song.videoId) ||
      Boolean(title && normalize(track.title) === title),
  );
};

const catalogMatchesArtist = (catalog: AlbumCatalog, artist: string) => {
  const key = normalize(artist);
  if (!key || !catalog.artists.length) return true;
  return catalog.artists.some((entry) => {
    const name = normalize(entry.name);
    return name === key || name.startsWith(`${key} `) || key.startsWith(`${name} `);
  });
};

const resolveSongAlbum = async (
  engine: CatalogYouTubeMusicAdapter,
  query: string,
  song: SearchResultItem,
  artist: SearchArtistProfile | null,
  initial: SearchCatalog,
): Promise<ResolvedSongAlbum | null> => {
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

  const candidates = unique(albumCandidates).filter(
    (item) => item.browseId && isFullAlbumCandidate(item),
  );
  const artistKey = normalize(artist?.title ?? '');
  candidates.sort((left, right) => {
    const leftArtist = artistKey && normalize(left.subtitle).includes(artistKey) ? 1 : 0;
    const rightArtist = artistKey && normalize(right.subtitle).includes(artistKey) ? 1 : 0;
    if (leftArtist !== rightArtist) return rightArtist - leftArtist;
    return scoreItem(query, right) - scoreItem(query, left);
  });

  const explicitArtist = artistRemainder(query, song.title) ? artist?.title ?? '' : '';
  for (const candidate of candidates.slice(0, 10)) {
    if (!candidate.browseId) continue;
    try {
      const album = await engine.getAlbumCatalog(candidate.browseId, candidate.title);
      if (!catalogContainsSong(album, song)) continue;
      if (explicitArtist && !catalogMatchesArtist(album, explicitArtist)) continue;
      return { item: albumItemFromCatalog(album), catalog: album };
    } catch {
      // One bad candidate must not kill search.
    }
  }
  return null;
};

const resolveSongArtist = async (
  engine: CatalogYouTubeMusicAdapter,
  query: string,
  song: SearchResultItem,
  catalog: SearchCatalog,
) => {
  const remainder = artistRemainder(query, song.title);

  if (remainder) {
    try {
      const artistSearch = await engine.searchCatalog(remainder);
      const anchored = artistAnchoredToQuery(remainder, artistSearch);
      const scored = bestForKind(remainder, artistSearch, 'artist');
      const artistItem = anchored ?? (scored && scored.score >= 76 ? scored.item : null);
      if (artistItem?.browseId) {
        const profile = await loadArtistProfile(engine, artistItem, null);
        if (profile) return profile;
      }
    } catch {
      // Fall through to the artist relation from the original response.
    }
  }

  const artistItem = pickArtistItem(query, song, catalog);
  return loadArtistProfile(engine, artistItem, catalog.featuredArtist);
};

const artistFromAlbum = async (
  engine: CatalogYouTubeMusicAdapter,
  catalog: AlbumCatalog,
) => {
  const main = catalog.artists[0];
  if (!main?.browseId) return null;
  return loadArtistProfile(
    engine,
    {
      kind: 'artist',
      title: main.name,
      subtitle: '',
      artwork: '',
      browseId: main.browseId,
    },
    null,
  );
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
  // Variant queries should remain literal YouTube-style searches. Collapsing
  // “artist + sped up/slowed/reverb” into an artist/album focus defeats one of
  // YouTube Music's main advantages: community and alternate video versions.
  if (isVariantVideoQuery(catalog.query)) return null;

  const intent = detectSearchIntent(catalog);
  if (!intent || intent.kind === 'artist') return null;

  if (intent.kind === 'song') {
    let artist = await resolveSongArtist(engine, catalog.query, intent.item, catalog);
    const resolvedAlbum = await resolveSongAlbum(
      engine,
      catalog.query,
      intent.item,
      artist,
      catalog,
    );
    if (resolvedAlbum) {
      const verifiedArtist = await artistFromAlbum(engine, resolvedAlbum.catalog);
      if (verifiedArtist) artist = verifiedArtist;
    }
    return {
      kind: 'song',
      song: intent.item,
      album: resolvedAlbum?.item ?? null,
      artist,
    };
  }

  if (!intent.item.browseId) return null;
  try {
    const albumCatalog = await engine.getAlbumCatalog(
      intent.item.browseId,
      intent.item.title,
    );
    const album = albumItemFromCatalog(albumCatalog);
    let artist = await artistFromAlbum(engine, albumCatalog);
    if (!artist) {
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