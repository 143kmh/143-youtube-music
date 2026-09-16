/** Bounded cache shared by lightweight searches and artist browse consumers. */
export const createCatalogRequestCache = () => {
  const entries = new Map<
    string,
    { value: Promise<unknown>; expires: number }
  >();
  return {
    load<T>(key: string, ttl: number, fetch: () => Promise<T>): Promise<T> {
      const now = Date.now();
      const hit = entries.get(key);
      if (hit && hit.expires > now) {
        entries.delete(key);
        entries.set(key, hit);
        return hit.value as Promise<T>;
      }
      // Sweep on access, without an additional background timer.
      for (const [cachedKey, entry] of entries) {
        if (entry.expires <= now) entries.delete(cachedKey);
      }
      const value = fetch().catch((error) => {
        if (entries.get(key)?.value === value) entries.delete(key);
        throw error;
      });
      entries.set(key, { value, expires: now + ttl });
      if (entries.size > 64) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      return value;
    },
    clear() {
      entries.clear();
    },
  };
};
