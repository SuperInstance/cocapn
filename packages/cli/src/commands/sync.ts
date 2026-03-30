/**
 * cocapn sync — Git sync between local and remote repos (private + public).
 *
 * Usage:
 *   cocapn sync            — Sync both repos (commit + push)
 *   cocapn sync private    — Sync only brain (private) repo
 *   cocapn sync public     — Sync only face (public) repo
 *   cocapn sync status     — Show sync status for both repos
 *   cocapn sync pull       — Pull from remotes
 */

import { Command } from "commander";
import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

// --- Color helpers ---

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

const bold = (s: string) => `${c.bold}${s}${c.reset}`;
const cyan = (s: string) => `${c.cyan}${s}${c.reset}`;
const green = (s: string) => `${c.green}${s}${c.reset}`;
const yellow = (s: string) => `${c.yellow}${s}${c.reset}`;
const red = (s: string) => `${c.red}${s}${c.reset}`;
const gray = (s: string) => `${c.gray}${s}${c.reset}`;
const dim = (s: string) => `${c.dim}${s}${c.reset}`;

// --- Types ---

export interface SyncRepoStatus {
  path: string;
  branch: string;
  clean: boolean;
  changedFiles: string[];
  hasRemote: boolean;
  ahead: number;
  behind: number;
  lastCommitMsg: string;
  lastCommitDate: string;
}

export interface SyncFullStatus {
  privateRepo: SyncRepoStatus | null;
  publicRepo: SyncRepoStatus | null;
}

export interface SyncResult {
  repo: "private" | "public";
  committed: boolean;
  pushed: boolean;
  files: string[];
  diffSummary: string;
}

// --- Git helpers ---

function git(cwd: string, args: string): string {
  try {
    return execSync(`git ${args}`, { cwd, encoding: "utf-8", timeout: 30_000 }).trim();
  } catch {
    return "";
  }
}

function gitSafe(cwd: string, args: string): { ok: true; output: string } | { ok: false; error: string } {
  try {
    const output = execSync(`git ${args}`, { cwd, encoding: "utf-8", timeout: 30_000 }).trim();
    return { ok: true, output };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Detect repo paths from current working directory or config. */
export function resolveRepoPaths(cwdOverride?: string): { privatePath: string | null; publicPath: string | null } {
  const cwd = cwdOverride ?? process.cwd();

  // Check if we're inside a brain repo (has cocapn/memory or memory/)
  const isBrain =
    existsSync(join(cwd, "cocapn", "memory")) ||
    existsSync(join(cwd, "memory")) ||
    existsSync(join(cwd, "cocapn", "soul.md"));

  // Check if we're inside a public/face repo (has cocapn.yml or index.html)
  const isFace = existsSync(join(cwd, "cocapn.yml")) || existsSync(join(cwd, "index.html"));

  // Try to read config.yml for explicit paths
  const configPath = join(cwd, "cocapn", "config.yml");
  let configPrivate: string | undefined;
  let configPublic: string | undefined;
  if (existsSync(configPath)) {
    const configContent = readFileSync(configPath, "utf-8");
    const privateMatch = configContent.match(/publicRepo\s*:\s*(.+)/);
    if (privateMatch) configPublic = privateMatch[1].trim();
  }

  // If we're in a brain repo, this IS the private repo
  const privatePath = isBrain ? cwd : null;

  // If we're in a face repo, this IS the public repo
  const publicPath = isFace ? cwd : (configPublic ? join(cwd, configPublic) : null);

  // Check for sibling public repo (e.g., ../alice.makerlog.ai)
  let siblingPublic: string | null = null;
  if (isBrain) {
    try {
      const dirs = execSync("ls ../", { cwd, encoding: "utf-8" }).trim().split("\n");
      const publicDir = dirs.find((d) =>
        d.includes(".") && existsSync(join(cwd, "..", d, "cocapn.yml"))
      );
      if (publicDir) siblingPublic = join(cwd, "..", publicDir);
    } catch {
      // ignore
    }
  }

  return {
    privatePath,
    publicPath: publicPath ?? siblingPublic,
  };
}

/** Check if a directory is a git repo. */
function isGitRepo(path: string): boolean {
  return existsSync(join(path, ".git"));
}

/** Parse git status --porcelain into file list. */
export function parseStatusPorcelain(output: string): string[] {
  if (!output) return [];
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const path = line.slice(3).trim();
      // Renamed files show as "old -> new" — extract the target
      const arrow = path.indexOf(" -> ");
      if (arrow !== -1) return path.slice(arrow + 4).trim();
      return path;
    });
}

