/**
 * Brain — structured read/write access to the private repo's memory layer.
 *
 * Responsibilities:
 *   - getSoul()      — read soul.md (agent personality)
 *   - getFact(key)   — read a single fact from memory/facts.json
 *   - setFact(key, value) — write a fact and auto-commit
 *   - searchWiki(query)   — full-text search across wiki/ markdown pages
 *   - createTask(title, description) — append a task file and auto-commit
 *
 * All paths are resolved relative to the private repo root using the same
 * config paths that `loadConfig` produces (cocapn/soul.md, cocapn/memory/facts.json, etc.)
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
  rmdirSync,
} from "fs";
import { join, extname, basename } from "path";
import { homedir } from "os";
import type { GitSync } from "../git/sync.js";
import type { BridgeConfig } from "../config/types.js";
import { InvertedIndex, tokenize } from "../utils/inverted-index.js";
import { createEmbeddingProvider, type EmbeddingOptions } from "./embedding.js";
import { createVectorStore, type VectorStore } from "./vector-store.js";
import { createHybridSearch, HybridSearch } from "./hybrid-search.js";
import type { RepoGraph } from "../graph/index.js";
import { MemoryManager, type MemoryEntry, type MemoryManagerOptions } from "./memory-manager.js";

// ─── Re-exports ─────────────────────────────────────────────────────────────────

export type { MemoryEntry, MemoryManagerOptions, MemoryWriteOptions, MemoryType, MemoryStats, PruneResult } from "./memory-manager.js";
export { MemoryManager } from "./memory-manager.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WikiPage {
  /** Filename relative to the wiki root (e.g. "projects/my-project.md") */
  file: string;
  /** First heading found in the page, or the filename stem */
  title: string;
  /** Matched excerpt (up to 200 chars around the first match) */
  excerpt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  status: "active" | "done";
}

// ─── Brain ────────────────────────────────────────────────────────────────────

export class Brain {
  private repoRoot: string;
  private config: BridgeConfig;
  private sync: GitSync;
  private wikiIndex: InvertedIndex;
  private wikiIndexInitialized = false;
  private hybridSearch: HybridSearch;
  private vectorStore: VectorStore | null = null;
  private embeddingProvider: any = null;
  private repoGraph: RepoGraph | null = null;
  public memoryManager: MemoryManager | null = null;

  constructor(repoRoot: string, config: BridgeConfig, sync: GitSync, repoGraph?: RepoGraph, memoryManagerOptions?: MemoryManagerOptions) {
    this.repoRoot = repoRoot;
    this.config = config;
    this.sync = sync;
    this.wikiIndex = new InvertedIndex();
    this.repoGraph = repoGraph ?? null;

    // Initialize hybrid search with vector store (optional)
    this.hybridSearch = this.initializeVectorSearch();

    // Initialize repo graph async (non-blocking)
    if (this.repoGraph) {
      setImmediate(async () => {
        try {
          await this.repoGraph.build();
        } catch (error) {
          console.error("[brain] Failed to build repo graph:", error);
        }
      });
    }

    // Initialize memory manager (optional)
    if (memoryManagerOptions !== undefined && memoryManagerOptions !== false) {
      this.memoryManager = new MemoryManager(this, memoryManagerOptions);
    } else if (memoryManagerOptions === undefined) {
      // Default: enabled with default options
      this.memoryManager = new MemoryManager(this, {});
    } else {
      this.memoryManager = null;
    }
  }

  /**
   * Initialize vector search (optional, with graceful fallback).
   * This runs in the background and doesn't block the constructor.
   */
  private initializeVectorSearch(): HybridSearch {
    // Initialize async (non-blocking)
    setImmediate(async () => {
      const vectorConfig = this.config.vectorSearch;
      if (!vectorConfig?.enabled) {
        return;
      }

      try {
        // Create embedding provider
        const embeddingOptions: EmbeddingOptions = {
          provider: vectorConfig.provider || "local",
          apiKey: vectorConfig.apiKey,
          model: vectorConfig.model,
          dimensions: vectorConfig.dimensions,
        };

        this.embeddingProvider = await createEmbeddingProvider(embeddingOptions);
        const initResult = await this.embeddingProvider.initialize();

        if (!initResult.success) {
          // Silently fall back to keyword-only
          return;
        }

        // Create vector store
        const vectorStore = await createVectorStore(
          this.repoRoot,
          this.embeddingProvider,
          vectorConfig.dimensions || 384
        );

        if (!vectorStore.isEnabled()) {
          // Silently fall back to keyword-only
          return;
        }

        this.vectorStore = vectorStore;
        // Update hybrid search with vector store
        this.hybridSearch = createHybridSearch(this.wikiIndex, this.vectorStore);
      } catch (error) {
        // Silently fall back to keyword-only
      }
    });

    // Create hybrid search (will use keyword-only until vector store is ready)
    return createHybridSearch(this.wikiIndex, null);
  }

