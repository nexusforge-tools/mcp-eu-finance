# @nexusforgetools/eu-finance

> European financial data for AI agents — ECB rates, inflation, GDP, unemployment. One MCP server, zero API keys needed.

[![npm version](https://img.shields.io/npm/v/@nexusforgetools/eu-finance)](https://www.npmjs.com/package/@nexusforgetools/eu-finance)
[![npm downloads](https://img.shields.io/npm/dm/@nexusforgetools/eu-finance)](https://www.npmjs.com/package/@nexusforgetools/eu-finance)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Glama](https://glama.ai/mcp/servers/nexusforge-tools/mcp-eu-finance/badges/score.svg)](https://glama.ai/mcp/servers/nexusforge-tools/mcp-eu-finance)

---

## Quick Start (30 seconds)

### Claude Code

```bash
claude mcp add eu-finance -- npx -y @nexusforgetools/eu-finance
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "eu-finance": {
      "command": "npx",
      "args": ["-y", "@nexusforgetools/eu-finance"]
    }
  }
}
```

### Cursor / Windsurf

Same config — add it under `mcpServers` in your MCP settings file.

---

## What You Can Do

*"What's the current ECB deposit facility rate and how does it compare to last year?"*

*"Compare inflation across Germany, France, Spain, and Italy — who's closest to the 2% target?"*

*"Show me Q4 GDP growth for the Eurozone vs the EU-27 average."*

*"What's the EUR/USD rate today? What was it on 2024-01-15?"*

---

## Tools

| Tool | Description | Source |
|------|-------------|--------|
| `get_ecb_rates` | ECB key interest rates: deposit facility, main refinancing, marginal lending | ECB SDW |
| `get_euro_exchange` | EUR exchange rates vs any currency — latest or historical by date | ECB via Frankfurter.app |
| `get_eu_inflation` | HICP inflation rates for all EU countries — annual % change | Eurostat |
| `get_eu_gdp` | Quarterly GDP data — growth rate or absolute value, all EU countries | Eurostat |
| `get_eu_unemployment` | Monthly unemployment rates — seasonally adjusted, by age group | Eurostat |
| `compare_eu_economies` | Side-by-side snapshot: inflation + GDP + unemployment for 2-10 countries | Eurostat |

---

## Free vs Pro

| Feature | Free | Pro |
|---------|------|-----|
| API calls / day | 100 | Unlimited |
| Data freshness | Cached (1h ECB / 24h Eurostat) | Same (upstream limits) |
| Historical depth | Latest only | Up to 20 periods |
| Servers included | eu-finance | All NexusForge servers |
| Support | Community | Priority email |

**Get Pro: [https://nexusforge.tools/pricing](https://nexusforge.tools/pricing)**

---

## More NexusForge Servers

- **@nexusforgetools/web-enrichment** — Scraping & data enrichment *(coming soon)*
- **@nexusforgetools/business-intel** — Market intelligence *(coming soon)*

---

## Links

- **Website**: [nexusforge.tools](https://nexusforge.tools)
- **Docs**: [nexusforge.tools/docs](https://nexusforge.tools/docs)
- **Discord**: [nexusforge.tools/discord](https://nexusforge.tools/discord)
- **Issues**: [github.com/nexusforge-tools/mcp-eu-finance/issues](https://github.com/nexusforge-tools/mcp-eu-finance/issues)
