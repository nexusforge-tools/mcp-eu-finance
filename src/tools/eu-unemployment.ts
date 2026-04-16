import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { cacheGet, cacheSet, hashParams } from '../lib/cache.js';
import { withMcpMiddleware, makeMcpError } from '../lib/middleware.js';

const SERVER_NAME = 'nexusforge-eu-finance';
const CACHE_TTL = 86400; // 24 hours

const EUROSTAT_BASE = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data';

interface UnemploymentDataPoint {
  country: string;
  period: string;
  rate: number; // % of active population
  age_group: string;
  sex: string;
}

interface EuUnemploymentResult {
  data: UnemploymentDataPoint[];
  unit: 'Percentage of active population (%)';
  source: string;
  retrieved_at: string;
}

interface EurostatJsonData {
  value: Record<string, number | null>;
  dimension: {
    geo: { category: { index: Record<string, number>; label: Record<string, string> } };
    time: { category: { index: Record<string, number>; label: Record<string, string> } };
    age?: { category: { label: Record<string, string> } };
    sex?: { category: { label: Record<string, string> } };
  };
  size: number[];
}

export function registerEuUnemploymentTool(server: McpServer): void {
  server.tool(
    'get_eu_unemployment',
    'Get monthly unemployment rates for EU countries from Eurostat, seasonally adjusted, as a percentage of the active population. Use this tool to monitor labor market conditions, compare employment across EU members, or track youth unemployment trends. Default returns the latest 3 months for the Eurozone (EA20) and major EU countries. Use age="Y15-24" for youth unemployment (15-24 year olds) or age="Y25-74" for adult unemployment. Data is cached 24 hours and updated monthly by Eurostat. Returns an array of data points with country code, period (YYYY-MM), and unemployment rate.',
    {
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
    },
    async ({ countries, months, age }) => {
      return withMcpMiddleware({ serverName: SERVER_NAME, toolName: 'get_eu_unemployment' }, async () => {
        const targetCountries = countries?.length
          ? countries
          : ['EA20', 'EU27_2020', 'DE', 'FR', 'IT', 'ES', 'PL', 'NL'];

        const params = { countries: targetCountries, months, age };
        const cacheKey = `get_eu_unemployment:${hashParams(params as Record<string, unknown>)}`;

        const cached = await cacheGet<EuUnemploymentResult>(cacheKey);
        if (cached) {
          return { content: [{ type: 'text' as const, text: JSON.stringify(cached, null, 2) }] };
        }

        const searchParams = new URLSearchParams({
          sex: 'T',        // Total (both sexes)
          age: age ?? 'TOTAL',
          unit: 'PC_ACT', // Percentage of active population
          s_adj: 'SA',    // Seasonally adjusted
          lastTimePeriod: String(months ?? 3),
          format: 'JSON',
          lang: 'EN',
        });
        for (const country of targetCountries) {
          searchParams.append('geo', country);
        }

        const url = `${EUROSTAT_BASE}/une_rt_m?${searchParams}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });

        if (!res.ok) {
          return makeMcpError(
            `Eurostat API returned ${res.status} for unemployment data`,
            'SOURCE_UNAVAILABLE',
          );
        }

        const json = (await res.json()) as EurostatJsonData;
        const data = parseUnemploymentResponse(json, targetCountries, age ?? 'TOTAL');

        if (!data.length) {
          return makeMcpError('No unemployment data found for the requested countries', 'SOURCE_UNAVAILABLE');
        }

        const result: EuUnemploymentResult = {
          data,
          unit: 'Percentage of active population (%)',
          source: 'Eurostat — Unemployment by sex and age — monthly data (une_rt_m)',
          retrieved_at: new Date().toISOString(),
        };

        await cacheSet(cacheKey, result, CACHE_TTL);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      });
    },
  );
}

function parseUnemploymentResponse(
  json: EurostatJsonData,
  countries: string[],
  ageGroup: string,
): UnemploymentDataPoint[] {
  const geoIndex = json.dimension.geo.category.index;
  const geoLabel = json.dimension.geo.category.label;
  const timeIndex = json.dimension.time.category.index;

  const timeByPos: Record<number, string> = {};
  for (const [period, pos] of Object.entries(timeIndex)) {
    timeByPos[pos] = period;
  }

  const geoSize = json.size[json.size.length - 2];
  const timeSize = json.size[json.size.length - 1];
  const results: UnemploymentDataPoint[] = [];

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
          rate: value,
          age_group: ageGroup,
          sex: 'Total',
        });
      }
    }
  }

  return results;
}