  // ---------------------------------------------------------------------------
  // Soul
  // ---------------------------------------------------------------------------

  /** Return the raw soul.md text. Returns empty string if missing. */
  getSoul(): string {
    const soulPath = join(this.repoRoot, this.config.soul);
    if (!existsSync(soulPath)) return "";
    try {
      return readFileSync(soulPath, "utf8");
    } catch {
      return "";
    }
  }

  // ---------------------------------------------------------------------------
  // Facts (cocapn/memory/facts.json — Record<string, string>)
  // ---------------------------------------------------------------------------

  /** Return the value for a fact key, or undefined if not present. */
  getFact(key: string): string | undefined {
    const facts = this.readFacts();
    return facts[key];
  }

  /** Return all facts as a plain object. */
  getAllFacts(): Record<string, string> {
    return this.readFacts();
  }

  /**
   * Set (or overwrite) a fact and auto-commit the change.
   * Commit message: "update memory: set fact <key>"
   */
  async setFact(key: string, value: string): Promise<void> {
    const release = await acquireLock();
    try {
      const facts = this.readFacts();
      facts[key] = value;
      this.writeFacts(facts);
      await this.sync.commit(`update memory: set fact ${key}`);
    } finally {
      release();
    }
  }

  /**
   * Delete a fact and auto-commit.
   * No-op (no commit) if the key doesn't exist.
   */
  async deleteFact(key: string): Promise<void> {
    const release = await acquireLock();
    try {
      const facts = this.readFacts();
      if (!(key in facts)) return;
      delete facts[key];
      this.writeFacts(facts);
      await this.sync.commit(`update memory: deleted fact ${key}`);
    } finally {
      release();
    }
  }

  // ---------------------------------------------------------------------------
  // Wiki (cocapn/wiki/)
  // ---------------------------------------------------------------------------

  /**
   * Search all .md files under the wiki directory for the given query string.
   * Uses hybrid search (keyword + semantic) if available, falls back to keyword-only.
   *
   * The index is built on first search and rebuilt when wiki pages change.
   */
  async searchWiki(query: string): Promise<WikiPage[]> {
    const wikiDir = join(this.repoRoot, "cocapn", "wiki");
    if (!existsSync(wikiDir)) return [];

    // Build index on first use or if wiki was modified
    if (!this.wikiIndexInitialized) {
      this.rebuildWikiIndex();
    }

    const results: WikiPage[] = [];
    const searchResults = await this.hybridSearch.search(query, {
      alpha: this.config.vectorSearch?.alpha || 0.6,
      topK: 10,
    });
    const lower = query.toLowerCase();

    for (const { id: file } of searchResults) {
      const fullPath = join(wikiDir, file);
      let content: string;
      try {
        content = readFileSync(fullPath, "utf8");
      } catch {
        continue;
      }

      const title = extractTitle(content) ?? basename(file, extname(file));
      const excerpt = extractExcerpt(content, lower);
      results.push({ file, title, excerpt });
    }

    return results;
  }

  /**
   * Rebuild the wiki search index.
   * Call this after adding, updating, or removing wiki pages.
   * Also rebuilds vector embeddings if available.
   */
  private rebuildWikiIndex(): void {
    this.wikiIndex.clear();
    const wikiDir = join(this.repoRoot, "cocapn", "wiki");
    if (!existsSync(wikiDir)) {
      this.wikiIndexInitialized = true;
      return;
    }

    for (const file of this.walkMarkdown(wikiDir, "")) {
      const fullPath = join(wikiDir, file);
      try {
        const content = readFileSync(fullPath, "utf8");
        this.wikiIndex.add(file, content);

        // Store embedding in background (non-blocking)
        if (this.vectorStore && this.vectorStore.isEnabled()) {
          setImmediate(async () => {
            try {
              await this.vectorStore.store(file, content);
            } catch (error) {
              // Silently fail to allow keyword-only search
            }
          });
        }
      } catch {
        // Skip unreadable files
      }
    }
    this.wikiIndexInitialized = true;
  }

