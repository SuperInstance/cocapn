#!/usr/bin/env node
// Load zotero credentials from secrets/zotero.yml if present
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

const REPO_ROOT   = process.env.COCAPN_REPO_ROOT ?? process.cwd();
const secretsFile = join(REPO_ROOT, "secrets", "zotero.yml");

if (existsSync(secretsFile)) {
  const creds = parse(readFileSync(secretsFile, "utf8"));
  if (!creds.ZOTERO_API_KEY || !creds.ZOTERO_USER_ID) {
    console.warn("zotero.yml found but missing ZOTERO_API_KEY or ZOTERO_USER_ID");
  } else {
    console.log("zotero-bridge enabled. Run sync.js to populate wiki/references/");
  }
} else {
  console.warn("secrets/zotero.yml not found. See secrets/zotero.yml.example");
}
