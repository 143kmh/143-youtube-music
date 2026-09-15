import type { PlaybackContextAdapter } from './playback-context';

const normalize = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const cachePromise = <T>(
  cache: Map<string, { value: Promise<T>; expires: number }>,
  key: string,
  ttl: number,
  load: () => Promise<T>,
) => {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.value;
  if (hit) cache.delete(key);

  const value = load().catch((error) => {
    const current = cache.get(key);
    if (current?.value === value) cache.delete(key);
    throw error;
  });
  cache.set(key, { value, expires: now + ttl });
  if (cache.size > 96) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest) cache.delete(oldest);
  }
  return value;
};

export const installCatalogCache = (engine: PlaybackContextAdapter) => {
  const search = engine.searchCatalog.bind(engine);
  const artist = engine.getArtistCatalog.bind(engine);
  const album = engine.getAlbumCatalog.bind(engine);
  const autoplay = engine.getAutoplayItems.bind(engine);

  const searchCache = new Map<string, { value: ReturnType<typeof search>; expires: number }>();
  const artistCache = new Map<string, { value: ReturnType<typeof artist>; expires: number }>();
  const albumCache = new Map<string, { value: ReturnType<typeof album>; expires: number }>();
  const autoplayCache = new Map<string, { value: ReturnType<typeof autoplay>; expires: number }>();

  engine.searchCatalog = (query) =>
    cachePromise(searchCache, normalize(query), 2 * 60_000, () => search(query));
  engine.getArtistCatalog = (browseId, fallbackName = '') =>
    cachePromise(artistCache, browseId, 5 * 60_000, () => artist(browseId, fallbackName));
  engine.getAlbumCatalog = (browseId, fallbackTitle = '') =>
    cachePromise(albumCache, browseId, 5 * 60_000, () => album(browseId, fallbackTitle));
  engine.getAutoplayItems = (videoId) =>
    cachePromise(autoplayCache, videoId, 60_000, () => autoplay(videoId));

  return () => {
    engine.searchCatalog = search;
    engine.getArtistCatalog = artist;
    engine.getAlbumCatalog = album;
    engine.getAutoplayItems = autoplay;
  };
};
