/**
 * Knowledge Pack Export/Import Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rmSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { Brain } from "../../src/brain/index.js";
import { MemoryManager } from "../../src/brain/memory-manager.js";
import { KnowledgePackExporter, KnowledgePackImporter, type KnowledgePack } from "../../src/brain/knowledge-pack.js";
import { loadConfig } from "../../src/config/loader.js";
import { GitSync } from "../../src/git/sync.js";

describe("Knowledge Pack Export/Import", () => {
  let testRepoRoot: string;
  let brain: Brain;
  let memoryManager: MemoryManager;
  let sync: GitSync;

  beforeEach(async () => {
    // Create a temporary test repository
    testRepoRoot = join(tmpdir(), `cocapn-test-${randomUUID()}`);
    mkdirSync(testRepoRoot, { recursive: true });
    mkdirSync(join(testRepoRoot, "cocapn"), { recursive: true });
    mkdirSync(join(testRepoRoot, "cocapn", "memory"), { recursive: true });

    // Initialize Git
    const { execSync } = await import("child_process");
    execSync("git init", { cwd: testRepoRoot });
    execSync('git config user.email "test@test.com"', { cwd: testRepoRoot });
    execSync('git config user.name "Test User"', { cwd: testRepoRoot });

    // Create config
    const config = loadConfig(testRepoRoot);
    sync = new GitSync(testRepoRoot, config);
    brain = new Brain(testRepoRoot, config, sync);
    memoryManager = new MemoryManager(brain);
  });

  afterEach(() => {
    // Clean up test repository
    if (existsSync(testRepoRoot)) {
      rmSync(testRepoRoot, { recursive: true, force: true });
    }
  });

  describe("KnowledgePackExporter", () => {
    it("should export all memories", async () => {
      // Add some memories
      await memoryManager.remember("pattern:async-error", "Use async/await for error handling", {
        type: "implicit",
        confidence: 0.9,
        tags: ["javascript", "async"],
      });

      await memoryManager.remember("preference:test-style", "Prefer vitest over jest", {
        type: "preference",
        confidence: 0.8,
        tags: ["testing"],
      });

      const exporter = new KnowledgePackExporter(brain, memoryManager);
      const pack = await exporter.export();

      expect(pack.version).toBe("1.0");
      expect(pack.memories).toHaveLength(2);
      expect(pack.stats.totalMemories).toBe(2);
      expect(pack.stats.avgConfidence).toBeCloseTo(0.85);

      // Check memory structure
      const mem1 = pack.memories.find(m => m.key === "pattern:async-error");
      expect(mem1).toBeDefined();
      expect(mem1?.value).toBe("Use async/await for error handling");
      expect(mem1?.type).toBe("implicit");
      expect(mem1?.confidence).toBe(0.9);
      expect(mem1?.tags).toEqual(["javascript", "async"]);
    });

    it("should filter by minimum confidence", async () => {
      await memoryManager.remember("high-confidence", "High", {
        type: "implicit",
        confidence: 0.9,
      });

      await memoryManager.remember("low-confidence", "Low", {
        type: "implicit",
        confidence: 0.3,
      });

      const exporter = new KnowledgePackExporter(brain, memoryManager);
      const pack = await exporter.export({ minConfidence: 0.5 });

      expect(pack.memories).toHaveLength(1);
      expect(pack.memories[0].key).toBe("high-confidence");
    });

    it("should filter by tags", async () => {
      await memoryManager.remember("tagged-js", "JS memory", {
        type: "implicit",
        tags: ["javascript"],
      });

      await memoryManager.remember("tagged-python", "Python memory", {
        type: "implicit",
        tags: ["python"],
      });

      const exporter = new KnowledgePackExporter(brain, memoryManager);
      const pack = await exporter.export({ tags: ["javascript"] });

      expect(pack.memories).toHaveLength(1);
      expect(pack.memories[0].key).toBe("tagged-js");
    });

    it("should filter by type", async () => {
      await memoryManager.remember("implicit-mem", "Implicit", {
        type: "implicit",
      });

      await memoryManager.remember("preference-mem", "Preference", {
        type: "preference",
      });

      const exporter = new KnowledgePackExporter(brain, memoryManager);
      const pack = await exporter.export({ types: ["preference"] });

      expect(pack.memories).toHaveLength(1);
      expect(pack.memories[0].type).toBe("preference");
    });

    it("should exclude auto-generated memories when requested", async () => {
      await memoryManager.remember("auto-mem", "Auto", {
        type: "implicit",
        confidence: 0.8,
      });

      await memoryManager.remember("explicit-mem", "Explicit", {
        type: "explicit",
        confidence: 0.8,
      });

      const exporter = new KnowledgePackExporter(brain, memoryManager);
      const pack = await exporter.export({ includeAuto: false });

      expect(pack.memories).toHaveLength(1);
      expect(pack.memories[0].key).toBe("explicit-mem");
    });

    it("should calculate stats correctly", async () => {
      await memoryManager.remember("mem1", "Value 1", {
        type: "implicit",
        confidence: 0.5,
      });

      await memoryManager.remember("mem2", "Value 2", {
        type: "preference",
        confidence: 0.9,
      });

      const exporter = new KnowledgePackExporter(brain, memoryManager);
      const pack = await exporter.export();

      expect(pack.stats.totalMemories).toBe(2);
      expect(pack.stats.avgConfidence).toBe(0.7);
      expect(pack.stats.types).toEqual({
        implicit: 1,
        preference: 1,
      });
    });
  });

  describe("KnowledgePackImporter", () => {
    it("should import a knowledge pack", async () => {
      const pack: KnowledgePack = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        source: { repo: "test-repo", instance: "test-instance" },
        memories: [
          {
            key: "imported-pattern",
            value: "Imported pattern value",
            type: "implicit",
            confidence: 0.85,
            tags: ["imported"],
          },
        ],
        stats: { totalMemories: 1, avgConfidence: 0.85, types: { implicit: 1 } },
      };

      const importer = new KnowledgePackImporter(brain, memoryManager);
      const result = await importer.import(pack);

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.errors).toBe(0);
      expect(result.conflicts).toHaveLength(0);

      // Verify memory was imported
      const memories = memoryManager.list();
      const imported = memories.find(m => m.key === "imported-pattern");
      expect(imported).toBeDefined();
      expect(imported?.value).toBe("Imported pattern value");
    });

    it("should skip duplicates with deduplicate strategy", async () => {
      // Add existing memory
      await memoryManager.remember("existing-key", "Existing value", {
        type: "implicit",
      });

      const pack: KnowledgePack = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        source: { repo: "test-repo", instance: "test-instance" },
        memories: [
          {
            key: "existing-key",
            value: "New value",
            type: "implicit",
            confidence: 0.9,
            tags: [],
          },
        ],
        stats: { totalMemories: 1, avgConfidence: 0.9, types: { implicit: 1 } },
      };

      const importer = new KnowledgePackImporter(brain, memoryManager);
      const result = await importer.import(pack, { deduplicate: true, mergeStrategy: "skip" });

      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toBe("existing-key");

      // Verify original value unchanged
      const memories = memoryManager.list();
      const existing = memories.find(m => m.key === "existing-key");
      expect(existing?.value).toBe("Existing value");
    });

    it("should overwrite with overwrite strategy", async () => {
      // Add existing memory
      await memoryManager.remember("existing-key", "Old value", {
        type: "implicit",
      });

      const pack: KnowledgePack = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        source: { repo: "test-repo", instance: "test-instance" },
        memories: [
          {
            key: "existing-key",
            value: "New value",
            type: "implicit",
            confidence: 0.9,
            tags: [],
          },
        ],
        stats: { totalMemories: 1, avgConfidence: 0.9, types: { implicit: 1 } },
      };

      const importer = new KnowledgePackImporter(brain, memoryManager);
      const result = await importer.import(pack, { deduplicate: true, mergeStrategy: "overwrite" });

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.conflicts).toHaveLength(1);

      // Verify value was overwritten
      const memories = memoryManager.list();
      const existing = memories.find(m => m.key === "existing-key");
      expect(existing?.value).toBe("New value");
    });

    it("should add tag prefix to all imported memories", async () => {
      const pack: KnowledgePack = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        source: { repo: "test-repo", instance: "test-instance" },
        memories: [
          {
            key: "tagged-mem",
            value: "Value",
            type: "implicit",
            confidence: 0.8,
            tags: ["original-tag"],
          },
        ],
        stats: { totalMemories: 1, avgConfidence: 0.8, types: { implicit: 1 } },
      };

      const importer = new KnowledgePackImporter(brain, memoryManager);
      await importer.import(pack, { tagPrefix: "imported:test-repo" });

      const memories = memoryManager.list();
      const imported = memories.find(m => m.key === "tagged-mem");
      expect(imported?.tags).toContain("imported:test-repo");
      expect(imported?.tags).toContain("original-tag");
    });

    it("should preview import without importing", async () => {
      // Add existing memory
      await memoryManager.remember("existing-key", "Existing", {
        type: "implicit",
      });

      const pack: KnowledgePack = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        source: { repo: "test-repo", instance: "test-instance" },
        memories: [
          {
            key: "new-key",
            value: "New",
            type: "implicit",
            confidence: 0.8,
            tags: [],
          },
          {
            key: "existing-key",
            value: "Conflict",
            type: "implicit",
            confidence: 0.8,
            tags: [],
          },
        ],
        stats: { totalMemories: 2, avgConfidence: 0.8, types: { implicit: 2 } },
      };

      const importer = new KnowledgePackImporter(brain, memoryManager);
      const preview = await importer.preview(pack);

      expect(preview.memories).toBe(2);
      expect(preview.conflicts).toBe(1);
      expect(preview.conflictKeys).toContain("existing-key");

      // Verify nothing was imported
      const memories = memoryManager.list();
      expect(memories).toHaveLength(1);
    });

    it("should handle empty pack", async () => {
      const pack: KnowledgePack = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        source: { repo: "test-repo", instance: "test-instance" },
        memories: [],
        stats: { totalMemories: 0, avgConfidence: 0, types: {} },
      };

      const importer = new KnowledgePackImporter(brain, memoryManager);
      const result = await importer.import(pack);

      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.errors).toBe(0);
    });

    it("should reject invalid pack format", async () => {
      const importer = new KnowledgePackImporter(brain, memoryManager);

      await expect(importer.import("not json")).rejects.toThrow();
      await expect(importer.import({} as any)).rejects.toThrow("Invalid knowledge pack format");
    });
  });

  describe("Round-trip export/import", () => {
    it("should preserve data through export/import cycle", async () => {
      // Create original memories
      await memoryManager.remember("pattern-1", "Pattern 1", {
        type: "implicit",
        confidence: 0.9,
        tags: ["pattern", "javascript"],
      });

      await memoryManager.remember("preference-1", "Preference 1", {
        type: "preference",
        confidence: 0.75,
        tags: ["preference"],
      });

      // Export
      const exporter = new KnowledgePackExporter(brain, memoryManager);
      const pack = await exporter.export();

      // Clear memories
      const allMemories = memoryManager.list();
      for (const mem of allMemories) {
        await memoryManager.forget(mem.key);
      }

      // Import
      const importer = new KnowledgePackImporter(brain, memoryManager);
      const result = await importer.import(pack);

      expect(result.imported).toBe(2);
      expect(result.errors).toBe(0);

      // Verify data preserved
      const newMemories = memoryManager.list();
      expect(newMemories).toHaveLength(2);

      const pattern1 = newMemories.find(m => m.key === "pattern-1");
      expect(pattern1?.value).toBe("Pattern 1");
      expect(pattern1?.confidence).toBe(0.9);
      expect(pattern1?.tags).toEqual(["pattern", "javascript"]);
    });
  });
});
