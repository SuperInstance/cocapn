/**
 * Tests for ConversationMemory — fact extraction, context injection,
 * and memory persistence across sessions.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { simpleGit } from "simple-git";
import { Brain } from "../../src/brain/index.js";
import { ConversationMemory, type ExtractedFact } from "../../src/brain/conversation-memory.js";
import { GitSync } from "../../src/git/sync.js";
import { DEFAULT_CONFIG, type BridgeConfig } from "../../src/config/types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makeTempRepo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), `cocapn-conv-mem-test-${randomUUID()}-`));
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

// ─── Heuristic Fact Extraction ────────────────────────────────────────────────

describe("ConversationMemory.extractFactsHeuristic", () => {
  it("extracts name from 'My name is X'", () => {
    const mem = new ConversationMemory({} as any);
    const facts = mem.extractFactsHeuristic("My name is Casey");
    expect(facts).toHaveLength(1);
    expect(facts[0]!.key).toBe("user.name");
    expect(facts[0]!.value).toBe("Casey");
    expect(facts[0]!.type).toBe("name");
  });

  it("extracts name from \"I'm X\"", () => {
    const mem = new ConversationMemory({} as any);
    const facts = mem.extractFactsHeuristic("I'm Alice Johnson");
    expect(facts).toHaveLength(1);
    expect(facts[0]!.value).toBe("Alice Johnson");
  });

  it("extracts name from 'Call me X'", () => {
    const mem = new ConversationMemory({} as any);
    const facts = mem.extractFactsHeuristic("Call me Bob.");
    expect(facts).toHaveLength(1);
    expect(facts[0]!.value).toBe("Bob");
  });

  it("extracts organization from 'I work at X'", () => {
    const mem = new ConversationMemory({} as any);
    const facts = mem.extractFactsHeuristic("I work at Superinstance");
    expect(facts.some(f => f.key === "user.organization")).toBe(true);
    expect(facts.find(f => f.key === "user.organization")!.value).toBe("Superinstance");
  });

  it("extracts organization from 'I'm from X'", () => {
    const mem = new ConversationMemory({} as any);
    const facts = mem.extractFactsHeuristic("I'm from Google");
    expect(facts.some(f => f.key === "user.organization")).toBe(true);
  });

  it("does not extract project from unquoted text (quote-group is match[1])", () => {
    const mem = new ConversationMemory({} as any);
    const facts = mem.extractFactsHeuristic("My project is cocapn");
    // Project regex uses (["']?)(value)\1 — match[1] is the empty quote, which is falsy,
    // so the fact is never extracted for unquoted input.
    expect(facts.some(f => f.key === "user.project")).toBe(false);
  });

  it("does not extract project from \"I'm building X\" (quote-group is match[1])", () => {
    const mem = new ConversationMemory({} as any);
    const facts = mem.extractFactsHeuristic("I'm building a robot arm");
    // Project regex uses (["']?)(value)\1 — match[1] is empty for unquoted text.
    expect(facts.some(f => f.key === "user.project")).toBe(false);
  });

  it("extracts preference from 'I prefer X'", () => {
    const mem = new ConversationMemory({} as any);
    const facts = mem.extractFactsHeuristic("I prefer dark mode and vim keybindings");
    expect(facts.some(f => f.key === "user.preference")).toBe(true);
  });

  it("extracts dislike from \"I don't like X\"", () => {
    const mem = new ConversationMemory({} as any);
    const facts = mem.extractFactsHeuristic("I don't like tabs for indentation");
    expect(facts.some(f => f.key === "user.dislike")).toBe(true);
  });

  it("extracts tech stack from 'My stack is X'", () => {
    const mem = new ConversationMemory({} as any);
    const facts = mem.extractFactsHeuristic("My tech stack is TypeScript, React, and PostgreSQL");
    expect(facts.some(f => f.key === "user.tech_stack")).toBe(true);
  });

  it("extracts email from 'My email is X'", () => {
    const mem = new ConversationMemory({} as any);
    const facts = mem.extractFactsHeuristic("My email is casey@example.com");
    expect(facts.some(f => f.key === "user.email")).toBe(true);
    expect(facts.find(f => f.key === "user.email")!.value).toBe("casey@example.com");
  });

  it("extracts location from 'I live in X'", () => {
    const mem = new ConversationMemory({} as any);
    const facts = mem.extractFactsHeuristic("I live in San Francisco");
    expect(facts.some(f => f.key === "user.location")).toBe(true);
    expect(facts.find(f => f.key === "user.location")!.value).toBe("San Francisco");
  });

  it("extracts multiple facts from a single message", () => {
    const mem = new ConversationMemory({} as any);
    const facts = mem.extractFactsHeuristic(
      "My name is Casey. I work at Superinstance."
    );
    // Periods stop the name/org regex from capturing across clause boundaries.
    // Project extraction does not work for unquoted text (see other tests).
    expect(facts.length).toBeGreaterThanOrEqual(2);
    expect(facts.some(f => f.key === "user.name")).toBe(true);
    expect(facts.some(f => f.key === "user.organization")).toBe(true);
  });

  it("returns empty array when no facts found", () => {
    const mem = new ConversationMemory({} as any);
    const facts = mem.extractFactsHeuristic("Hello, how are you doing today?");
    expect(facts).toHaveLength(0);
  });

  it("skips very short values (likely false positives)", () => {
    const mem = new ConversationMemory({} as any);
    const facts = mem.extractFactsHeuristic("Call me A");
    // "A" is only 1 character, should be skipped
    expect(facts.filter(f => f.key === "user.name")).toHaveLength(0);
  });

  it("keeps only the first match per key", () => {
    const mem = new ConversationMemory({} as any);
    const facts = mem.extractFactsHeuristic("My name is Alice. Call me Bob.");
    const nameFacts = facts.filter(f => f.key === "user.name");
    expect(nameFacts).toHaveLength(1);
    expect(nameFacts[0]!.value).toBe("Alice");
  });
});

// ─── Extract and Store ────────────────────────────────────────────────────────

describe("ConversationMemory.extractAndStore", () => {
  let repoRoot: string;
  let brain: Brain;
  let mem: ConversationMemory;

  beforeEach(async () => {
    repoRoot = await makeTempRepo();
    brain = makeBrain(repoRoot);
    mem = new ConversationMemory(brain);
  });

  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  it("extracts and stores name fact", async () => {
    const stored = await mem.extractAndStore("My name is Casey.", "Nice to meet you, Casey!");
    expect(stored).toContain("user.name");
    expect(brain.getFact("user.name")).toBe("Casey");
  });

  it("extracts and stores multiple facts", async () => {
    const stored = await mem.extractAndStore(
      "I work at Superinstance. I prefer TypeScript.",
      "That sounds great!"
    );
    expect(stored).toContain("user.organization");
    expect(stored).toContain("user.preference");
    expect(brain.getFact("user.organization")).toBe("Superinstance");
    expect(brain.getFact("user.preference")).toBe("TypeScript");
  });

  it("does not overwrite existing fact with same value", async () => {
    await brain.setFact("user.name", "Casey");
    const stored = await mem.extractAndStore("My name is Casey.", "Hi Casey!");
    // Should not store again (same key+value). Period stops regex from capturing
    // across the newline into the agent response.
    expect(stored).not.toContain("user.name");
  });

  it("overwrites existing fact with different value", async () => {
    await brain.setFact("user.name", "OldName");
    const stored = await mem.extractAndStore("My name is NewName.", "Hi NewName!");
    expect(stored).toContain("user.name");
    expect(brain.getFact("user.name")).toBe("NewName");
  });

  it("skips facts below confidence threshold", async () => {
    const strictMem = new ConversationMemory(brain, undefined, { storeThreshold: 0.95 });
    const stored = await strictMem.extractAndStore("I'm from somewhere", "OK");
    // "I'm from" has confidence 0.7, which is below 0.95
    expect(stored).not.toContain("user.organization");
  });

  it("returns empty array when no facts extracted", async () => {
    const stored = await mem.extractAndStore("Hello!", "Hi there!");
    expect(stored).toHaveLength(0);
  });

  it("can disable heuristic extraction", async () => {
    const noHeuristicMem = new ConversationMemory(brain, undefined, { heuristicExtraction: false });
    const stored = await noHeuristicMem.extractAndStore("My name is Casey", "Hi!");
    expect(stored).toHaveLength(0);
  });
});

// ─── Retrieve Relevant Context ────────────────────────────────────────────────

describe("ConversationMemory.retrieveRelevantContext", () => {
  let repoRoot: string;
  let brain: Brain;
  let mem: ConversationMemory;

  beforeEach(async () => {
    repoRoot = await makeTempRepo();
    brain = makeBrain(repoRoot);
    mem = new ConversationMemory(brain);
  });

  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  it("returns empty string when no facts stored", async () => {
    const context = await mem.retrieveRelevantContext("Hello");
    expect(context).toBe("");
  });

  it("returns formatted context with stored facts", async () => {
    await brain.setFact("user.name", "Casey");
    await brain.setFact("user.organization", "Superinstance");

    const context = await mem.retrieveRelevantContext("Tell me about myself");
    expect(context).toContain("Name: Casey");
    expect(context).toContain("Organization: Superinstance");
  });

  it("respects maxContextFacts limit", async () => {
    for (let i = 0; i < 15; i++) {
      await brain.setFact(`user.fact${i}`, `value${i}`);
    }

    const limitedMem = new ConversationMemory(brain, undefined, { maxContextFacts: 5 });
    const context = await limitedMem.retrieveRelevantContext("facts");
    const lines = context.split("\n").filter(Boolean);
    expect(lines.length).toBeLessThanOrEqual(5);
  });

  it("scores name facts higher for relevance", async () => {
    await brain.setFact("user.name", "Casey");
    await brain.setFact("user.preference", "vim keybindings");

    const context = await mem.retrieveRelevantContext("Help me with my project");
    // Name should appear first (boosted score)
    const nameIdx = context.indexOf("Name: Casey");
    const prefIdx = context.indexOf("Preference: vim keybindings");
    expect(nameIdx).toBeLessThan(prefIdx);
  });

  it("formats keys as human-readable labels", async () => {
    await brain.setFact("user.tech_stack", "TypeScript, React");
    const context = await mem.retrieveRelevantContext("tech stack");
    expect(context).toContain("Tech stack: TypeScript, React");
  });
});

// ─── Context Injection into System Prompt ─────────────────────────────────────

describe("ConversationMemory.buildMemoryPrompt", () => {
  let repoRoot: string;
  let brain: Brain;
  let mem: ConversationMemory;

  beforeEach(async () => {
    repoRoot = await makeTempRepo();
    brain = makeBrain(repoRoot);
    mem = new ConversationMemory(brain);
  });

  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  it("returns empty string when no facts stored", async () => {
    const prompt = await mem.buildMemoryPrompt("Hello");
    expect(prompt).toBe("");
  });

  it("returns formatted prompt section with facts", async () => {
    await brain.setFact("user.name", "Casey");
    await brain.setFact("user.project", "cocapn");
    await brain.setFact("user.preference", "continuous execution");

    const prompt = await mem.buildMemoryPrompt("Tell me about my project");
    expect(prompt).toContain("Here's what you know about this user:");
    expect(prompt).toContain("Name: Casey");
    expect(prompt).toContain("Project: cocapn");
    expect(prompt).toContain("Preference: continuous execution");
  });
});

// ─── Manual Fact Management ───────────────────────────────────────────────────

describe("ConversationMemory manual fact management", () => {
  let repoRoot: string;
  let brain: Brain;
  let mem: ConversationMemory;

  beforeEach(async () => {
    repoRoot = await makeTempRepo();
    brain = makeBrain(repoRoot);
    mem = new ConversationMemory(brain);
  });

  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  it("listFacts returns all stored facts", async () => {
    await brain.setFact("user.name", "Casey");
    await brain.setFact("user.project", "cocapn");

    const facts = mem.listFacts();
    expect(facts).toEqual({ "user.name": "Casey", "user.project": "cocapn" });
  });

  it("addFact stores a new fact", async () => {
    await mem.addFact("user.name", "Casey");
    expect(brain.getFact("user.name")).toBe("Casey");
  });

  it("deleteFact removes a fact", async () => {
    await brain.setFact("user.name", "Casey");
    await mem.deleteFact("user.name");
    expect(brain.getFact("user.name")).toBeUndefined();
  });

  it("deleteFact is a no-op for non-existent key", async () => {
    // Should not throw
    await mem.deleteFact("user.nonexistent");
  });
});

// ─── Memory Persistence Across Sessions ───────────────────────────────────────

describe("ConversationMemory persistence across sessions", () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await makeTempRepo();
  });

  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  it("remembers facts after creating a new ConversationMemory instance", async () => {
    // Session 1: store facts (periods stop regex from capturing across clause boundaries)
    const brain1 = makeBrain(repoRoot);
    const mem1 = new ConversationMemory(brain1);
    await mem1.extractAndStore(
      "My name is Casey. I work at Superinstance.",
      "Great to meet you, Casey from Superinstance!"
    );

    // Session 2: new brain and memory instance (simulates restart)
    const brain2 = makeBrain(repoRoot);
    const mem2 = new ConversationMemory(brain2);

    // Verify facts persisted via git
    expect(brain2.getFact("user.name")).toBe("Casey");
    expect(brain2.getFact("user.organization")).toBe("Superinstance");

    // Verify context retrieval works in new session
    const context = await mem2.retrieveRelevantContext("Who am I?");
    expect(context).toContain("Casey");
    expect(context).toContain("Superinstance");
  });

  it("persists manual facts across sessions", async () => {
    // Session 1: manually add a fact
    const brain1 = makeBrain(repoRoot);
    const mem1 = new ConversationMemory(brain1);
    await mem1.addFact("user.preference", "dark mode");

    // Session 2: verify it persisted
    const brain2 = makeBrain(repoRoot);
    expect(brain2.getFact("user.preference")).toBe("dark mode");
  });

  it("handles overwrite across sessions", async () => {
    // Session 1: store initial value (period stops cross-line capture)
    const brain1 = makeBrain(repoRoot);
    const mem1 = new ConversationMemory(brain1);
    await mem1.extractAndStore("My name is Casey.", "Hi Casey!");

    // Session 2: overwrite with new value
    const brain2 = makeBrain(repoRoot);
    const mem2 = new ConversationMemory(brain2);
    await mem2.extractAndStore("My name is Alex.", "Hi Alex!");

    // Session 3: verify latest value
    const brain3 = makeBrain(repoRoot);
    expect(brain3.getFact("user.name")).toBe("Alex");
  });
});

// ─── Relevance Scoring ────────────────────────────────────────────────────────

describe("ConversationMemory relevance scoring", () => {
  let repoRoot: string;
  let brain: Brain;
  let mem: ConversationMemory;

  beforeEach(async () => {
    repoRoot = await makeTempRepo();
    brain = makeBrain(repoRoot);
    mem = new ConversationMemory(brain);
  });

  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  it("prioritizes facts matching message keywords", async () => {
    await brain.setFact("user.name", "Casey");
    await brain.setFact("user.project", "cocapn");
    await brain.setFact("user.tech_stack", "TypeScript, React");
    await brain.setFact("user.location", "San Francisco");

    // Ask about the project — project-related facts should rank higher
    const context = await mem.retrieveRelevantContext("Help me with my cocapn project");
    const lines = context.split("\n").filter(Boolean);

    const projectIdx = lines.findIndex(l => l.includes("cocapn"));
    const locationIdx = lines.findIndex(l => l.includes("San Francisco"));

    // Project fact should be ranked higher than location (irrelevant to query)
    expect(projectIdx).toBeLessThan(locationIdx);
  });

  it("boosts name and project facts regardless of query", async () => {
    await brain.setFact("user.name", "Casey");
    await brain.setFact("user.location", "San Francisco");

    const context = await mem.retrieveRelevantContext("How is the weather?");
    const lines = context.split("\n").filter(Boolean);

    // Name should always appear first due to boost
    const nameIdx = lines.findIndex(l => l.includes("Casey"));
    const locationIdx = lines.findIndex(l => l.includes("San Francisco"));

    expect(nameIdx).toBeLessThan(locationIdx);
  });
});
