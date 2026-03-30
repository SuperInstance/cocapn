/**
 * cocapn wiki — Manage agent wiki from the CLI.
 *
 * Reads/writes cocapn/wiki/*.md files directly. No bridge required.
 */

import { Command } from "commander";
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, statSync, mkdirSync, readSync } from "fs";
import { join, resolve } from "path";
import { execSync } from "child_process";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WikiPageMeta {
  slug: string;
  path: string;
  created: string;
  modified: string;
  size: number;
}

export interface WikiPage extends WikiPageMeta {
  content: string;
}

export interface WikiSearchResult {
  slug: string;
  snippet: string;
  line: number;
}

// ─── ANSI colors ────────────────────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  magenta: "\x1b[35m",
};

const bold = (s: string) => `${c.bold}${s}${c.reset}`;
const cyan = (s: string) => `${c.cyan}${s}${c.reset}`;
const green = (s: string) => `${c.green}${s}${c.reset}`;
const yellow = (s: string) => `${c.yellow}${s}${c.reset}`;
const red = (s: string) => `${c.red}${s}${c.reset}`;
const magenta = (s: string) => `${c.magenta}${s}${c.reset}`;
const gray = (s: string) => `${c.gray}${s}${c.reset}`;
const dim = (s: string) => `${c.dim}${s}${c.reset}`;

// ─── Helpers ────────────────────────────────────────────────────────────────

export function resolveWikiDir(repoRoot: string): string | null {
  const cocapnDir = join(repoRoot, "cocapn");
  if (existsSync(join(cocapnDir, "wiki"))) return join(cocapnDir, "wiki");
  if (existsSync(join(repoRoot, "wiki"))) return join(repoRoot, "wiki");
  return null;
}

export function ensureWikiDir(repoRoot: string): string {
  const cocapnDir = join(repoRoot, "cocapn");
  const wikiDir = join(cocapnDir, "wiki");
  if (!existsSync(wikiDir)) {
    mkdirSync(wikiDir, { recursive: true });
  }
  return wikiDir;
}

function slugToPath(wikiDir: string, slug: string): string {
  return join(wikiDir, `${slug.endsWith(".md") ? slug : `${slug}.md`}`);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/`{1,3}(.+?)`{1,3}/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/^[-*+]\s+/gm, "  \u2022 ")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/^---+$/gm, "\u2500".repeat(40));
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "\u2026";
}

