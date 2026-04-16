import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { cacheGet, cacheSet, hashParams } from '../lib/cache.js';
import { withMcpMiddleware, makeMcpError } from '../lib/middleware.js';

const SERVER_NAME = 'nexusforge-eu-finance';
const CACHE_TTL = 86400; // 24 hours

const EUROSTAT_BASE = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data';

interface CountrySnapshot {
  country: string;
  country_code: string;
  inflation?: { rate: number; period: string } | null;
  gdp_growth?: { rate: number; period: string } | null;
  unemployment?: { rate: number; period: string } | null;
}

interface CompareEconomiesResult {
  countries: CountrySnapshot[];
  source: string;
  retrieved_at: string;
}

async function fetchLatestEurostatValue(
  dataset: string,
  params: Record<string, string>,
  countries: string[],
): Promise<Record<string, { value: number; period: string }>> {
  const searchParams = new URLSearchParams({
    ...params,
    geo: countries.join(','),
    lastTimePeriod: '1',
    format: 'JSON',
    lang: 'EN',
  });

  const res = await fetch(`${EUROSTAT_BASE}/${dataset}?${searchParams}`, {
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) return {};

  const json = (await res.json()) as {
    value: Record<string, number | null>;
    dimension: {
      geo: { category: { index: Record<string, number>; label: Record<string, string> } };
      time: { category: { index: Record<string, number> } };
    };
    size: number[];
  };

  const geoIndex = json.dimension.geo.category.index;
  const timeIndex = json.dimension.time.category.index;
  const timeByPos: Record<number, string> = {};
  for (const [period, pos] of Object.entries(timeIndex)) {
    timeByPos[pos] = period;
  }

  const timeSize = json.size[json.size.length - 1];
  const result: Record<string, { value: number; period: string }> = {};

  for (const country of countries) {
    const geoPos = geoIndex[country];
    if (geoPos === undefined) continue;

    for (let t = timeSize - 1; t >= 0; t--) {
      const valueIndex = geoPos * timeSize + t;
      const value = json.value[String(valueIndex)];
      if (value !== null && value !== undefined) {
        result[country] = { value, period: timeByPos[t] ?? 'unknown' };
        break;
      }
    }
  }

  return result;
}

export function registerCompareEconomiesTool(server: McpServer): void {
  server.tool(
    'compare_eu_economies',
    'Compare key economic indicators (inflation, GDP growth, unemployment) across multiple EU countries side by side. Returns a unified snapshot per country.',
    {
      countries: z
        .array(z.string().min(2).max(12).toUpperCase())
        .min(2)
        .max(10)
        .describe('2-10 EU country codes to compare (e.g. ["DE", "FR", "ES", "IT"]). Use "EA20" for Eurozone.'),
      indicators: z
        .array(z.enum(['inflation', 'gdp_growth', 'unemployment']))
        .optional()
        .default(['inflation', 'gdp_growth', 'unemployment'])
        .describe('Which indicators to include. Default: all three.'),
    },
    async ({ countries, indicators }) => {
      return withMcpMiddleware({ serverName: SERVER_NAME, toolName: 'compare_eu_economies' }, async () => {
        const params = { countries, indicators };
        const cacheKey = `compare_eu_economies:${hashParams(params as Record<string, unknown>)}`;

        const cached = await cacheGet<CompareEconomiesResult>(cacheKey);
        if (cached) {
          return { content: [{ type: 'text' as const, text: JSON.stringify(cached, null, 2) }] };
        }

        const activeIndicators = indicators ?? ['inflation', 'gdp_growth', 'unemployment'];

        type IndicatorMap = Record<string, { value: number; period: string }>;
        const empty: IndicatorMap = {};

        // Fetch all requested indicators in parallel
        const [inflationData, gdpData, unemploymentData] = await Promise.all([
          activeIndicators.includes('inflation')
            ? fetchLatestEurostatValue('prc_hicp_manr', { coicop: 'CP00', unit: 'RCH_A' }, countries)
            : Promise.resolve(empty),
          activeIndicators.includes('gdp_growth')
            ? fetchLatestEurostatValue('namq_10_gdp', { na_item: 'B1GQ', unit: 'CLV_PCH_SM' }, countries)
            : Promise.resolve(empty),
          activeIndicators.includes('unemployment')
            ? fetchLatestEurostatValue('une_rt_m', { sex: 'T', age: 'TOTAL', unit: 'PC_ACT', s_adj: 'SA' }, countries)
            : Promise.resolve(empty),
        ]);

        const snapshots: CountrySnapshot[] = countries.map((code) => ({
          country: countryName(code),
          country_code: code,
          inflation: inflationData[code]
            ? { rate: inflationData[code].value, period: inflationData[code].period }
            : null,
          gdp_growth: gdpData[code]
            ? { rate: gdpData[code].value, period: gdpData[code].period }
            : null,
          unemployment: unemploymentData[code]
            ? { rate: unemploymentData[code].value, period: unemploymentData[code].period }
            : null,
        }));

        if (snapshots.every((s) => !s.inflation && !s.gdp_growth && !s.unemployment)) {
          return makeMcpError('No economic data found for the requested countries', 'SOURCE_UNAVAILABLE');
        }

        const result: CompareEconomiesResult = {
          countries: snapshots,
          source: 'Eurostat (HICP, namq_10_gdp, une_rt_m)',
          retrieved_at: new Date().toISOString(),
        };

        await cacheSet(cacheKey, result, CACHE_TTL);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      });
    },
  );
}

const COUNTRY_NAMES: Record<string, string> = {
  AT: 'Austria', BE: 'Belgium', BG: 'Bulgaria', CY: 'Cyprus',
  CZ: 'Czechia', DE: 'Germany', DK: 'Denmark', EE: 'Estonia',
  ES: 'Spain', FI: 'Finland', FR: 'France', GR: 'Greece',
  HR: 'Croatia', HU: 'Hungary', IE: 'Ireland', IT: 'Italy',
  LT: 'Lithuania', LU: 'Luxembourg', LV: 'Latvia', MT: 'Malta',
  NL: 'Netherlands', PL: 'Poland', PT: 'Portugal', RO: 'Romania',
  SE: 'Sweden', SI: 'Slovenia', SK: 'Slovakia',
  EA20: 'Eurozone (EA20)', EA: 'Eurozone', EU27_2020: 'European Union (EU-27)',
};

function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}
