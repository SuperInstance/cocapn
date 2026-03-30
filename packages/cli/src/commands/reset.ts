/**
 * cocapn reset — Reset agent to clean state with backups
 *
 * Usage:
 *   cocapn reset brain     — Clear brain memory (facts, memories, wiki)
 *   cocapn reset knowledge — Clear knowledge pipeline
 *   cocapn reset all       — Full reset + re-run setup
 *   cocapn reset --force   — Skip confirmation prompt
 */

import { Command } from "commander";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  cpSync,
  readdirSync,
  rmSync,
  statSync,
} from "fs";
import { join } from "path";

// ─── ANSI colors ────────────────────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

const bold = (s: string) => `${c.bold}${s}${c.reset}`;
const green = (s: string) => `${c.green}${s}${c.reset}`;
const cyan = (s: string) => `${c.cyan}${s}${c.reset}`;
const yellow = (s: string) => `${c.yellow}${s}${c.reset}`;
const red = (s: string) => `${c.red}${s}${c.reset}`;
const gray = (s: string) => `${c.gray}${s}${c.reset}`;

// ─── Paths ──────────────────────────────────────────────────────────────────

const BRAIN_FILES = [
  "cocapn/memory/facts.json",
  "cocapn/memory/memories.json",
  "cocapn/memory/procedures.json",
  "cocapn/memory/relationships.json",
];

