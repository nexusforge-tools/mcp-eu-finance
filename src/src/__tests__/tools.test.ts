/**
 * Integration tests — mcp-eu-finance tools
 * Hit real ECB/Eurostat/Frankfurter APIs. Require internet access.
 * No Supabase/Redis needed (middleware mocked).
 */
import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Mock mcp-core middleware so tests don't need Redis/Supabase
vi.mock('../lib/index.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/index.js')>('../lib/index.js');
  return {
    ...actual,
    withMcpMiddleware: vi.fn(async (_ctx: unknown, handler: (u: null) => Promise<unknown>) => handler(null)),
    cacheGet: vi.fn(() => Promise.resolve(null)),
    cacheSet: vi.fn(() => Promise.resolve()),
    hashParams: actual.hashParams,
    makeMcpError: actual.makeMcpError,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});

import { registerEcbRatesTool } from '../tools/ecb-rates.js';
import { registerEuroExchangeTool } from '../tools/euro-exchange.js';
import { registerEuInflationTool } from '../tools/eu-inflation.js';
import { registerEuGdpTool } from '../tools/eu-gdp.js';
import { registerEuUnemploymentTool } from '../tools/eu-unemployment.js';
import { registerCompareEconomiesTool } from '../tools/compare-economies.js';

// ── helper ────────────────────────────────────────────────────────────────────

async function callTool(
  register: (s: McpServer) => void,
  toolName: string,
  args: Record<string, unknown> = {},
) {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  register(server);
  // _registeredTools is a plain object in the MCP SDK (not a Map)
  const tools = (server as unknown as {
    _registeredTools: Record<string, { handler: (a: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }>
  })._registeredTools;
  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool "${toolName}" not found. Available: ${Object.keys(tools).join(', ')}`);
  const result = await tool.handler(args);
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

// ── get_ecb_rates ─────────────────────────────────────────────────────────────

describe('get_ecb_rates', () => {
  it('returns all three ECB interest rates', async () => {
    const data = await callTool(registerEcbRatesTool, 'get_ecb_rates');

    expect(data).not.toHaveProperty('error');
    expect(data.rates).toBeDefined();
    const rates = data.rates as Record<string, { date: string; value: number }>;
    expect(typeof rates.deposit_facility.value).toBe('number');
    expect(typeof rates.main_refinancing.value).toBe('number');
    expect(typeof rates.marginal_lending.value).toBe('number');
    expect(data.source).toContain('European Central Bank');
  }, 15_000);
});

// ── get_euro_exchange ─────────────────────────────────────────────────────────

describe('get_euro_exchange', () => {
  it('returns EUR/USD and EUR/GBP rates', async () => {
    // Tool expects `currencies` array, not `currency` string
    const data = await callTool(registerEuroExchangeTool, 'get_euro_exchange', {
      currencies: ['USD', 'GBP'],
    });

    expect(data).not.toHaveProperty('error');
    expect(data.base).toBe('EUR');
    const rates = data.rates as Record<string, number>;
    expect(typeof rates.USD).toBe('number');
    expect(rates.USD).toBeGreaterThan(0);
    expect(typeof rates.GBP).toBe('number');
    expect(rates.GBP).toBeGreaterThan(0);
  }, 15_000);

  it('returns rates for all currencies when no filter', async () => {
    const data = await callTool(registerEuroExchangeTool, 'get_euro_exchange');
    expect(data).not.toHaveProperty('error');
    expect(Object.keys(data.rates as object).length).toBeGreaterThan(10);
  }, 15_000);
});

// ── get_eu_inflation ──────────────────────────────────────────────────────────

describe('get_eu_inflation', () => {
  it('returns latest HICP inflation for France and Germany', async () => {
    // Tool expects `countries` array
    const data = await callTool(registerEuInflationTool, 'get_eu_inflation', {
      countries: ['FR', 'DE'],
    });

    expect(data).not.toHaveProperty('error');
    const items = data.data as Array<{ country: string; rate: number; period: string }>;
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(typeof items[0].rate).toBe('number');
    expect(items[0].period).toMatch(/^\d{4}-\d{2}$/);
  }, 20_000);
});

// ── get_eu_gdp ────────────────────────────────────────────────────────────────

describe('get_eu_gdp', () => {
  it('returns GDP data for Germany', async () => {
    // Tool expects `countries` array
    const data = await callTool(registerEuGdpTool, 'get_eu_gdp', {
      countries: ['DE'],
    });

    expect(data).not.toHaveProperty('error');
    const items = data.data as Array<{ country: string; value: number }>;
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(typeof items[0].value).toBe('number');
  }, 20_000);
});

// ── get_eu_unemployment ───────────────────────────────────────────────────────

describe('get_eu_unemployment', () => {
  it('returns unemployment rate for Spain', async () => {
    // Tool expects `countries` array
    const data = await callTool(registerEuUnemploymentTool, 'get_eu_unemployment', {
      countries: ['ES'],
    });

    expect(data).not.toHaveProperty('error');
    const items = data.data as Array<{ country: string; rate: number }>;
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(typeof items[0].rate).toBe('number');
    expect(items[0].rate).toBeGreaterThan(0);
  }, 20_000);
});

// ── compare_eu_economies ──────────────────────────────────────────────────────

describe('compare_eu_economies', () => {
  it('compares France and Germany across indicators', async () => {
    const data = await callTool(
      registerCompareEconomiesTool,
      'compare_eu_economies',
      { countries: ['FR', 'DE'] },
    );

    expect(data).not.toHaveProperty('error');
    expect(data.countries).toBeDefined();
    const countries = data.countries as Array<{ country_code: string }>;
    expect(countries.map((c) => c.country_code)).toContain('FR');
    expect(countries.map((c) => c.country_code)).toContain('DE');
  }, 30_000);
});
