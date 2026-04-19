import { type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

const WINDOW_MS = 60 * 60 * 1000; // 1h
const MAX_REQUESTS = parseInt(process.env.MCP_RATE_LIMIT ?? '100', 10);

interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();

// Cleanup expired entries every 10min
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 10 * 60 * 1000).unref();

export function rateLimit(req: IncomingMessage, res: ServerResponse): boolean {
  // Extract or generate anon UUID
  let anonId = req.headers['x-anon-id'] as string | undefined;
  if (!anonId || !/^[0-9a-f-]{36}$/.test(anonId)) {
    anonId = randomUUID();
  }

  const now = Date.now();
  let entry = store.get(anonId);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    store.set(anonId, entry);
  }

  entry.count++;

  const remaining = Math.max(0, MAX_REQUESTS - entry.count);
  const resetSec = Math.floor(entry.resetAt / 1000);

  res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', resetSec);
  res.setHeader('X-Anon-Id', anonId);

  if (entry.count > MAX_REQUESTS) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Rate limit exceeded', retry_after: resetSec }));
    return false;
  }

  return true;
}