  /**
   * List all wiki pages (file + title). Does not include content.
   */
  listWikiPages(): WikiPage[] {
    const wikiDir = join(this.repoRoot, "cocapn", "wiki");
    if (!existsSync(wikiDir)) return [];

    const pages: WikiPage[] = [];
    for (const file of this.walkMarkdown(wikiDir, "")) {
      const fullPath = join(wikiDir, file);
      try {
        const content = readFileSync(fullPath, "utf8");
        const title = extractTitle(content) ?? basename(file, extname(file));
        pages.push({ file, title, excerpt: content.slice(0, 100) });
      } catch {
        continue;
      }
    }
    return pages;
  }

  /**
   * Read the raw content of a wiki page by relative filename.
   * Returns null if the file doesn't exist.
   */
  readWikiPage(file: string): string | null {
    const fullPath = join(this.repoRoot, "cocapn", "wiki", file);
    if (!existsSync(fullPath)) return null;
    try {
      return readFileSync(fullPath, "utf8");
    } catch {
      return null;
    }
  }

  /**
   * Add a new wiki page from a local file path.
   * Copies the file into cocapn/wiki/ and auto-commits.
   * Also stores embedding if vector search is available.
   */
  async addWikiPage(sourcePath: string, destName?: string): Promise<void> {
    const release = await acquireLock();
    try {
      const wikiDir = join(this.repoRoot, "cocapn", "wiki");
      ensureDir(wikiDir);

      const name = destName ?? basename(sourcePath);
      const destPath = join(wikiDir, name);
      const content = readFileSync(sourcePath, "utf8");
      writeFileSync(destPath, content, "utf8");
      this.wikiIndex.add(name, content);

      // Store embedding in background (non-blocking)
      if (this.vectorStore && this.vectorStore.isEnabled()) {
        setImmediate(async () => {
          try {
            await this.vectorStore.store(name, content);
          } catch (error) {
            // Silently fail to allow keyword-only search
          }
        });
      }

      await this.sync.commit(`update memory: added wiki page ${name}`);
    } finally {
      release();
    }
  }

  // ---------------------------------------------------------------------------
  // Tasks (cocapn/tasks/)
  // ---------------------------------------------------------------------------

  /**
   * Create a new task markdown file in cocapn/tasks/ and auto-commit.
   * Task id is a timestamp slug. Returns the task id.
   */
  async createTask(title: string, description: string): Promise<string> {
    const release = await acquireLock();
    try {
      const tasksDir = join(this.repoRoot, "cocapn", "tasks");
      ensureDir(tasksDir);

      const id = `${Date.now()}-${slugify(title)}`;
      const filename = `${id}.md`;
      const content = [
        `# ${title}`,
        "",
        description,
        "",
        `---`,
        `created: ${new Date().toISOString()}`,
        `status: active`,
      ].join("\n");

      writeFileSync(join(tasksDir, filename), content, "utf8");
      await this.sync.commit(`update memory: added task "${title}"`);
      return id;
    } finally {
      release();
    }
  }

