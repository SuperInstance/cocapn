/**
 * cocapn export — Export agent data in multiple formats.
 *
 * Subcommands:
 *   cocapn export brain    — entire brain (facts, memories, wiki)
 *   cocapn export chat     — chat history
 *   cocapn export wiki     — wiki as markdown files
 *   cocapn export knowledge — knowledge entries with type filtering
 *
 * Formats: json, jsonl, markdown, csv
 * Output:  stdout (default) or --output <file>
 */

import { Command } from "commander";
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ExportEntry {
  type: string;
  key: string;
  value: string;
  meta?: Record<string, unknown>;
}

type ExportFormat = "json" | "jsonl" | "markdown" | "csv";

// ─── ANSI colors ────────────────────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

const green = (s: string) => `${c.green}${s}${c.reset}`;
const yellow = (s: string) => `${c.yellow}${s}${c.reset}`;

// ─── Readers (reuse memory patterns) ────────────────────────────────────────

function resolvePaths(repoRoot: string): { memoryDir: string; wikiDir: string } | null {
  const cocapnDir = join(repoRoot, "cocapn");
  const memoryDir = existsSync(join(cocapnDir, "memory"))
    ? join(cocapnDir, "memory")
    : existsSync(join(repoRoot, "memory"))
      ? join(repoRoot, "memory")
      : null;

  if (!memoryDir) return null;

  const wikiDir = existsSync(join(cocapnDir, "wiki"))
    ? join(cocapnDir, "wiki")
    : existsSync(join(repoRoot, "wiki"))
      ? join(repoRoot, "wiki")
      : join(repoRoot, "wiki");

  return { memoryDir, wikiDir };
}

function readFacts(memoryDir: string): ExportEntry[] {
  const path = join(memoryDir, "facts.json");
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
    return Object.entries(data).map(([key, value]) => ({
      type: key.startsWith("knowledge.") ? "knowledge" : "fact",
      key,
      value: typeof value === "string" ? value : JSON.stringify(value),
    }));
  } catch {
    return [];
  }
}

function readMemories(memoryDir: string): ExportEntry[] {
  const path = join(memoryDir, "memories.json");
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, "utf-8")) as unknown[];
    if (!Array.isArray(data)) return [];
    return data.map((entry, i) => {
      const obj = entry as Record<string, unknown>;
      return {
        type: "memory" as const,
        key: (obj.id as string) ?? `memory-${i}`,
        value: typeof obj.content === "string" ? obj.content : JSON.stringify(obj),
        meta: obj.confidence !== undefined ? { confidence: obj.confidence } : undefined,
      };
    });
  } catch {
    return [];
  }
}

function readWikiFiles(wikiDir: string): ExportEntry[] {
  if (!existsSync(wikiDir)) return [];
  try {
    const files = readdirSync(wikiDir).filter((f) => f.endsWith(".md"));
    return files.map((file) => {
      const content = readFileSync(join(wikiDir, file), "utf-8");
      return {
        type: "wiki" as const,
        key: file.replace(/\.md$/, ""),
        value: content,
      };
    });
  } catch {
    return [];
  }
}

function loadBrainEntries(repoRoot: string): ExportEntry[] {
  const paths = resolvePaths(repoRoot);
  if (!paths) return [];
  return [...readFacts(paths.memoryDir), ...readMemories(paths.memoryDir), ...readWikiFiles(paths.wikiDir)];
}

function loadKnowledgeEntries(repoRoot: string, typeFilter?: string): ExportEntry[] {
  const paths = resolvePaths(repoRoot);
  if (!paths) return [];

  let entries = readFacts(paths.memoryDir).filter((e) => e.type === "knowledge");

  if (typeFilter) {
    const prefix = `knowledge.${typeFilter}.`;
    entries = entries.filter((e) => e.key.startsWith(prefix));
  }

  return entries;
}

function loadWikiEntries(repoRoot: string): ExportEntry[] {
  const paths = resolvePaths(repoRoot);
  if (!paths) return [];
  return readWikiFiles(paths.wikiDir);
}

function loadChatHistory(repoRoot: string, sessionId: string): ExportEntry[] {
  const paths = resolvePaths(repoRoot);
  if (!paths) return [];

  const chatDir = join(dirname(paths.memoryDir), "chat");
  const sessionFile = join(chatDir, `${sessionId}.json`);

  if (!existsSync(sessionFile)) return [];

  try {
    const data = JSON.parse(readFileSync(sessionFile, "utf-8")) as unknown[];
    if (!Array.isArray(data)) return [];
    return data.map((entry, i) => {
      const obj = entry as Record<string, unknown>;
      return {
        type: "chat" as const,
        key: `msg-${i}`,
        value: typeof obj.content === "string" ? obj.content : JSON.stringify(obj),
        meta: {
          role: obj.role,
          timestamp: obj.timestamp,
        },
      };
    });
  } catch {
    return [];
  }
}

// ─── Formatters ─────────────────────────────────────────────────────────────