function getGitDate(filePath: string): string {
  try {
    return execSync(`git log -1 --format=%aI -- "${filePath}"`, { encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

// ─── Core functions (exported for testing) ──────────────────────────────────

export function listPages(wikiDir: string): WikiPageMeta[] {
  if (!existsSync(wikiDir)) return [];
  const files = readdirSync(wikiDir).filter((f) => f.endsWith(".md")).sort();
  return files.map((file) => {
    const fullPath = join(wikiDir, file);
    const stat = statSync(fullPath);
    const slug = file.replace(/\.md$/, "");
    const gitDate = getGitDate(fullPath);
    return {
      slug,
      path: fullPath,
      created: gitDate || stat.birthtime.toISOString(),
      modified: stat.mtime.toISOString(),
      size: stat.size,
    };
  });
}

export function getPage(wikiDir: string, slug: string): WikiPage | null {
  const path = slugToPath(wikiDir, slug);
  if (!existsSync(path)) return null;
  const stat = statSync(path);
  const content = readFileSync(path, "utf-8");
  const gitDate = getGitDate(path);
  return {
    slug: slug.replace(/\.md$/, ""),
    path,
    content,
    created: gitDate || stat.birthtime.toISOString(),
    modified: stat.mtime.toISOString(),
    size: stat.size,
  };
}

export function searchWiki(wikiDir: string, query: string): WikiSearchResult[] {
  if (!existsSync(wikiDir)) return [];
  const lowerQuery = query.toLowerCase();
  const files = readdirSync(wikiDir).filter((f) => f.endsWith(".md"));
  const results: WikiSearchResult[] = [];
  for (const file of files) {
    const slug = file.replace(/\.md$/, "");
    const content = readFileSync(join(wikiDir, file), "utf-8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(lowerQuery)) {
        results.push({
          slug,
          snippet: stripMarkdown(truncate(lines[i].trim(), 120)),
          line: i + 1,
        });
      }
    }
  }
  return results;
}

// ─── Subcommands ────────────────────────────────────────────────────────────

function listAction(repoRoot: string, json: boolean): void {
  const wikiDir = resolveWikiDir(repoRoot);
  if (!wikiDir) {
    console.log(yellow("No wiki directory found. Run cocapn setup to get started."));
    process.exit(1);
  }

  const pages = listPages(wikiDir);

  if (json) {
    console.log(JSON.stringify({ pages, total: pages.length }, null, 2));
    return;
  }

  if (pages.length === 0) {
    console.log(gray("No wiki pages found."));
    return;
  }

  const header = `  ${bold("SLUG".padEnd(30))}  ${bold("MODIFIED".padEnd(20))}  ${bold("SIZE")}`;
  const sep = `  ${gray("\u2500".repeat(30))}  ${gray("\u2500".repeat(20))}  ${gray("\u2500".repeat(8))}`;
  const rows = pages.map((p) => {
    const sizeStr = p.size > 1024 ? `${(p.size / 1024).toFixed(1)}K` : `${p.size}B`;
    return `  ${magenta(p.slug.padEnd(30))}  ${dim(formatDate(p.modified).padEnd(20))}  ${gray(sizeStr)}`;
  });

  console.log(bold(`\nWiki (${pages.length} pages)\n`));
  console.log(header);
  console.log(sep);
  console.log(rows.join("\n"));
}

function getAction(repoRoot: string, slug: string, json: boolean): void {
  const wikiDir = resolveWikiDir(repoRoot);
  if (!wikiDir) {
    console.log(yellow("No wiki directory found. Run cocapn setup to get started."));
    process.exit(1);
  }

  const page = getPage(wikiDir, slug);
  if (!page) {
    console.log(yellow(`Wiki page not found: ${slug}`));
    process.exit(1);
  }

  if (json) {
    console.log(JSON.stringify(page, null, 2));
    return;
  }

  console.log(bold(`\n${page.slug}\n`));
  console.log(`${dim("Created:")}  ${formatDate(page.created)}`);
  console.log(`${dim("Modified:")} ${formatDate(page.modified)}`);
  console.log(`${dim("Size:")}     ${page.size} bytes`);
  console.log(`\n${gray("\u2500".repeat(60))}\n`);
  console.log(stripMarkdown(page.content));
}

function editAction(repoRoot: string, slug: string): void {
  const wikiDir = ensureWikiDir(repoRoot);
  const path = slugToPath(wikiDir, slug);

  if (!existsSync(path)) {
    console.log(yellow(`Wiki page not found: ${slug}. Use 'cocapn wiki new ${slug}' to create it.`));
    process.exit(1);
  }

  const editor = process.env.EDITOR || "nano";
  try {
    execSync(`${editor} "${path}"`, { stdio: "inherit" });
  } catch {
    console.log(red(`Failed to open editor. Set $EDITOR or ensure nano is installed.`));
    process.exit(1);
  }

  // Auto-commit
  try {
    execSync(`git add "${path}"`, { cwd: repoRoot, stdio: "pipe" });
    execSync(`git commit -m "wiki: edit ${slug}"`, { cwd: repoRoot, stdio: "pipe" });
    console.log(green(`\u2713 Saved and committed: ${slug}`));
  } catch {
    console.log(yellow(`Saved ${slug} (no changes to commit)`));
  }
}

function newAction(repoRoot: string, slug: string): void {
  const wikiDir = ensureWikiDir(repoRoot);
  const path = slugToPath(wikiDir, slug);

  if (existsSync(path)) {
    console.log(yellow(`Wiki page already exists: ${slug}. Use 'cocapn wiki edit ${slug}' to edit it.`));
    process.exit(1);
  }

  const template = `# ${slug}\n\n_A wiki page about ${slug}._\n\n## Overview\n\n\n## Details\n\n`;
  writeFileSync(path, template);

  const editor = process.env.EDITOR || "nano";
  try {
    execSync(`${editor} "${path}"`, { stdio: "inherit" });
  } catch {
    console.log(red(`Failed to open editor. Set $EDITOR or ensure nano is installed.`));
    process.exit(1);
  }

  // Auto-commit
  try {
    execSync(`git add "${path}"`, { cwd: repoRoot, stdio: "pipe" });
    execSync(`git commit -m "wiki: new ${slug}"`, { cwd: repoRoot, stdio: "pipe" });
    console.log(green(`\u2713 Created and committed: ${slug}`));
  } catch {
    console.log(yellow(`Created ${slug}`));
  }
}

function searchAction(repoRoot: string, query: string, json: boolean): void {
  const wikiDir = resolveWikiDir(repoRoot);
  if (!wikiDir) {
    console.log(yellow("No wiki directory found. Run cocapn setup to get started."));
    process.exit(1);
  }

  const results = searchWiki(wikiDir, query);

  if (json) {
    console.log(JSON.stringify({ query, results, total: results.length }, null, 2));
    return;
  }

  if (results.length === 0) {
    console.log(gray(`No results for: ${query}`));
    return;
  }

  console.log(bold(`\nSearch: "${query}" (${results.length} matches)\n`));
  for (const r of results) {
    console.log(`  ${magenta(r.slug.padEnd(30))} ${dim(`L${r.line}`)}  ${gray(truncate(r.snippet, 80))}`);
  }
}

function deleteAction(repoRoot: string, slug: string): void {
  const wikiDir = resolveWikiDir(repoRoot);
  if (!wikiDir) {
    console.log(yellow("No wiki directory found. Run cocapn setup to get started."));
    process.exit(1);
  }

  const path = slugToPath(wikiDir, slug);
  if (!existsSync(path)) {
    console.log(yellow(`Wiki page not found: ${slug}`));
    process.exit(1);
  }

  const content = readFileSync(path, "utf-8");
  console.log(dim(`Deleting: ${slug} (${content.length} bytes)`));

  // Simple confirmation
  const confirm = process.env.COCAPN_YES === "1" || process.argv.includes("--yes") || process.argv.includes("-y");
  if (!confirm) {
    // Synchronous confirmation — we can't do true async in a sync commander action,
    // so we require --yes/-y or COCAPN_YES=1 for non-interactive use.
    // For interactive terminals, we check if stdin is a TTY and use a sync read.
    if (process.stdin.isTTY) {
      process.stdout.write(red(`Delete "${slug}"? [y/N] `));
      const buf = Buffer.alloc(1);
      readSync(0, buf, 0, 1, null);
      const answer = buf.toString("utf-8", 0, 1).trim().toLowerCase();
      console.log();
      if (answer !== "y") {
        console.log(gray("Cancelled."));
        process.exit(0);
      }
    } else {
      console.log(yellow("Use --yes to confirm deletion in non-interactive mode."));
      process.exit(1);
    }
  }

  unlinkSync(path);
  console.log(green(`\u2713 Deleted: ${slug}`));

  // Auto-commit
  try {
    execSync(`git add "${path}"`, { cwd: repoRoot, stdio: "pipe" });
    execSync(`git commit -m "wiki: delete ${slug}"`, { cwd: repoRoot, stdio: "pipe" });
    console.log(green(`\u2713 Committed deletion: ${slug}`));
  } catch {
    // not in a git repo, or no changes
  }
}

// ─── Command ────────────────────────────────────────────────────────────────

export function createWikiCommand(): Command {
  return new Command("wiki")
    .description("Manage agent wiki pages")
    .addCommand(
      new Command("list")
        .description("List all wiki pages")
        .option("--json", "Output as JSON")
        .action((opts: { json?: boolean }) => {
          listAction(process.cwd(), opts.json ?? false);
        })
    )
    .addCommand(
      new Command("get")
        .description("Show wiki page content")
        .argument("<slug>", "Wiki page slug")
        .option("--json", "Output as JSON")
        .action((slug: string, opts: { json?: boolean }) => {
          getAction(process.cwd(), slug, opts.json ?? false);
        })
    )
    .addCommand(
      new Command("edit")
        .description("Edit a wiki page in $EDITOR")
        .argument("<slug>", "Wiki page slug")
        .action((slug: string) => {
          editAction(process.cwd(), slug);
        })
    )
    .addCommand(
      new Command("new")
        .description("Create a new wiki page")
        .argument("<slug>", "Wiki page slug")
        .action((slug: string) => {
          newAction(process.cwd(), slug);
        })
    )
    .addCommand(
      new Command("search")
        .description("Search wiki pages")
        .argument("<query>", "Search query")
        .option("--json", "Output as JSON")
        .action((query: string, opts: { json?: boolean }) => {
          searchAction(process.cwd(), query, opts.json ?? false);
        })
    )
    .addCommand(
      new Command("delete")
        .description("Delete a wiki page")
        .argument("<slug>", "Wiki page slug")
        .option("-y, --yes", "Skip confirmation")
        .action((slug: string) => {
          deleteAction(process.cwd(), slug);
        })
    );
}
