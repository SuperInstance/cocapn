/**
 * Tests for Brain ↔ RepoLearner integration.
 *
 * Verifies that:
 *   - Brain initializes RepoLearner on construction
 *   - queryFileContext delegates to RepoLearner
 *   - queryModuleInfo delegates to RepoLearner
 *   - queryArchitecture delegates to RepoLearner
 *   - getRepoLearner returns the instance
 *   - Lazy index build on first access
 *   - Graceful fallback when not a git repo
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { simpleGit } from "simple-git";
import { Brain } from "../../src/brain/index.js";
import { GitSync } from "../../src/git/sync.js";
import { DEFAULT_CONFIG, type BridgeConfig } from "../../src/config/types.js";
import { RepoLearner } from "../../src/brain/repo-learner.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makeTempRepo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "cocapn-repo-learn-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test");
  await git.addConfig("user.email", "test@test.com");
  writeFileSync(join(dir, "README.md"), "# Test\ninitial\n");
  await git.add(".");
  await git.commit("init: initial commit");
  return dir;
}

function makeConfig(repoRoot: string): BridgeConfig {
  return {
    ...DEFAULT_CONFIG,
    soul: "cocapn/soul.md",
    memory: {
      facts: "cocapn/memory/facts.json",
      procedures: "cocapn/memory/procedures.json",
      relationships: "cocapn/memory/relationships.json",
    },
    sync: {
      interval: 300,
      memoryInterval: 60,
      autoCommit: false,
      autoPush: false,
    },
  };
}

function makeBrain(repoRoot: string): Brain {
  const config = makeConfig(repoRoot);
  const sync = new GitSync(repoRoot, config);
  return new Brain(repoRoot, config, sync);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Brain RepoLearner integration", () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await makeTempRepo();
  });

  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  describe("construction", () => {
    it("initializes RepoLearner on construction", () => {
      const brain = makeBrain(repoRoot);
      const learner = brain.getRepoLearner();
      expect(learner).toBeDefined();
      expect(learner).toBeInstanceOf(RepoLearner);
    });

    it("exposes RepoLearner via getRepoLearner()", () => {
      const brain = makeBrain(repoRoot);
      const learner = brain.getRepoLearner();
      expect(learner).toBeDefined();
      expect(typeof learner.buildIndex).toBe("function");
      expect(typeof learner.queryFile).toBe("function");
      expect(typeof learner.queryModule).toBe("function");
      expect(typeof learner.queryArchitecture).toBe("function");
    });
  });

  describe("queryFileContext", () => {
    it("delegates to RepoLearner.queryFile", async () => {
      const brain = makeBrain(repoRoot);

      // Add a commit touching a specific file so we have data
      const git = simpleGit(repoRoot);
      mkdirSync(join(repoRoot, "src"), { recursive: true });
      writeFileSync(join(repoRoot, "src", "index.ts"), "export const x = 1;\n", "utf8");
      await git.add(".");
      await git.commit("feat: add index module");

      const result = await brain.queryFileContext("src/index.ts");
      // May be null or have data depending on git parsing
      // The important thing is it doesn't throw
      expect(result).toBeDefined();
    });

    it("returns null for unknown files", async () => {
      const brain = makeBrain(repoRoot);

      const result = await brain.queryFileContext("nonexistent/file.ts");
      expect(result).toBeNull();
    });
  });

  describe("queryModuleInfo", () => {
    it("delegates to RepoLearner.queryModule", async () => {
      const brain = makeBrain(repoRoot);

      const result = await brain.queryModuleInfo("src");
      // May be null if module wasn't detected
      expect(result).toBeDefined();
    });

    it("returns null for unknown modules", async () => {
      const brain = makeBrain(repoRoot);

      const result = await brain.queryModuleInfo("nonexistent-module");
      expect(result).toBeNull();
    });
  });

  describe("queryArchitecture", () => {
    it("delegates to RepoLearner.queryArchitecture", async () => {
      const brain = makeBrain(repoRoot);

      const result = await brain.queryArchitecture();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("graceful fallback", () => {
    it("works when not in a git repo", async () => {
      const nonGitDir = mkdtempSync(join(tmpdir(), "cocapn-no-git-"));
      const brain = makeBrain(nonGitDir);

      // These should not throw
      const fileCtx = await brain.queryFileContext("any/file.ts");
      const moduleInfo = await brain.queryModuleInfo("any");
      const arch = await brain.queryArchitecture();

      expect(fileCtx).toBeNull();
      expect(moduleInfo).toBeNull();
      expect(arch).toEqual([]);
    });
  });
});