/** Get the repo status. */
export function getRepoStatus(repoPath: string): SyncRepoStatus {
  const branch = git(repoPath, "rev-parse --abbrev-ref HEAD") || "unknown";
  const porcelain = git(repoPath, "status --porcelain");
  const changedFiles = parseStatusPorcelain(porcelain);
  const clean = changedFiles.length === 0;

  // Remote tracking
  const hasRemote = git(repoPath, "remote").length > 0;
  let ahead = 0;
  let behind = 0;
  if (hasRemote) {
    const ab = git(repoPath, "rev-list --left-right --count HEAD...@{upstream}");
    const parts = ab.split("\t");
    if (parts.length === 2) {
      ahead = parseInt(parts[0], 10) || 0;
      behind = parseInt(parts[1], 10) || 0;
    }
  }

  const lastCommitMsg = git(repoPath, 'log -1 --format="%s"');
  const lastCommitDate = git(repoPath, 'log -1 --format="%ar"');

  return { path: repoPath, branch, clean, changedFiles, hasRemote, ahead, behind, lastCommitMsg, lastCommitDate };
}

/** Stage all changes and commit. Returns list of committed files or null if nothing to commit. */
function autoCommit(repoPath: string, message: string): string[] | null {
  const porcelain = git(repoPath, "status --porcelain");
  const files = parseStatusPorcelain(porcelain);
  if (files.length === 0) return null;

  git(repoPath, "add -A");
  git(repoPath, `commit -m "${message}"`);
  return files;
}

/** Push to remote. Returns true on success. */
function pushRepo(repoPath: string): boolean {
  const result = gitSafe(repoPath, "push");
  return result.ok;
}

/** Pull from remote. Returns true on success. */
function pullRepo(repoPath: string): boolean {
  const result = gitSafe(repoPath, "pull --rebase");
  return result.ok;
}

/** Get short diff summary. */
export function getDiffSummary(repoPath: string): string {
  return git(repoPath, 'diff --stat HEAD~1 HEAD 2>/dev/null || git diff --stat --cached');
}

// --- Sync actions ---

function syncBothAction(): void {
  const { privatePath, publicPath } = resolveRepoPaths();
  const results: SyncResult[] = [];

  if (privatePath && isGitRepo(privatePath)) {
    results.push(syncRepo(privatePath, "private", "[cocapn] brain sync"));
  } else {
    console.log(yellow("Private repo not found or not a git repo."));
  }

  if (publicPath && isGitRepo(publicPath)) {
    results.push(syncRepo(publicPath, "public", "[cocapn] face sync"));
  } else {
    console.log(yellow("Public repo not found or not a git repo."));
  }

  if (results.length === 0) {
    console.log(red("No repos found. Run cocapn setup to get started."));
    process.exit(1);
  }

  console.log();
  printSyncResults(results);
}

function syncPrivateAction(): void {
  const { privatePath } = resolveRepoPaths();
  if (!privatePath || !isGitRepo(privatePath)) {
    console.log(red("Private repo not found or not a git repo."));
    console.log(dim("Make sure you're in your brain repo directory."));
    process.exit(1);
  }
  const result = syncRepo(privatePath, "private", "[cocapn] brain sync");
  console.log();
  printSyncResults([result]);
}

function syncPublicAction(): void {
  const { publicPath } = resolveRepoPaths();
  if (!publicPath || !isGitRepo(publicPath)) {
    console.log(red("Public repo not found or not a git repo."));
    console.log(dim("Make sure your face repo exists and is a git repo."));
    process.exit(1);
  }
  const result = syncRepo(publicPath, "public", "[cocapn] face sync");
  console.log();
  printSyncResults([result]);
}

