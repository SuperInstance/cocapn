/**
 * Tests for cocapn reset command.
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
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  createBackupDir,
  resetBrain,
  resetKnowledge,
  resetAll,
  createResetCommand,
} from "../src/commands/reset.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "cocapn-reset-test-"));
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

// ─── createBackupDir ────────────────────────────────────────────────────────

describe("createBackupDir", () => {
  it("creates timestamped backup directory", () => {
    const backupDir = createBackupDir(tmpDir, "brain");
    expect(existsSync(backupDir)).toBe(true);
    expect(backupDir).toContain("brain-20");
    expect(backupDir).toContain(join("cocapn", "backups"));
  });

  it("creates unique directories for consecutive calls", () => {
    const dir1 = createBackupDir(tmpDir, "brain");
    const dir2 = createBackupDir(tmpDir, "brain");
    expect(dir1).not.toBe(dir2);
  });
});

// ─── resetBrain ─────────────────────────────────────────────────────────────

describe("resetBrain", () => {
  it("clears brain JSON files to empty objects", () => {
    const backupDir = createBackupDir(tmpDir, "brain");
    const result = resetBrain(tmpDir, backupDir);

    expect(result.target).toBe("brain");
    expect(result.cleared.length).toBeGreaterThan(0);

    for (const file of ["facts.json", "memories.json", "procedures.json", "relationships.json"]) {
      const content = readFileSync(join(tmpDir, "cocapn", "memory", file), "utf-8");
      expect(JSON.parse(content)).toEqual({});
    }
  });

  it("backs up brain files before clearing", () => {
    const backupDir = createBackupDir(tmpDir, "brain");
    const result = resetBrain(tmpDir, backupDir);

    expect(result.backedUp.length).toBeGreaterThan(0);

    // Verify backup contains original data
    const factsBackup = readFileSync(join(backupDir, "cocapn/memory/facts.json"), "utf-8");
    expect(JSON.parse(factsBackup)).toEqual({ name: "Alice", theme: "dark" });

    const memoriesBackup = readFileSync(join(backupDir, "cocapn/memory/memories.json"), "utf-8");
    expect(JSON.parse(memoriesBackup)).toHaveProperty("m1");
  });

  it("clears wiki pages", () => {
    const backupDir = createBackupDir(tmpDir, "brain");
    const result = resetBrain(tmpDir, backupDir);

    const wikiDir = join(tmpDir, "cocapn", "wiki");
    const remaining = readdirSync(wikiDir);
    expect(remaining.length).toBe(0);
  });

  it("backs up wiki pages", () => {
    const backupDir = createBackupDir(tmpDir, "brain");
    resetBrain(tmpDir, backupDir);

    expect(existsSync(join(backupDir, "cocapn/wiki/getting-started.md"))).toBe(true);
    expect(existsSync(join(backupDir, "cocapn/wiki/advanced.md"))).toBe(true);
  });

  it("preserves config.yml and soul.md", () => {
    const backupDir = createBackupDir(tmpDir, "brain");
    resetBrain(tmpDir, backupDir);

    expect(existsSync(join(tmpDir, "cocapn", "config.yml"))).toBe(true);
    expect(existsSync(join(tmpDir, "cocapn", "soul.md"))).toBe(true);

    const soulContent = readFileSync(join(tmpDir, "cocapn", "soul.md"), "utf-8");
    expect(soulContent).toContain("# Soul");
  });

  it("handles missing wiki directory gracefully", () => {
    rmSync(join(tmpDir, "cocapn", "wiki"), { recursive: true, force: true });
    const backupDir = createBackupDir(tmpDir, "brain");
    const result = resetBrain(tmpDir, backupDir);

    expect(result.target).toBe("brain");
    // Should still clear brain files
    for (const file of ["facts.json", "memories.json"]) {
      const content = readFileSync(join(tmpDir, "cocapn", "memory", file), "utf-8");
      expect(JSON.parse(content)).toEqual({});
    }
  });
});

// ─── resetKnowledge ─────────────────────────────────────────────────────────

describe("resetKnowledge", () => {
  it("clears knowledge entries", () => {
    const backupDir = createBackupDir(tmpDir, "knowledge");
    const result = resetKnowledge(tmpDir, backupDir);

    expect(result.target).toBe("knowledge");

    const knowledgeDir = join(tmpDir, "cocapn", "knowledge");
    const remaining = readdirSync(knowledgeDir);
    expect(remaining.length).toBe(0);
  });

  it("backs up knowledge entries before clearing", () => {
    const backupDir = createBackupDir(tmpDir, "knowledge");
    const result = resetKnowledge(tmpDir, backupDir);

    expect(result.backedUp.length).toBeGreaterThan(0);
    expect(existsSync(join(backupDir, "cocapn/knowledge/k1.json"))).toBe(true);
    expect(existsSync(join(backupDir, "cocapn/knowledge/k2.json"))).toBe(true);

    const k1Backup = readFileSync(join(backupDir, "cocapn/knowledge/k1.json"), "utf-8");
    expect(JSON.parse(k1Backup)).toEqual({ type: "fact" });
  });

  it("does not touch brain files", () => {
    const backupDir = createBackupDir(tmpDir, "knowledge");
    resetKnowledge(tmpDir, backupDir);

    const facts = JSON.parse(readFileSync(join(tmpDir, "cocapn/memory/facts.json"), "utf-8"));
    expect(facts).toEqual({ name: "Alice", theme: "dark" });
  });

  it("handles missing knowledge directory gracefully", () => {
    rmSync(join(tmpDir, "cocapn", "knowledge"), { recursive: true, force: true });
    const backupDir = createBackupDir(tmpDir, "knowledge");
    const result = resetKnowledge(tmpDir, backupDir);

    expect(result.target).toBe("knowledge");
    expect(result.cleared.length).toBe(0);
  });
});

// ─── resetAll ───────────────────────────────────────────────────────────────

describe("resetAll", () => {
  it("clears both brain and knowledge", () => {
    const backupDir = createBackupDir(tmpDir, "all");
    const result = resetAll(tmpDir, backupDir);

    expect(result.target).toBe("all");

    // Brain files should be empty
    for (const file of ["facts.json", "memories.json"]) {
      const content = readFileSync(join(tmpDir, "cocapn", "memory", file), "utf-8");
      expect(JSON.parse(content)).toEqual({});
    }

    // Wiki should be empty
    expect(readdirSync(join(tmpDir, "cocapn", "wiki")).length).toBe(0);

    // Knowledge should be empty
    expect(readdirSync(join(tmpDir, "cocapn", "knowledge")).length).toBe(0);
  });

  it("backs up everything", () => {
    const backupDir = createBackupDir(tmpDir, "all");
    const result = resetAll(tmpDir, backupDir);

    expect(result.backedUp.length).toBeGreaterThan(0);

    // Verify brain backup
    const factsBackup = readFileSync(join(backupDir, "cocapn/memory/facts.json"), "utf-8");
    expect(JSON.parse(factsBackup)).toEqual({ name: "Alice", theme: "dark" });

    // Verify wiki backup
    expect(existsSync(join(backupDir, "cocapn/wiki/getting-started.md"))).toBe(true);

    // Verify knowledge backup
    expect(existsSync(join(backupDir, "cocapn/knowledge/k1.json"))).toBe(true);
  });

  it("preserves config.yml and soul.md", () => {
    const backupDir = createBackupDir(tmpDir, "all");
    resetAll(tmpDir, backupDir);

    expect(existsSync(join(tmpDir, "cocapn", "config.yml"))).toBe(true);
    expect(existsSync(join(tmpDir, "cocapn", "soul.md"))).toBe(true);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("handles project with no brain data", () => {
    const empty = mkdtempSync(join(tmpdir(), "cocapn-reset-empty-"));
    mkdirSync(join(empty, "cocapn", "memory"), { recursive: true });
    mkdirSync(join(empty, "cocapn", "backups"), { recursive: true });

    const backupDir = createBackupDir(empty, "brain");
    const result = resetBrain(empty, backupDir);

    expect(result.target).toBe("brain");
    // Files should be created as empty
    for (const file of ["facts.json", "memories.json", "procedures.json", "relationships.json"]) {
      const content = readFileSync(join(empty, "cocapn", "memory", file), "utf-8");
      expect(JSON.parse(content)).toEqual({});
    }

    rmSync(empty, { recursive: true, force: true });
  });

  it("force flag skips confirmation (command creation)", () => {
    // Verify the command can be created with --force option
    const cmd = createResetCommand();
    const forceOption = cmd.options.find((o: { long: string }) => o.long === "--force");
    expect(forceOption).toBeDefined();
  });
});
