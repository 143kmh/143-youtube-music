import type { PlaybackContextAdapter } from './playback-context';
import type { SearchOptions } from './youtube-music';

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
  const methods = engine as Partial<PlaybackContextAdapter>;
  const search = methods.searchCatalog?.bind(engine);
  const artist = methods.getArtistCatalog?.bind(engine);
  const album = methods.getAlbumCatalog?.bind(engine);
  const autoplay = methods.getAutoplayItems?.bind(engine);

  // Some isolated UI tests intentionally provide only the subset of the
  // playback adapter they exercise. In production all four catalog methods are
  // present; when one is absent, simply leave the adapter untouched.
  if (!search || !artist || !album || !autoplay) return () => {};

  const searchCache = new Map<string, { value: ReturnType<typeof search>; expires: number }>();
  const artistCache = new Map<string, { value: ReturnType<typeof artist>; expires: number }>();
  const albumCache = new Map<string, { value: ReturnType<typeof album>; expires: number }>();
  const autoplayCache = new Map<string, { value: ReturnType<typeof autoplay>; expires: number }>();

  engine.searchCatalog = (query: string, options?: SearchOptions) => {
    // A caller's cancellation must not become another caller's cached result.
    // The adapter still shares the underlying search/browse requests.
    if (options?.isCurrent) return search(query, options);
    return cachePromise(
      searchCache,
      `${options?.basic ? 'basic' : 'full'}:${normalize(query)}`,
      2 * 60_000,
      () => search(query, options),
    );
  };
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
