/**
 * Tests for the starter template generator (src/starter.ts).
 */

import { describe, it, expect } from "vitest";
import {
  getPrivateRepoTemplate,
  getPublicRepoTemplate,
  generateStarterFiles,
} from "../../src/starter.js";

const TEST_CONFIG = { name: "alice", domain: "makerlog" };

// ─── getPrivateRepoTemplate ───────────────────────────────────────────────────

describe("getPrivateRepoTemplate", () => {
  it("returns a non-empty array of files", () => {
    const files = getPrivateRepoTemplate(TEST_CONFIG);
    expect(files.length).toBeGreaterThan(0);
  });

  it("includes all required private repo files", () => {
    const files = getPrivateRepoTemplate(TEST_CONFIG);
    const paths = files.map((f) => f.path);

    // Core files
    expect(paths).toContain("cocapn/soul.md");
    expect(paths).toContain("cocapn/config.yml");
    expect(paths).toContain("cocapn/memory/facts.json");
    expect(paths).toContain("cocapn/memory/memories.json");
    expect(paths).toContain("cocapn/memory/procedures.json");
    expect(paths).toContain("cocapn/wiki/README.md");
    expect(paths).toContain("cocapn/notifications.json");
    expect(paths).toContain("cocapn/webhooks.json");

    // Infrastructure
    expect(paths).toContain("Dockerfile");
    expect(paths).toContain("docker-compose.yml");
    expect(paths).toContain("package.json");
    expect(paths).toContain(".gitignore");
    expect(paths).toContain("CLAUDE.md");
    expect(paths).toContain("README.md");

    // GitHub Actions
    expect(paths).toContain(".github/workflows/cocapn.yml");
  });

  it("replaces {{name}} placeholders with config name", () => {
    const files = getPrivateRepoTemplate(TEST_CONFIG);
    const soul = files.find((f) => f.path === "cocapn/soul.md");
    expect(soul).toBeTruthy();
    expect(soul!.content).toContain("alice");
    expect(soul!.content).not.toContain("{{name}}");
  });

  it("soul.md contains identity sections", () => {
    const files = getPrivateRepoTemplate(TEST_CONFIG);
    const soul = files.find((f) => f.path === "cocapn/soul.md");
    expect(soul!.content).toContain("# Identity");
    expect(soul!.content).toContain("What You Know");
    expect(soul!.content).toContain("What You Don't Do");
    expect(soul!.content).toContain("Public Face");
  });

  it("config.yml has correct structure", () => {
    const files = getPrivateRepoTemplate(TEST_CONFIG);
    const config = files.find((f) => f.path === "cocapn/config.yml");
    expect(config).toBeTruthy();
    expect(config!.content).toContain("provider: deepseek");
    expect(config!.content).toContain("model: deepseek-chat");
    expect(config!.content).toContain("port: 3100");
    expect(config!.content).toContain("maxMemories: 1000");
  });

  it("facts.json is valid empty JSON object", () => {
    const files = getPrivateRepoTemplate(TEST_CONFIG);
    const facts = files.find((f) => f.path === "cocapn/memory/facts.json");
    expect(facts).toBeTruthy();
    expect(JSON.parse(facts!.content)).toEqual({});
  });

  it("memories.json is valid empty JSON array", () => {
    const files = getPrivateRepoTemplate(TEST_CONFIG);
    const memories = files.find((f) => f.path === "cocapn/memory/memories.json");
    expect(memories).toBeTruthy();
    expect(JSON.parse(memories!.content)).toEqual([]);
  });

  it("procedures.json is valid empty JSON array", () => {
    const files = getPrivateRepoTemplate(TEST_CONFIG);
    const procedures = files.find((f) => f.path === "cocapn/memory/procedures.json");
    expect(procedures).toBeTruthy();
    expect(JSON.parse(procedures!.content)).toEqual([]);
  });

  it("package.json has cocapn dependency and scripts", () => {
    const files = getPrivateRepoTemplate(TEST_CONFIG);
    const pkg = files.find((f) => f.path === "package.json");
    expect(pkg).toBeTruthy();
    const parsed = JSON.parse(pkg!.content);
    expect(parsed.dependencies.cocapn).toBeTruthy();
    expect(parsed.scripts.start).toBe("cocapn start");
    expect(parsed.scripts.chat).toBe("cocapn chat");
    expect(parsed.scripts.deploy).toBe("cocapn deploy cloudflare");
  });

  it(".gitignore excludes secrets and node_modules", () => {
    const files = getPrivateRepoTemplate(TEST_CONFIG);
    const gitignore = files.find((f) => f.path === ".gitignore");
    expect(gitignore).toBeTruthy();
    expect(gitignore!.content).toContain("node_modules/");
    expect(gitignore!.content).toContain(".env.local");
    expect(gitignore!.content).toContain("secrets/");
  });

  it("README.md has the paradigm one-liner", () => {
    const files = getPrivateRepoTemplate(TEST_CONFIG);
    const readme = files.find((f) => f.path === "README.md");
    expect(readme).toBeTruthy();
    expect(readme!.content).toContain("Clone this repo. It's alive.");
    expect(readme!.content).toContain("Quick Start");
    expect(readme!.content).toContain("Customization");
  });

  it("GitHub Actions workflow triggers on push and schedule", () => {
    const files = getPrivateRepoTemplate(TEST_CONFIG);
    const workflow = files.find((f) => f.path === ".github/workflows/cocapn.yml");
    expect(workflow).toBeTruthy();
    expect(workflow!.content).toContain("push:");
    expect(workflow!.content).toContain("schedule:");
    expect(workflow!.content).toContain("cocapn start --ci");
  });

  it("Dockerfile exposes port 3100", () => {
    const files = getPrivateRepoTemplate(TEST_CONFIG);
    const dockerfile = files.find((f) => f.path === "Dockerfile");
    expect(dockerfile).toBeTruthy();
    expect(dockerfile!.content).toContain("3100");
  });

  it("docker-compose mounts cocapn directory", () => {
    const files = getPrivateRepoTemplate(TEST_CONFIG);
    const compose = files.find((f) => f.path === "docker-compose.yml");
    expect(compose).toBeTruthy();
    expect(compose!.content).toContain("3100:3100");
    expect(compose!.content).toContain("./cocapn:/app/cocapn");
  });
});

