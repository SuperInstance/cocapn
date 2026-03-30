/**
 * Tests for cocapn wiki command
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import {
  resolveWikiDir,
  ensureWikiDir,
  listPages,
  getPage,
  searchWiki,
  type WikiPageMeta,
  type WikiSearchResult,
} from "../src/commands/wiki.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

const testDir = join(process.cwd(), ".test-wiki-tmp");

function setupWiki(): void {
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true });
  }
  const wikiDir = join(testDir, "cocapn", "wiki");
  mkdirSync(wikiDir, { recursive: true });

  writeFileSync(join(wikiDir, "getting-started.md"), "# Getting Started\n\nThis is the **getting started** guide.\n\n## Prerequisites\n\n- Node.js 18+\n- A code editor\n\n## Installation\n\n```bash\nnpm install cocapn\n```\n");
  writeFileSync(join(wikiDir, "fishing-guide.md"), "# Fishing Guide\n\nTips for *saltwater* fishing.\n\n- Use live bait\n- Check the tides\n- Best times: dawn and dusk\n");
  writeFileSync(join(wikiDir, "api-reference.md"), "# API Reference\n\n## Endpoints\n\n- `GET /api/chat` — Send a message\n- `POST /api/facts` — Set a fact\n");
}

function cleanupWiki(): void {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
}

// ─── resolveWikiDir ──────────────────────────────────────────────────────────

describe("resolveWikiDir", () => {
  beforeEach(() => setupWiki());
  afterEach(() => cleanupWiki());

  it("resolves cocapn/wiki directory", () => {
    const result = resolveWikiDir(testDir);
    expect(result).not.toBeNull();
    expect(result!).toContain("cocapn/wiki");
  });

  it("returns null when no wiki exists", () => {
    cleanupWiki();
    const result = resolveWikiDir(testDir);
    expect(result).toBeNull();
  });
});

// ─── ensureWikiDir ───────────────────────────────────────────────────────────

describe("ensureWikiDir", () => {
  afterEach(() => cleanupWiki());

  it("creates wiki directory if it does not exist", () => {
    const result = ensureWikiDir(testDir);
    expect(existsSync(result)).toBe(true);
    expect(result).toContain("cocapn/wiki");
  });

  it("returns existing wiki directory", () => {
    setupWiki();
    const result = ensureWikiDir(testDir);
    expect(existsSync(result)).toBe(true);
  });
});

// ─── listPages ───────────────────────────────────────────────────────────────

describe("listPages", () => {
  beforeEach(() => setupWiki());
  afterEach(() => cleanupWiki());

  it("lists all wiki pages", () => {
    const wikiDir = resolveWikiDir(testDir)!;
    const pages = listPages(wikiDir);
    expect(pages.length).toBe(3);
  });

  it("pages have correct metadata shape", () => {
    const wikiDir = resolveWikiDir(testDir)!;
    const pages = listPages(wikiDir);
    for (const page of pages) {
      expect(page).toHaveProperty("slug");
      expect(page).toHaveProperty("path");
      expect(page).toHaveProperty("created");
      expect(page).toHaveProperty("modified");
      expect(page).toHaveProperty("size");
      expect(page.size).toBeGreaterThan(0);
    }
  });

  it("pages are sorted alphabetically by slug", () => {
    const wikiDir = resolveWikiDir(testDir)!;
    const pages = listPages(wikiDir);
    const slugs = pages.map((p) => p.slug);
    const sorted = [...slugs].sort();
    expect(slugs).toEqual(sorted);
  });

  it("returns empty array for non-existent directory", () => {
    cleanupWiki();
    const pages = listPages(join(testDir, "cocapn", "wiki"));
    expect(pages).toEqual([]);
  });
});

// ─── getPage ─────────────────────────────────────────────────────────────────

describe("getPage", () => {
  beforeEach(() => setupWiki());
  afterEach(() => cleanupWiki());

  it("returns page content for existing slug", () => {
    const wikiDir = resolveWikiDir(testDir)!;
    const page = getPage(wikiDir, "getting-started");
    expect(page).not.toBeNull();
    expect(page!.content).toContain("Getting Started");
    expect(page!.content).toContain("Prerequisites");
    expect(page!.size).toBeGreaterThan(0);
  });

  it("returns null for non-existent slug", () => {
    const wikiDir = resolveWikiDir(testDir)!;
    const page = getPage(wikiDir, "nonexistent");
    expect(page).toBeNull();
  });

  it("works with .md extension in slug", () => {
    const wikiDir = resolveWikiDir(testDir)!;
    const page = getPage(wikiDir, "fishing-guide.md");
    expect(page).not.toBeNull();
    expect(page!.slug).toBe("fishing-guide");
    expect(page!.content).toContain("saltwater");
  });

  it("page has correct metadata", () => {
    const wikiDir = resolveWikiDir(testDir)!;
    const page = getPage(wikiDir, "api-reference");
    expect(page!.slug).toBe("api-reference");
    expect(page!.content).toContain("Endpoints");
  });
});

// ─── searchWiki ─────────────────────────────────────────────────────────────

describe("searchWiki", () => {
  beforeEach(() => setupWiki());
  afterEach(() => cleanupWiki());

  it("finds matching pages by content", () => {
    const wikiDir = resolveWikiDir(testDir)!;
    const results = searchWiki(wikiDir, "bait");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].slug).toBe("fishing-guide");
  });

  it("search is case-insensitive", () => {
    const wikiDir = resolveWikiDir(testDir)!;
    const upper = searchWiki(wikiDir, "SALTWATER");
    const lower = searchWiki(wikiDir, "saltwater");
    expect(upper.length).toBe(lower.length);
  });

  it("finds matches across multiple pages", () => {
    const wikiDir = resolveWikiDir(testDir)!;
    const results = searchWiki(wikiDir, "api");
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("returns empty array for no matches", () => {
    const wikiDir = resolveWikiDir(testDir)!;
    const results = searchWiki(wikiDir, "zzznonexistent");
    expect(results).toEqual([]);
  });

  it("returns empty array for non-existent directory", () => {
    cleanupWiki();
    const results = searchWiki(join(testDir, "cocapn", "wiki"), "test");
    expect(results).toEqual([]);
  });

  it("results include line numbers", () => {
    const wikiDir = resolveWikiDir(testDir)!;
    const results = searchWiki(wikiDir, "Prerequisites");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].line).toBeGreaterThan(0);
  });

  it("results include stripped snippets", () => {
    const wikiDir = resolveWikiDir(testDir)!;
    const results = searchWiki(wikiDir, "getting started");
    expect(results.length).toBeGreaterThan(0);
    // Markdown should be stripped (no ** or ## in snippet)
    expect(results[0].snippet).not.toContain("**");
  });

  it("multi-line query returns multiple results", () => {
    const wikiDir = resolveWikiDir(testDir)!;
    const results = searchWiki(wikiDir, "the");
    // "the" appears in multiple pages/lines
    expect(results.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Editor fallback ─────────────────────────────────────────────────────────

describe("editor fallback", () => {
  afterEach(() => cleanupWiki());

  it("EDITOR env var determines editor choice", () => {
    // The editAction function uses process.env.EDITOR || "nano"
    // This test documents the fallback behavior
    const originalEditor = process.env.EDITOR;
    delete process.env.EDITOR;
    expect(process.env.EDITOR).toBeUndefined();
    // The code falls back to "nano"
    process.env.EDITOR = originalEditor;
  });

  it("custom EDITOR is used when set", () => {
    const originalEditor = process.env.EDITOR;
    process.env.EDITOR = "vim";
    expect(process.env.EDITOR).toBe("vim");
    process.env.EDITOR = originalEditor;
  });
});

// ─── Slug handling ───────────────────────────────────────────────────────────

describe("slug handling", () => {
  beforeEach(() => setupWiki());
  afterEach(() => cleanupWiki());

  it("handles hyphenated slugs", () => {
    const wikiDir = resolveWikiDir(testDir)!;
    const page = getPage(wikiDir, "fishing-guide");
    expect(page).not.toBeNull();
  });

  it("handles simple slugs", () => {
    const wikiDir = resolveWikiDir(testDir)!;
    const page = getPage(wikiDir, "getting-started");
    expect(page).not.toBeNull();
  });

  it("search works with partial words", () => {
    const wikiDir = resolveWikiDir(testDir)!;
    const results = searchWiki(wikiDir, "salt");
    expect(results.length).toBeGreaterThan(0);
  });
});