const BRAIN_EMPTY = "{}\n";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ResetResult {
  target: string;
  backupDir: string;
  backedUp: string[];
  cleared: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function timestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  const rand = Math.random().toString(36).substring(2, 6);
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${ms}-${rand}`;
}

function countJsonEntries(filePath: string): number {
  if (!existsSync(filePath)) return 0;
  try {
    const data = JSON.parse(readFileSync(filePath, "utf-8"));
    if (data && typeof data === "object") {
      return Object.keys(data).length;
    }
  } catch {
    // Invalid JSON — count as 1 entry worth clearing
    return 1;
  }
  return 0;
}

function countWikiPages(repoRoot: string): number {
  const wikiDir = join(repoRoot, "cocapn", "wiki");
  if (!existsSync(wikiDir)) return 0;
  try {
    return readdirSync(wikiDir)
      .filter((f) => f.endsWith(".md"))
      .length;
  } catch {
    return 0;
  }
}

function countKnowledgeEntries(repoRoot: string): number {
  const knowledgeDir = join(repoRoot, "cocapn", "knowledge");
  if (!existsSync(knowledgeDir)) return 0;
  try {
    return readdirSync(knowledgeDir).length;
  } catch {
    return 0;
  }
}

export function createBackupDir(repoRoot: string, prefix: string): string {
  const backupDir = join(repoRoot, "cocapn", "backups", `${prefix}-${timestamp()}`);
  mkdirSync(backupDir, { recursive: true });
  return backupDir;
}

function backupFile(repoRoot: string, backupDir: string, relativePath: string): boolean {
  const src = join(repoRoot, relativePath);
  if (!existsSync(src)) return false;

  const destDir = join(backupDir, relativePath.substring(0, relativePath.lastIndexOf("/")));
  mkdirSync(destDir, { recursive: true });
  cpSync(src, join(backupDir, relativePath), { preserveTimestamps: true });
  return true;
}

function backupDirectory(repoRoot: string, backupDir: string, relativePath: string): boolean {
  const src = join(repoRoot, relativePath);
  if (!existsSync(src) || !statSync(src).isDirectory()) return false;

  const entries = readdirSync(src);
  if (entries.length === 0) return false;

  const dest = join(backupDir, relativePath);
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true, preserveTimestamps: true });
  return true;
}

// ─── Reset operations ───────────────────────────────────────────────────────

export function resetBrain(repoRoot: string, backupDir: string): ResetResult {
  const backedUp: string[] = [];
  const cleared: string[] = [];

  // Backup and clear brain JSON files
  for (const file of BRAIN_FILES) {
    if (backupFile(repoRoot, backupDir, file)) {
      backedUp.push(file);
    }
    // Ensure parent dir exists, write empty
    const fullPath = join(repoRoot, file);
    mkdirSync(fullPath.substring(0, fullPath.lastIndexOf("/")), { recursive: true });
    writeFileSync(fullPath, BRAIN_EMPTY, "utf-8");
    cleared.push(file);
  }

  // Backup and clear wiki
  const wikiRel = "cocapn/wiki";
  if (backupDirectory(repoRoot, backupDir, wikiRel)) {
    backedUp.push(`${wikiRel}/`);
  }
  const wikiDir = join(repoRoot, wikiRel);
  if (existsSync(wikiDir)) {
    const entries = readdirSync(wikiDir);
    for (const entry of entries) {
      rmSync(join(wikiDir, entry), { recursive: true, force: true });
      cleared.push(`${wikiRel}/${entry}`);
    }
  }

  return { target: "brain", backupDir, backedUp, cleared };
}

export function resetKnowledge(repoRoot: string, backupDir: string): ResetResult {
  const backedUp: string[] = [];
  const cleared: string[] = [];
  const knowledgeRel = "cocapn/knowledge";

  if (backupDirectory(repoRoot, backupDir, knowledgeRel)) {
    backedUp.push(`${knowledgeRel}/`);
  }

  const knowledgeDir = join(repoRoot, knowledgeRel);
  if (existsSync(knowledgeDir)) {
    const entries = readdirSync(knowledgeDir);
    for (const entry of entries) {
      rmSync(join(knowledgeDir, entry), { recursive: true, force: true });
      cleared.push(`${knowledgeRel}/${entry}`);
    }
  }

  return { target: "knowledge", backupDir, backedUp, cleared };
}

export function resetAll(repoRoot: string, backupDir: string): ResetResult {
  const brain = resetBrain(repoRoot, backupDir);
  const knowledge = resetKnowledge(repoRoot, backupDir);

  return {
    target: "all",
    backupDir,
    backedUp: [...brain.backedUp, ...knowledge.backedUp],
    cleared: [...brain.cleared, ...knowledge.cleared],
  };
}

// ─── Display ────────────────────────────────────────────────────────────────

function printResult(result: ResetResult): void {
  console.log(bold("\n  cocapn reset") + gray(` ${result.target}\n`));

  console.log(`  ${cyan("Backup:")} ${result.backupDir}`);
  if (result.backedUp.length > 0) {
    console.log(bold("  Backed up:"));
    for (const item of result.backedUp) {
      console.log(`  ${green("\u2713")} ${item}`);
    }
  }

  if (result.cleared.length > 0) {
    console.log(bold("  Cleared:"));
    for (const item of result.cleared) {
      console.log(`  ${red("\u2713")} ${item}`);
    }
  }

  console.log();
  if (result.target === "all") {
    console.log(gray("  Run cocapn setup to re-initialize the agent.\n"));
  } else {
    console.log(green("  Done.\n"));
  }
}

// ─── Confirm prompt ─────────────────────────────────────────────────────────

async function confirmPrompt(message: string): Promise<boolean> {
  process.stdout.write(`  ${yellow("?")} ${message} ${gray("[y/N]")} `);
  return new Promise<boolean>((resolve) => {
    const onData = (data: Buffer) => {
      process.stdin.removeListener("data", onData);
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      const answer = data.toString().trim().toLowerCase();
      console.log();
      resolve(answer === "y" || answer === "yes");
    };
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

// ─── Command ────────────────────────────────────────────────────────────────

export function createResetCommand(): Command {
  return new Command("reset")
    .description("Reset agent to clean state (with backups)")
    .argument("<target>", "What to reset: brain, knowledge, all")
    .option("-f, --force", "Skip confirmation prompt", false)
    .action(async (target: string, options: { force: boolean }) => {
      const validTargets = ["brain", "knowledge", "all"];
      if (!validTargets.includes(target)) {
        console.log(red(`\n  Invalid target: ${target}\n`));
        console.log(gray(`  Valid targets: ${validTargets.join(", ")}\n`));
        process.exit(1);
      }

      const repoRoot = process.cwd();
      const cocapnDir = join(repoRoot, "cocapn");
      if (!existsSync(cocapnDir)) {
        console.log(red("\n  No cocapn/ directory found. Run cocapn setup first.\n"));
        process.exit(1);
      }

      // Show counts and confirm (unless --force)
      if (!options.force) {
        if (target === "brain" || target === "all") {
          const facts = countJsonEntries(join(repoRoot, "cocapn/memory/facts.json"));
          const memories = countJsonEntries(join(repoRoot, "cocapn/memory/memories.json"));
          const procedures = countJsonEntries(join(repoRoot, "cocapn/memory/procedures.json"));
          const relationships = countJsonEntries(join(repoRoot, "cocapn/memory/relationships.json"));
          const wikiPages = countWikiPages(repoRoot);
          console.log(bold("\n  Brain contents:"));
          console.log(`  ${cyan(`${facts}`)} facts, ${cyan(`${memories}`)} memories, ${cyan(`${procedures}`)} procedures, ${cyan(`${relationships}`)} relationships, ${cyan(`${wikiPages}`)} wiki pages`);
        }
        if (target === "knowledge" || target === "all") {
          const knowledgeEntries = countKnowledgeEntries(repoRoot);
          console.log(`  ${bold("Knowledge:")} ${cyan(`${knowledgeEntries}`)} entries`);
        }

        const confirmed = await confirmPrompt(
          `Reset ${target}? A backup will be created first.`,
        );
        if (!confirmed) {
          console.log(gray("  Cancelled.\n"));
          return;
        }
      }

      // Create backup and reset
      const backupDir = createBackupDir(repoRoot, target);
      let result: ResetResult;

      switch (target) {
        case "brain":
          result = resetBrain(repoRoot, backupDir);
          break;
        case "knowledge":
          result = resetKnowledge(repoRoot, backupDir);
          break;
        case "all":
          result = resetAll(repoRoot, backupDir);
          break;
      }

      printResult(result!);
    });
}
