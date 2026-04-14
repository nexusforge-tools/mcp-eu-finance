<div align="center">
  <img src="assets/logo.svg" alt="NexusForge" width="80" />

  # NexusForge EU Finance

  **European financial data for AI agents**<br/>
  ECB rates · Eurostat inflation · GDP · Unemployment · Zero API key needed

  [![npm version](https://img.shields.io/npm/v/@nexusforgetools/eu-finance?style=flat-square)](https://www.npmjs.com/package/@nexusforgetools/eu-finance)
  [![npm downloads](https://img.shields.io/npm/dm/@nexusforgetools/eu-finance?style=flat-square)](https://www.npmjs.com/package/@nexusforgetools/eu-finance)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
  [![Glama](https://glama.ai/mcp/servers/nexusforge-tools/mcp-eu-finance/badges/score.svg)](https://glama.ai/mcp/servers/nexusforge-tools/mcp-eu-finance)

</div>

---

## Quick Start

**Claude Code** — one command:
```bash
claude mcp add eu-finance -- npx -y @nexusforgetools/eu-finance
```

**Claude Desktop / Cursor / Windsurf** — add to your MCP config:
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

---

## What You Can Ask

> *"What's the current ECB deposit facility rate and how does it compare to last year?"*

> *"Compare inflation across Germany, France, Spain, and Italy — who's closest to the 2% target?"*

> *"Show me Q4 GDP growth for the Eurozone vs the EU-27 average."*

> *"What's the EUR/USD rate today? What was it on 2024-01-15?"*

---

## In Action

![ECB rates in Claude](https://raw.githubusercontent.com/nexusforge-tools/mcp-eu-finance/main/docs/screenshot-ecb-rates.png)

![EU inflation comparison](https://raw.githubusercontent.com/nexusforge-tools/mcp-eu-finance/main/docs/screenshot-inflation.png)

---

## Tools

| Tool | Description | Source |
|------|-------------|--------|
| `get_ecb_rates` | ECB key interest rates: deposit facility, main refinancing, marginal lending | ECB SDW |
| `get_euro_exchange` | EUR exchange rates vs any currency — latest or historical by date | ECB / Frankfurter |
| `get_eu_inflation` | HICP inflation rates for all EU countries — annual % change | Eurostat |
| `get_eu_gdp` | Quarterly GDP data — growth rate or absolute value, all EU countries | Eurostat |
| `get_eu_unemployment` | Monthly unemployment rates — seasonally adjusted, by age group | Eurostat |
| `compare_eu_economies` | Side-by-side snapshot: inflation + GDP + unemployment for 2-10 countries | Eurostat |

---

## Free vs Pro

eu-finance is free during beta. Pro is coming in Month 2 with higher rate limits and all NexusForge servers bundled.

→ **[nexusforge.tools](https://nexusforge.tools)**

---

## More NexusForge Servers

| Package | Description | Status |
|---------|-------------|--------|
| `@nexusforgetools/web-enrichment` | Scraping & structured data enrichment | Coming soon |
| `@nexusforgetools/business-intel` | Market sizing, competitors, trends | Coming soon |

---

<div align="center">
  <a href="https://nexusforge.tools">nexusforge.tools</a> ·
  <a href="https://github.com/nexusforge-tools/mcp-eu-finance/issues">Issues</a>
</div>
