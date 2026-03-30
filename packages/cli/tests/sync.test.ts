/**
 * Tests for cocapn sync command
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import {
  parseStatusPorcelain,
  getRepoStatus,
  autoCommit,
  resolveRepoPaths,
  syncRepo,
  printRepoStatus,
  type SyncRepoStatus,
} from "../src/commands/sync.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

let testCounter = 0;

function uniqueDir(): string {
  testCounter++;
  return join(process.cwd(), `.test-sync-${process.pid}-${testCounter}`);
}

function initGitRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  execSafe("git init -b main", dir);
  execSafe('git config user.email "test@test.com"', dir);
  execSafe('git config user.name "Test"', dir);
}

function execSafe(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: "utf-8", timeout: 10_000 }).trim();
  } catch {
    return "";
  }
}

function makeBrainRepo(dir: string): void {
  initGitRepo(dir);
  const cocapnDir = join(dir, "cocapn");
  mkdirSync(join(cocapnDir, "memory"), { recursive: true });
  writeFileSync(join(cocapnDir, "soul.md"), "# Test Soul\n\nI am a test agent.");
  writeFileSync(join(cocapnDir, "memory", "facts.json"), JSON.stringify({ "user.name": "Alice" }));
  execSafe("git add -A", dir);
  execSafe('git commit -m "init brain"', dir);
}

function makeFaceRepo(dir: string): void {
  initGitRepo(dir);
  writeFileSync(join(dir, "cocapn.yml"), "name: test");
  writeFileSync(join(dir, "index.html"), "<html><body>hello</body></html>");
  execSafe("git add -A", dir);
  execSafe('git commit -m "init face"', dir);
}

// ─── parseStatusPorcelain ──────────────────────────────────────────────────

describe("parseStatusPorcelain", () => {
  it("parses empty output", () => {
    expect(parseStatusPorcelain("")).toEqual([]);
  });

  it("parses modified files", () => {
    const output = " M src/foo.ts\n M src/bar.ts";
    expect(parseStatusPorcelain(output)).toEqual(["src/foo.ts", "src/bar.ts"]);
  });

  it("parses untracked files", () => {
    const output = "?? newfile.ts\n?? another.ts";
    expect(parseStatusPorcelain(output)).toEqual(["newfile.ts", "another.ts"]);
  });

  it("parses staged added and deleted files", () => {
    const output = "A  staged.ts\nD  deleted.ts";
    const result = parseStatusPorcelain(output);
    expect(result).toContain("staged.ts");
    expect(result).toContain("deleted.ts");
  });

  it("parses renamed files", () => {
    const output = "R  old.ts -> new.ts";
    const result = parseStatusPorcelain(output);
    expect(result).toContain("new.ts");
  });

  it("handles mixed status", () => {
    const output = " M modified.ts\n?? untracked.ts\nA  staged.ts\nD  gone.ts";
    const result = parseStatusPorcelain(output);
    expect(result).toHaveLength(4);
  });
});

// ─── getRepoStatus ─────────────────────────────────────────────────────────

describe("getRepoStatus", () => {
  let dir: string;

  beforeEach(() => {
    dir = uniqueDir();
    makeBrainRepo(dir);
  });

  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it("returns clean status for committed repo", () => {
    const status = getRepoStatus(dir);
    expect(status.clean).toBe(true);
    expect(status.changedFiles).toEqual([]);
  });

  it("detects uncommitted changes", () => {
    writeFileSync(join(dir, "cocapn", "new-file.md"), "test");
    const status = getRepoStatus(dir);
    expect(status.clean).toBe(false);
    expect(status.changedFiles.length).toBeGreaterThan(0);
    expect(status.changedFiles.some((f) => f.includes("new-file.md"))).toBe(true);
  });

  it("detects no remote by default", () => {
    const status = getRepoStatus(dir);
    expect(status.hasRemote).toBe(false);
  });

  it("returns last commit info", () => {
    const status = getRepoStatus(dir);
    expect(status.lastCommitMsg).toBe("init brain");
  });

  it("returns ahead=0 behind=0 with no remote", () => {
    const status = getRepoStatus(dir);
    expect(status.ahead).toBe(0);
    expect(status.behind).toBe(0);
  });
});

// ─── autoCommit ────────────────────────────────────────────────────────────

describe("autoCommit", () => {
  let dir: string;

  beforeEach(() => {
    dir = uniqueDir();
    makeBrainRepo(dir);
  });

  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it("returns null when no changes", () => {
    const result = autoCommit(dir, "test commit");
    expect(result).toBeNull();
  });

  it("commits changes and returns file list", () => {
    writeFileSync(join(dir, "cocapn", "change.md"), "new content");
    const result = autoCommit(dir, "test commit");
    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThan(0);
  });

  it("creates a git commit with the given message", () => {
    writeFileSync(join(dir, "cocapn", "change.md"), "new content");
    autoCommit(dir, "sync test message");
    const lastMsg = execSafe('git log -1 --format="%s"', dir);
    expect(lastMsg).toBe("sync test message");
  });

  it("handles multiple files", () => {
    writeFileSync(join(dir, "a.txt"), "a");
    writeFileSync(join(dir, "b.txt"), "b");
    writeFileSync(join(dir, "c.txt"), "c");
    const result = autoCommit(dir, "multi file commit");
    expect(result).not.toBeNull();
    expect(result!.length).toBe(3);
  });
});

// ─── resolveRepoPaths ──────────────────────────────────────────────────────

describe("resolveRepoPaths", () => {
  let brainDir: string;
  let faceDir: string;
  let parentDir: string;

  beforeEach(() => {
    parentDir = uniqueDir();
    brainDir = join(parentDir, "brain");
    faceDir = join(parentDir, "alice.makerlog.ai");
    makeBrainRepo(brainDir);
    makeFaceRepo(faceDir);
  });

  afterEach(() => {
    if (existsSync(parentDir)) rmSync(parentDir, { recursive: true, force: true });
  });

  it("detects private repo when in brain directory", () => {
    const { privatePath } = resolveRepoPaths(brainDir);
    expect(privatePath).toBe(brainDir);
  });

  it("detects public repo when in face directory", () => {
    const { publicPath } = resolveRepoPaths(faceDir);
    expect(publicPath).toBe(faceDir);
  });

  it("finds sibling public repo from brain directory", () => {
    const { publicPath } = resolveRepoPaths(brainDir);
    expect(publicPath).toBe(faceDir);
  });

  it("returns null for private when not in a cocapn directory", () => {
    const { privatePath } = resolveRepoPaths(parentDir);
    expect(privatePath).toBeNull();
  });
});

// ─── syncRepo ──────────────────────────────────────────────────────────────

describe("syncRepo", () => {
  let dir: string;

  beforeEach(() => {
    dir = uniqueDir();
    makeBrainRepo(dir);
  });

  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it("syncs a clean repo (no changes)", () => {
    const result = syncRepo(dir, "private", "[cocapn] test");
    expect(result.committed).toBe(false);
    expect(result.files).toEqual([]);
    expect(result.repo).toBe("private");
  });

  it("syncs a dirty repo (commits changes)", () => {
    writeFileSync(join(dir, "cocapn", "dirty.md"), "dirty");
    const result = syncRepo(dir, "private", "[cocapn] test");
    expect(result.committed).toBe(true);
    expect(result.files.length).toBeGreaterThan(0);
  });

  it("pushed is false when no remote configured", () => {
    const result = syncRepo(dir, "private", "[cocapn] test");
    expect(result.pushed).toBe(false);
  });
});

// ─── printRepoStatus ──────────────────────────────────────────────────────

describe("printRepoStatus", () => {
  it("prints clean status without throwing", () => {
    const status: SyncRepoStatus = {
      path: "/tmp/test",
      branch: "main",
      clean: true,
      changedFiles: [],
      hasRemote: false,
      ahead: 0,
      behind: 0,
      lastCommitMsg: "init",
      lastCommitDate: "2 hours ago",
    };
    expect(() => printRepoStatus("Test", status)).not.toThrow();
  });

  it("prints dirty status with files", () => {
    const status: SyncRepoStatus = {
      path: "/tmp/test",
      branch: "main",
      clean: false,
      changedFiles: ["foo.ts", "bar.ts"],
      hasRemote: true,
      ahead: 2,
      behind: 1,
      lastCommitMsg: "feat: add thing",
      lastCommitDate: "5 min ago",
    };
    expect(() => printRepoStatus("Test", status)).not.toThrow();
  });
});

// ─── Conflict detection ────────────────────────────────────────────────────

describe("conflict handling", () => {
  let dir: string;

  beforeEach(() => {
    dir = uniqueDir();
    makeBrainRepo(dir);
  });

  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it("syncRepo handles repos with conflict markers in a file", () => {
    writeFileSync(join(dir, "conflict.md"), "<<<<<<< HEAD\ncontent\n=======\nother\n>>>>>>> branch\n");
    // Conflict detection uses git ls-files -u, not file content, so this should work
    const result = syncRepo(dir, "private", "[cocapn] test");
    expect(result.repo).toBe("private");
  });
});

// ─── End-to-end: sync both repos ───────────────────────────────────────────

describe("end-to-end sync", () => {
  let brainDir: string;
  let faceDir: string;
  let parentDir: string;

  beforeEach(() => {
    parentDir = uniqueDir();
    brainDir = join(parentDir, "brain");
    faceDir = join(parentDir, "alice.makerlog.ai");
    makeBrainRepo(brainDir);
    makeFaceRepo(faceDir);
  });

  afterEach(() => {
    if (existsSync(parentDir)) rmSync(parentDir, { recursive: true, force: true });
  });

  it("can sync both repos with changes", () => {
    writeFileSync(join(brainDir, "cocapn", "brain-update.md"), "brain change");
    writeFileSync(join(faceDir, "face-update.html"), "<html>face change</html>");

    const brainResult = syncRepo(brainDir, "private", "[cocapn] brain sync");
    const faceResult = syncRepo(faceDir, "public", "[cocapn] face sync");

    expect(brainResult.committed).toBe(true);
    expect(faceResult.committed).toBe(true);
  });

  it("handles one clean and one dirty repo", () => {
    writeFileSync(join(brainDir, "cocapn", "update.md"), "update");

    const brainResult = syncRepo(brainDir, "private", "[cocapn] brain sync");
    const faceResult = syncRepo(faceDir, "public", "[cocapn] face sync");

    expect(brainResult.committed).toBe(true);
    expect(faceResult.committed).toBe(false);
  });
});
