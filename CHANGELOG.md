# Changelog

All notable changes to `@nexusforgetools/eu-finance` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.4] — 2026-04-17

### Fixed

- Removed @nexusforge/mcp-core workspace dependency — package now fully standalone
- npx mode works without Redis or Supabase

---

## [1.0.3] — 2026-04-17

### Improved

- **Tool descriptions upgraded across all 6 tools** to meet TDQS (Tool Definition Quality Score) standards:
  - Each description now documents the exact return schema (field names, types, value formats)
  - Added structured `USAGE:` section to every tool covering parameter guidance, data lag, limitations, and cross-tool recommendations
  - `get_eu_gdp`: documents `YYYY-Qq` period format, 60-90 day Eurostat lag, guidance per `unit` enum value
  - `get_eu_unemployment`: documents seasonally adjusted data (SA), 30-60 day lag, age group multipliers, non-EU country limitation
  - `compare_eu_economies`: documents nested JSON schema, mixed period formats per indicator, when to prefer over individual tools
  - `get_ecb_rates`: clarifies policy rate vs market rate distinction, `date` semantics (last change date, not today)
  - `get_eu_inflation`: documents HICP vs national CPI difference, EA/EU27_2020 aggregate codes, cross-tool pairing with `get_ecb_rates`
  - `get_euro_exchange`: documents `rates` object semantics (units per EUR), 33 supported currencies, ECB reference rate timing, weekend behavior

---

## [1.0.2] — 2026-04-14

### Fixed

- Exclude `.tsbuildinfo`, test files, and `_core.js` from npm package bundle
- Updated `mcpName` field to `io.github.nexusforge-tools/mcp-eu-finance` for Anthropic registry compliance

---

## [1.0.1] — 2026-04-10

### Added

- `mcpName` field in `package.json` for MCP registry auto-discovery
- Published to Anthropic MCP registry, mcp.so, Smithery, Glama

---

## [1.0.0] — 2026-04-07

### Added

- Initial release: 6 MCP tools — `get_ecb_rates`, `get_euro_exchange`, `get_eu_inflation`, `get_eu_gdp`, `get_eu_unemployment`, `compare_eu_economies`
- Dual transport: stdio (`npx`) and HTTP/SSE (systemd on port 3001)
- Redis cache (TTL: 1h rates, 24h Eurostat data)
- Sources: ECB Statistical Data Warehouse, Frankfurter API, Eurostat SDMX
