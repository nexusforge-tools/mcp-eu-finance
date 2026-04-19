import { type IncomingMessage, type ServerResponse } from 'node:http';
import { verifyApiKey } from '../lib/auth.js';

export async function handleAuth(req: IncomingMessage, res: ServerResponse): Promise<boolean | null> {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return null; // pas de clé → anon

  const rawKey = auth.slice(7).trim();

  const user = await verifyApiKey(rawKey);

  if (!user) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid or revoked API key' }));
    return false;
  }

  // Clé valide — headers premium
  res.setHeader('X-RateLimit-Limit', user.rateLimit);
  res.setHeader('X-RateLimit-Remaining', user.rateLimit);
  res.setHeader('X-RateLimit-Reset', Math.floor(Date.now() / 1000) + 3600);
  res.setHeader('X-User-Plan', user.plan);

  return true;
}
