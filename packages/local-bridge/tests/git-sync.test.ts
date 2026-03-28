/**
 * Tests for GitSync — uses a real temp git repo to avoid mocking git internals.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { simpleGit } from "simple-git";
import { GitSync } from "../src/git/sync.js";
import { DEFAULT_CONFIG, type BridgeConfig } from "../src/config/types.js";

async function makeTempGitRepo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "cocapn-git-test-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test");
  await git.addConfig("user.email", "test@test.com");
  // Initial commit so we have a HEAD
  writeFileSync(join(dir, "README.md"), "test repo\n");
  await git.add(".");
  await git.commit("init");
  return dir;
}

const TEST_CONFIG: BridgeConfig = {
  ...DEFAULT_CONFIG,
  sync: {
    interval: 300,
    memoryInterval: 60,
    autoCommit: true,
    autoPush: false,
  },
  encryption: {
    publicKey: "",
    recipients: [],
    encryptedPaths: ["secrets/**", "*.secret.yml"],
  },
};

describe("GitSync", () => {
  let repoDir: string;
  let sync: GitSync;

  beforeEach(async () => {
    repoDir = await makeTempGitRepo();
    sync = new GitSync(repoDir, TEST_CONFIG);
  });

  afterEach(() => {
    sync.stopTimers();
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("returns false when there is nothing to commit", async () => {
    const committed = await sync.commit("test: nothing changed");
    expect(committed).toBe(false);
  });

  it("commits new files", async () => {
    const { mkdirSync } = await import("fs");
    mkdirSync(join(repoDir, "memory"), { recursive: true });
    writeFileSync(join(repoDir, "memory", "facts.json"), "[]");

    const committed = await sync.commit("test: add facts");
    expect(committed).toBe(true);
  });

  it("emits committed event with file list", async () => {
    const { mkdirSync } = await import("fs");
    mkdirSync(join(repoDir, "memory"), { recursive: true });
    writeFileSync(join(repoDir, "memory", "facts.json"), "[1,2,3]");

    const events: Array<{ message: string; files: string[] }> = [];
    sync.on("committed", (message, files) => events.push({ message, files }));

    await sync.commit("test: facts update");
    expect(events).toHaveLength(1);
    // commit() reformats non-prefixed messages to "Cocapn: <files>"
    expect(events[0]?.message).toMatch(/^Cocapn:/);
    expect(events[0]?.message).toContain("facts.json");
    expect(events[0]?.files.some((f) => f.includes("facts.json"))).toBe(true);
  });

  it("does not commit files matching encrypted paths", async () => {
    const { mkdirSync } = await import("fs");
    mkdirSync(join(repoDir, "secrets"), { recursive: true });
    writeFileSync(join(repoDir, "secrets", "api-key.txt"), "super-secret");
    // Also add a non-secret file
    writeFileSync(join(repoDir, "notes.txt"), "just notes");

    const events: Array<{ files: string[] }> = [];
    sync.on("committed", (_, files) => events.push({ files }));

    await sync.commit("test: mixed files");
    expect(events[0]?.files).not.toContain("secrets/api-key.txt");
    expect(events[0]?.files.some((f) => f.includes("notes.txt"))).toBe(true);
  });

  it("does not commit *.secret.yml files", async () => {
    writeFileSync(join(repoDir, "creds.secret.yml"), "password: abc");
    writeFileSync(join(repoDir, "safe.yml"), "public: true");

    const events: Array<{ files: string[] }> = [];
    sync.on("committed", (_, files) => events.push({ files }));

    await sync.commit("test: secret yml");
    expect(events[0]?.files).not.toContain("creds.secret.yml");
    expect(events[0]?.files.some((f) => f.includes("safe.yml"))).toBe(true);
  });

  it("emits error event when git operation fails", async () => {
    // Use a real temp dir that isn't a git repo to force a git failure
    const notARepo = mkdtempSync(join(tmpdir(), "cocapn-notgit-"));
    try {
      const badSync = new GitSync(notARepo, TEST_CONFIG);
      const errors: Error[] = [];
      badSync.on("error", (err) => errors.push(err));

      await badSync.commit("should fail");
      expect(errors.length).toBeGreaterThan(0);
    } finally {
      rmSync(notARepo, { recursive: true, force: true });
    }
  });

  it("commitFile uses Cocapn: <filename> modified format", async () => {
    const { mkdirSync } = await import("fs");
    mkdirSync(join(repoDir, "notes"), { recursive: true });
    writeFileSync(join(repoDir, "notes", "todo.md"), "# Todo");

    const messages: string[] = [];
    sync.on("committed", (msg) => messages.push(msg));

    await sync.commitFile("todo.md");
    expect(messages[0]).toBe("Cocapn: todo.md modified");
  });

  it("startTimers sets up a pull timer", () => {
    sync.startTimers();
    // Timer is internal — verify stopTimers clears it without throwing
    expect(() => sync.stopTimers()).not.toThrow();
  });
});
