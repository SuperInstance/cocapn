/**
 * cocapn backup — Backup and restore agent data
 *
 * Usage:
 *   cocapn backup create          — Create full backup (tar.gz)
 *   cocapn backup list            — List existing backups
 *   cocapn backup restore <name>  — Restore from backup
 *   cocapn backup clean           — Remove old backups (keep last 5)
 *   cocapn backup clean --keep 3  — Remove old backups (keep last 3)
 */

import { Command } from "commander";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  createReadStream,
  createWriteStream,
} from "fs";
import { join, basename } from "path";
import { createHash } from "crypto";
import { createGzip } from "zlib";
import { pipeline } from "stream/promises";
import { execSync } from "child_process";

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

// ─── Constants ──────────────────────────────────────────────────────────────

const BACKUP_DIR = "cocapn/backups";

const BACKUP_INCLUDES = [
  "cocapn/memory",
  "cocapn/wiki",
  "cocapn/knowledge",
  "cocapn/config.yml",
  "cocapn/soul.md",
];

const TAR_EXCLUDES = [
  "node_modules",
  ".git",
];

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BackupManifest {
  name: string;
  created: string;
  checksum: string;
  sizeBytes: number;
  files: string[];
}

export interface BackupListEntry {
  name: string;
  created: string;
  sizeBytes: number;
  checksum: string;
  fileCount: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}-${ms}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function backupDirPath(repoRoot: string): string {
  return join(repoRoot, BACKUP_DIR);
}

function backupFilePath(repoRoot: string, name: string): string {
  return join(repoRoot, BACKUP_DIR, `${name}.tar.gz`);
}

function manifestPath(repoRoot: string, name: string): string {
  return join(repoRoot, BACKUP_DIR, `${name}.json`);
}

export function resolveCocapnDir(repoRoot: string): string | null {
  const cocapnDir = join(repoRoot, "cocapn");
  return existsSync(cocapnDir) ? cocapnDir : null;
}

async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (data) => hash.update(data));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

function collectFiles(repoRoot: string): string[] {
  const files: string[] = [];
  for (const include of BACKUP_INCLUDES) {
    const fullPath = join(repoRoot, include);
    if (!existsSync(fullPath)) continue;

    if (statSync(fullPath).isDirectory()) {
      const entries = readdirSync(fullPath, { recursive: true, withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const relative = join(include, entry.path.slice(fullPath.length), entry.name);
        // Normalize path separators and remove leading ./
        const normalized = relative.replace(/\\/g, "/");
        files.push(normalized);
      }
    } else {
      files.push(include);
    }
  }
  return files.sort();
}

// ─── Create backup ──────────────────────────────────────────────────────────

export async function createBackup(repoRoot: string): Promise<BackupManifest> {
  const bDir = backupDirPath(repoRoot);
  mkdirSync(bDir, { recursive: true });

  const name = `backup-${formatTimestamp()}`;
  const archivePath = backupFilePath(repoRoot, name);

  // Collect files for manifest
  const files = collectFiles(repoRoot);
  if (files.length === 0) {
    throw new Error("No files to backup. Ensure cocapn/ directory contains data.");
  }

  // Build tar command with excludes
  const includeArgs = files.map((f) => `"${f}"`).join(" ");
  const excludeArgs = TAR_EXCLUDES.map((e) => `--exclude="${e}"`).join(" ");

  execSync(
    `cd "${repoRoot}" && tar czf "${archivePath}" ${excludeArgs} ${includeArgs}`,
    { stdio: "pipe" },
  );

  const sizeBytes = statSync(archivePath).size;
  const checksum = await sha256File(archivePath);

  const manifest: BackupManifest = {
    name,
    created: new Date().toISOString(),
    checksum,
    sizeBytes,
    files,
  };

  writeFileSync(manifestPath(repoRoot, name), JSON.stringify(manifest, null, 2), "utf-8");

  return manifest;
}

// ─── List backups ───────────────────────────────────────────────────────────

export function listBackups(repoRoot: string): BackupListEntry[] {
  const bDir = backupDirPath(repoRoot);
  if (!existsSync(bDir)) return [];

  const entries = readdirSync(bDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        const manifest: BackupManifest = JSON.parse(
          readFileSync(join(bDir, f), "utf-8"),
        );
        const archiveExists = existsSync(backupFilePath(repoRoot, manifest.name));
        return {
          name: manifest.name,
          created: manifest.created,
          sizeBytes: archiveExists ? statSync(backupFilePath(repoRoot, manifest.name)).size : 0,
          checksum: manifest.checksum,
          fileCount: manifest.files.length,
        };
      } catch {
        return null;
      }
    })
    .filter((e): e is BackupListEntry => e !== null)
    .sort((a, b) => b.created.localeCompare(a.created));

  return entries;
}

