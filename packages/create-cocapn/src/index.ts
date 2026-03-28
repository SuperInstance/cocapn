#!/usr/bin/env node
/**
 * create-cocapn — Zero-friction scaffolder for Cocapn agent instances.
 *
 * Usage:
 *   npx create-cocapn my-makerlog --domain makerlog
 *   npx create-cocapn my-studylog --domain studylog --token ghp_...
 */

import { program } from "commander";
import { resolve } from "path";
import {
  validateToken,
  createGitHubRepos,
  enableGitHubPages,
  cloneRepos,
  scaffoldPrivateRepo,
  generateAgeKey,
  commitAll,
  pushRepo,
  printSuccess,
} from "./scaffold.js";
import { promptHidden, closePrompts } from "./prompts.js";

// ─── CLI definition ───────────────────────────────────────────────────────────

const DOMAINS = ["makerlog", "studylog", "activelog", "lifelog"] as const;
type Domain = (typeof DOMAINS)[number];

program
  .name("create-cocapn")
  .description("Zero-friction scaffolder for Cocapn agent instances")
  .argument("<name>", "Username / subdomain slug (e.g. my-makerlog)")
  .option(
    "--domain <domain>",
    `Domain slug (choices: ${DOMAINS.join(", ")})`,
    "makerlog"
  )
  .option("--token <pat>", "GitHub Personal Access Token (or set GITHUB_TOKEN env var)")
  .option("--skip-pages", "Skip enabling GitHub Pages on the public repo")
  .option("--dir <dir>", "Directory to clone into (default: cwd/<name>)")
  .action(async (name: string, opts: {
    domain: string;
    token?: string;
    skipPages?: boolean;
    dir?: string;
  }) => {
    await run(name, opts);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(`\nError: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

// ─── Main action ──────────────────────────────────────────────────────────────

async function run(
  name: string,
  opts: {
    domain: string;
    token?: string;
    skipPages?: boolean;
    dir?: string;
  }
): Promise<void> {
  // Validate domain choice
  const domain = opts.domain as Domain;
  if (!(DOMAINS as readonly string[]).includes(domain)) {
    console.error(
      `Error: Unknown domain "${domain}". Valid choices: ${DOMAINS.join(", ")}`
    );
    process.exit(1);
  }

  // Resolve base dir
  const baseDir = opts.dir ? resolve(opts.dir) : resolve(process.cwd(), name);

  // ── GitHub token ─────────────────────────────────────────────────────────
  let token = opts.token ?? process.env["GITHUB_TOKEN"] ?? "";

  if (!token) {
    console.log(
      "\nYou need a GitHub Personal Access Token with repo + pages scopes."
    );
    console.log("  https://github.com/settings/tokens/new\n");
    token = await promptHidden("GitHub PAT: ");
  }

  // ── Validate token ───────────────────────────────────────────────────────
  process.stdout.write("  Validating token… ");
  const username = await validateToken(token);
  if (!username) {
    console.error(
      "\nInvalid or expired token. Check your PAT and try again."
    );
    closePrompts();
    process.exit(1);
  }
  console.log(`ok (@${username})`);

  // ── Create repos ─────────────────────────────────────────────────────────
  console.log(`\n  Creating repos for "${name}" on domain ${domain}.ai…`);
  const repos = await createGitHubRepos(token, username, name);
  console.log(`  ✓ github.com/${username}/${repos.publicRepo} (public)`);
  console.log(`  ✓ github.com/${username}/${repos.privateRepo} (private)`);

  // ── Clone ─────────────────────────────────────────────────────────────────
  console.log("\n  Cloning repos…");
  const { publicDir, privateDir } = cloneRepos(token, username, repos, baseDir);
  console.log(`  ✓ ${privateDir}`);
  console.log(`  ✓ ${publicDir}`);

  // ── Scaffold private repo ─────────────────────────────────────────────────
  console.log("\n  Scaffolding private repo…");
  scaffoldPrivateRepo(privateDir, username, domain);

  // ── Age keygen ────────────────────────────────────────────────────────────
  console.log("  Generating age keypair…");
  const ageResult = generateAgeKey(privateDir);
  if (ageResult) {
    console.log(`  ✓ Age public key: ${ageResult.publicKey.slice(0, 24)}…`);
  } else {
    console.log(
      "  (age-keygen not found — skipping. Install: https://age-encryption.org)"
    );
  }

  // ── Commit and push ───────────────────────────────────────────────────────
  console.log("\n  Committing scaffold…");
  commitAll(privateDir, username, "Initial Cocapn scaffold");
  commitAll(publicDir, username, "Initial Cocapn scaffold");

  console.log("  Pushing to GitHub…");
  pushRepo(privateDir, username);
  pushRepo(publicDir, username);

  // ── GitHub Pages ──────────────────────────────────────────────────────────
  if (opts.skipPages !== true) {
    console.log("  Enabling GitHub Pages…");
    await enableGitHubPages(token, username, repos.publicRepo);
    console.log("  ✓ Pages enabled (may take ~60s to go live)");
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  closePrompts();
  printSuccess({
    username,
    domain,
    name,
    privateDir,
    privateRepo: repos.privateRepo,
    agePublicKey: ageResult?.publicKey,
  });
}
