/**
 * cocapn learn — teach the agent from documents, URLs, and text.
 *
 * Usage:
 *   cocapn learn file <path>   — learn from a file (.md, .json, .csv, .pdf, .txt)
 *   cocapn learn url <url>     — learn from a URL (fetch + strip HTML)
 *   cocapn learn text <text>   — learn from direct text input
 *   cocapn learn list          — show what the agent has learned
 *   cocapn learn forget <id>   — remove a knowledge entry
 */

import { Command } from "commander";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "fs";
import { join, extname, basename } from "path";
import { randomUUID } from "crypto";
import { extract, suggestType, type ExtractionResult, type ExtractedEntity } from "../../../local-bridge/src/knowledge/extractor.js";
import type { KnowledgeType, KnowledgeEntry, KnowledgeMeta } from "../../../local-bridge/src/knowledge/pipeline.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

type SourceType = "document" | "dataset" | "notes" | "data" | "url" | "text";

interface LearnOptions {
  type?: string;
  tags?: string;
  confidence?: string;
  json?: boolean;
}

// ─── ANSI colors ───────────────────────────────────────────────────────────────

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

// ─── Knowledge store path ──────────────────────────────────────────────────────

const KNOWLEDGE_DIR = "cocapn/knowledge";

function knowledgeRoot(cwd: string): string {
  return join(cwd, KNOWLEDGE_DIR);
}

function ensureKnowledgeDir(cwd: string): string {
  const root = knowledgeRoot(cwd);
  mkdirSync(root, { recursive: true });
  return root;
}

// ─── File type detection ───────────────────────────────────────────────────────

function detectSourceType(filePath: string): SourceType {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case ".pdf": return "document";
    case ".csv": case ".tsv": return "dataset";
    case ".md": case ".markdown": return "notes";
    case ".json": case ".jsonl": return "data";
    default: return "notes";
  }
}

// ─── URL fetching ──────────────────────────────────────────────────────────────

async function fetchUrl(url: string): Promise<string> {
  const proto = url.startsWith("https") ? await import("https") : await import("http");

  return new Promise((resolve, reject) => {
    const req = proto.get(url, { headers: { "User-Agent": "cocapn-learn/0.1" } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode && res.statusCode >= 400) {
        return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
      }
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf-8");
        resolve(stripHtml(body));
      });
    });
    req.on("error", reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error("Request timed out")); });
  });
}

/**
 * Basic HTML → plain text: remove tags, decode entities.
 */
