/**
 * Tests for cocapn learn command — file, url, text, list, forget.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { createLearnCommand } from "../src/commands/learn.js";
import { Command } from "commander";

// ─── Helpers ────────────────────────────────────────────────────────────────

const testDir = join(process.cwd(), ".test-learn-tmp");

function setupTestDir(): void {
  if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  mkdirSync(testDir, { recursive: true });
}

function cleanupTestDir(): void {
  if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
}

function knowledgeDir(): string {
  return join(testDir, "cocapn", "knowledge");
}

/**
 * Run a Commander command programmatically and capture output.
 */
async function runCommand(args: string[]): Promise<{ stdout: string; exitCode: number }> {
  const cmd = createLearnCommand();
  let stdout = "";
  const origLog = console.log;
  const origErr = console.error;
  const origExit = process.exit;

  console.log = (...a: any[]) => { stdout += a.join(" ") + "\n"; };
  console.error = (...a: any[]) => { stdout += a.join(" ") + "\n"; };
  let exitCode = 0;
  process.exit = ((code: number) => { exitCode = code ?? 1; }) as never;

  try {
    // Override process.cwd for test isolation
    const origCwd = process.cwd;
    process.cwd = () => testDir;

    cmd.parseAsync(["node", "cocapn", ...args]).catch(() => {});
    // Allow async actions to settle
    await new Promise(r => setTimeout(r, 100));

    process.cwd = origCwd;
  } finally {
    console.log = origLog;
    console.error = origErr;
    process.exit = origExit;
  }

  return { stdout, exitCode };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("cocapn learn", () => {
  beforeEach(() => setupTestDir());
  afterEach(() => cleanupTestDir());

  describe("learn text", () => {
    it("stores a knowledge entry from text", async () => {
      const { stdout } = await runCommand(["text", "Pacific salmon spawn in freshwater streams", "--json"]);

      const parsed = JSON.parse(stdout);
      expect(parsed.entry).toBeDefined();
      expect(parsed.entry.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(parsed.entry.content).toContain("Pacific salmon");
      expect(parsed.extraction).toBeDefined();

      // Verify file was written
      const kdir = knowledgeDir();
      expect(existsSync(kdir)).toBe(true);
    });

    it("auto-categorizes as species type", async () => {
      const { stdout } = await runCommand(["text", "The species of salmon migrate upstream", "--json"]);
      const parsed = JSON.parse(stdout);
      expect(parsed.entry.type).toBe("species");
    });

    it("respects --type flag override", async () => {
      const { stdout } = await runCommand(["text", "Some general content", "--type", "regulation", "--json"]);
      const parsed = JSON.parse(stdout);
      expect(parsed.entry.type).toBe("regulation");
    });

    it("respects --confidence flag", async () => {
      const { stdout } = await runCommand(["text", "Some fact", "--confidence", "0.5", "--json"]);
      const parsed = JSON.parse(stdout);
      expect(parsed.entry.metadata.confidence).toBe(0.5);
    });

    it("respects --tags flag", async () => {
      const { stdout } = await runCommand(["text", "Some fact", "--tags", "tag1,tag2", "--json"]);
      const parsed = JSON.parse(stdout);
      expect(parsed.entry.metadata.tags).toContain("tag1");
      expect(parsed.entry.metadata.tags).toContain("tag2");
    });
  });

  describe("learn file", () => {
    it("learns from a markdown file", async () => {
      const filePath = join(testDir, "notes.md");
      writeFileSync(filePath, "# Salmon Species\n\nPacific salmon spawn in freshwater rivers.");

      const { stdout } = await runCommand(["file", filePath, "--json"]);
      const parsed = JSON.parse(stdout);
      expect(parsed.entry.content).toContain("Salmon Species");
      expect(parsed.extraction.suggestedType).toBe("species");
    });

    it("learns from a JSON file", async () => {
      const filePath = join(testDir, "data.json");
      writeFileSync(filePath, JSON.stringify({ name: "Halibut", weight: "30 kg", location: "Bay Area" }));

      const { stdout } = await runCommand(["file", filePath, "--json"]);
      const parsed = JSON.parse(stdout);
      expect(parsed.entry.content).toContain("Halibut");
    });

    it("learns from a CSV file", async () => {
      const filePath = join(testDir, "catch.csv");
      writeFileSync(filePath, "species,weight,location\nsalmon,12 kg,Lake Tahoe");

      const { stdout } = await runCommand(["file", filePath, "--json"]);
      const parsed = JSON.parse(stdout);
      expect(parsed.entry.content).toContain("salmon");
    });
  });

  describe("learn list", () => {
    it("lists no entries when store is empty", async () => {
      const { stdout } = await runCommand(["list"]);
      expect(stdout).toContain("No knowledge entries found");
    });

    it("lists stored entries", async () => {
      // First, add an entry
      await runCommand(["text", "Pacific salmon is a species of fish", "--json"]);
      // Then list
      const { stdout } = await runCommand(["list"]);
      expect(stdout).toContain("Knowledge store");
      expect(stdout).toContain("species");
    });

    it("outputs JSON with --json flag", async () => {
      await runCommand(["text", "Test content for JSON listing", "--json"]);
      const { stdout } = await runCommand(["list", "--json"]);
      const parsed = JSON.parse(stdout);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThanOrEqual(1);
    });

    it("groups entries by type", async () => {
      await runCommand(["text", "Salmon species info", "--type", "species", "--json"]);
      await runCommand(["text", "Fishing regulation info", "--type", "regulation", "--json"]);
      const { stdout } = await runCommand(["list"]);
      expect(stdout).toContain("species");
      expect(stdout).toContain("regulation");
    });
  });

  describe("learn forget", () => {
    it("removes an entry by ID", async () => {
      const { stdout: addOut } = await runCommand(["text", "To be forgotten", "--json"]);
      const parsed = JSON.parse(addOut);
      const id = parsed.entry.id;

      const { stdout: forgetOut } = await runCommand(["forget", id]);
      expect(forgetOut).toContain("Forgot entry");

      // Verify it's gone
      const { stdout: listOut } = await runCommand(["list"]);
      expect(listOut).toContain("No knowledge entries found");
    });

    it("removes an entry by partial ID", async () => {
      const { stdout: addOut } = await runCommand(["text", "Partial ID test", "--json"]);
      const parsed = JSON.parse(addOut);
      const partialId = parsed.entry.id.slice(0, 8);

      const { stdout: forgetOut } = await runCommand(["forget", partialId]);
      expect(forgetOut).toContain("Forgot entry");
    });

    it("outputs JSON with --json flag", async () => {
      const { stdout: addOut } = await runCommand(["text", "JSON forget test", "--json"]);
      const parsed = JSON.parse(addOut);
      const id = parsed.entry.id;

      const { stdout: forgetOut } = await runCommand(["forget", id, "--json"]);
      const forgetParsed = JSON.parse(forgetOut);
      expect(forgetParsed.removed).toBe(id);
    });
  });
});

describe("createLearnCommand", () => {
  it("returns a Commander command with correct name", () => {
    const cmd = createLearnCommand();
    expect(cmd.name()).toBe("learn");
  });

  it("has subcommands: file, url, text, list, forget", () => {
    const cmd = createLearnCommand();
    const subcommandNames = cmd.commands.map(c => c.name());
    expect(subcommandNames).toContain("file");
    expect(subcommandNames).toContain("url");
    expect(subcommandNames).toContain("text");
    expect(subcommandNames).toContain("list");
    expect(subcommandNames).toContain("forget");
  });
});
