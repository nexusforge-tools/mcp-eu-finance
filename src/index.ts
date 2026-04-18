#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { VERSION, NAME } from './version.js';
import { logger } from './lib/index.js';

import { registerEcbRatesTool } from './tools/ecb-rates.js';
import { registerEuroExchangeTool } from './tools/euro-exchange.js';
import { registerEuInflationTool } from './tools/eu-inflation.js';
import { registerEuGdpTool } from './tools/eu-gdp.js';
import { registerEuUnemploymentTool } from './tools/eu-unemployment.js';
import { registerCompareEconomiesTool } from './tools/compare-economies.js';

const server = new McpServer({ name: NAME, version: VERSION });

registerEcbRatesTool(server);
registerEuroExchangeTool(server);
registerEuInflationTool(server);
registerEuGdpTool(server);
registerEuUnemploymentTool(server);
registerCompareEconomiesTool(server);

const transport = new StdioServerTransport();
await server.connect(transport);
logger.info('MCP EU Finance server started', { transport: 'stdio', version: VERSION });