function formatJSON(entries: ExportEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

function formatJSONL(entries: ExportEntry[]): string {
  return entries.map((e) => JSON.stringify(e)).join("\n");
}

function formatMarkdown(entries: ExportEntry[]): string {
  if (entries.length === 0) return "# Export\n\nNo entries found.";

  const sections = new Map<string, ExportEntry[]>();
  for (const entry of entries) {
    const list = sections.get(entry.type) ?? [];
    list.push(entry);
    sections.set(entry.type, list);
  }

  const lines: string[] = ["# Cocapn Export\n"];

  for (const [type, typeEntries] of sections) {
    lines.push(`\n## ${type.charAt(0).toUpperCase() + type.slice(1)} (${typeEntries.length})\n`);
    for (const entry of typeEntries) {
      lines.push(`### ${entry.key}\n`);
      lines.push(entry.value);
      lines.push("");
    }
  }

  return lines.join("\n");
}

function formatCSV(entries: ExportEntry[]): string {
  const header = "type,key,value";
  const rows = entries.map((e) => {
    const escape = (s: string) => {
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    return `${e.type},${escape(e.key)},${escape(e.value)}`;
  });
  return [header, ...rows].join("\n");
}

function formatEntries(entries: ExportEntry[], format: ExportFormat): string {
  switch (format) {
    case "json":
      return formatJSON(entries);
    case "jsonl":
      return formatJSONL(entries);
    case "markdown":
      return formatMarkdown(entries);
    case "csv":
      return formatCSV(entries);
  }
}

// ─── Output helper ──────────────────────────────────────────────────────────

function output(content: string, outputPath?: string): void {
  if (outputPath) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, content, "utf-8");
    console.log(green(`\u2713 Exported to ${outputPath}`));
  } else {
    console.log(content);
  }
}

// ─── Subcommand actions ─────────────────────────────────────────────────────

function brainAction(repoRoot: string, format: ExportFormat, outputPath?: string): void {
  const paths = resolvePaths(repoRoot);
  if (!paths) {
    console.log(yellow("No cocapn/ directory found. Run cocapn setup to get started."));
    process.exit(1);
  }

  const entries = loadBrainEntries(repoRoot);
  output(formatEntries(entries, format), outputPath);
}

function chatAction(repoRoot: string, sessionId: string, format: ExportFormat, outputPath?: string): void {
  const paths = resolvePaths(repoRoot);
  if (!paths) {
    console.log(yellow("No cocapn/ directory found. Run cocapn setup to get started."));
    process.exit(1);
  }

  const entries = loadChatHistory(repoRoot, sessionId);
  if (entries.length === 0) {
    console.log(yellow(`No chat history found for session: ${sessionId}`));
    process.exit(1);
  }

  output(formatEntries(entries, format), outputPath);
}

function wikiAction(repoRoot: string, outputPath?: string): void {
  const paths = resolvePaths(repoRoot);
  if (!paths) {
    console.log(yellow("No cocapn/ directory found. Run cocapn setup to get started."));
    process.exit(1);
  }

  const entries = loadWikiEntries(repoRoot);
  if (entries.length === 0) {
    console.log(yellow("No wiki pages found."));
    process.exit(1);
  }

  const targetDir = outputPath ?? join(repoRoot, "export-wiki");

  mkdirSync(targetDir, { recursive: true });
  for (const entry of entries) {
    writeFileSync(join(targetDir, `${entry.key}.md`), entry.value, "utf-8");
  }

  console.log(green(`\u2713 Exported ${entries.length} wiki page(s) to ${targetDir}`));
}

function knowledgeAction(repoRoot: string, format: ExportFormat, typeFilter?: string, outputPath?: string): void {
  const paths = resolvePaths(repoRoot);
  if (!paths) {
    console.log(yellow("No cocapn/ directory found. Run cocapn setup to get started."));
    process.exit(1);
  }

  const entries = loadKnowledgeEntries(repoRoot, typeFilter);
  if (entries.length === 0) {
    console.log(yellow("No knowledge entries found."));
    process.exit(1);
  }

  output(formatEntries(entries, format), outputPath);
}

// ─── Command ────────────────────────────────────────────────────────────────

export function createExportCommand(): Command {
  return new Command("export")
    .description("Export agent data in multiple formats")
    .addCommand(
      new Command("brain")
        .description("Export entire brain (facts, memories, wiki)")
        .option("-f, --format <format>", "Output format: json, jsonl, markdown, csv", "json")
        .option("-o, --output <path>", "Write to file instead of stdout")
        .action((opts: { format: string; output?: string }) => {
          brainAction(process.cwd(), opts.format as ExportFormat, opts.output);
        })
    )
    .addCommand(
      new Command("chat")
        .description("Export chat history")
        .argument("<session-id>", "Chat session ID")
        .option("-f, --format <format>", "Output format: json, jsonl, markdown", "json")
        .option("-o, --output <path>", "Write to file instead of stdout")
        .action((sessionId: string, opts: { format: string; output?: string }) => {
          chatAction(process.cwd(), sessionId, opts.format as ExportFormat, opts.output);
        })
    )
    .addCommand(
      new Command("wiki")
        .description("Export wiki as markdown files")
        .option("-o, --output <dir>", "Output directory (default: ./export-wiki)")
        .action((opts: { output?: string }) => {
          wikiAction(process.cwd(), opts.output);
        })
    )
    .addCommand(
      new Command("knowledge")
        .description("Export knowledge entries")
        .option("-f, --format <format>", "Output format: json, jsonl, csv", "json")
        .option("-t, --type <type>", "Filter by type (e.g. species, regulation, technique)")
        .option("-o, --output <path>", "Write to file instead of stdout")
        .action((opts: { format: string; type?: string; output?: string }) => {
          knowledgeAction(process.cwd(), opts.format as ExportFormat, opts.type, opts.output);
        })
    );
}

// ─── Exported for testing ───────────────────────────────────────────────────

export { formatJSON, formatJSONL, formatMarkdown, formatCSV, loadBrainEntries, loadKnowledgeEntries, loadWikiEntries, loadChatHistory };
export type { ExportEntry, ExportFormat };
