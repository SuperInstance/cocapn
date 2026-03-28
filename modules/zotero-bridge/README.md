# zotero-bridge

Syncs your Zotero library to `wiki/references/` — one Markdown file per year, with an index.

## Setup

1. Create `secrets/zotero.yml`:
   ```yaml
   ZOTERO_API_KEY: pplx-...
   ZOTERO_USER_ID: 1234567
   ```
2. Run sync manually or via cron:
   ```bash
   ZOTERO_API_KEY=... ZOTERO_USER_ID=... node modules/zotero-bridge/sync.js
   ```

## What it writes

- `wiki/references/README.md` — index by year
- `wiki/references/{year}.md` — one entry per paper with authors, DOI, URL

## Install

```bash
cocapn-bridge module add https://github.com/cocapn/zotero-bridge
```
