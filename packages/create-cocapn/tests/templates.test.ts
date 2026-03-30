/**
 * Tests for template-based scaffolding (templates.ts).
 */

import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { existsSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { getTemplateFiles, writeTemplateFiles } from "../src/templates.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tmpDir(suffix: string): string {
  const dir = join(tmpdir(), `create-cocapn-test-${suffix}-${Date.now()}`);
  return dir;
}

// ─── getTemplateFiles ──────────────────────────────────────────────────────────

describe("getTemplateFiles", () => {
  it("returns base files for all templates", () => {
    const templates = ["bare", "cloud-worker", "web-app", "dmlog", "studylog"];

    for (const template of templates) {
      const files = getTemplateFiles({ template });

      // All templates should have .gitignore and cocapn.json
      expect(files.some((f) => f.path === ".gitignore")).toBeTruthy();
      expect(files.some((f) => f.path === "cocapn.json")).toBeTruthy();
    }
  });

  it("cloud-worker template includes wrangler.toml", () => {
    const files = getTemplateFiles({ template: "cloud-worker" });
    expect(files.some((f) => f.path === "wrangler.toml")).toBeTruthy();
  });

  it("web-app template includes index.html", () => {
    const files = getTemplateFiles({ template: "web-app" });
    expect(files.some((f) => f.path === "index.html")).toBeTruthy();
  });

  it("dmlog template includes soul.md with TTRPG content", () => {
    const files = getTemplateFiles({ template: "dmlog" });
    const soulFile = files.find((f) => f.path === "cocapn/soul.md");
    expect(soulFile).toBeTruthy();
    expect(soulFile!.content.includes("Dungeon Master")).toBeTruthy();
    expect(soulFile!.content.includes("TTRPG")).toBeTruthy();
  });

  it("studylog template includes soul.md with education content", () => {
    const files = getTemplateFiles({ template: "studylog" });
    const soulFile = files.find((f) => f.path === "cocapn/soul.md");
    expect(soulFile).toBeTruthy();
    expect(soulFile!.content.includes("AI tutor")).toBeTruthy();
    expect(soulFile!.content.includes("learning")).toBeTruthy();
  });

  it("replaces repoName placeholder in files", () => {
    const files = getTemplateFiles({
      template: "bare",
      repoName: "my-custom-app"
    });

    const pkgJson = files.find((f) => f.path === "package.json");
    expect(pkgJson).toBeTruthy();

    const parsed = JSON.parse(pkgJson!.content);
    expect(parsed.name).toBe("my-custom-app");
  });

  it("includes description in cocapn.json when provided", () => {
    const files = getTemplateFiles({
      template: "bare",
      repoName: "test-app",
      description: "My custom test app"
    });

    const cocapnJson = files.find((f) => f.path === "cocapn.json");
    expect(cocapnJson).toBeTruthy();

    const parsed = JSON.parse(cocapnJson!.content);
    expect(parsed.description).toBe("My custom test app");
  });

  it("includes author in dmlog soul.md when provided", () => {
    const files = getTemplateFiles({
      template: "dmlog",
      author: "Alice the DM"
    });

    const soulFile = files.find((f) => f.path === "cocapn/soul.md");
    expect(soulFile).toBeTruthy();
    expect(soulFile!.content.includes("Alice the DM")).toBeTruthy();
  });
});

// ─── writeTemplateFiles ────────────────────────────────────────────────────────

