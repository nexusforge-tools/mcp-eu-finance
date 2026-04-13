import { z } from 'zod';
import { cacheGet, cacheSet, hashParams, withMcpMiddleware, makeMcpError } from '@nexusforge/mcp-core';
const SERVER_NAME = 'nexusforge-eu-finance';
const CACHE_TTL = 86400; // 24 hours — monthly stats
// Eurostat HICP (Harmonised Index of Consumer Prices) — annual rate of change
// Dataset: prc_hicp_manr
const EUROSTAT_BASE = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data';
const EU_COUNTRIES = [
    'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI',
    'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT',
    'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'EU27_2020', 'EA',
];
function parseEurostatResponse(json, countries) {
    const geoIndex = json.dimension.geo.category.index;
    const geoLabel = json.dimension.geo.category.label;
    const timeIndex = json.dimension.time.category.index;
    // Build reverse time index (position → period string)
    const timeByPos = {};
    for (const [period, pos] of Object.entries(timeIndex)) {
        timeByPos[pos] = period;
    }
    // Size array: [coicop, geo, time] — but we filter to TOTAL coicop
    const geoSize = json.size[1];
    const timeSize = json.size[2];
    const results = [];
    for (const country of countries) {
        const geoPos = geoIndex[country];
        if (geoPos === undefined)
            continue;
        // Find the latest non-null value for this country
        for (let t = timeSize - 1; t >= 0; t--) {
            // Index calculation: coicop=0 (TOTAL), geo=geoPos, time=t
            const valueIndex = 0 * geoSize * timeSize + geoPos * timeSize + t;
            const value = json.value[String(valueIndex)];
            if (value !== null && value !== undefined) {
                results.push({
                    country: geoLabel[country] ?? country,
                    period: timeByPos[t] ?? 'unknown',
                    rate: value,
                });
                break;
            }
        }
    }
    return results;
}
export function registerEuInflationTool(server) {
    server.tool('get_eu_inflation', 'Get HICP (Harmonised Index of Consumer Prices) inflation rates for EU countries. Returns the latest annual rate of change (%) per country. Source: Eurostat.', {
        countries: z
            .array(z.string().min(2).max(12).toUpperCase())
            .optional()
            .describe('List of EU country codes (e.g. ["DE", "FR", "ES"]) or "EA" for Eurozone / "EU27_2020" for EU-27. Omit for all EU countries.'),
        periods: z
            .number()
            .int()
            .min(1)
            .max(24)
            .optional()
            .default(1)
            .describe('Number of recent months to return per country (1-24). Default: 1 (latest only).'),
    }, async ({ countries, periods }) => {
        return withMcpMiddleware({ serverName: SERVER_NAME, toolName: 'get_eu_inflation' }, async () => {
            const targetCountries = countries?.length ? countries : [...EU_COUNTRIES];
            const params = { countries: targetCountries, periods };
            const cacheKey = `get_eu_inflation:${hashParams(params)}`;
            const cached = await cacheGet(cacheKey);
            if (cached) {
                return { content: [{ type: 'text', text: JSON.stringify(cached, null, 2) }] };
            }
            const searchParams = new URLSearchParams({
                coicop: 'CP00', // Total (all items)
                unit: 'RCH_A', // Annual rate of change
                geo: targetCountries.join(','),
                lastTimePeriod: String(periods),
                format: 'JSON',
                lang: 'EN',
            });
            const url = `${EUROSTAT_BASE}/prc_hicp_manr?${searchParams}`;
            const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
            if (!res.ok) {
                return makeMcpError(`Eurostat API returned ${res.status} for inflation data`, 'SOURCE_UNAVAILABLE');
            }
            const json = (await res.json());
            const data = parseEurostatResponse(json, targetCountries);
            if (!data.length) {
                return makeMcpError('No inflation data found for the requested countries', 'SOURCE_UNAVAILABLE');
            }
            const result = {
                data,
                unit: 'Annual rate of change (%)',
                source: 'Eurostat — Harmonised Index of Consumer Prices (HICP)',
                retrieved_at: new Date().toISOString(),
            };
            await cacheSet(cacheKey, result, CACHE_TTL);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        });
    });
}
//# sourceMappingURL=eu-inflation.js.map