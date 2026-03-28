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
} from "fs";
import { join, extname, basename } from "path";
import type { GitSync } from "../git/sync.js";
import type { BridgeConfig } from "../config/types.js";

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

  constructor(repoRoot: string, config: BridgeConfig, sync: GitSync) {
    this.repoRoot = repoRoot;
    this.config = config;
    this.sync = sync;
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
    const facts = this.readFacts();
    facts[key] = value;
    this.writeFacts(facts);
    await this.sync.commit(`update memory: set fact ${key}`);
  }

  /**
   * Delete a fact and auto-commit.
   * No-op (no commit) if the key doesn't exist.
   */
  async deleteFact(key: string): Promise<void> {
    const facts = this.readFacts();
    if (!(key in facts)) return;
    delete facts[key];
    this.writeFacts(facts);
    await this.sync.commit(`update memory: deleted fact ${key}`);
  }

  // ---------------------------------------------------------------------------
  // Wiki (cocapn/wiki/)
  // ---------------------------------------------------------------------------

  /**
   * Search all .md files under the wiki directory for the given query string.
   * Case-insensitive substring match. Returns pages in order of first match.
   */
  searchWiki(query: string): WikiPage[] {
    const wikiDir = join(this.repoRoot, "cocapn", "wiki");
    if (!existsSync(wikiDir)) return [];

    const lower = query.toLowerCase();
    const results: WikiPage[] = [];

    for (const file of this.walkMarkdown(wikiDir, "")) {
      const fullPath = join(wikiDir, file);
      let content: string;
      try {
        content = readFileSync(fullPath, "utf8");
      } catch {
        continue;
      }

      if (!content.toLowerCase().includes(lower)) continue;

      const title = extractTitle(content) ?? basename(file, extname(file));
      const excerpt = extractExcerpt(content, lower);
      results.push({ file, title, excerpt });
    }

    return results;
  }

  /**
   * Add a new wiki page from a local file path.
   * Copies the file into cocapn/wiki/ and auto-commits.
   */
  async addWikiPage(sourcePath: string, destName?: string): Promise<void> {
    const wikiDir = join(this.repoRoot, "cocapn", "wiki");
    ensureDir(wikiDir);

    const name = destName ?? basename(sourcePath);
    const destPath = join(wikiDir, name);
    const content = readFileSync(sourcePath, "utf8");
    writeFileSync(destPath, content, "utf8");
    await this.sync.commit(`update memory: added wiki page ${name}`);
  }

  // ---------------------------------------------------------------------------
  // Tasks (cocapn/tasks/)
  // ---------------------------------------------------------------------------

  /**
   * Create a new task markdown file in cocapn/tasks/ and auto-commit.
   * Task id is a timestamp slug. Returns the task id.
   */
  async createTask(title: string, description: string): Promise<string> {
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