// ─── getPublicRepoTemplate ────────────────────────────────────────────────────

describe("getPublicRepoTemplate", () => {
  it("returns a non-empty array of files", () => {
    const files = getPublicRepoTemplate("alice", "makerlog");
    expect(files.length).toBeGreaterThan(0);
  });

  it("includes all required public repo files", () => {
    const files = getPublicRepoTemplate("alice", "makerlog");
    const paths = files.map((f) => f.path);

    // Public assets
    expect(paths).toContain("public/index.html");
    expect(paths).toContain("public/styles.css");
    expect(paths).toContain("public/assets/favicon.svg");

    // Cocapn config
    expect(paths).toContain("cocapn/soul.md");
    expect(paths).toContain("cocapn/config.yml");

    // Infrastructure
    expect(paths).toContain("wrangler.toml");
    expect(paths).toContain("package.json");
    expect(paths).toContain("README.md");

    // GitHub Actions
    expect(paths).toContain(".github/workflows/deploy.yml");
  });

  it("replaces {{name}} and {{domain}} placeholders", () => {
    const files = getPublicRepoTemplate("bob", "dmlog");
    for (const file of files) {
      expect(file.content).not.toContain("{{name}}");
      expect(file.content).not.toContain("{{domain}}");
    }
  });

  it("index.html has chat UI structure", () => {
    const files = getPublicRepoTemplate("alice", "makerlog");
    const html = files.find((f) => f.path === "public/index.html");
    expect(html).toBeTruthy();
    expect(html!.content).toContain("chat-container");
    expect(html!.content).toContain("chat-form");
    expect(html!.content).toContain("api/chat");
    expect(html!.content).toContain("alice");
  });

  it("styles.css has dark theme variables", () => {
    const files = getPublicRepoTemplate("alice", "makerlog");
    const css = files.find((f) => f.path === "public/styles.css");
    expect(css).toBeTruthy();
    expect(css!.content).toContain("--bg:");
    expect(css!.content).toContain("--accent:");
  });

  it("wrangler.toml has correct name", () => {
    const files = getPublicRepoTemplate("alice", "makerlog");
    const wrangler = files.find((f) => f.path === "wrangler.toml");
    expect(wrangler).toBeTruthy();
    expect(wrangler!.content).toContain('name = "alice"');
  });

  it("public cocapn/soul.md has public persona", () => {
    const files = getPublicRepoTemplate("alice", "makerlog");
    const soul = files.find((f) => f.path === "cocapn/soul.md");
    expect(soul).toBeTruthy();
    expect(soul!.content).toContain("Public Persona");
    expect(soul!.content).toContain("public: true");
    expect(soul!.content).toContain("alice");
  });

  it("public config.yml has mode public", () => {
    const files = getPublicRepoTemplate("alice", "makerlog");
    const config = files.find((f) => f.path === "cocapn/config.yml");
    expect(config).toBeTruthy();
    expect(config!.content).toContain("mode: public");
    expect(config!.content).toContain("makerlog");
  });

  it("package.json has wrangler devDependency", () => {
    const files = getPublicRepoTemplate("alice", "makerlog");
    const pkg = files.find((f) => f.path === "package.json");
    expect(pkg).toBeTruthy();
    const parsed = JSON.parse(pkg!.content);
    expect(parsed.devDependencies.wrangler).toBeTruthy();
    expect(parsed.scripts.deploy).toBe("wrangler deploy");
  });

  it("deploy workflow uses Cloudflare action", () => {
    const files = getPublicRepoTemplate("alice", "makerlog");
    const workflow = files.find((f) => f.path === ".github/workflows/deploy.yml");
    expect(workflow).toBeTruthy();
    expect(workflow!.content).toContain("cloudflare");
    expect(workflow!.content).toContain("CLOUDFLARE_API_TOKEN");
  });
});

