import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { cacheGet, cacheSet, hashParams } from '../lib/cache.js';
import { withMcpMiddleware, makeMcpError } from '../lib/middleware.js';

const SERVER_NAME = 'nexusforge-eu-finance';
const CACHE_TTL = 3600; // 1 hour — ECB rates change infrequently

// ECB SDW REST API: Key interest rates dataset (FM)
// Codes: DFR = Deposit Facility Rate, MRR_FR = Main Refinancing Rate, MLF = Marginal Lending Facility
const ECB_SERIES: Record<string, string> = {
  deposit_facility: 'FM/B.U2.EUR.4F.KR.DFR.LEV',
  main_refinancing: 'FM/B.U2.EUR.4F.KR.MRR_FR.LEV',
  marginal_lending: 'FM/B.U2.EUR.4F.KR.MLF.LEV',
};

interface EcbObservation {
  date: string;
  value: number;
}

interface EcbRatesResult {
  rates: {
    deposit_facility: EcbObservation;
    main_refinancing: EcbObservation;
    marginal_lending: EcbObservation;
  };
  source: string;
  retrieved_at: string;
}

async function fetchEcbSeries(seriesKey: string): Promise<EcbObservation | null> {
  const url = `https://data-api.ecb.europa.eu/service/data/${seriesKey}?format=jsondata&detail=dataonly&lastNObservations=1`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) return null;

  // ECB returns SDMX-JSON format
  const json = (await res.json()) as {
    dataSets: Array<{
      series: Record<string, { observations: Record<string, [number | null]> }>;
    }>;
    structure: {
      dimensions: {
        observation: Array<{ values: Array<{ id: string }> }>;
      };
    };
  };

  const series = json.dataSets?.[0]?.series?.['0:0:0:0:0:0:0'];
  if (!series) return null;

  const observations = series.observations;
  const obsDimension = json.structure?.dimensions?.observation?.[0]?.values;
  if (!obsDimension) return null;

  // Get the last observation (we requested lastNObservations=1, so index is "0")
  const lastIdx = Object.keys(observations).sort().pop();
  if (lastIdx === undefined) return null;

  const value = observations[lastIdx]?.[0];
  const date = obsDimension[parseInt(lastIdx, 10)]?.id;

  if (value === null || value === undefined || !date) return null;

  return { date, value };
}

export function registerEcbRatesTool(server: McpServer): void {
  server.tool(
    'get_ecb_rates',
    'Get the current ECB (European Central Bank) key interest rates: deposit facility rate, main refinancing rate, and marginal lending facility rate.',
    {},
    async () => {
      return withMcpMiddleware({ serverName: SERVER_NAME, toolName: 'get_ecb_rates' }, async () => {
        const cacheKey = `get_ecb_rates:${hashParams({})}`;
        const cached = await cacheGet<EcbRatesResult>(cacheKey);
        if (cached) {
          return { content: [{ type: 'text' as const, text: JSON.stringify(cached, null, 2) }] };
        }

        const [deposit, main, marginal] = await Promise.all([
          fetchEcbSeries(ECB_SERIES.deposit_facility),
          fetchEcbSeries(ECB_SERIES.main_refinancing),
          fetchEcbSeries(ECB_SERIES.marginal_lending),
        ]);

        if (!deposit || !main || !marginal) {
          return makeMcpError(
            'Failed to fetch ECB rates from data-api.ecb.europa.eu',
            'SOURCE_UNAVAILABLE',
          );
        }

        const result: EcbRatesResult = {
          rates: {
            deposit_facility: deposit,
            main_refinancing: main,
            marginal_lending: marginal,
          },
          source: 'European Central Bank Statistical Data Warehouse',
          retrieved_at: new Date().toISOString(),
        };

        await cacheSet(cacheKey, result, CACHE_TTL);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      });
    },
  );
}
