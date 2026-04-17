import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { cacheGet, cacheSet, hashParams, withMcpMiddleware, makeMcpError } from '../lib/index.js';

const SERVER_NAME = 'nexusforge-eu-finance';
const CACHE_TTL = 3600; // 1 hour

// Frankfurter API — free, ECB-sourced exchange rates
// api.frankfurter.app redirects to api.frankfurter.dev/v1 since 2025
const FRANKFURTER_BASE = 'https://api.frankfurter.dev/v1';

interface ExchangeRateResult {
  base: string;
  date: string;
  rates: Record<string, number>;
  source: string;
  retrieved_at: string;
}

export function registerEuroExchangeTool(server: McpServer): void {
  server.tool(
    'get_euro_exchange',
    'Fetches EUR exchange rates against other currencies from the ECB via Frankfurter API. Returns a JSON object with: `base` ("EUR"), `date` (YYYY-MM-DD of the rate), `rates` (object mapping 3-letter currency codes to numeric values representing how many units of that currency equal 1 EUR), `source`, and `retrieved_at` as ISO 8601. Latest rates are cached 1 hour; historical rates are cached permanently. USAGE: Supports 33 currencies including USD, GBP, JPY, CHF, CNY, SEK, PLN, and others. Omit `date` for the latest available rates. Provide `date` in YYYY-MM-DD format for historical rates (available from 1999-01-04). These are ECB reference rates published at ~16:00 CET — not real-time mid-market rates; expect small spreads vs live quotes. Requests for weekends or ECB holidays return the previous business day\'s rates. Returns an error for dates before 1999-01-04 or future dates.',
    {
      currencies: z
        .array(z.string().length(3).toUpperCase())
        .optional()
        .describe('List of 3-letter currency codes (e.g. ["USD", "GBP", "JPY"]). Omit for all available currencies.'),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe('Historical date in YYYY-MM-DD format. Omit for latest rates.'),
    },
    async ({ currencies, date }) => {
      return withMcpMiddleware({ serverName: SERVER_NAME, toolName: 'get_euro_exchange' }, async () => {
        const params = { currencies, date };
        const cacheKey = `get_euro_exchange:${hashParams(params as Record<string, unknown>)}`;
        const cached = await cacheGet<ExchangeRateResult>(cacheKey);
        if (cached) {
          return { content: [{ type: 'text' as const, text: JSON.stringify(cached, null, 2) }] };
        }

        const endpoint = date ? `${FRANKFURTER_BASE}/${date}` : `${FRANKFURTER_BASE}/latest`;
        const searchParams = new URLSearchParams({ base: 'EUR' });
        if (currencies?.length) {
          searchParams.set('to', currencies.join(','));
        }

        const res = await fetch(`${endpoint}?${searchParams}`, {
          signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) {
          if (res.status === 404) {
            return makeMcpError(
              `No exchange rate data found for date ${date ?? 'latest'}`,
              'SOURCE_UNAVAILABLE',
            );
          }
          return makeMcpError(
            `Frankfurter API returned ${res.status}`,
            'SOURCE_UNAVAILABLE',
          );
        }

        const json = (await res.json()) as { amount: number; base: string; date: string; rates: Record<string, number> };

        const result: ExchangeRateResult = {
          base: json.base,
          date: json.date,
          rates: json.rates,
          source: 'European Central Bank via Frankfurter.app',
          retrieved_at: new Date().toISOString(),
        };

        await cacheSet(cacheKey, result, CACHE_TTL);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      });
    },
  );
}
