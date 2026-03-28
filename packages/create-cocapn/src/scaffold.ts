/**
 * Core scaffolding logic for create-cocapn.
 *
 * All functions are individually exported so they can be tested in isolation.
 */

import { execSync } from "child_process";
import {
  mkdirSync,
  writeFileSync,
} from "fs";
import { join } from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RepoNames {
  publicRepo: string;
  privateRepo: string;
}

export interface ScaffoldOptions {
  name: string;
  domain: string;
  token: string;
  username: string;
  baseDir: string;
  skipPages: boolean;
}

// ─── GitHub API ───────────────────────────────────────────────────────────────

const GH_API = "https://api.github.com";
const UA = "create-cocapn/0.1.0";

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github+json",
    "User-Agent": UA,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/**
 * Validate a GitHub PAT and return the authenticated username.
 * Returns undefined if the token is invalid.
 */
export async function validateToken(token: string): Promise<string | undefined> {
  try {
    const res = await fetch(`${GH_API}/user`, { headers: ghHeaders(token) });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { login?: string };
    return body.login;
  } catch {
    return undefined;
  }
}

/**
 * Create a single GitHub repo for the authenticated user.
 * Silently ignores 422 (already exists).
 */
export async function createGitHubRepo(
  token: string,
  name: string,
  isPrivate: boolean
): Promise<void> {
  const res = await fetch(`${GH_API}/user/repos`, {
    method: "POST",
    headers: ghHeaders(token),
    body: JSON.stringify({
      name,
      private: isPrivate,
      auto_init: false,
      description: `Cocapn ${isPrivate ? "private brain" : "public UI"} — powered by Git`,
    }),
  });

  if (!res.ok && res.status !== 422) {
    const err = (await res.json()) as { message?: string };
    throw new Error(`GitHub API error creating "${name}": ${err.message ?? res.status}`);
  }
}

/**
 * Create both public and private repos for a Cocapn instance.
 */
export async function createGitHubRepos(
  token: string,
  username: string,
  name: string
): Promise<RepoNames> {
  const publicRepo = `${name}-public`;
  const privateRepo = `${name}-brain`;

  await createGitHubRepo(token, publicRepo, false);
  await createGitHubRepo(token, privateRepo, true);

  return { publicRepo, privateRepo };
}

/**
 * Enable GitHub Pages on the public repo (branch: main, path: /).
 * Non-fatal — logs a warning if it fails.
 */
