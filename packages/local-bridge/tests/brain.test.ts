/**
 * Tests for the Brain class — memory read/write with auto-commit.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { simpleGit } from "simple-git";
import { Brain } from "../src/brain/index.js";
import { GitSync } from "../src/git/sync.js";
import { DEFAULT_CONFIG, type BridgeConfig } from "../src/config/types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makeTempRepo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "cocapn-brain-test-"));
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
  const sync   = new GitSync(repoRoot, config);
  return new Brain(repoRoot, config, sync);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Brain.getSoul", () => {
  let repoRoot: string;

  beforeEach(async () => { repoRoot = await makeTempRepo(); });
  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  it("returns empty string when soul.md is missing", () => {
    const brain = makeBrain(repoRoot);
    expect(brain.getSoul()).toBe("");
  });

  it("returns soul.md content", () => {
    mkdirSync(join(repoRoot, "cocapn"), { recursive: true });
    writeFileSync(join(repoRoot, "cocapn", "soul.md"), "# Soul\nHello, agent.", "utf8");
    const brain = makeBrain(repoRoot);
    expect(brain.getSoul()).toContain("Hello, agent.");
  });
});

describe("Brain facts", () => {
  let repoRoot: string;

  beforeEach(async () => { repoRoot = await makeTempRepo(); });
  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  it("getFact returns undefined when facts.json is absent", () => {
    const brain = makeBrain(repoRoot);
    expect(brain.getFact("name")).toBeUndefined();
  });

  it("setFact creates facts.json and commits", async () => {
    const brain = makeBrain(repoRoot);
    await brain.setFact("name", "Alice");

    expect(brain.getFact("name")).toBe("Alice");

    const raw = JSON.parse(readFileSync(join(repoRoot, "cocapn", "memory", "facts.json"), "utf8"));
    expect(raw).toEqual({ name: "Alice" });
  });

  it("setFact overwrites existing fact", async () => {
    const brain = makeBrain(repoRoot);
    await brain.setFact("name", "Alice");
    await brain.setFact("name", "Bob");
    expect(brain.getFact("name")).toBe("Bob");
  });

  it("getAllFacts returns all stored facts", async () => {
    const brain = makeBrain(repoRoot);
    await brain.setFact("a", "1");
    await brain.setFact("b", "2");
    expect(brain.getAllFacts()).toEqual({ a: "1", b: "2" });
  });

  it("deleteFact removes a fact", async () => {
    const brain = makeBrain(repoRoot);
    await brain.setFact("x", "y");
    await brain.deleteFact("x");
    expect(brain.getFact("x")).toBeUndefined();
  });

  it("handles legacy array facts.json gracefully (returns empty)", () => {
    mkdirSync(join(repoRoot, "cocapn", "memory"), { recursive: true });
    writeFileSync(join(repoRoot, "cocapn", "memory", "facts.json"), "[]", "utf8");
    const brain = makeBrain(repoRoot);
    expect(brain.getAllFacts()).toEqual({});
  });
});

describe("Brain.searchWiki", () => {
  let repoRoot: string;

  beforeEach(async () => { repoRoot = await makeTempRepo(); });
  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  it("returns empty array when wiki dir is missing", () => {
    const brain = makeBrain(repoRoot);
    expect(brain.searchWiki("anything")).toEqual([]);
  });

  it("finds pages matching the query", () => {
    const wikiDir = join(repoRoot, "cocapn", "wiki");
    mkdirSync(wikiDir, { recursive: true });
    writeFileSync(join(wikiDir, "soldering.md"), "# Soldering\nTips for soldering SMD components.", "utf8");
    writeFileSync(join(wikiDir, "rust.md"), "# Rust\nOwnership and borrowing.", "utf8");

    const brain = makeBrain(repoRoot);
    const results = brain.searchWiki("soldering");
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe("Soldering");
    expect(results[0]!.file).toBe("soldering.md");
    expect(results[0]!.excerpt).toContain("Soldering");
  });

  it("is case-insensitive", () => {
    const wikiDir = join(repoRoot, "cocapn", "wiki");
    mkdirSync(wikiDir, { recursive: true });
    writeFileSync(join(wikiDir, "test.md"), "# Test\nTypeScript generics.", "utf8");

    const brain = makeBrain(repoRoot);
    expect(brain.searchWiki("TYPESCRIPT")).toHaveLength(1);
  });
});

describe("Brain.createTask", () => {
  let repoRoot: string;

  beforeEach(async () => { repoRoot = await makeTempRepo(); });
  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  it("creates a task file and returns its id", async () => {
    const brain = makeBrain(repoRoot);
    const id = await brain.createTask("Write tests", "Cover all edge cases");

    expect(id).toBeTruthy();
    expect(existsSync(join(repoRoot, "cocapn", "tasks", `${id}.md`))).toBe(true);
  });

  it("listTasks includes the new task", async () => {
    const brain = makeBrain(repoRoot);
    await brain.createTask("My Task", "Do something");

    const tasks = brain.listTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.title).toBe("My Task");
    expect(tasks[0]!.status).toBe("active");
  });
});

describe("Brain.buildContext", () => {
  let repoRoot: string;

  beforeEach(async () => { repoRoot = await makeTempRepo(); });
  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  it("returns valid JSON with soul, facts, activeTasks", async () => {
    mkdirSync(join(repoRoot, "cocapn"), { recursive: true });
    writeFileSync(join(repoRoot, "cocapn", "soul.md"), "# Soul", "utf8");

    const brain = makeBrain(repoRoot);
    await brain.setFact("role", "engineer");

    const ctx = JSON.parse(brain.buildContext()) as { soul: string; facts: Record<string,string>; activeTasks: number };
    expect(ctx.soul).toContain("Soul");
    expect(ctx.facts).toEqual({ role: "engineer" });
    expect(ctx.activeTasks).toBe(0);
  });
});
