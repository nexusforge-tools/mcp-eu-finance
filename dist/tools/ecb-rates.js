import { cacheGet, cacheSet, hashParams, withMcpMiddleware, makeMcpError } from '@nexusforge/mcp-core';
const SERVER_NAME = 'nexusforge-eu-finance';
const CACHE_TTL = 3600; // 1 hour — ECB rates change infrequently
// ECB SDW REST API: Key interest rates dataset (FM)
// Codes: DFR = Deposit Facility Rate, MRR_FR = Main Refinancing Rate, MLF = Marginal Lending Facility
const ECB_SERIES = {
    deposit_facility: 'FM/B.U2.EUR.4F.KR.DFR.LEV',
    main_refinancing: 'FM/B.U2.EUR.4F.KR.MRR_FR.LEV',
    marginal_lending: 'FM/B.U2.EUR.4F.KR.MLF.LEV',
};
async function fetchEcbSeries(seriesKey) {
    const url = `https://data-api.ecb.europa.eu/service/data/${seriesKey}?format=jsondata&detail=dataonly&lastNObservations=1`;
    const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok)
        return null;
    // ECB returns SDMX-JSON format
    const json = (await res.json());
    const series = json.dataSets?.[0]?.series?.['0:0:0:0:0:0:0'];
    if (!series)
        return null;
    const observations = series.observations;
    const obsDimension = json.structure?.dimensions?.observation?.[0]?.values;
    if (!obsDimension)
        return null;
    // Get the last observation (we requested lastNObservations=1, so index is "0")
    const lastIdx = Object.keys(observations).sort().pop();
    if (lastIdx === undefined)
        return null;
    const value = observations[lastIdx]?.[0];
    const date = obsDimension[parseInt(lastIdx, 10)]?.id;
    if (value === null || value === undefined || !date)
        return null;
    return { date, value };
}
export function registerEcbRatesTool(server) {
    server.tool('get_ecb_rates', 'Get the current ECB (European Central Bank) key interest rates: deposit facility rate, main refinancing rate, and marginal lending facility rate.', {}, async () => {
        return withMcpMiddleware({ serverName: SERVER_NAME, toolName: 'get_ecb_rates' }, async () => {
            const cacheKey = `get_ecb_rates:${hashParams({})}`;
            const cached = await cacheGet(cacheKey);
            if (cached) {
                return { content: [{ type: 'text', text: JSON.stringify(cached, null, 2) }] };
            }
            const [deposit, main, marginal] = await Promise.all([
                fetchEcbSeries(ECB_SERIES.deposit_facility),
                fetchEcbSeries(ECB_SERIES.main_refinancing),
                fetchEcbSeries(ECB_SERIES.marginal_lending),
            ]);
            if (!deposit || !main || !marginal) {
                return makeMcpError('Failed to fetch ECB rates from data-api.ecb.europa.eu', 'SOURCE_UNAVAILABLE');
            }
            const result = {
                rates: {
                    deposit_facility: deposit,
                    main_refinancing: main,
                    marginal_lending: marginal,
                },
                source: 'European Central Bank Statistical Data Warehouse',
                retrieved_at: new Date().toISOString(),
            };
            await cacheSet(cacheKey, result, CACHE_TTL);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        });
    });
}
//# sourceMappingURL=ecb-rates.js.map