#!/usr/bin/env node
/**
 * NexusForge EU Finance MCP Server
 *
 * Transport modes (set via MCP_TRANSPORT env var):
 *   stdio  — default, used by npx / Claude Desktop
 *   http   — HTTP/SSE, used by systemd (hosted service)
 *
 * Quick start (stdio):
 *   npx -y @nexusforge/eu-finance
 *
 * Quick start (HTTP):
 *   MCP_TRANSPORT=http PORT=3001 node dist/index.js
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { logger } from './lib/index.js';

import { registerEcbRatesTool } from './tools/ecb-rates.js';
import { registerEuroExchangeTool } from './tools/euro-exchange.js';
import { registerEuInflationTool } from './tools/eu-inflation.js';
import { registerEuGdpTool } from './tools/eu-gdp.js';
import { registerEuUnemploymentTool } from './tools/eu-unemployment.js';
import { registerCompareEconomiesTool } from './tools/compare-economies.js';

const SERVER_NAME = 'nexusforge-eu-finance';
const SERVER_VERSION = '1.0.0';

/** Create a fully-registered McpServer instance (one per transport connection) */
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerEcbRatesTool(server);
  registerEuroExchangeTool(server);
  registerEuInflationTool(server);
  registerEuGdpTool(server);
  registerEuUnemploymentTool(server);
  registerCompareEconomiesTool(server);

  return server;
}

// ── Stdio mode (default — for npx / Claude Desktop) ──────────────────────────
async function startStdio(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('MCP EU Finance server started', { transport: 'stdio', version: SERVER_VERSION });
}

// ── HTTP/SSE mode (for systemd hosted service) ────────────────────────────────
async function startHttp(port: number): Promise<void> {
  // Active SSE sessions: sessionId → transport
  const sessions = new Map<string, SSEServerTransport>();

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    const pathname = url.pathname;

    // CORS for browser-based MCP clients (preflight)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // ── GET /sse — open a new SSE connection ─────────────────────────────────
    if (req.method === 'GET' && pathname === '/sse') {
      const transport = new SSEServerTransport('/messages', res);

      sessions.set(transport.sessionId, transport);
      logger.info('SSE session opened', { sessionId: transport.sessionId });

      req.on('close', () => {
        sessions.delete(transport.sessionId);
        logger.info('SSE session closed', { sessionId: transport.sessionId });
      });

      // Each session gets its own server instance (tools are stateless)
      const mcpServer = createMcpServer();
      await mcpServer.connect(transport);
      return;
    }

    // ── POST /messages — relay message to existing session ───────────────────
    if (req.method === 'POST' && pathname === '/messages') {
      const sessionId = url.searchParams.get('sessionId');
      const transport = sessionId ? sessions.get(sessionId) : undefined;

      if (!transport) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found', sessionId }));
        return;
      }

      await transport.handlePostMessage(req, res);
      return;
    }

    // ── GET /health — liveness probe for Caddy / Uptime Kuma ────────────────
    if (req.method === 'GET' && pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        server: SERVER_NAME,
        version: SERVER_VERSION,
        sessions: sessions.size,
      }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  // Graceful shutdown
  const shutdown = (): void => {
    logger.info('Shutting down HTTP server...');
    httpServer.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    // Force-close after 10s
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await new Promise<void>((resolve, reject) => {
    httpServer.listen(port, '127.0.0.1', () => {
      logger.info('MCP EU Finance server started', {
        transport: 'http',
        port,
        version: SERVER_VERSION,
        endpoints: {
          sse: `http://127.0.0.1:${port}/sse`,
          messages: `http://127.0.0.1:${port}/messages`,
          health: `http://127.0.0.1:${port}/health`,
        },
      });
      resolve();
    });
    httpServer.on('error', reject);
  });
}

// ── Entry point ───────────────────────────────────────────────────────────────
const TRANSPORT = process.env.MCP_TRANSPORT ?? 'stdio';
const PORT = parseInt(process.env.PORT ?? '3001', 10);

const start = TRANSPORT === 'http' ? () => startHttp(PORT) : startStdio;

start().catch((err: unknown) => {
  logger.error('Server failed to start', { error: String(err) });
  process.exit(1);
});
