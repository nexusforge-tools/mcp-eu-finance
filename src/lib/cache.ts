import { createHash } from 'crypto';

/** Deterministic short hash of arbitrary params for cache keys */
export function hashParams(params: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify(params, Object.keys(params).sort()))
    .digest('hex')
    .slice(0, 16);
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

/** Get a cached value. Returns null on miss or expiry. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

/** Store a value in cache with TTL in seconds. */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}