function syncStatusAction(): void {
  const { privatePath, publicPath } = resolveRepoPaths();
  let foundAny = false;

  if (privatePath && isGitRepo(privatePath)) {
    const status = getRepoStatus(privatePath);
    printRepoStatus("Private (brain)", status);
    foundAny = true;
  } else {
    console.log(cyan("Private (brain):") + " " + yellow("not found"));
  }

  console.log();

  if (publicPath && isGitRepo(publicPath)) {
    const status = getRepoStatus(publicPath);
    printRepoStatus("Public (face)", status);
    foundAny = true;
  } else {
    console.log(cyan("Public (face):") + " " + yellow("not found"));
  }

  if (!foundAny) {
    console.log();
    console.log(red("No repos found. Run cocapn setup to get started."));
    process.exit(1);
  }
}

function syncPullAction(): void {
  const { privatePath, publicPath } = resolveRepoPaths();
  const results: { repo: "private" | "public"; path: string; success: boolean }[] = [];

  if (privatePath && isGitRepo(privatePath)) {
    console.log(cyan(`\u25b8 Pulling private repo (${privatePath})...`));
    const success = pullRepo(privatePath);
    results.push({ repo: "private", path: privatePath, success });
    if (success) {
      console.log(green(`\u2713 Private repo pulled`));
    } else {
      console.log(red(`\u2717 Private repo pull failed (possible merge conflict)`));
      console.log(dim("  Run 'cd <path> && git status' to check conflicts"));
    }
  } else {
    console.log(yellow("Private repo not found, skipping."));
  }

  if (publicPath && isGitRepo(publicPath)) {
    console.log(cyan(`\u25b8 Pulling public repo (${publicPath})...`));
    const success = pullRepo(publicPath);
    results.push({ repo: "public", path: publicPath, success });
    if (success) {
      console.log(green(`\u2713 Public repo pulled`));
    } else {
      console.log(red(`\u2717 Public repo pull failed (possible merge conflict)`));
      console.log(dim("  Run 'cd <path> && git status' to check conflicts"));
    }
  } else {
    console.log(yellow("Public repo not found, skipping."));
  }

  if (results.length === 0) {
    console.log(red("No repos found to pull."));
    process.exit(1);
  }

  // Show what changed after pull
  console.log();
  for (const r of results) {
    if (r.success) {
      const lastMsg = git(r.path, 'log -1 --format="%s"');
      const lastDate = git(r.path, 'log -1 --format="%ar"');
      console.log(`  ${bold(r.repo)}: ${dim(`${lastMsg} (${lastDate})`)}`);
    }
  }
}

// --- Core sync logic ---

function syncRepo(repoPath: string, repo: "private" | "public", commitMsg: string): SyncResult {
  const label = repo === "private" ? "Private (brain)" : "Public (face)";
  console.log(cyan(`\u25b8 Syncing ${label}...`));

  // Check for merge conflicts first
  const conflictCheck = git(repoPath, 'ls-files -u');
  if (conflictCheck) {
    console.log(red(`\u2717 Merge conflicts detected in ${label}`));
    console.log(dim("  Resolve conflicts first, then run cocapn sync again."));
    const conflictedFiles = conflictCheck
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split("\t").pop()?.trim())
      .filter(Boolean) as string[];
    for (const f of conflictedFiles) {
      console.log(yellow(`  conflicted: ${f}`));
    }
    return { repo, committed: false, pushed: false, files: conflictedFiles, diffSummary: "" };
  }

  // Auto-commit
  const files = autoCommit(repoPath, commitMsg);
  if (files) {
    console.log(green(`\u2713 Committed ${files.length} file(s) to ${label}`));
  } else {
    console.log(gray(`  No changes to commit in ${label}`));
  }

  // Push
  const hasRemote = git(repoPath, "remote").length > 0;
  let pushed = false;
  if (hasRemote) {
    pushed = pushRepo(repoPath);
    if (pushed) {
      console.log(green(`\u2713 Pushed ${label} to remote`));
    } else {
      console.log(yellow(`\u26a0 Push failed for ${label}`));
    }
  } else {
    console.log(gray(`  No remote configured for ${label}`));
  }

  // Diff summary
  const diffSummary = getDiffSummary(repoPath);

  return { repo, committed: files !== null, pushed, files: files ?? [], diffSummary };
}

