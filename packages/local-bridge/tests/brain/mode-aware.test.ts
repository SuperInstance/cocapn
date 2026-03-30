/**
 * Tests for Brain mode-aware access — public/private/maintenance/a2a filtering.
 *
 * Verifies that:
 *   - Public mode hides private.* facts
 *   - Public mode blocks wiki pages in private/ dir
 *   - Public mode prevents writes
 *   - Private mode has full access
 *   - Maintenance mode has full access
 *   - A2A mode hides private.* facts
 *   - setMode() persists across calls
 *   - Per-call mode parameter overrides current mode
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { simpleGit } from "simple-git";
import { Brain } from "../../src/brain/index.js";
import { GitSync } from "../../src/git/sync.js";
import { DEFAULT_CONFIG, type BridgeConfig } from "../../src/config/types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makeTempRepo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "cocapn-mode-test-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test");
  await git.addConfig("user.email", "test@test.com");
  writeFileSync(join(dir, "README.md"), "test\n");
  await git.add(".");
  await git.commit("init");
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

function setupFacts(repoRoot: string): void {
  const factsDir = join(repoRoot, "cocapn", "memory");
  mkdirSync(factsDir, { recursive: true });
  writeFileSync(
    join(factsDir, "facts.json"),
    JSON.stringify({
      name: "Test Agent",
      "private.apiKey": "sk-secret-123",
      "private.internalNote": "internal only",
      version: "1.0",
    }),
    "utf8",
  );
}

function setupWiki(repoRoot: string): void {
  const wikiDir = join(repoRoot, "cocapn", "wiki");
  mkdirSync(wikiDir, { recursive: true });
  mkdirSync(join(wikiDir, "private"), { recursive: true });

  writeFileSync(join(wikiDir, "public.md"), "# Public\nThis is public.", "utf8");
  writeFileSync(join(wikiDir, "private", "secrets.md"), "# Secrets\nSecret data.", "utf8");
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Brain mode-aware access", () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await makeTempRepo();
  });

  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  describe("getFact", () => {
    it("returns private.* facts in private mode (default)", () => {
      setupFacts(repoRoot);
      const brain = makeBrain(repoRoot);

      expect(brain.getFact("name")).toBe("Test Agent");
      expect(brain.getFact("private.apiKey")).toBe("sk-secret-123");
    });

    it("hides private.* facts in public mode", () => {
      setupFacts(repoRoot);
      const brain = makeBrain(repoRoot);

      expect(brain.getFact("private.apiKey", "public")).toBeUndefined();
      expect(brain.getFact("name", "public")).toBe("Test Agent");
    });

    it("hides private.* facts in a2a mode", () => {
      setupFacts(repoRoot);
      const brain = makeBrain(repoRoot);

      expect(brain.getFact("private.apiKey", "a2a")).toBeUndefined();
      expect(brain.getFact("version", "a2a")).toBe("1.0");
    });

    it("returns all facts in maintenance mode", () => {
      setupFacts(repoRoot);
      const brain = makeBrain(repoRoot);

      expect(brain.getFact("private.internalNote", "maintenance")).toBe("internal only");
      expect(brain.getFact("name", "maintenance")).toBe("Test Agent");
    });

    it("uses current mode when no mode parameter given", () => {
      setupFacts(repoRoot);
      const brain = makeBrain(repoRoot);
      brain.setMode("public");

      expect(brain.getFact("private.apiKey")).toBeUndefined();
      expect(brain.getFact("name")).toBe("Test Agent");
    });
  });

  describe("getAllFacts", () => {
    it("returns all facts in private mode", () => {
      setupFacts(repoRoot);
      const brain = makeBrain(repoRoot);

      const facts = brain.getAllFacts();
      expect(facts).toHaveProperty("name", "Test Agent");
      expect(facts).toHaveProperty("private.apiKey", "sk-secret-123");
      expect(facts).toHaveProperty("version", "1.0");
    });

    it("filters private.* facts in public mode", () => {
      setupFacts(repoRoot);
      const brain = makeBrain(repoRoot);

      const facts = brain.getAllFacts("public");
      expect(facts).toHaveProperty("name", "Test Agent");
      expect(facts).toHaveProperty("version", "1.0");
      expect(facts).not.toHaveProperty("private.apiKey");
      expect(facts).not.toHaveProperty("private.internalNote");
    });

    it("filters private.* facts in a2a mode", () => {
      setupFacts(repoRoot);
      const brain = makeBrain(repoRoot);

      const facts = brain.getAllFacts("a2a");
      expect(facts).toHaveProperty("name");
      expect(facts).not.toHaveProperty("private.apiKey");
    });

    it("returns all facts in maintenance mode", () => {
      setupFacts(repoRoot);
      const brain = makeBrain(repoRoot);

      const facts = brain.getAllFacts("maintenance");
      expect(facts).toHaveProperty("private.apiKey");
      expect(facts).toHaveProperty("name");
    });
  });

  describe("setFact", () => {
    it("writes in private mode (default)", async () => {
      setupFacts(repoRoot);
      const brain = makeBrain(repoRoot);

      await brain.setFact("newKey", "newValue");
      expect(brain.getFact("newKey")).toBe("newValue");
    }, 10_000);

    it("writes in maintenance mode", async () => {
      setupFacts(repoRoot);
      const brain = makeBrain(repoRoot);

      await brain.setFact("newKey", "newValue", "maintenance");
      expect(brain.getFact("newKey")).toBe("newValue");
    }, 10_000);

    it("is a no-op in public mode", async () => {
      setupFacts(repoRoot);
      const brain = makeBrain(repoRoot);

      await brain.setFact("newKey", "newValue", "public");
      expect(brain.getFact("newKey")).toBeUndefined();
    });

    it("is a no-op in a2a mode", async () => {
      setupFacts(repoRoot);
      const brain = makeBrain(repoRoot);

      await brain.setFact("newKey", "newValue", "a2a");
      expect(brain.getFact("newKey")).toBeUndefined();
    });
  });

  describe("readWikiPage", () => {
    it("reads public wiki pages in all modes", () => {
      setupWiki(repoRoot);
      const brain = makeBrain(repoRoot);

      expect(brain.readWikiPage("public.md", "public")).toContain("This is public");
      expect(brain.readWikiPage("public.md", "private")).toContain("This is public");
    });

    it("blocks private/ wiki pages in public mode", () => {
      setupWiki(repoRoot);
      const brain = makeBrain(repoRoot);

      expect(brain.readWikiPage("private/secrets.md", "public")).toBeNull();
    });

    it("blocks private/ wiki pages in a2a mode", () => {
      setupWiki(repoRoot);
      const brain = makeBrain(repoRoot);

      expect(brain.readWikiPage("private/secrets.md", "a2a")).toBeNull();
    });

    it("allows private/ wiki pages in private mode", () => {
      setupWiki(repoRoot);
      const brain = makeBrain(repoRoot);

      expect(brain.readWikiPage("private/secrets.md", "private")).toContain("Secret data");
    });

    it("allows private/ wiki pages in maintenance mode", () => {
      setupWiki(repoRoot);
      const brain = makeBrain(repoRoot);

      expect(brain.readWikiPage("private/secrets.md", "maintenance")).toContain("Secret data");
    });
  });

  describe("setMode / getMode", () => {
    it("defaults to private mode", () => {
      const brain = makeBrain(repoRoot);
      expect(brain.getMode()).toBe("private");
    });

    it("switches mode via setMode", () => {
      const brain = makeBrain(repoRoot);
      brain.setMode("public");
      expect(brain.getMode()).toBe("public");
      brain.setMode("maintenance");
      expect(brain.getMode()).toBe("maintenance");
      brain.setMode("a2a");
      expect(brain.getMode()).toBe("a2a");
      brain.setMode("private");
      expect(brain.getMode()).toBe("private");
    });

    it("per-call mode overrides current mode", () => {
      setupFacts(repoRoot);
      const brain = makeBrain(repoRoot);
      brain.setMode("public");

      // Current mode is public, but explicit private mode override works
      expect(brain.getFact("private.apiKey", "private")).toBe("sk-secret-123");
    });
  });
});
