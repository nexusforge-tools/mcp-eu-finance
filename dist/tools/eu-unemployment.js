import { z } from 'zod';
import { cacheGet, cacheSet, hashParams, withMcpMiddleware, makeMcpError } from '@nexusforge/mcp-core';
const SERVER_NAME = 'nexusforge-eu-finance';
const CACHE_TTL = 86400; // 24 hours
const EUROSTAT_BASE = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data';
export function registerEuUnemploymentTool(server) {
    server.tool('get_eu_unemployment', 'Get monthly unemployment rates for EU countries. Seasonally adjusted, as % of active population. Source: Eurostat.', {
        countries: z
            .array(z.string().min(2).max(12).toUpperCase())
            .optional()
            .describe('List of EU country codes (e.g. ["DE", "FR", "ES"]). Use "EA20" for Eurozone. Omit for main EU countries.'),
        months: z
            .number()
            .int()
            .min(1)
            .max(24)
            .optional()
            .default(3)
            .describe('Number of recent months to return (1-24). Default: 3.'),
        age: z
            .enum(['TOTAL', 'Y15-74', 'Y15-24', 'Y25-74'])
            .optional()
            .default('TOTAL')
            .describe('Age group: TOTAL (all ages), Y15-24 (youth), Y25-74 (adults). Default: TOTAL.'),
    }, async ({ countries, months, age }) => {
        return withMcpMiddleware({ serverName: SERVER_NAME, toolName: 'get_eu_unemployment' }, async () => {
            const targetCountries = countries?.length
                ? countries
                : ['EA20', 'EU27_2020', 'DE', 'FR', 'IT', 'ES', 'PL', 'NL'];
            const params = { countries: targetCountries, months, age };
            const cacheKey = `get_eu_unemployment:${hashParams(params)}`;
            const cached = await cacheGet(cacheKey);
            if (cached) {
                return { content: [{ type: 'text', text: JSON.stringify(cached, null, 2) }] };
            }
            const searchParams = new URLSearchParams({
                sex: 'T', // Total (both sexes)
                age: age ?? 'TOTAL',
                unit: 'PC_ACT', // Percentage of active population
                s_adj: 'SA', // Seasonally adjusted
                geo: targetCountries.join(','),
                lastTimePeriod: String(months),
                format: 'JSON',
                lang: 'EN',
            });
            const url = `${EUROSTAT_BASE}/une_rt_m?${searchParams}`;
            const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
            if (!res.ok) {
                return makeMcpError(`Eurostat API returned ${res.status} for unemployment data`, 'SOURCE_UNAVAILABLE');
            }
            const json = (await res.json());
            const data = parseUnemploymentResponse(json, targetCountries, age ?? 'TOTAL');
            if (!data.length) {
                return makeMcpError('No unemployment data found for the requested countries', 'SOURCE_UNAVAILABLE');
            }
            const result = {
                data,
                unit: 'Percentage of active population (%)',
                source: 'Eurostat — Unemployment by sex and age — monthly data (une_rt_m)',
                retrieved_at: new Date().toISOString(),
            };
            await cacheSet(cacheKey, result, CACHE_TTL);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        });
    });
}
function parseUnemploymentResponse(json, countries, ageGroup) {
    const geoIndex = json.dimension.geo.category.index;
    const geoLabel = json.dimension.geo.category.label;
    const timeIndex = json.dimension.time.category.index;
    const timeByPos = {};
    for (const [period, pos] of Object.entries(timeIndex)) {
        timeByPos[pos] = period;
    }
    const geoSize = json.size[json.size.length - 2];
    const timeSize = json.size[json.size.length - 1];
    const results = [];
    for (const country of countries) {
        const geoPos = geoIndex[country];
        if (geoPos === undefined)
            continue;
        for (let t = timeSize - 1; t >= 0; t--) {
            const valueIndex = geoPos * timeSize + t;
            const value = json.value[String(valueIndex)];
            if (value !== null && value !== undefined) {
                results.push({
                    country: geoLabel[country] ?? country,
                    period: timeByPos[t] ?? 'unknown',
                    rate: value,
                    age_group: ageGroup,
                    sex: 'Total',
                });
            }
        }
    }
    return results;
}
//# sourceMappingURL=eu-unemployment.js.map