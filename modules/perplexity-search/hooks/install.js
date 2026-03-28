#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.env.COCAPN_REPO_ROOT ?? process.cwd();
const secretsDir = join(REPO_ROOT, "secrets");
mkdirSync(secretsDir, { recursive: true });

const secretFile = join(secretsDir, "perplexity.yml.example");
if (!existsSync(secretFile)) {
  writeFileSync(secretFile,
    "# Set your Perplexity API key here and rename to perplexity.yml\n" +
    "PERPLEXITY_API_KEY: your-key-here\n",
    "utf8"
  );
}

console.log("perplexity-search installed.");
console.log("Add your API key to secrets/perplexity.yml (see .example file).");
