import type { IncomingMessage, ServerResponse } from 'node:http';

const allowedOrigins: Set<string> = new Set(
  (process.env.MCP_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)
);

export function checkOrigin(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers['origin'];

  // No Origin header — native MCP client, let through
  if (!origin) return true;

  // Origin present but whitelist empty — reject
  if (allowedOrigins.size === 0) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Origin not allowed' }));
    return false;
  }

  // Origin not in whitelist — reject
  if (!allowedOrigins.has(origin)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Origin not allowed' }));
    return false;
  }

  return true;
}
