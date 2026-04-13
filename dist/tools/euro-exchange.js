import { z } from 'zod';
import { cacheGet, cacheSet, hashParams, withMcpMiddleware, makeMcpError } from '@nexusforge/mcp-core';
const SERVER_NAME = 'nexusforge-eu-finance';
const CACHE_TTL = 3600; // 1 hour
// Frankfurter API — free, ECB-sourced exchange rates
const FRANKFURTER_BASE = 'https://api.frankfurter.app';
export function registerEuroExchangeTool(server) {
    server.tool('get_euro_exchange', 'Get EUR exchange rates against other currencies. Supports latest rates or historical rates by date. Source: ECB via Frankfurter.app.', {
        currencies: z
            .array(z.string().length(3).toUpperCase())
            .optional()
            .describe('List of 3-letter currency codes (e.g. ["USD", "GBP", "JPY"]). Omit for all available currencies.'),
        date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional()
            .describe('Historical date in YYYY-MM-DD format. Omit for latest rates.'),
    }, async ({ currencies, date }) => {
        return withMcpMiddleware({ serverName: SERVER_NAME, toolName: 'get_euro_exchange' }, async () => {
            const params = { currencies, date };
            const cacheKey = `get_euro_exchange:${hashParams(params)}`;
            const cached = await cacheGet(cacheKey);
            if (cached) {
                return { content: [{ type: 'text', text: JSON.stringify(cached, null, 2) }] };
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
                    return makeMcpError(`No exchange rate data found for date ${date ?? 'latest'}`, 'SOURCE_UNAVAILABLE');
                }
                return makeMcpError(`Frankfurter API returned ${res.status}`, 'SOURCE_UNAVAILABLE');
            }
            const json = (await res.json());
            const result = {
                base: json.base,
                date: json.date,
                rates: json.rates,
                source: 'European Central Bank via Frankfurter.app',
                retrieved_at: new Date().toISOString(),
            };
            await cacheSet(cacheKey, result, CACHE_TTL);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        });
    });
}
//# sourceMappingURL=euro-exchange.js.map