describe("writeTemplateFiles", () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir("write-files");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates all files for bare template", () => {
    writeTemplateFiles(dir, { template: "bare", repoName: "test-bare" });

    // Check base files
    expect(existsSync(join(dir, ".gitignore"))).toBeTruthy();
    expect(existsSync(join(dir, "cocapn.json"))).toBeTruthy();
    expect(existsSync(join(dir, "package.json"))).toBeTruthy();
    expect(existsSync(join(dir, "src/index.ts"))).toBeTruthy();
  });

  it("creates wrangler.toml for cloud-worker template", () => {
    const testDir = tmpDir("cloud-worker");
    try {
      writeTemplateFiles(testDir, { template: "cloud-worker", repoName: "test-worker" });

      expect(existsSync(join(testDir, "wrangler.toml"))).toBeTruthy();
      expect(existsSync(join(testDir, "src/index.ts"))).toBeTruthy();

      // Check that wrangler.toml has the project name
      const wrangler = readFileSync(join(testDir, "wrangler.toml"), "utf8");
      expect(wrangler.includes("test-worker")).toBeTruthy();
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("creates cocapn/soul.md for dmlog template", () => {
    const testDir = tmpDir("dmlog");
    try {
      writeTemplateFiles(testDir, { template: "dmlog", repoName: "test-dmlog" });

      expect(existsSync(join(testDir, "cocapn/soul.md"))).toBeTruthy();
      expect(existsSync(join(testDir, "cocapn/config.yml"))).toBeTruthy();

      // Check soul.md content
      const soul = readFileSync(join(testDir, "cocapn/soul.md"), "utf8");
      expect(soul.includes("Dungeon Master")).toBeTruthy();
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("creates cocapn/soul.md for studylog template", () => {
    const testDir = tmpDir("studylog");
    try {
      writeTemplateFiles(testDir, { template: "studylog", repoName: "test-studylog" });

      expect(existsSync(join(testDir, "cocapn/soul.md"))).toBeTruthy();
      expect(existsSync(join(testDir, "cocapn/config.yml"))).toBeTruthy();

      // Check soul.md content
      const soul = readFileSync(join(testDir, "cocapn/soul.md"), "utf8");
      expect(soul.includes("AI tutor")).toBeTruthy();
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("creates web app files for web-app template", () => {
    const testDir = tmpDir("webapp");
    try {
      writeTemplateFiles(testDir, { template: "web-app", repoName: "test-webapp" });

      expect(existsSync(join(testDir, "index.html"))).toBeTruthy();
      expect(existsSync(join(testDir, "src/index.ts"))).toBeTruthy();
      expect(existsSync(join(testDir, "src/App.tsx"))).toBeTruthy();

      // Check index.html has project name
      const html = readFileSync(join(testDir, "index.html"), "utf8");
      expect(html.includes("test-webapp")).toBeTruthy();
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("overwrites existing files", () => {
    const testDir = tmpDir("overwrite");
    try {
      // Write initial files
      writeTemplateFiles(testDir, { template: "bare", repoName: "initial" });

      // Write again with different options
      writeTemplateFiles(testDir, { template: "bare", repoName: "updated" });

      // Check that the file was updated
      const pkgJson = readFileSync(join(testDir, "package.json"), "utf8");
      const parsed = JSON.parse(pkgJson);
      expect(parsed.name).toBe("updated");
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("creates nested directory structure", () => {
    const testDir = tmpDir("nested");
    try {
      writeTemplateFiles(testDir, { template: "dmlog", repoName: "test-nested" });

      // Check that nested directories were created
      expect(existsSync(join(testDir, "cocapn"))).toBeTruthy();
      expect(existsSync(join(testDir, "cocapn/soul.md"))).toBeTruthy();
      expect(existsSync(join(testDir, "cocapn/config.yml"))).toBeTruthy();
      expect(existsSync(join(testDir, "src"))).toBeTruthy();
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });
});

// ─── Template content validation ───────────────────────────────────────────────

describe("Template content validation", () => {
  it("bare template has minimal dependencies", () => {
    const files = getTemplateFiles({ template: "bare" });
    const pkgJson = files.find((f) => f.path === "package.json");
    expect(pkgJson).toBeTruthy();

    const parsed = JSON.parse(pkgJson!.content);
    // Bare should have minimal dependencies (no runtime deps)
    expect(!parsed.dependencies || Object.keys(parsed.dependencies).length === 0).toBeTruthy();
  });

  it("cloud-worker template includes hono dependency", () => {
    const files = getTemplateFiles({ template: "cloud-worker" });
    const pkgJson = files.find((f) => f.path === "package.json");
    expect(pkgJson).toBeTruthy();

    const parsed = JSON.parse(pkgJson!.content);
    expect(parsed.dependencies.hono).toBeTruthy();
    expect(parsed.devDependencies.wrangler).toBeTruthy();
  });

  it("web-app template includes preact dependency", () => {
    const files = getTemplateFiles({ template: "web-app" });
    const pkgJson = files.find((f) => f.path === "package.json");
    expect(pkgJson).toBeTruthy();

    const parsed = JSON.parse(pkgJson!.content);
    expect(parsed.dependencies.preact).toBeTruthy();
    expect(parsed.devDependencies.vite).toBeTruthy();
  });

  it("all templates use type: module in package.json", () => {
    const templates = ["bare", "cloud-worker", "web-app", "dmlog", "studylog"];

    for (const template of templates) {
      const files = getTemplateFiles({ template });
      const pkgJson = files.find((f) => f.path === "package.json");
      expect(pkgJson).toBeTruthy();

      const parsed = JSON.parse(pkgJson!.content);
      expect(parsed.type).toBe("module");
    }
  });

  it("all templates include test script", () => {
    const templates = ["bare", "cloud-worker", "web-app", "dmlog", "studylog"];

    for (const template of templates) {
      const files = getTemplateFiles({ template });
      const pkgJson = files.find((f) => f.path === "package.json");
      expect(pkgJson).toBeTruthy();

      const parsed = JSON.parse(pkgJson!.content);
      expect(parsed.scripts.test).toBeTruthy();
    }
  });
});
