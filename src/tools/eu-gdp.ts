import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { cacheGet, cacheSet, hashParams, withMcpMiddleware, makeMcpError } from '../lib/index.js';

const SERVER_NAME = 'nexusforge-eu-finance';
const CACHE_TTL = 86400; // 24 hours

const EUROSTAT_BASE = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data';

interface GdpDataPoint {
  country: string;
  period: string;
  value: number;
  unit: string;
}

interface EuGdpResult {
  data: GdpDataPoint[];
  source: string;
  retrieved_at: string;
}

interface EurostatJsonData {
  value: Record<string, number | null>;
  dimension: {
    geo: { category: { index: Record<string, number>; label: Record<string, string> } };
    time: { category: { index: Record<string, number>; label: Record<string, string> } };
    unit?: { category: { index: Record<string, number>; label: Record<string, string> } };
    na_item?: { category: { label: Record<string, string> } };
  };
  size: number[];
}

export function registerEuGdpTool(server: McpServer): void {
  server.tool(
    'get_eu_gdp',
    'Fetches quarterly GDP data for EU/Eurozone countries from Eurostat (dataset: namq_10_gdp). Returns a JSON object with: `data` (array of objects, each containing `country` as a full name string, `period` in YYYY-Qq format e.g. "2024-Q3", `value` as a number, and `unit` as a string label), `source`, and `retrieved_at` as ISO 8601. Defaults to year-on-year growth rate (%) for EA20, EU27_2020, DE, FR, IT, ES over the last 4 quarters. Data is cached 24 hours. Missing periods are omitted from the array (not returned as null). USAGE: Use unit=CLV_PCH_SM (default) for cross-country growth comparisons. Use unit=CP_MEUR to compare absolute GDP size. Use unit=CLV_PCH_PRE for quarter-on-quarter momentum. Use unit=CLV10_MEUR for real GDP volume excluding price effects. Typical Eurostat data lag is 60-90 days after quarter end — the most recent quarter may be absent. Request quarters=8 or more for recession analysis or multi-year trend charts.',
    {
      countries: z
        .array(z.string().min(2).max(12).toUpperCase())
        .optional()
        .describe('List of EU country codes (e.g. ["DE", "FR"]). Use "EA20" for Eurozone, "EU27_2020" for EU-27.'),
      unit: z
        .enum(['CLV_PCH_PRE', 'CLV_PCH_SM', 'CP_MEUR', 'CLV10_MEUR'])
        .optional()
        .default('CLV_PCH_SM')
        .describe(
          'Unit: CLV_PCH_SM = growth rate vs same quarter previous year (default), CLV_PCH_PRE = growth rate vs previous quarter, CP_MEUR = current prices in million EUR, CLV10_MEUR = chain-linked volumes in million EUR',
        ),
      quarters: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .default(4)
        .describe('Number of recent quarters to return (1-20). Default: 4 (1 year).'),
    },
    async ({ countries, unit, quarters }) => {
      return withMcpMiddleware({ serverName: SERVER_NAME, toolName: 'get_eu_gdp' }, async () => {
        const targetCountries = countries?.length ? countries : ['EA20', 'EU27_2020', 'DE', 'FR', 'IT', 'ES'];
        const params = { countries: targetCountries, unit, quarters };
        const cacheKey = `get_eu_gdp:${hashParams(params as Record<string, unknown>)}`;

        const cached = await cacheGet<EuGdpResult>(cacheKey);
        if (cached) {
          return { content: [{ type: 'text' as const, text: JSON.stringify(cached, null, 2) }] };
        }

        const searchParams = new URLSearchParams({
          na_item: 'B1GQ',       // GDP at market prices
          unit: unit ?? 'CLV_PCH_SM',
          lastTimePeriod: String(quarters ?? 4),
          format: 'JSON',
          lang: 'EN',
        });
        for (const country of targetCountries) {
          searchParams.append('geo', country);
        }

        const url = `${EUROSTAT_BASE}/namq_10_gdp?${searchParams}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });

        if (!res.ok) {
          return makeMcpError(
            `Eurostat API returned ${res.status} for GDP data`,
            'SOURCE_UNAVAILABLE',
          );
        }

        const json = (await res.json()) as EurostatJsonData;
        const unitLabel = json.dimension.unit?.category?.label[unit ?? 'CLV_PCH_SM'] ?? unit;
        const data = parseGdpResponse(json, targetCountries, unitLabel ?? '');

        if (!data.length) {
          return makeMcpError('No GDP data found for the requested countries', 'SOURCE_UNAVAILABLE');
        }

        const result: EuGdpResult = {
          data,
          source: 'Eurostat — National Accounts (namq_10_gdp)',
          retrieved_at: new Date().toISOString(),
        };

        await cacheSet(cacheKey, result, CACHE_TTL);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      });
    },
  );
}

function parseGdpResponse(json: EurostatJsonData, countries: string[], unitLabel: string): GdpDataPoint[] {
  const geoIndex = json.dimension.geo.category.index;
  const geoLabel = json.dimension.geo.category.label;
  const timeIndex = json.dimension.time.category.index;
  const timeByPos: Record<number, string> = {};
  for (const [period, pos] of Object.entries(timeIndex)) {
    timeByPos[pos] = period;
  }

  const geoSize = json.size[json.size.length - 2];
  const timeSize = json.size[json.size.length - 1];
  const results: GdpDataPoint[] = [];

  for (const country of countries) {
    const geoPos = geoIndex[country];
    if (geoPos === undefined) continue;

    for (let t = timeSize - 1; t >= 0; t--) {
      const valueIndex = geoPos * timeSize + t;
      const value = json.value[String(valueIndex)];
      if (value !== null && value !== undefined) {
        results.push({
          country: geoLabel[country] ?? country,
          period: timeByPos[t] ?? 'unknown',
          value,
          unit: unitLabel,
        });
      }
    }
  }

  return results;
}
