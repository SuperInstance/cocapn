/**
 * Tests for cocapn export command
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  formatJSON,
  formatJSONL,
  formatMarkdown,
  formatCSV,
  loadBrainEntries,
  loadKnowledgeEntries,
  loadWikiEntries,
  loadChatHistory,
  type ExportEntry,
} from "../src/commands/export.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

const testDir = join(process.cwd(), ".test-export-tmp");

function setupRepo(): void {
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true });
  }
  const memoryDir = join(testDir, "cocapn", "memory");
  const wikiDir = join(testDir, "cocapn", "wiki");
  const chatDir = join(testDir, "cocapn", "chat");
  mkdirSync(memoryDir, { recursive: true });
  mkdirSync(wikiDir, { recursive: true });
  mkdirSync(chatDir, { recursive: true });

  writeFileSync(join(memoryDir, "facts.json"), JSON.stringify({
    "user.name": "Alice",
    "user.email": "alice@example.com",
    "private.phone": "555-1234",
    "knowledge.species.1": "salmon",
    "knowledge.species.2": "halibut",
    "knowledge.regulation.limit": "6 per day",
    "knowledge.technique.troll": "trolling at 2.5mph",
  }));

  writeFileSync(join(memoryDir, "memories.json"), JSON.stringify([
    { id: "m1", content: "Alice prefers morning fishing trips", createdAt: "2026-03-30T10:00:00Z", confidence: 0.9 },
    { id: "m2", content: "Best bait for salmon is herring", createdAt: "2026-03-29T10:00:00Z", confidence: 0.8 },
  ]));

  writeFileSync(join(wikiDir, "guide.md"), "# Fishing Guide\n\nThis is a guide about fishing.");
  writeFileSync(join(wikiDir, "species.md"), "# Species\n\nCommon species in the area.");

  writeFileSync(join(chatDir, "sess-001.json"), JSON.stringify([
    { role: "user", content: "Hello!", timestamp: "2026-03-30T10:00:00Z" },
    { role: "assistant", content: "Hi Alice! How can I help?", timestamp: "2026-03-30T10:00:01Z" },
    { role: "user", content: "What species are in season?", timestamp: "2026-03-30T10:00:05Z" },
  ]));
}

function cleanupRepo(): void {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
}

const sampleEntries: ExportEntry[] = [
  { type: "fact", key: "user.name", value: "Alice" },
  { type: "knowledge", key: "knowledge.species.1", value: "salmon" },
  { type: "memory", key: "m1", value: "Prefers morning trips" },
  { type: "wiki", key: "guide", value: "# Guide\n\nContent here." },
];

// ─── formatJSON ─────────────────────────────────────────────────────────────

describe("formatJSON", () => {
  it("pretty-prints entries as JSON", () => {
    const result = formatJSON(sampleEntries);
    const parsed = JSON.parse(result) as ExportEntry[];
    expect(parsed).toHaveLength(4);
    expect(parsed[0].type).toBe("fact");
    expect(result).toContain("  ");
  });

  it("handles empty array", () => {
    const result = formatJSON([]);
    expect(result).toBe("[]");
  });
});

// ─── formatJSONL ────────────────────────────────────────────────────────────

describe("formatJSONL", () => {
  it("outputs one JSON object per line", () => {
    const result = formatJSONL(sampleEntries);
    const lines = result.split("\n");
    expect(lines).toHaveLength(4);
    for (const line of lines) {
      const parsed = JSON.parse(line) as ExportEntry;
      expect(parsed).toHaveProperty("type");
      expect(parsed).toHaveProperty("key");
      expect(parsed).toHaveProperty("value");
    }
  });

  it("handles empty array", () => {
    const result = formatJSONL([]);
    expect(result).toBe("");
  });
});

// ─── formatMarkdown ─────────────────────────────────────────────────────────

describe("formatMarkdown", () => {
  it("groups entries by type with headers", () => {
    const result = formatMarkdown(sampleEntries);
    expect(result).toContain("# Cocapn Export");
    expect(result).toContain("## Fact (1)");
    expect(result).toContain("## Knowledge (1)");
    expect(result).toContain("## Memory (1)");
    expect(result).toContain("## Wiki (1)");
  });

  it("includes entry keys as sub-headers", () => {
    const result = formatMarkdown(sampleEntries);
    expect(result).toContain("### user.name");
    expect(result).toContain("### guide");
  });

  it("includes entry values", () => {
    const result = formatMarkdown(sampleEntries);
    expect(result).toContain("Alice");
    expect(result).toContain("salmon");
    expect(result).toContain("# Guide");
  });

  it("handles empty entries", () => {
    const result = formatMarkdown([]);
    expect(result).toContain("# Export");
    expect(result).toContain("No entries found");
  });
});

// ─── formatCSV ──────────────────────────────────────────────────────────────

describe("formatCSV", () => {
  it("outputs header row and data rows", () => {
    const simpleEntries: ExportEntry[] = [
      { type: "fact", key: "user.name", value: "Alice" },
      { type: "knowledge", key: "knowledge.species.1", value: "salmon" },
    ];
    const result = formatCSV(simpleEntries);
    const lines = result.split("\n");
    expect(lines[0]).toBe("type,key,value");
    expect(lines).toHaveLength(3);
  });

  it("escapes values with commas", () => {
    const entries: ExportEntry[] = [
      { type: "fact", key: "desc", value: "hello, world" },
    ];
    const result = formatCSV(entries);
    expect(result).toContain('"hello, world"');
  });

  it("escapes values with quotes", () => {
    const entries: ExportEntry[] = [
      { type: "fact", key: "quote", value: 'say "hi"' },
    ];
    const result = formatCSV(entries);
    expect(result).toContain('"say ""hi"""');
  });

  it("handles empty array", () => {
    const result = formatCSV([]);
    expect(result).toBe("type,key,value");
  });
});

// ─── loadBrainEntries ───────────────────────────────────────────────────────

describe("loadBrainEntries", () => {
  beforeEach(() => setupRepo());
  afterEach(() => cleanupRepo());

  it("loads all brain data (facts, memories, wiki)", () => {
    const entries = loadBrainEntries(testDir);
    // 7 facts total (3 fact + 4 knowledge) + 2 memories + 2 wiki = 11
    expect(entries.length).toBe(11);
  });

  it("categorizes types correctly", () => {
    const entries = loadBrainEntries(testDir);
    const facts = entries.filter((e) => e.type === "fact");
    const knowledge = entries.filter((e) => e.type === "knowledge");
    const memories = entries.filter((e) => e.type === "memory");
    const wiki = entries.filter((e) => e.type === "wiki");
    expect(facts.length).toBe(3);
    expect(knowledge.length).toBe(4);
    expect(memories.length).toBe(2);
    expect(wiki.length).toBe(2);
  });

  it("returns empty when no cocapn dir", () => {
    cleanupRepo();
    expect(loadBrainEntries(testDir)).toEqual([]);
  });
});

// ─── loadKnowledgeEntries ───────────────────────────────────────────────────

describe("loadKnowledgeEntries", () => {
  beforeEach(() => setupRepo());
  afterEach(() => cleanupRepo());

  it("loads all knowledge entries without filter", () => {
    const entries = loadKnowledgeEntries(testDir);
    expect(entries.length).toBe(4);
    expect(entries.every((e) => e.type === "knowledge")).toBe(true);
  });

  it("filters by type prefix", () => {
    const entries = loadKnowledgeEntries(testDir, "species");
    expect(entries.length).toBe(2);
    expect(entries.every((e) => e.key.startsWith("knowledge.species."))).toBe(true);
  });

  it("filters by regulation type", () => {
    const entries = loadKnowledgeEntries(testDir, "regulation");
    expect(entries.length).toBe(1);
    expect(entries[0].key).toBe("knowledge.regulation.limit");
  });

  it("returns empty for unknown type", () => {
    const entries = loadKnowledgeEntries(testDir, "nonexistent");
    expect(entries).toEqual([]);
  });

  it("returns empty when no cocapn dir", () => {
    cleanupRepo();
    expect(loadKnowledgeEntries(testDir)).toEqual([]);
  });
});

// ─── loadWikiEntries ────────────────────────────────────────────────────────

describe("loadWikiEntries", () => {
  beforeEach(() => setupRepo());
  afterEach(() => cleanupRepo());

  it("loads wiki pages", () => {
    const entries = loadWikiEntries(testDir);
    expect(entries.length).toBe(2);
    expect(entries.every((e) => e.type === "wiki")).toBe(true);
    expect(entries.some((e) => e.key === "guide")).toBe(true);
    expect(entries.some((e) => e.key === "species")).toBe(true);
  });

  it("includes full markdown content", () => {
    const entries = loadWikiEntries(testDir);
    const guide = entries.find((e) => e.key === "guide");
    expect(guide?.value).toContain("# Fishing Guide");
  });

  it("returns empty when no cocapn dir", () => {
    cleanupRepo();
    expect(loadWikiEntries(testDir)).toEqual([]);
  });
});

// ─── loadChatHistory ────────────────────────────────────────────────────────

describe("loadChatHistory", () => {
  beforeEach(() => setupRepo());
  afterEach(() => cleanupRepo());

  it("loads chat messages for a session", () => {
    const entries = loadChatHistory(testDir, "sess-001");
    expect(entries.length).toBe(3);
    expect(entries.every((e) => e.type === "chat")).toBe(true);
  });

  it("includes meta with role and timestamp", () => {
    const entries = loadChatHistory(testDir, "sess-001");
    expect(entries[0].meta?.role).toBe("user");
    expect(entries[0].meta?.timestamp).toBe("2026-03-30T10:00:00Z");
  });

  it("returns empty for nonexistent session", () => {
    const entries = loadChatHistory(testDir, "nonexistent");
    expect(entries).toEqual([]);
  });

  it("returns empty when no cocapn dir", () => {
    cleanupRepo();
    expect(loadChatHistory(testDir, "sess-001")).toEqual([]);
  });
});

// ─── Integration: format round-trip ─────────────────────────────────────────

describe("format round-trip with real data", () => {
  beforeEach(() => setupRepo());
  afterEach(() => cleanupRepo());

  it("brain entries serialize and parse back for json", () => {
    const entries = loadBrainEntries(testDir);
    const formatted = formatJSON(entries);
    const parsed = JSON.parse(formatted) as ExportEntry[];
    expect(parsed).toEqual(entries);
  });

  it("knowledge entries serialize and parse back for jsonl", () => {
    const entries = loadKnowledgeEntries(testDir, "species");
    const formatted = formatJSONL(entries);
    const parsed = formatted.split("\n").map((l) => JSON.parse(l) as ExportEntry);
    expect(parsed).toEqual(entries);
  });

  it("brain entries produce valid CSV with header", () => {
    const entries = loadBrainEntries(testDir);
    const formatted = formatCSV(entries);
    expect(formatted.startsWith("type,key,value\n")).toBe(true);
    // Markdown values contain newlines, so just check header is present
    expect(formatted).toContain("fact,");
    expect(formatted).toContain("knowledge,");
    expect(formatted).toContain("memory,");
    expect(formatted).toContain("wiki,");
  });
});

// ─── File output ────────────────────────────────────────────────────────────

describe("file output", () => {
  beforeEach(() => setupRepo());
  afterEach(() => cleanupRepo());

  it("can write export to a file", () => {
    const entries = loadBrainEntries(testDir);
    const output = formatJSON(entries);
    const outPath = join(testDir, "output", "brain.json");

    mkdirSync(join(testDir, "output"), { recursive: true });
    writeFileSync(outPath, output, "utf-8");

    expect(existsSync(outPath)).toBe(true);
    const readBack = readFileSync(outPath, "utf-8");
    expect(readBack).toBe(output);
  });

  it("can write JSONL to a file", () => {
    const entries = loadKnowledgeEntries(testDir);
    const output = formatJSONL(entries);
    const outPath = join(testDir, "knowledge.jsonl");

    writeFileSync(outPath, output, "utf-8");

    expect(existsSync(outPath)).toBe(true);
    const lines = readFileSync(outPath, "utf-8").split("\n").filter(Boolean);
    expect(lines.length).toBe(entries.length);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});
