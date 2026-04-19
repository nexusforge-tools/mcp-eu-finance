#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { VERSION, NAME } from './version.js';
import { checkOrigin } from './middleware/origin-check.js';
import { logger } from './lib/index.js';

import { registerEcbRatesTool } from './tools/ecb-rates.js';
import { registerEuroExchangeTool } from './tools/euro-exchange.js';
import { registerEuInflationTool } from './tools/eu-inflation.js';
import { registerEuGdpTool } from './tools/eu-gdp.js';
import { registerEuUnemploymentTool } from './tools/eu-unemployment.js';
import { registerCompareEconomiesTool } from './tools/compare-economies.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : (() => {
  console.error('FATAL: PORT env var is required.');
  process.exit(1);
})() as never;

function createMcpServer(): McpServer {
  const server = new McpServer({ name: NAME, version: VERSION });
  registerEcbRatesTool(server);
  registerEuroExchangeTool(server);
  registerEuInflationTool(server);
  registerEuGdpTool(server);
  registerEuUnemploymentTool(server);
  registerCompareEconomiesTool(server);
  return server;
}

const MCP_WELL_KNOWN = {
  name: NAME,
  version: VERSION,
  transports: [
    { type: 'streamable-http', url: 'https://api.nexusforge.tools/mcp/eu-finance' },
    { type: 'sse', url: 'https://api.nexusforge.tools/mcp/eu-finance/sse' }
  ],
  tools: [
    'get_ecb_rates',
    'get_euro_exchange',
    'get_eu_inflation',
    'get_eu_gdp',
    'get_eu_unemployment',
    'compare_eu_economies'
  ]
};

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', name: NAME, version: VERSION, transport: 'streamable-http-stateless', uptime_seconds: Math.floor(process.uptime()) }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', name: NAME, version: VERSION, transport: 'streamable-http-stateless', uptime_seconds: Math.floor(process.uptime()) }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/.well-known/mcp.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(MCP_WELL_KNOWN));
    return;
  }

  if (!checkOrigin(req, res)) return;

  if (req.method === 'POST' && url.pathname === '/') {
    const limit = parseInt(process.env.MCP_RATE_LIMIT ?? '100', 10);
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', limit);
    res.setHeader('X-RateLimit-Reset', Math.floor(Date.now() / 1000) + 3600);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = createMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

const shutdown = (): void => {
  logger.info('Shutdown signal received');
  httpServer.close(() => { logger.info('HTTP server closed'); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

httpServer.listen(PORT, '127.0.0.1', () => {
  logger.info('MCP EU Finance HTTP server started', { port: PORT, version: VERSION, transport: 'streamable-http-stateless' });
});