// --- Display helpers ---

function printRepoStatus(label: string, status: SyncRepoStatus): void {
  const cleanLabel = status.clean ? green("clean") : yellow(`${status.changedFiles.length} changed`);
  console.log(cyan(`\u25b8 ${label}:`));
  console.log(`   Branch:  ${bold(status.branch)}`);
  console.log(`   Status:  ${cleanLabel}`);
  console.log(`   Remote:  ${status.hasRemote ? green("configured") : yellow("none")}`);

  if (status.hasRemote) {
    const tracking: string[] = [];
    if (status.ahead > 0) tracking.push(green(`${status.ahead} ahead`));
    if (status.behind > 0) tracking.push(yellow(`${status.behind} behind`));
    if (tracking.length === 0) tracking.push(gray("up to date"));
    console.log(`   Tracking: ${tracking.join(", ")}`);
  }

  console.log(`   Last:    ${dim(`${status.lastCommitMsg} (${status.lastCommitDate})`)}`);

  if (status.changedFiles.length > 0) {
    console.log(`   Files:`);
    for (const f of status.changedFiles) {
      console.log(`     ${yellow(f)}`);
    }
  }
}

function printSyncResults(results: SyncResult[]): void {
  for (const r of results) {
    const label = r.repo === "private" ? "Private" : "Public";
    const parts: string[] = [];
    if (r.committed) parts.push(green(`committed ${r.files.length} file(s)`));
    else parts.push(gray("no changes"));
    if (r.pushed) parts.push(green("pushed"));
    else if (r.files.length > 0) parts.push(yellow("not pushed"));
    console.log(`  ${bold(label)}: ${parts.join(", ")}`);
  }

  // Show diff summary if any commits happened
  for (const r of results) {
    if (r.diffSummary) {
      console.log();
      console.log(dim(`  ${r.repo} diff:`));
      for (const line of r.diffSummary.split("\n")) {
        console.log(dim(`    ${line}`));
      }
    }
  }
}

// --- Command registration ---

export function createSyncCommand(): Command {
  return (
    new Command("sync")
      .description("Sync local repos with remote (private brain + public face)")
      .action(() => {
        try {
          syncBothAction();
        } catch (err) {
          console.error(red("\u2717 Sync failed"));
          console.error(`  ${err instanceof Error ? err.message : String(err)}`);
          process.exit(1);
        }
      })
      .addCommand(
        new Command("private")
          .description("Sync only the private (brain) repo")
          .action(() => {
            try {
              syncPrivateAction();
            } catch (err) {
              console.error(red("\u2717 Private sync failed"));
              console.error(`  ${err instanceof Error ? err.message : String(err)}`);
              process.exit(1);
            }
          })
      )
      .addCommand(
        new Command("public")
          .description("Sync only the public (face) repo")
          .action(() => {
            try {
              syncPublicAction();
            } catch (err) {
              console.error(red("\u2717 Public sync failed"));
              console.error(`  ${err instanceof Error ? err.message : String(err)}`);
              process.exit(1);
            }
          })
      )
      .addCommand(
        new Command("status")
          .description("Show sync status for both repos")
          .action(() => {
            try {
              syncStatusAction();
            } catch (err) {
              console.error(red("\u2717 Status check failed"));
              console.error(`  ${err instanceof Error ? err.message : String(err)}`);
              process.exit(1);
            }
          })
      )
      .addCommand(
        new Command("pull")
          .description("Pull latest from remotes")
          .action(() => {
            try {
              syncPullAction();
            } catch (err) {
              console.error(red("\u2717 Pull failed"));
              console.error(`  ${err instanceof Error ? err.message : String(err)}`);
              process.exit(1);
            }
          })
      )
  );
}

// Exported for testing
export { git, gitSafe, autoCommit, pushRepo, pullRepo, syncRepo, printRepoStatus };
