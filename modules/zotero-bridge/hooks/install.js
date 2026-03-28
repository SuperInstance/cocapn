#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.env.COCAPN_REPO_ROOT ?? process.cwd();
const secretsDir = join(REPO_ROOT, "secrets");
mkdirSync(secretsDir, { recursive: true });

const exampleFile = join(secretsDir, "zotero.yml.example");
if (!existsSync(exampleFile)) {
  writeFileSync(exampleFile,
    "# Rename to zotero.yml and fill in your credentials\n" +
    "# Get API key from https://www.zotero.org/settings/keys\n" +
    "ZOTERO_API_KEY: your-api-key\n" +
    "ZOTERO_USER_ID: your-numeric-user-id\n" +
    "# Optional: use a group library instead\n" +
    "# ZOTERO_GROUP_ID: group-id\n",
    "utf8"
  );
}

mkdirSync(join(REPO_ROOT, "wiki", "references"), { recursive: true });
writeFileSync(
  join(REPO_ROOT, "wiki", "references", "README.md"),
  "# Zotero References\n\nRun `node modules/zotero-bridge/sync.js` to sync your library.\n",
  "utf8"
);

console.log("zotero-bridge installed.");
console.log("Add credentials to secrets/zotero.yml (see .example).");
console.log("Then run: node modules/zotero-bridge/sync.js");