  /** List all active tasks by scanning cocapn/tasks/*.md files. */
  listTasks(): Task[] {
    const tasksDir = join(this.repoRoot, "cocapn", "tasks");
    if (!existsSync(tasksDir)) return [];

    const tasks: Task[] = [];
    for (const file of readdirSync(tasksDir)) {
      if (!file.endsWith(".md")) continue;
      try {
        const content = readFileSync(join(tasksDir, file), "utf8");
        const task = parseTaskFile(file, content);
        if (task) tasks.push(task);
      } catch {
        // skip unreadable files
      }
    }

    return tasks.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  // ---------------------------------------------------------------------------
  // Context snapshot (injected into agent as COCAPN_CONTEXT)
  // ---------------------------------------------------------------------------

  /**
   * Build a JSON context snapshot suitable for injection into agent processes.
   * Kept small to fit in an env var: soul (truncated), recent facts, active task count.
   */
  buildContext(): string {
    const soul = this.getSoul().slice(0, 2000);
    const facts = this.getAllFacts();
    const taskCount = this.listTasks().filter((t) => t.status === "active").length;

    return JSON.stringify({ soul, facts, activeTasks: taskCount });
  }

  // ---------------------------------------------------------------------------
  // Repo Graph Queries (optional)
  // ---------------------------------------------------------------------------

  /**
   * Get the repo graph instance (if enabled).
   */
  getGraph(): RepoGraph | null {
    return this.repoGraph;
  }

  /**
   * Check if repo graph is available.
   */
  hasGraph(): boolean {
    return this.repoGraph !== null;
  }

  /**
   * Update graph when a file changes.
   */
  async updateGraphFile(filePath: string): Promise<void> {
    if (this.repoGraph) {
      try {
        await this.repoGraph.updateFile(filePath);
      } catch (error) {
        console.error("[brain] Failed to update graph for file:", filePath, error);
      }
    }
  }

  /**
   * Remove file from graph when deleted.
   */
  async removeGraphFile(filePath: string): Promise<void> {
    if (this.repoGraph) {
      try {
        await this.repoGraph.removeFile(filePath);
      } catch (error) {
        console.error("[brain] Failed to remove file from graph:", filePath, error);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private factsPath(): string {
    return join(this.repoRoot, this.config.memory.facts);
  }

  private readFacts(): Record<string, string> {
    const p = this.factsPath();
    if (!existsSync(p)) return {};
    try {
      const raw = readFileSync(p, "utf8").trim();
      const parsed: unknown = JSON.parse(raw || "{}");
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        // Ensure all values are strings
        const result: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          result[k] = String(v);
        }
        return result;
      }
      return {};
    } catch {
      return {};
    }
  }

  private writeFacts(facts: Record<string, string>): void {
    const p = this.factsPath();
    ensureDir(join(p, ".."));
    writeFileSync(p, JSON.stringify(facts, null, 2) + "\n", "utf8");
  }

  /**
   * Recursively collect all .md files under a directory.
   * Returns paths relative to the base directory.
   */
  private walkMarkdown(dir: string, prefix: string): string[] {
    const results: string[] = [];
    let entries: string[];
    try {
      entries = readdirSync(dir, { withFileTypes: false }) as string[];
    } catch {
      return results;
    }
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry}` : entry;
      const full = join(dir, entry);
      if (entry.endsWith(".md")) {
        results.push(rel);
      } else {
        // Recurse into subdirectories (simple check: no extension = dir)
        if (!extname(entry)) {
          try {
            results.push(...this.walkMarkdown(full, rel));
          } catch {
            // skip
          }
        }
      }
    }
    return results;
  }
}

// ─── File Lock (advisory, mkdir-based for portability) ─────────────────────────

const LOCK_DIR = join(homedir(), ".cocapn", "brain");
const LOCK_POLL_INTERVAL = 100; // ms between lock acquisition attempts
const LOCK_TIMEOUT = 5_000;     // ms before giving up

/**
 * Acquire an advisory lock for concurrent Git writes.
 * Uses mkdir-based locking which is atomic on all platforms.
 * Returns a release function that must be called in a finally block.
 */
async function acquireLock(): Promise<() => void> {
  const lockPath = join(LOCK_DIR, ".lock");
  const deadline = Date.now() + LOCK_TIMEOUT;

  while (true) {
    try {
      mkdirSync(lockPath, { recursive: false });
      // Lock acquired
      return () => {
        try { rmdirSync(lockPath); } catch { /* already released */ }
      };
    } catch {
      // Lock held by another process — wait and retry
      if (Date.now() >= deadline) {
        throw new Error(
          `Brain lock acquisition timed out after ${LOCK_TIMEOUT}ms ` +
          `(lock: ${lockPath})`
        );
      }
      await new Promise((r) => setTimeout(r, LOCK_POLL_INTERVAL));
    }
  }
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function extractTitle(content: string): string | undefined {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
}

function extractExcerpt(content: string, lower: string): string {
  const idx = content.toLowerCase().indexOf(lower);
  if (idx === -1) return content.slice(0, 100);
  const start = Math.max(0, idx - 60);
  const end   = Math.min(content.length, idx + 140);
  const excerpt = content.slice(start, end).replace(/\n+/g, " ").trim();
  return (start > 0 ? "…" : "") + excerpt + (end < content.length ? "…" : "");
}

function parseTaskFile(filename: string, content: string): Task | null {
  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (!titleMatch) return null;

  const title = titleMatch[1]!.trim();
  const createdMatch = content.match(/^created:\s*(.+)$/m);
  const statusMatch  = content.match(/^status:\s*(active|done)$/m);

  const id = filename.replace(/\.md$/, "");
  const createdAt = createdMatch?.[1]?.trim() ?? new Date(0).toISOString();
  const status: Task["status"] = statusMatch?.[1] === "done" ? "done" : "active";

  // Description is everything between the title line and the --- separator
  const lines = content.split("\n");
  const titleLineIdx = lines.findIndex((l) => /^#\s/.test(l));
  const sepIdx = lines.findIndex((l, i) => i > titleLineIdx && l.startsWith("---"));
  const descLines = lines.slice(titleLineIdx + 1, sepIdx === -1 ? undefined : sepIdx);
  const description = descLines.join("\n").trim();

  return { id, title, description, createdAt, status };
}
