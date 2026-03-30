/**
 * Tests for cocapn backup command.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  createBackup,
  listBackups,
  restoreBackup,
  cleanBackups,
  resolveCocapnDir,
  createBackupCommand,
  type BackupManifest,
} from "../src/commands/backup.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "cocapn-backup-test-"));
  // Create a valid cocapn project with brain data
  mkdirSync(join(tmpDir, "cocapn", "memory"), { recursive: true });
  mkdirSync(join(tmpDir, "cocapn", "wiki"), { recursive: true });
  mkdirSync(join(tmpDir, "cocapn", "knowledge"), { recursive: true });
  writeFileSync(join(tmpDir, "cocapn", "soul.md"), "# Soul\n\nYou are helpful.\n", "utf-8");
  writeFileSync(join(tmpDir, "cocapn", "config.yml"), "soul: cocapn/soul.md\n", "utf-8");
  writeFileSync(
    join(tmpDir, "cocapn", "memory", "facts.json"),
    JSON.stringify({ name: "Alice", theme: "dark" }),
    "utf-8",
  );
  writeFileSync(
    join(tmpDir, "cocapn", "memory", "memories.json"),
    JSON.stringify({ m1: { text: "test", confidence: 0.9 } }),
    "utf-8",
  );
  writeFileSync(
    join(tmpDir, "cocapn", "memory", "procedures.json"),
    JSON.stringify({ p1: { steps: ["step1", "step2"] } }),
    "utf-8",
  );
  writeFileSync(
    join(tmpDir, "cocapn", "memory", "relationships.json"),
    JSON.stringify({ r1: { entity: "Bob", relation: "friend" } }),
    "utf-8",
  );
  writeFileSync(join(tmpDir, "cocapn", "wiki", "getting-started.md"), "# Getting Started\n", "utf-8");
  writeFileSync(join(tmpDir, "cocapn", "wiki", "advanced.md"), "# Advanced\n", "utf-8");
  writeFileSync(join(tmpDir, "cocapn", "knowledge", "k1.json"), '{"type":"fact"}\n', "utf-8");
  writeFileSync(join(tmpDir, "cocapn", "knowledge", "k2.json"), '{"type":"pattern"}\n', "utf-8");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ─── resolveCocapnDir ───────────────────────────────────────────────────────

describe("resolveCocapnDir", () => {
  it("returns cocapn dir when it exists", () => {
    const result = resolveCocapnDir(tmpDir);
    expect(result).toBe(join(tmpDir, "cocapn"));
  });

  it("returns null when cocapn dir does not exist", () => {
    const empty = mkdtempSync(join(tmpdir(), "cocapn-backup-empty-"));
    expect(resolveCocapnDir(empty)).toBeNull();
    rmSync(empty, { recursive: true, force: true });
  });
});

// ─── createBackup ───────────────────────────────────────────────────────────

describe("createBackup", () => {
  it("creates a tar.gz archive with manifest", async () => {
    const manifest = await createBackup(tmpDir);

    expect(manifest.name).toMatch(/^backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}$/);
    expect(manifest.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.sizeBytes).toBeGreaterThan(0);
    expect(manifest.files.length).toBeGreaterThan(0);
    expect(manifest.created).toBeTruthy();

    // Archive should exist
    const archivePath = join(tmpDir, "cocapn", "backups", `${manifest.name}.tar.gz`);
    expect(existsSync(archivePath)).toBe(true);

    // Manifest should exist
    const manifestPath = join(tmpDir, "cocapn", "backups", `${manifest.name}.json`);
    expect(existsSync(manifestPath)).toBe(true);
  });

  it("includes all expected data directories", async () => {
    const manifest = await createBackup(tmpDir);

    // Check key files are in manifest
    const fileNames = manifest.files.map((f) => f.replace(/\\/g, "/"));
    expect(fileNames.some((f) => f.includes("memory/facts.json"))).toBe(true);
    expect(fileNames.some((f) => f.includes("memory/memories.json"))).toBe(true);
    expect(fileNames.some((f) => f.includes("wiki/getting-started.md"))).toBe(true);
    expect(fileNames.some((f) => f.includes("knowledge/k1.json"))).toBe(true);
    expect(fileNames.some((f) => f.endsWith("soul.md"))).toBe(true);
    expect(fileNames.some((f) => f.endsWith("config.yml"))).toBe(true);
  });

  it("produces a valid checksum", async () => {
    const manifest = await createBackup(tmpDir);
    const archivePath = join(tmpDir, "cocapn", "backups", `${manifest.name}.tar.gz`);
    const archiveContent = readFileSync(archivePath);

    const { createHash } = await import("crypto");
    const hash = createHash("sha256").update(archiveContent).digest("hex");
    expect(hash).toBe(manifest.checksum);
  });

  it("throws when no files to backup", async () => {
    const empty = mkdtempSync(join(tmpdir(), "cocapn-backup-nofiles-"));
    mkdirSync(join(empty, "cocapn"), { recursive: true });
    // No memory/, wiki/, knowledge/, soul.md, or config.yml

    await expect(createBackup(empty)).rejects.toThrow("No files to backup");
    rmSync(empty, { recursive: true, force: true });
  });

  it("creates unique backup names", async () => {
    const m1 = await createBackup(tmpDir);
    const m2 = await createBackup(tmpDir);
    expect(m1.name).not.toBe(m2.name);
  });

  it("archives contain correct data that can be verified", async () => {
    const manifest = await createBackup(tmpDir);

    // Verify archive size is reasonable (not 0, not absurdly large)
    expect(manifest.sizeBytes).toBeGreaterThan(100);
    expect(manifest.sizeBytes).toBeLessThan(1024 * 1024); // < 1MB for test data
  });
});

// ─── listBackups ────────────────────────────────────────────────────────────

describe("listBackups", () => {
  it("returns empty array when no backups exist", () => {
    const result = listBackups(tmpDir);
    expect(result).toEqual([]);
  });

  it("lists created backups sorted newest first", async () => {
    await createBackup(tmpDir);
    await createBackup(tmpDir);

    const result = listBackups(tmpDir);
    expect(result.length).toBe(2);
    // Newest first
    expect(result[0].created >= result[1].created).toBe(true);
  });

  it("includes size and file count", async () => {
    await createBackup(tmpDir);

    const result = listBackups(tmpDir);
    expect(result.length).toBe(1);
    expect(result[0].sizeBytes).toBeGreaterThan(0);
    expect(result[0].fileCount).toBeGreaterThan(0);
    expect(result[0].checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it("ignores corrupted manifest files", () => {
    mkdirSync(join(tmpDir, "cocapn", "backups"), { recursive: true });
    writeFileSync(join(tmpDir, "cocapn", "backups", "bad.json"), "not json", "utf-8");

    const result = listBackups(tmpDir);
    expect(result).toEqual([]);
  });
});

// ─── restoreBackup ──────────────────────────────────────────────────────────

describe("restoreBackup", () => {
  it("restores files from a backup", async () => {
    const original = await createBackup(tmpDir);

    // Modify a file
    writeFileSync(
      join(tmpDir, "cocapn", "memory", "facts.json"),
      JSON.stringify({ name: "MODIFIED" }),
      "utf-8",
    );

    const result = await restoreBackup(tmpDir, original.name, false);

    // Should be restored to original
    const facts = JSON.parse(readFileSync(join(tmpDir, "cocapn", "memory", "facts.json"), "utf-8"));
    expect(facts).toEqual({ name: "Alice", theme: "dark" });
    expect(result.restored.name).toBe(original.name);
  });

  it("creates a safety backup when preRestoreBackup is true", async () => {
    const original = await createBackup(tmpDir);

    writeFileSync(
      join(tmpDir, "cocapn", "memory", "facts.json"),
      JSON.stringify({ name: "MODIFIED" }),
      "utf-8",
    );

    const result = await restoreBackup(tmpDir, original.name, true);
    expect(result.safetyBackup).toBeTruthy();

    // Safety backup should exist
    const safetyPath = join(tmpDir, "cocapn", "backups", `${result.safetyBackup}.tar.gz`);
    expect(existsSync(safetyPath)).toBe(true);
  });

  it("does not create safety backup when preRestoreBackup is false", async () => {
    const original = await createBackup(tmpDir);
    const result = await restoreBackup(tmpDir, original.name, false);
    expect(result.safetyBackup).toBeUndefined();
  });

  it("throws on checksum mismatch", async () => {
    const original = await createBackup(tmpDir);

    // Corrupt the archive
    const archivePath = join(tmpDir, "cocapn", "backups", `${original.name}.tar.gz`);
    writeFileSync(archivePath, "corrupted data", "utf-8");

    await expect(restoreBackup(tmpDir, original.name, false)).rejects.toThrow("Checksum mismatch");
  });

  it("throws when backup not found", async () => {
    await expect(restoreBackup(tmpDir, "nonexistent", false)).rejects.toThrow("Backup not found");
  });

  it("restores wiki pages", async () => {
    const original = await createBackup(tmpDir);

    // Delete wiki pages
    rmSync(join(tmpDir, "cocapn", "wiki", "getting-started.md"));
    rmSync(join(tmpDir, "cocapn", "wiki", "advanced.md"));

    await restoreBackup(tmpDir, original.name, false);

    expect(existsSync(join(tmpDir, "cocapn", "wiki", "getting-started.md"))).toBe(true);
    expect(existsSync(join(tmpDir, "cocapn", "wiki", "advanced.md"))).toBe(true);
  });

  it("restores soul.md and config.yml", async () => {
    const original = await createBackup(tmpDir);

    writeFileSync(join(tmpDir, "cocapn", "soul.md"), "# Changed\n", "utf-8");
    writeFileSync(join(tmpDir, "cocapn", "config.yml"), "# Changed\n", "utf-8");

    await restoreBackup(tmpDir, original.name, false);

    const soul = readFileSync(join(tmpDir, "cocapn", "soul.md"), "utf-8");
    expect(soul).toContain("# Soul");

    const config = readFileSync(join(tmpDir, "cocapn", "config.yml"), "utf-8");
    expect(config).toContain("soul: cocapn/soul.md");
  });
});

// ─── cleanBackups ───────────────────────────────────────────────────────────

describe("cleanBackups", () => {
  it("removes old backups keeping the specified number", async () => {
    await createBackup(tmpDir);
    await createBackup(tmpDir);
    await createBackup(tmpDir);

    const removed = cleanBackups(tmpDir, 1);
    expect(removed.length).toBe(2);

    const remaining = listBackups(tmpDir);
    expect(remaining.length).toBe(1);
  });

  it("keeps all backups when count is within limit", async () => {
    await createBackup(tmpDir);
    await createBackup(tmpDir);

    const removed = cleanBackups(tmpDir, 5);
    expect(removed).toEqual([]);

    const remaining = listBackups(tmpDir);
    expect(remaining.length).toBe(2);
  });

  it("removes both archive and manifest files", async () => {
    const manifest = await createBackup(tmpDir);
    await createBackup(tmpDir);

    cleanBackups(tmpDir, 1);

    const archivePath = join(tmpDir, "cocapn", "backups", `${manifest.name}.tar.gz`);
    const manifestPath = join(tmpDir, "cocapn", "backups", `${manifest.name}.json`);

    expect(existsSync(archivePath)).toBe(false);
    expect(existsSync(manifestPath)).toBe(false);
  });

  it("returns empty array when no backups exist", () => {
    const removed = cleanBackups(tmpDir, 5);
    expect(removed).toEqual([]);
  });

  it("keeps newest backups", async () => {
    const m1 = await createBackup(tmpDir);
    const m2 = await createBackup(tmpDir);
    const m3 = await createBackup(tmpDir);

    cleanBackups(tmpDir, 1);

    const remaining = listBackups(tmpDir);
    expect(remaining.length).toBe(1);
    // Should keep the newest (m3 was created last)
    expect(remaining[0].name).toBe(m3.name);
  });
});

// ─── Command creation ───────────────────────────────────────────────────────

describe("createBackupCommand", () => {
  it("creates command with subcommands", () => {
    const cmd = createBackupCommand();
    expect(cmd.name()).toBe("backup");

    const subcommands = cmd.commands.map((c: { name: () => string }) => c.name());
    expect(subcommands).toContain("create");
    expect(subcommands).toContain("list");
    expect(subcommands).toContain("restore");
    expect(subcommands).toContain("clean");
  });

  it("clean command has --keep option", () => {
    const cmd = createBackupCommand();
    const cleanCmd = cmd.commands.find((c: { name: () => string }) => c.name() === "clean");
    expect(cleanCmd).toBeDefined();

    const keepOption = cleanCmd.options.find((o: { long: string }) => o.long === "--keep");
    expect(keepOption).toBeDefined();
  });

  it("restore command has --no-safety-backup option", () => {
    const cmd = createBackupCommand();
    const restoreCmd = cmd.commands.find((c: { name: () => string }) => c.name() === "restore");
    expect(restoreCmd).toBeDefined();

    const safetyOption = restoreCmd.options.find((o: { long: string }) => o.long === "--no-safety-backup");
    expect(safetyOption).toBeDefined();
  });
});

// ─── Integration ────────────────────────────────────────────────────────────

describe("integration", () => {
  it("full backup → modify → restore cycle preserves data", async () => {
    // Create backup
    const manifest = await createBackup(tmpDir);

    // Modify all data
    writeFileSync(join(tmpDir, "cocapn", "memory", "facts.json"), "{}", "utf-8");
    writeFileSync(join(tmpDir, "cocapn", "soul.md"), "# Empty\n", "utf-8");
    rmSync(join(tmpDir, "cocapn", "wiki"), { recursive: true, force: true });
    rmSync(join(tmpDir, "cocapn", "knowledge"), { recursive: true, force: true });

    // Restore
    await restoreBackup(tmpDir, manifest.name, false);

    // Verify data is back
    const facts = JSON.parse(readFileSync(join(tmpDir, "cocapn", "memory", "facts.json"), "utf-8"));
    expect(facts).toEqual({ name: "Alice", theme: "dark" });

    const soul = readFileSync(join(tmpDir, "cocapn", "soul.md"), "utf-8");
    expect(soul).toContain("# Soul");

    expect(existsSync(join(tmpDir, "cocapn", "wiki", "getting-started.md"))).toBe(true);
    expect(existsSync(join(tmpDir, "cocapn", "knowledge", "k1.json"))).toBe(true);
  });

  it("create multiple backups then clean to specific count", async () => {
    const names: string[] = [];
    for (let i = 0; i < 4; i++) {
      const m = await createBackup(tmpDir);
      names.push(m.name);
    }

    expect(listBackups(tmpDir).length).toBe(4);

    cleanBackups(tmpDir, 2);

    const remaining = listBackups(tmpDir);
    expect(remaining.length).toBe(2);
    // Should keep the two newest
    expect(remaining[0].name).toBe(names[3]);
    expect(remaining[1].name).toBe(names[2]);
  });
});