// ─── Restore backup ─────────────────────────────────────────────────────────

export async function restoreBackup(
  repoRoot: string,
  backupName: string,
  preRestoreBackup: boolean,
): Promise<{ restored: BackupManifest; safetyBackup?: string }> {
  const archivePath = backupFilePath(repoRoot, backupName);
  const manifestFile = manifestPath(repoRoot, backupName);

  if (!existsSync(archivePath)) {
    throw new Error(`Backup not found: ${backupName}`);
  }

  if (!existsSync(manifestFile)) {
    throw new Error(`Manifest not found for: ${backupName}`);
  }

  const manifest: BackupManifest = JSON.parse(readFileSync(manifestFile, "utf-8"));

  // Verify integrity
  const currentChecksum = await sha256File(archivePath);
  if (currentChecksum !== manifest.checksum) {
    throw new Error(
      `Checksum mismatch! Archive may be corrupted.\n  Expected: ${manifest.checksum}\n  Got:      ${currentChecksum}`,
    );
  }

  let safetyBackup: string | undefined;
  if (preRestoreBackup) {
    const safetyName = `pre-restore-${formatTimestamp()}`;
    const safetyResult = await createBackup(repoRoot);
    safetyBackup = safetyResult.name;
  }

  // Extract — tar will overwrite existing files
  execSync(
    `cd "${repoRoot}" && tar xzf "${archivePath}"`,
    { stdio: "pipe" },
  );

  // Verify restored files exist
  const missing = manifest.files.filter((f) => !existsSync(join(repoRoot, f)));
  if (missing.length > 0) {
    throw new Error(`Restore incomplete. Missing files: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "..." : ""}`);
  }

  return { restored: manifest, safetyBackup };
}

// ─── Clean backups ──────────────────────────────────────────────────────────