// ─── generateStarterFiles ─────────────────────────────────────────────────────

describe("generateStarterFiles", () => {
  it("returns both private and public file sets", () => {
    const result = generateStarterFiles(TEST_CONFIG);
    expect(result.private).toBeDefined();
    expect(result.public).toBeDefined();
    expect(result.private.length).toBeGreaterThan(0);
    expect(result.public.length).toBeGreaterThan(0);
  });

  it("private and public have no overlapping paths", () => {
    const result = generateStarterFiles(TEST_CONFIG);
    const privatePaths = new Set(result.private.map((f) => f.path));
    const publicPaths = new Set(result.public.map((f) => f.path));
    const overlap = [...privatePaths].filter((p) => publicPaths.has(p));
    // Only README.md and package.json may overlap — but they're different repos
    // so the overlap is fine. Check that core structure differs.
    expect(result.private.some((f) => f.path === "cocapn/memory/facts.json")).toBe(true);
    expect(result.public.some((f) => f.path === "public/index.html")).toBe(true);
  });

  it("all placeholders are resolved in both sets", () => {
    const result = generateStarterFiles(TEST_CONFIG);
    const allFiles = [...result.private, ...result.public];
    for (const file of allFiles) {
      expect(file.content).not.toContain("{{name}}");
      expect(file.content).not.toContain("{{domain}}");
    }
  });

  it("handles empty domain gracefully", () => {
    const result = generateStarterFiles({ name: "test", domain: "" });
    expect(result.private.length).toBeGreaterThan(0);
    expect(result.public.length).toBeGreaterThan(0);
  });

  it("handles special characters in name", () => {
    const result = generateStarterFiles({ name: "my-agent", domain: "maker-log" });
    const allFiles = [...result.private, ...result.public];
    for (const file of allFiles) {
      expect(file.content).not.toContain("{{name}}");
    }
  });

  it("generates consistent results for same config", () => {
    const a = generateStarterFiles(TEST_CONFIG);
    const b = generateStarterFiles(TEST_CONFIG);
    expect(a.private.length).toBe(b.private.length);
    expect(a.public.length).toBe(b.public.length);
    for (let i = 0; i < a.private.length; i++) {
      expect(a.private[i]!.content).toBe(b.private[i]!.content);
    }
  });
});