export async function enableGitHubPages(
  token: string,
  username: string,
  repo: string
): Promise<void> {
  try {
    const res = await fetch(`${GH_API}/repos/${username}/${repo}/pages`, {
      method: "POST",
      headers: ghHeaders(token),
      body: JSON.stringify({
        source: { branch: "main", path: "/" },
        build_type: "legacy",
      }),
    });
    // 201 = created, 409 = already enabled — both OK
    if (!res.ok && res.status !== 409) {
      const err = (await res.json()) as { message?: string };
      console.warn(`  Warning: Could not enable Pages: ${err.message ?? res.status}`);
    }
  } catch (e) {
    console.warn(`  Warning: Pages request failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ─── Clone ────────────────────────────────────────────────────────────────────

/**
 * Clone both repos into `baseDir/{publicRepo}` and `baseDir/{privateRepo}`.
 * Returns the two local directory paths.
 */
export function cloneRepos(
  token: string,
  username: string,
  repos: RepoNames,
  baseDir: string
): { publicDir: string; privateDir: string } {
  const publicDir = join(baseDir, repos.publicRepo);
  const privateDir = join(baseDir, repos.privateRepo);

  for (const [repoName, destDir] of [
    [repos.publicRepo, publicDir],
    [repos.privateRepo, privateDir],
  ] as const) {
    const url = `https://oauth2:${token}@github.com/${username}/${repoName}.git`;
    mkdirSync(destDir, { recursive: true });
    execSync(`git clone "${url}" "${destDir}"`, { stdio: "pipe" });
  }

  return { publicDir, privateDir };
}

// ─── Scaffold private repo ────────────────────────────────────────────────────

const SOUL_TEMPLATE = `# {{username}}'s Soul

You are {{username}}'s personal Cocapn agent.

## Values
- Helpful and direct
- Respects privacy — this is a private brain

## Domains
- Domain: {{domain}}

## Notes
_Edit this file to shape your agent's personality and knowledge._
`;

const CONFIG_TEMPLATE = `# Cocapn private config
username: "{{username}}"
domain: "{{domain}}"
bridge:
  port: 8787
  auth: true
encryption:
  provider: age
`;

const WIKI_README = `# Wiki

Personal knowledge base for {{username}}.

Add pages as Markdown files in this directory.
`;

/**
 * Populate a cloned private repo with the Cocapn directory structure.
 * Replaces {{username}} and {{domain}} placeholders.
 */
export function scaffoldPrivateRepo(
  dir: string,
  username: string,
  domain: string
): void {
  const replace = (s: string): string =>
    s.replace(/\{\{username\}\}/g, username).replace(/\{\{domain\}\}/g, domain);

  const cocapnDir = join(dir, "cocapn");
  const memoryDir = join(cocapnDir, "memory");
  const tasksDir = join(cocapnDir, "tasks");
  const wikiDir = join(cocapnDir, "wiki");

  for (const d of [cocapnDir, memoryDir, tasksDir, wikiDir]) {
    mkdirSync(d, { recursive: true });
  }

  writeFileSync(join(cocapnDir, "soul.md"), replace(SOUL_TEMPLATE), "utf8");
  writeFileSync(join(cocapnDir, "config.yml"), replace(CONFIG_TEMPLATE), "utf8");
  writeFileSync(join(memoryDir, "facts.json"), "{}\n", "utf8");
  writeFileSync(join(wikiDir, "README.md"), replace(WIKI_README), "utf8");

  // Keep empty tasks dir tracked by git
  writeFileSync(join(tasksDir, ".gitkeep"), "", "utf8");
}

// ─── Age keygen ───────────────────────────────────────────────────────────────

export interface AgeKeyResult {
  publicKey: string;
  privateKeyPath: string;
}

/**
 * Run `age-keygen` and store the private key in `{dir}/cocapn/secrets/age.key`.
 * Returns the public key (recipient) string.
 * Gracefully skips and returns undefined if age-keygen is not available.
 */
export function generateAgeKey(dir: string): AgeKeyResult | undefined {
  const secretsDir = join(dir, "cocapn", "secrets");
  const keyPath = join(secretsDir, "age.key");

  try {
    mkdirSync(secretsDir, { recursive: true });
    const output = execSync("age-keygen", { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    const lines = output.split("\n").filter((l) => l.trim().length > 0);

    // age-keygen stdout format:
    //   # created: <date>
    //   # public key: age1...
    //   AGE-SECRET-KEY-...
    const publicKeyLine = lines.find((l) => l.startsWith("# public key:"));
    const secretLine = lines.find((l) => l.startsWith("AGE-SECRET-KEY-"));

    if (!publicKeyLine || !secretLine) {
      console.warn("  Warning: Unexpected age-keygen output — skipping age setup.");
      return undefined;
    }

    const publicKey = publicKeyLine.replace("# public key: ", "").trim();
    writeFileSync(keyPath, output, { encoding: "utf8", mode: 0o600 });

    return { publicKey, privateKeyPath: keyPath };
  } catch {
    // age-keygen not installed or failed — non-fatal
    return undefined;
  }
}

// ─── Git helpers ──────────────────────────────────────────────────────────────

/**
 * Stage all files and commit in the given directory.
 */
export function commitAll(dir: string, username: string, message: string): void {
  const env = {
    GIT_AUTHOR_NAME: username,
    GIT_AUTHOR_EMAIL: `${username}@users.noreply.github.com`,
    GIT_COMMITTER_NAME: username,
    GIT_COMMITTER_EMAIL: `${username}@users.noreply.github.com`,
  };
  try {
    execSync("git add -A", { cwd: dir, stdio: "pipe", env: { ...process.env, ...env } });
    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
      cwd: dir,
      stdio: "pipe",
      env: { ...process.env, ...env },
    });
  } catch {
    // Nothing to commit is fine
  }
}

/**
 * Push HEAD to origin (non-fatal on failure).
 */
export function pushRepo(dir: string, username: string): void {
  const env = {
    GIT_AUTHOR_NAME: username,
    GIT_AUTHOR_EMAIL: `${username}@users.noreply.github.com`,
    GIT_COMMITTER_NAME: username,
    GIT_COMMITTER_EMAIL: `${username}@users.noreply.github.com`,
  };
  try {
    execSync("git push -u origin HEAD", {
      cwd: dir,
      stdio: "pipe",
      env: { ...process.env, ...env },
    });
  } catch {
    // Non-fatal — user can push manually
  }
}

// ─── Success output ───────────────────────────────────────────────────────────

const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  green:  "\x1b[32m",
  cyan:   "\x1b[36m",
  gray:   "\x1b[90m",
};

const bold  = (s: string) => `${C.bold}${s}${C.reset}`;
const green = (s: string) => `${C.green}${s}${C.reset}`;
const cyan  = (s: string) => `${C.cyan}${s}${C.reset}`;
const dim   = (s: string) => `${C.dim}${s}${C.reset}`;
const gray  = (s: string) => `${C.gray}${s}${C.reset}`;

/**
 * Print the final success message with next steps.
 */
export function printSuccess(opts: {
  username: string;
  domain: string;
  name: string;
  privateDir: string;
  privateRepo: string;
  agePublicKey: string | undefined;
}): void {
  const subdomain = `${opts.username}.${opts.domain}.ai`;

  console.log(`
${green("✓")} ${bold(`Created ${subdomain}`)}

${bold("Next steps:")}
  cd ${bold(opts.privateDir)}
  npx cocapn-bridge --repo ./${opts.privateRepo}
`);

  if (opts.agePublicKey) {
    console.log(`  ${dim("Age public key:")} ${gray(opts.agePublicKey)}`);
    console.log(`  ${dim("Private key stored at:")} ${gray(join(opts.privateDir, "cocapn", "secrets", "age.key"))}`);
    console.log();
  }

  console.log(`  ${dim("Your data is in Git. You own it completely.")}`);
  console.log(`  ${dim("Public UI:")}   ${cyan(`https://${opts.username}.github.io/${opts.name}-public`)}`);
  console.log(`  ${dim("Private brain:")} ${gray(opts.privateDir)}`);
  console.log();
}
