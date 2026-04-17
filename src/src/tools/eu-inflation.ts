import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { cacheGet, cacheSet, hashParams, withMcpMiddleware, makeMcpError } from '../lib/index.js';

const SERVER_NAME = 'nexusforge-eu-finance';
const CACHE_TTL = 86400; // 24 hours — monthly stats

// Eurostat HICP (Harmonised Index of Consumer Prices) — annual rate of change
// Dataset: prc_hicp_manr
const EUROSTAT_BASE = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data';

const EU_COUNTRIES = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI',
  'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT',
  'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'EU27_2020', 'EA',
] as const;

type CountryCode = (typeof EU_COUNTRIES)[number];

interface InflationDataPoint {
  country: string;
  period: string;
  rate: number; // annual change %
}

interface EuInflationResult {
  data: InflationDataPoint[];
  unit: 'Annual rate of change (%)';
  source: string;
  retrieved_at: string;
}

interface EurostatJsonData {
  value: Record<string, number | null>;
  dimension: {
    geo: { category: { index: Record<string, number>; label: Record<string, string> } };
    time: { category: { index: Record<string, number>; label: Record<string, string> } };
  };
  size: number[];
}

function parseEurostatResponse(json: EurostatJsonData, countries: string[]): InflationDataPoint[] {
  const geoIndex = json.dimension.geo.category.index;
  const geoLabel = json.dimension.geo.category.label;
  const timeIndex = json.dimension.time.category.index;

  // Build reverse time index (position → period string)
  const timeByPos: Record<number, string> = {};
  for (const [period, pos] of Object.entries(timeIndex)) {
    timeByPos[pos] = period;
  }

  // Size array: [coicop, geo, time] — but we filter to TOTAL coicop
  const geoSize = json.size[1];
  const timeSize = json.size[2];

  const results: InflationDataPoint[] = [];

  for (const country of countries) {
    const geoPos = geoIndex[country];
    if (geoPos === undefined) continue;

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

export function registerEuInflationTool(server: McpServer): void {
  server.tool(
    'get_eu_inflation',
    'Fetches HICP (Harmonised Index of Consumer Prices) annual inflation rates for EU countries from Eurostat (dataset: prc_hicp_manr). Returns a JSON object with: `data` (array of objects containing `country` as full name, `period` in YYYY-MM format, and `rate` as a numeric annual percentage change), `unit` ("Annual rate of change (%)"), `source`, and `retrieved_at` as ISO 8601. Defaults to the latest single month for all 29 EU members and aggregates. Data is cached 24 hours. USAGE: HICP is the EU-harmonised inflation standard used by the ECB for monetary policy — use it (not national CPI) for cross-country comparisons. Use country code EA for the Eurozone aggregate or EU27_2020 for the full EU-27 aggregate. Typical data lag is 30-45 days after the reference month. Set periods=12 to retrieve a 12-month trend. Pair with get_ecb_rates to contextualize how the ECB policy rate relates to current inflation.',
    {
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
    },
    async ({ countries, periods }) => {
      return withMcpMiddleware({ serverName: SERVER_NAME, toolName: 'get_eu_inflation' }, async () => {
        const targetCountries = countries?.length ? countries : [...EU_COUNTRIES];
        const params = { countries: targetCountries, periods };
        const cacheKey = `get_eu_inflation:${hashParams(params as Record<string, unknown>)}`;

        const cached = await cacheGet<EuInflationResult>(cacheKey);
        if (cached) {
          return { content: [{ type: 'text' as const, text: JSON.stringify(cached, null, 2) }] };
        }

        const searchParams = new URLSearchParams({
          coicop: 'CP00', // Total (all items)
          unit: 'RCH_A',  // Annual rate of change
          lastTimePeriod: String(periods ?? 1),
          format: 'JSON',
          lang: 'EN',
        });
        for (const country of targetCountries) {
          searchParams.append('geo', country);
        }

        const url = `${EUROSTAT_BASE}/prc_hicp_manr?${searchParams}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });

        if (!res.ok) {
          return makeMcpError(
            `Eurostat API returned ${res.status} for inflation data`,
            'SOURCE_UNAVAILABLE',
          );
        }

        const json = (await res.json()) as EurostatJsonData;
        const data = parseEurostatResponse(json, targetCountries);

        if (!data.length) {
          return makeMcpError('No inflation data found for the requested countries', 'SOURCE_UNAVAILABLE');
        }

        const result: EuInflationResult = {
          data,
          unit: 'Annual rate of change (%)',
          source: 'Eurostat — Harmonised Index of Consumer Prices (HICP)',
          retrieved_at: new Date().toISOString(),
        };

        await cacheSet(cacheKey, result, CACHE_TTL);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      });
    },
  );
}