export function cleanBackups(repoRoot: string, keep: number): string[] {
  const backups = listBackups(repoRoot);
  if (backups.length <= keep) return [];

  const toRemove = backups.slice(keep);
  const removed: string[] = [];

  for (const backup of toRemove) {
    const archivePath = backupFilePath(repoRoot, backup.name);
    const manifestFile = manifestPath(repoRoot, backup.name);

    if (existsSync(archivePath)) rmSync(archivePath);
    if (existsSync(manifestFile)) rmSync(manifestFile);

    removed.push(backup.name);
  }

  return removed;
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

// ─── Display helpers ────────────────────────────────────────────────────────

function printManifest(manifest: BackupManifest): void {
  console.log(bold("\n  cocapn backup create\n"));
  console.log(`  ${cyan("Backup:")}  ${manifest.name}`);
  console.log(`  ${cyan("Size:")}    ${formatSize(manifest.sizeBytes)}`);
  console.log(`  ${cyan("Files:")}   ${manifest.files.length}`);
  console.log(`  ${cyan("SHA256:")}  ${manifest.checksum.slice(0, 16)}...`);
  console.log(green("\n  Done.\n"));
}

function printList(entries: BackupListEntry[]): void {
  console.log(bold("\n  cocapn backup list\n"));

  if (entries.length === 0) {
    console.log(gray("  No backups found.\n"));
    return;
  }

  for (const entry of entries) {
    console.log(`  ${green("\u2713")} ${entry.name}`);
    console.log(`    ${gray("Size:")} ${formatSize(entry.sizeBytes)}  ${gray("Files:")} ${entry.fileCount}  ${gray("SHA256:")} ${entry.checksum.slice(0, 12)}...`);
    console.log(`    ${gray("Created:")} ${entry.created}`);
  }
  console.log();
}

// ─── Command ────────────────────────────────────────────────────────────────

export function createBackupCommand(): Command {
  return new Command("backup")
    .description("Backup and restore agent data")
    .addCommand(
      new Command("create")
        .description("Create a full backup of agent data")
        .action(async () => {
          const repoRoot = process.cwd();
          if (!resolveCocapnDir(repoRoot)) {
            console.log(red("\n  No cocapn/ directory found. Run cocapn setup first.\n"));
            process.exit(1);
          }

          try {
            const manifest = await createBackup(repoRoot);
            printManifest(manifest);
          } catch (err) {
            console.log(red(`\n  ${(err as Error).message}\n`));
            process.exit(1);
          }
        }),
    )
    .addCommand(
      new Command("list")
        .description("List existing backups")
        .action(() => {
          const repoRoot = process.cwd();
          const entries = listBackups(repoRoot);
          printList(entries);
        }),
    )
    .addCommand(
      new Command("restore")
        .description("Restore from a backup")
        .argument("<name>", "Backup name (e.g. backup-2026-03-30T11-00-00)")
        .option("--no-safety-backup", "Skip pre-restore backup of current state", false)
        .action(async (name: string, options: { safetyBackup: boolean }) => {
          const repoRoot = process.cwd();
          if (!resolveCocapnDir(repoRoot)) {
            console.log(red("\n  No cocapn/ directory found. Run cocapn setup first.\n"));
            process.exit(1);
          }

          const confirmed = await confirmPrompt(
            `Restore from ${name}? This will overwrite current agent data.`,
          );
          if (!confirmed) {
            console.log(gray("  Cancelled.\n"));
            return;
          }

          try {
            const result = await restoreBackup(repoRoot, name, options.safetyBackup);
            console.log(bold("\n  cocapn backup restore\n"));
            console.log(`  ${cyan("Restored:")} ${result.restored.name}`);
            console.log(`  ${cyan("Files:")}    ${result.restored.files.length}`);
            if (result.safetyBackup) {
              console.log(`  ${cyan("Safety backup:")} ${result.safetyBackup}`);
            }
            console.log(green("\n  Done.\n"));
          } catch (err) {
            console.log(red(`\n  ${(err as Error).message}\n`));
            process.exit(1);
          }
        }),
    )
    .addCommand(
      new Command("clean")
        .description("Remove old backups")
        .option("-k, --keep <n>", "Number of backups to keep", (v: string) => parseInt(v, 10), 5)
        .action(async (options: { keep: number }) => {
          const repoRoot = process.cwd();
          const backups = listBackups(repoRoot);

          if (backups.length <= options.keep) {
            console.log(gray("\n  Nothing to clean. All backups within keep limit.\n"));
            return;
          }

          const toRemove = backups.slice(options.keep);
          console.log(bold("\n  cocapn backup clean\n"));
          console.log(`  Will remove ${toRemove.length} backup(s), keeping ${options.keep}:\n`);

          for (const backup of toRemove) {
            console.log(`  ${red("-")} ${backup.name} (${formatSize(backup.sizeBytes)})`);
          }

          const confirmed = await confirmPrompt("Remove these backups?");
          if (!confirmed) {
            console.log(gray("  Cancelled.\n"));
            return;
          }

          const removed = cleanBackups(repoRoot, options.keep);
          console.log(`\n  ${green(`Removed ${removed.length} backup(s).`)}\n`);
        }),
    );
}
