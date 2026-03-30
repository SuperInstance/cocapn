/**
 * Tests for scaffold.ts — two-repo model.
 */

import { describe, it, beforeEach, afterEach, beforeAll, afterAll, expect } from "vitest";
import { existsSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tmpDir(suffix: string): string {
  const dir = join(tmpdir(), `cocapn-test-${suffix}-${Date.now()}`);
  return dir;
}

const CONFIG = {
  username: "alice",
  projectName: "my-cocapn",
  domain: "makerlog",
  template: "bare",
  baseDir: "",
};

// ─── createPrivateRepo ────────────────────────────────────────────────────────

describe("createPrivateRepo", () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir("brain");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates expected directory structure", async () => {
    const { createPrivateRepo } = await import("../src/scaffold.js");
    createPrivateRepo(dir, CONFIG);

    // Directories
    expect(existsSync(join(dir, "cocapn"))).toBeTruthy();
    expect(existsSync(join(dir, "cocapn", "memory"))).toBeTruthy();
    expect(existsSync(join(dir, "cocapn", "memory", "repo-understanding"))).toBeTruthy();
    expect(existsSync(join(dir, "wiki"))).toBeTruthy();

    // Files
    expect(existsSync(join(dir, "cocapn", "soul.md"))).toBeTruthy();
    expect(existsSync(join(dir, "cocapn", "config.yml"))).toBeTruthy();
    expect(existsSync(join(dir, "cocapn", "memory", "facts.json"))).toBeTruthy();
    expect(existsSync(join(dir, "cocapn", "memory", "memories.json"))).toBeTruthy();
    expect(existsSync(join(dir, "cocapn", "memory", "procedures.json"))).toBeTruthy();
    expect(existsSync(join(dir, "cocapn", "memory", "relationships.json"))).toBeTruthy();
    expect(existsSync(join(dir, "wiki", "README.md"))).toBeTruthy();
    expect(existsSync(join(dir, ".gitignore"))).toBeTruthy();
    expect(existsSync(join(dir, ".env.local"))).toBeTruthy();
    expect(existsSync(join(dir, "package.json"))).toBeTruthy();
  });

  it("soul.md contains username", async () => {
    const { createPrivateRepo } = await import("../src/scaffold.js");
    const d = tmpDir("soul-user");
    try {
      createPrivateRepo(d, { ...CONFIG, username: "bob" });
      const soul = readFileSync(join(d, "cocapn", "soul.md"), "utf8");
      expect(soul.includes("bob")).toBeTruthy();
      expect(soul.includes("{{username}}")).toBeFalsy();
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it(".gitignore contains .env.local", async () => {
    const { createPrivateRepo } = await import("../src/scaffold.js");
    const d = tmpDir("gitignore");
    try {
      createPrivateRepo(d, CONFIG);
      const gitignore = readFileSync(join(d, ".gitignore"), "utf8");
      expect(gitignore.includes(".env.local")).toBeTruthy();
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("config.yml has correct domain", async () => {
    const { createPrivateRepo } = await import("../src/scaffold.js");
    const d = tmpDir("config-domain");
    try {
      createPrivateRepo(d, { ...CONFIG, domain: "dmlog" });
      const config = readFileSync(join(d, "cocapn", "config.yml"), "utf8");
      expect(config.includes("dmlog")).toBeTruthy();
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("dmlog template has TTRPG soul.md", async () => {
    const { createPrivateRepo } = await import("../src/scaffold.js");
    const d = tmpDir("dmlog-soul");
    try {
      createPrivateRepo(d, { ...CONFIG, template: "dmlog" });
      const soul = readFileSync(join(d, "cocapn", "soul.md"), "utf8");
      expect(soul.includes("Dungeon Master")).toBeTruthy();
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("facts.json is empty object", async () => {
    const { createPrivateRepo } = await import("../src/scaffold.js");
    const d = tmpDir("facts-empty");
    try {
      createPrivateRepo(d, CONFIG);
      const facts = readFileSync(join(d, "cocapn", "memory", "facts.json"), "utf8");
      expect(JSON.parse(facts)).toEqual({});
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});

// ─── createPublicRepo ─────────────────────────────────────────────────────────

describe("createPublicRepo", () => {
  it("creates expected directory structure", async () => {
    const { createPublicRepo } = await import("../src/scaffold.js");
    const dir = tmpDir("public");
    try {
      createPublicRepo(dir, CONFIG);

      expect(existsSync(join(dir, "cocapn.yml"))).toBeTruthy();
      expect(existsSync(join(dir, "index.html"))).toBeTruthy();
      expect(existsSync(join(dir, "src", "main.ts"))).toBeTruthy();
      expect(existsSync(join(dir, "src", "app.ts"))).toBeTruthy();
      expect(existsSync(join(dir, "src", "style.css"))).toBeTruthy();
      expect(existsSync(join(dir, ".gitignore"))).toBeTruthy();
      expect(existsSync(join(dir, "package.json"))).toBeTruthy();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("creates CNAME when domain is provided", async () => {
    const { createPublicRepo } = await import("../src/scaffold.js");
    const dir = tmpDir("cname");
    try {
      createPublicRepo(dir, CONFIG);
      expect(existsSync(join(dir, "CNAME"))).toBeTruthy();
      const cname = readFileSync(join(dir, "CNAME"), "utf8");
      expect(cname.includes("alice.makerlog.ai")).toBeTruthy();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("omits CNAME when no domain", async () => {
    const { createPublicRepo } = await import("../src/scaffold.js");
    const dir = tmpDir("no-cname");
    try {
      createPublicRepo(dir, { ...CONFIG, domain: "" });
      expect(existsSync(join(dir, "CNAME"))).toBeFalsy();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("cocapn.yml links to brain repo", async () => {
    const { createPublicRepo } = await import("../src/scaffold.js");
    const dir = tmpDir("cocapn-yml");
    try {
      createPublicRepo(dir, CONFIG);
      const yml = readFileSync(join(dir, "cocapn.yml"), "utf8");
      expect(yml.includes("my-cocapn")).toBeTruthy();
      expect(yml.includes("alice")).toBeTruthy();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── Two-repo integration ─────────────────────────────────────────────────────

describe("Two-repo integration", () => {
  let baseDir: string;

  beforeAll(() => {
    baseDir = tmpDir("two-repo");
  });

  afterAll(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it("creates both repos from a temp dir", async () => {
    const { createPrivateRepo, createPublicRepo, initAndCommit } = await import("../src/scaffold.js");
    const brainDir = join(baseDir, "test-brain");
    const publicDir = join(baseDir, "test-public");

    createPrivateRepo(brainDir, CONFIG);
    createPublicRepo(publicDir, CONFIG);
    initAndCommit(brainDir, "alice", "Initial brain");
    initAndCommit(publicDir, "alice", "Initial public");

    expect(existsSync(join(brainDir, "cocapn", "soul.md"))).toBeTruthy();
    expect(existsSync(join(publicDir, "cocapn.yml"))).toBeTruthy();
  });

  it("both repos have .git directories after initAndCommit", async () => {
    expect(existsSync(join(baseDir, "test-brain", ".git"))).toBeTruthy();
    expect(existsSync(join(baseDir, "test-public", ".git"))).toBeTruthy();
  });

  it("soul.md exists in brain repo", async () => {
    const soul = readFileSync(join(baseDir, "test-brain", "cocapn", "soul.md"), "utf8");
    expect(soul.length > 0).toBeTruthy();
    expect(soul.includes("alice")).toBeTruthy();
  });

  it(".gitignore has .env.local in brain repo", async () => {
    const gitignore = readFileSync(join(baseDir, "test-brain", ".gitignore"), "utf8");
    expect(gitignore.includes(".env.local")).toBeTruthy();
  });

  it(".env.local is gitignored", async () => {
    // git check-ignore should confirm .env.local is ignored
    try {
      const output = execSync("git check-ignore .env.local", {
        cwd: join(baseDir, "test-brain"),
        encoding: "utf8",
        stdio: "pipe",
      });
      expect(output.trim()).toBe(".env.local");
    } catch {
      expect.unreachable(".env.local should be gitignored but git check-ignore returned non-zero");
    }
  });
});

// ─── writeSecrets ─────────────────────────────────────────────────────────────

describe("writeSecrets", () => {
  it("writes secrets to .env.local", async () => {
    const { writeSecrets } = await import("../src/scaffold.js");
    const dir = tmpDir("secrets");
    try {
      // Create minimal .env.local first
      const { mkdirSync, writeFileSync } = await import("fs");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, ".env.local"), "");

      writeSecrets(dir, { DEEPSEEK_API_KEY: "sk-test-123" });
      const content = readFileSync(join(dir, ".env.local"), "utf8");
      expect(content.includes("DEEPSEEK_API_KEY=sk-test-123")).toBeTruthy();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── testLLMConnection (mocked) ───────────────────────────────────────────────

describe("testLLMConnection", () => {
  it("returns ok result on successful response", async () => {
    const { testLLMConnection } = await import("../src/scaffold.js");

    const originalFetch = global.fetch;
    global.fetch = async (): Promise<Response> => {
      return new Response(JSON.stringify({ id: "test" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      const result = await testLLMConnection("sk-test-key");
      expect(result.ok).toBe(true);
      expect(result.latencyMs >= 0).toBeTruthy();
      expect(typeof result.model === "string").toBeTruthy();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("returns error on non-ok response", async () => {
    const { testLLMConnection } = await import("../src/scaffold.js");

    const originalFetch = global.fetch;
    global.fetch = async (): Promise<Response> => {
      return new Response(JSON.stringify({ error: "invalid key" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      const result = await testLLMConnection("sk-bad-key");
      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("returns error on network failure", async () => {
    const { testLLMConnection } = await import("../src/scaffold.js");

    const originalFetch = global.fetch;
    global.fetch = async (): Promise<Response> => {
      throw new Error("ECONNREFUSED");
    };

    try {
      const result = await testLLMConnection("sk-any-key");
      expect(result.ok).toBe(false);
      expect(result.error?.includes("ECONNREFUSED")).toBeTruthy();
    } finally {
      global.fetch = originalFetch;
    }
  });
});

// ─── GitHub API (mocked) ─────────────────────────────────────────────────────

describe("createGitHubRepos", () => {
  it("derives correct repo names", async () => {
    const { createGitHubRepos } = await import("../src/scaffold.js");

    const calls: Array<{ url: string; body: unknown }> = [];
    const originalFetch = global.fetch;
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = input.toString();
      const body = init?.body ? (JSON.parse(init.body as string) as unknown) : undefined;
      calls.push({ url, body });
      return new Response(JSON.stringify({ id: 1, name: "test" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      const repos = await createGitHubRepos("fake-token", "testuser", "my-app");
      expect(repos.publicRepo).toBe("my-app-public");
      expect(repos.privateRepo).toBe("my-app-brain");
      expect(calls.length).toBe(2);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("validateToken", () => {
  it("returns username on valid token", async () => {
    const { validateToken } = await import("../src/scaffold.js");

    const originalFetch = global.fetch;
    global.fetch = async (): Promise<Response> => {
      return new Response(JSON.stringify({ login: "alice" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      const result = await validateToken("validtoken");
      expect(result).toBe("alice");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("returns undefined on invalid token", async () => {
    const { validateToken } = await import("../src/scaffold.js");

    const originalFetch = global.fetch;
    global.fetch = async (): Promise<Response> => {
      return new Response(JSON.stringify({ message: "Bad credentials" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      const result = await validateToken("badtoken");
      expect(result).toBeUndefined();
    } finally {
      global.fetch = originalFetch;
    }
  });
});
