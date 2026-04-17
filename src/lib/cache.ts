import { createHash } from 'crypto';
import { logger } from './logger.js';

// In-memory TTL cache — works in stdio (npx) mode without Redis.
// Keyed by string, values stored with expiry timestamp.
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

/** Deterministic short hash of arbitrary params for cache keys */
export function hashParams(params: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify(params, Object.keys(params).sort()))
    .digest('hex')
    .slice(0, 16);
}

/** Get a cached value. Returns null on miss or expiry. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  logger.debug('Cache hit', { key });
  return entry.value;
}

/** Store a value with TTL in seconds. */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}
