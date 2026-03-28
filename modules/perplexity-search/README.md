# perplexity-search

Web search MCP tool powered by Perplexity AI. Exposes `search` and `deep_search` tools to any agent via MCP.

## Setup

1. Get a [Perplexity API key](https://www.perplexity.ai/settings/api)
2. Add to `secrets/perplexity.yml`:
   ```yaml
   PERPLEXITY_API_KEY: pplx-...
   ```

## Tools

| Tool | Description |
|---|---|
| `search(query, recency?)` | Fast web search with citations |
| `deep_search(query)` | In-depth research via sonar-pro |

## Install

```bash
cocapn-bridge module add https://github.com/cocapn/perplexity-search
```
