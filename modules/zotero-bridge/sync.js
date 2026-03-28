#!/usr/bin/env node
/**
 * zotero-bridge sync — fetches Zotero library and writes to wiki/references/
 *
 * Usage:
 *   node sync.js [--collection <key>]
 *
 * Env:
 *   ZOTERO_API_KEY   — personal API key from zotero.org/settings/keys
 *   ZOTERO_USER_ID   — numeric user ID from zotero.org/settings/keys
 *   ZOTERO_GROUP_ID  — (optional) group library ID instead of personal
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT  = process.env.COCAPN_REPO_ROOT ?? process.cwd();
const API_KEY    = process.env.ZOTERO_API_KEY ?? "";
const USER_ID    = process.env.ZOTERO_USER_ID ?? "";
const GROUP_ID   = process.env.ZOTERO_GROUP_ID ?? "";
const REFS_DIR   = join(REPO_ROOT, "wiki", "references");

if (!API_KEY || !USER_ID) {
  console.error("ZOTERO_API_KEY and ZOTERO_USER_ID must be set.");
  process.exit(1);
}

const baseUrl = GROUP_ID
  ? `https://api.zotero.org/groups/${GROUP_ID}`
  : `https://api.zotero.org/users/${USER_ID}`;

const headers = {
  "Zotero-API-Key": API_KEY,
  "Zotero-API-Version": "3",
};

async function fetchItems(start = 0, limit = 100) {
  const url = `${baseUrl}/items?format=json&limit=${limit}&start=${start}&itemType=-attachment`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Zotero API ${res.status}: ${await res.text()}`);
  const total = parseInt(res.headers.get("Total-Results") ?? "0", 10);
  const items = await res.json();
  return { items, total };
}

function formatCitation(item) {
  const d = item.data;
  const authors = (d.creators ?? [])
    .filter((c) => c.creatorType === "author")
    .map((c) => c.lastName ? `${c.lastName}, ${c.firstName ?? ""}`.trim() : c.name)
    .slice(0, 3)
    .join("; ");

  const year   = d.date ? d.date.slice(0, 4) : "n.d.";
  const title  = d.title ?? "Untitled";
  const venue  = d.publicationTitle ?? d.conferenceName ?? d.bookTitle ?? d.publisher ?? "";
  const doi    = d.DOI ? `DOI: ${d.DOI}` : "";
  const url    = d.url ? `URL: ${d.url}` : "";
  const key    = item.key;

  return [
    `### ${title}`,
    ``,
    `- **Authors:** ${authors || "Unknown"}`,
    `- **Year:** ${year}`,
    venue ? `- **Venue:** ${venue}` : null,
    doi    ? `- **${doi}**` : null,
    url    ? `- ${url}` : null,
    `- **Key:** \`${key}\``,
    `- **Type:** ${d.itemType}`,
    ``,
  ].filter((l) => l !== null).join("\n");
}

async function sync() {
  mkdirSync(REFS_DIR, { recursive: true });

  let allItems = [];
  let start = 0;
  const limit = 100;

  console.log("Fetching Zotero library…");

  while (true) {
    const { items, total } = await fetchItems(start, limit);
    allItems = [...allItems, ...items];
    console.log(`  Fetched ${allItems.length}/${total} items`);
    if (allItems.length >= total) break;
    start += limit;
  }

  console.log(`Writing ${allItems.length} references to wiki/references/…`);

  // Group by year
  const byYear = {};
  for (const item of allItems) {
    const year = (item.data.date ?? "unknown").slice(0, 4);
    byYear[year] = byYear[year] ?? [];
    byYear[year].push(item);
  }

  for (const [year, items] of Object.entries(byYear).sort().reverse()) {
    const filename = join(REFS_DIR, `${year}.md`);
    const lines = [
      `# References — ${year}\n`,
      ...items.map(formatCitation),
    ];
    writeFileSync(filename, lines.join("\n"), "utf8");
  }

  // Write index
  const indexPath = join(REFS_DIR, "README.md");
  const years = Object.keys(byYear).sort().reverse();
  writeFileSync(
    indexPath,
    [
      `# Zotero References\n`,
      `Total: ${allItems.length} items across ${years.length} years.\n`,
      `Last synced: ${new Date().toISOString()}\n`,
      `\n## By Year\n`,
      ...years.map((y) => `- [${y}](./${y}.md) — ${byYear[y].length} items`),
    ].join("\n"),
    "utf8"
  );

  console.log(`Done. Index at wiki/references/README.md`);
}

sync().catch((err) => { console.error(err.message); process.exit(1); });