function stripHtml(html: string): string {
  return html
    // Remove script/style blocks
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    // Remove tags
    .replace(/<[^>]+>/g, " ")
    // Decode common entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Knowledge store operations ────────────────────────────────────────────────

function storeEntry(cwd: string, entry: KnowledgeEntry): void {
  const dir = join(ensureKnowledgeDir(cwd), entry.type);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${entry.id}.json`), JSON.stringify(entry, null, 2), "utf-8");
}

function loadAllEntries(cwd: string): KnowledgeEntry[] {
  const root = knowledgeRoot(cwd);
  if (!existsSync(root)) return [];

  const entries: KnowledgeEntry[] = [];
  const types = readdirSync(root, { withFileTypes: true });

  for (const dirent of types) {
    if (!dirent.isDirectory()) continue;
    const typeDir = join(root, dirent.name);
    for (const file of readdirSync(typeDir)) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = readFileSync(join(typeDir, file), "utf-8");
        entries.push(JSON.parse(raw));
      } catch {
        // skip malformed
      }
    }
  }

  return entries;
}

function findEntry(cwd: string, id: string): KnowledgeEntry | undefined {
  const root = knowledgeRoot(cwd);
  if (!existsSync(root)) return undefined;

  const types = readdirSync(root, { withFileTypes: true });
  for (const dirent of types) {
    if (!dirent.isDirectory()) continue;
    const filePath = join(root, dirent.name, `${id}.json`);
    if (existsSync(filePath)) {
      try {
        return JSON.parse(readFileSync(filePath, "utf-8"));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function removeEntry(cwd: string, id: string): boolean {
  const root = knowledgeRoot(cwd);
  if (!existsSync(root)) return false;

  const types = readdirSync(root, { withFileTypes: true });
  for (const dirent of types) {
    if (!dirent.isDirectory()) continue;
    const filePath = join(root, dirent.name, `${id}.json`);
    if (existsSync(filePath)) {
      rmSync(filePath);
      return true;
    }
  }
  return false;
}

// ─── Learn actions ─────────────────────────────────────────────────────────────

function learnFromContent(
  cwd: string,
  content: string,
  source: string,
  sourceType: SourceType,
  opts: LearnOptions,
): void {
  // Extract entities
  const extraction = extract(content);

  // Determine type
  const type = (opts.type ?? extraction.suggestedType) as KnowledgeType;
  if (!["species", "regulation", "technique", "location", "equipment"].includes(type) && type !== "general") {
    console.error(red(`Invalid type: ${type}. Use: species, regulation, technique, location, equipment`));
    process.exit(1);
  }
  const finalType: KnowledgeType = (type === "general" ? "technique" : type) as KnowledgeType;

  // Tags
  const optTags = opts.tags ? opts.tags.split(",").map(t => t.trim()) : [];
  const tags = [...new Set([...extraction.tags, ...optTags])];

  // Confidence
  const confidence = opts.confidence ? parseFloat(opts.confidence) : 0.8;

  const metadata: KnowledgeMeta = {
    type: finalType,
    source,
    confidence,
    tags,
  };

  const entry: KnowledgeEntry = {
    id: randomUUID(),
    type: finalType,
    content,
    metadata,
    createdAt: new Date().toISOString(),
    validated: false,
  };

  storeEntry(cwd, entry);

  if (opts.json) {
    console.log(JSON.stringify({ entry, extraction }, null, 2));
    return;
  }

  console.log(green(`\u2713 Learned from ${source}`));
  console.log(`  ID:         ${entry.id}`);
  console.log(`  Type:       ${entry.type}`);
  console.log(`  Confidence: ${entry.metadata.confidence}`);
  console.log(`  Tags:       ${entry.metadata.tags.join(", ") || "(none)"}`);
  console.log(`  Summary:    ${extraction.summary}`);

  if (extraction.entities.length > 0) {
    console.log(`  Entities:`);
    for (const e of extraction.entities) {
      console.log(`    ${cyan(e.kind)}: ${e.value} ${dim(e.context ?? "")}`);
    }
  }
}

function fileAction(cwd: string, filePath: string, opts: LearnOptions): void {
  const absPath = filePath.startsWith("/") ? filePath : join(cwd, filePath);

  if (!existsSync(absPath)) {
    console.error(red(`File not found: ${absPath}`));
    process.exit(1);
  }

  const content = readFileSync(absPath, "utf-8");
  const sourceType = detectSourceType(absPath);

  if (!opts.json) {
    console.log(dim(`Reading ${sourceType}: ${basename(absPath)}`));
  }
  learnFromContent(cwd, content, `file://${absPath}`, sourceType, opts);
}

async function urlAction(cwd: string, url: string, opts: LearnOptions): void {
  if (!opts.json) {
    console.log(dim(`Fetching: ${url}`));
  }

  try {
    const content = await fetchUrl(url);
    if (!content || content.trim().length === 0) {
      console.error(red("No content extracted from URL"));
      process.exit(1);
    }
    learnFromContent(cwd, content, url, "url", opts);
  } catch (err: any) {
    console.error(red(`Failed to fetch URL: ${err.message}`));
    process.exit(1);
  }
}

function textAction(cwd: string, text: string, opts: LearnOptions): void {
  if (!text.trim()) {
    console.error(red("No text provided"));
    process.exit(1);
  }
  learnFromContent(cwd, text, "text-input", "text", opts);
}

function listAction(cwd: string, opts: LearnOptions): void {
  const entries = loadAllEntries(cwd);

  if (entries.length === 0) {
    console.log(yellow("No knowledge entries found."));
    console.log(dim("Use cocapn learn file <path>, url <url>, or text <text> to teach the agent."));
    return;
  }

  if (opts.json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  // Group by type
  const byType: Record<string, KnowledgeEntry[]> = {};
  for (const e of entries) {
    (byType[e.type] ??= []).push(e);
  }

  console.log(bold(`Knowledge store: ${entries.length} entries\n`));

  for (const [type, list] of Object.entries(byType)) {
    console.log(cyan(`${type} (${list.length})`));
    for (const e of list) {
      const summary = e.content.replace(/\s+/g, " ").trim().slice(0, 80);
      console.log(`  ${dim(e.id.slice(0, 8))}  conf=${e.metadata.confidence}  ${summary}${summary.length >= 80 ? "..." : ""}`);
    }
    console.log();
  }
}

function forgetAction(cwd: string, id: string, opts: LearnOptions): void {
  // Support partial ID match (first 8+ chars)
  const entries = loadAllEntries(cwd);
  const match = entries.find(e => e.id === id || e.id.startsWith(id));

  if (!match) {
    console.error(red(`Knowledge entry not found: ${id}`));
    process.exit(1);
  }

  const removed = removeEntry(cwd, match.id);
  if (removed) {
    if (opts.json) {
      console.log(JSON.stringify({ removed: match.id }, null, 2));
    } else {
      console.log(green(`\u2713 Forgot entry ${match.id}`));
      console.log(`  Type:   ${match.type}`);
      console.log(`  Source: ${match.metadata.source}`);
    }
  } else {
    console.error(red(`Failed to remove entry: ${id}`));
    process.exit(1);
  }
}

// ─── Command factory ───────────────────────────────────────────────────────────

export function createLearnCommand(): Command {
  const cmd = new Command("learn")
    .description("Teach the agent from documents, URLs, and text");

  cmd
    .addCommand(
      new Command("file")
        .description("Learn from a file (.md, .json, .csv, .pdf, .txt)")
        .argument("<path>", "File path to learn from")
        .option("-t, --type <type>", "Force knowledge type: species|regulation|technique|location|equipment")
        .option("--tags <tags>", "Comma-separated tags")
        .option("--confidence <n>", "Confidence score (0.1-1.0)", "0.8")
        .option("--json", "Output as JSON")
        .action((filePath: string, opts: LearnOptions) => {
          fileAction(process.cwd(), filePath, opts);
        })
    )
    .addCommand(
      new Command("url")
        .description("Learn from a URL (fetch and extract text)")
        .argument("<url>", "URL to learn from")
        .option("-t, --type <type>", "Force knowledge type: species|regulation|technique|location|equipment")
        .option("--tags <tags>", "Comma-separated tags")
        .option("--confidence <n>", "Confidence score (0.1-1.0)", "0.8")
        .option("--json", "Output as JSON")
        .action(async (url: string, opts: LearnOptions) => {
          await urlAction(process.cwd(), url, opts);
        })
    )
    .addCommand(
      new Command("text")
        .description("Learn from direct text input")
        .argument("<text>", "Text to learn from")
        .option("-t, --type <type>", "Force knowledge type: species|regulation|technique|location|equipment")
        .option("--tags <tags>", "Comma-separated tags")
        .option("--confidence <n>", "Confidence score (0.1-1.0)", "0.8")
        .option("--json", "Output as JSON")
        .action((text: string, opts: LearnOptions) => {
          textAction(process.cwd(), text, opts);
        })
    )
    .addCommand(
      new Command("list")
        .description("Show what the agent has learned")
        .option("--json", "Output as JSON")
        .action((opts: LearnOptions) => {
          listAction(process.cwd(), opts);
        })
    )
    .addCommand(
      new Command("forget")
        .description("Remove a knowledge entry")
        .argument("<id>", "Entry ID (or first 8+ characters)")
        .option("--json", "Output as JSON")
        .action((id: string, opts: LearnOptions) => {
          forgetAction(process.cwd(), id, opts);
        })
    );

  return cmd;
}
