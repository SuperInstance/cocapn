/**
 * Tests for scaffold.ts — uses node:test, no external test runner needed.
 *
 * Run with:
 *   node --test --experimental-strip-types tests/scaffold.test.ts
 *
 * (Node 20+ supports --experimental-strip-types; for tsc-compiled output use:
 *   node --test dist-tests/scaffold.test.js)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tmpDir(suffix: string): string {
  const dir = join(tmpdir(), `create-cocapn-test-${suffix}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── scaffoldPrivateRepo ──────────────────────────────────────────────────────

describe("scaffoldPrivateRepo", () => {
  let dir: string;

  before(() => {
    dir = tmpDir("private-repo");
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates expected directory structure", async () => {
    // Import after tmp dir is ready
    const { scaffoldPrivateRepo } = await import("../src/scaffold.js");
    scaffoldPrivateRepo(dir, "alice", "makerlog");

    // Directories
    assert.ok(existsSync(join(dir, "cocapn")), "cocapn/ exists");
    assert.ok(existsSync(join(dir, "cocapn", "memory")), "memory/ exists");
    assert.ok(existsSync(join(dir, "cocapn", "tasks")), "tasks/ exists");
    assert.ok(existsSync(join(dir, "cocapn", "wiki")), "wiki/ exists");

    // Files
    assert.ok(existsSync(join(dir, "cocapn", "soul.md")), "soul.md exists");
    assert.ok(existsSync(join(dir, "cocapn", "config.yml")), "config.yml exists");
    assert.ok(existsSync(join(dir, "cocapn", "memory", "facts.json")), "facts.json exists");
    assert.ok(existsSync(join(dir, "cocapn", "wiki", "README.md")), "wiki README exists");
    assert.ok(existsSync(join(dir, "cocapn", "tasks", ".gitkeep")), ".gitkeep exists");
  });

  it("replaces {{username}} placeholder in soul.md", async () => {
    const { scaffoldPrivateRepo } = await import("../src/scaffold.js");
    const d = tmpDir("placeholder");
    try {
      scaffoldPrivateRepo(d, "bob", "studylog");
      const soul = readFileSync(join(d, "cocapn", "soul.md"), "utf8");
      assert.ok(soul.includes("bob"), "username replaced in soul.md");
      assert.ok(!soul.includes("{{username}}"), "no unreplaced placeholders");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("replaces {{domain}} placeholder in config.yml", async () => {
    const { scaffoldPrivateRepo } = await import("../src/scaffold.js");
    const d = tmpDir("domain");
    try {
      scaffoldPrivateRepo(d, "carol", "activelog");
      const config = readFileSync(join(d, "cocapn", "config.yml"), "utf8");
      assert.ok(config.includes("activelog"), "domain replaced in config.yml");
      assert.ok(!config.includes("{{domain}}"), "no unreplaced placeholders");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("writes facts.json as empty object", async () => {
    const { scaffoldPrivateRepo } = await import("../src/scaffold.js");
    const d = tmpDir("facts");
    try {
      scaffoldPrivateRepo(d, "dave", "lifelog");
      const facts = readFileSync(join(d, "cocapn", "memory", "facts.json"), "utf8");
      const parsed: unknown = JSON.parse(facts);
      assert.deepEqual(parsed, {});
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});

// ─── generateAgeKey ───────────────────────────────────────────────────────────

describe("generateAgeKey", () => {
  it("returns undefined when age-keygen is not available", async () => {
    const { generateAgeKey } = await import("../src/scaffold.js");
    const d = tmpDir("age-missing");
    try {
      // This will succeed on systems with age-keygen, or return undefined otherwise.
      // We test that it never throws.
      const result = generateAgeKey(d);
      // result is either AgeKeyResult | undefined — both acceptable
      if (result !== undefined) {
        assert.ok(typeof result.publicKey === "string", "publicKey is string");
        assert.ok(result.publicKey.startsWith("age1"), "publicKey has age1 prefix");
        assert.ok(existsSync(result.privateKeyPath), "private key file created");
      }
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});

// ─── createGitHubRepos (mocked) ───────────────────────────────────────────────

describe("createGitHubRepos", () => {
  it("derives correct public and private repo names", async () => {
    const { createGitHubRepos } = await import("../src/scaffold.js");

    // Mock global fetch to avoid real network calls
    const calls: Array<{ url: string; body: unknown }> = [];
    const originalFetch = global.fetch;
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = input.toString();
      const body = init?.body ? (JSON.parse(init.body as string) as unknown) : undefined;
      calls.push({ url, body });
      // Return a successful 201 for all POST calls
      return new Response(JSON.stringify({ id: 1, name: "test" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      const repos = await createGitHubRepos("fake-token", "testuser", "my-makerlog");

      assert.equal(repos.publicRepo, "my-makerlog-public");
      assert.equal(repos.privateRepo, "my-makerlog-brain");

      // Two POST calls were made
      assert.equal(calls.length, 2, "two repo creation calls");
      assert.ok(
        calls.every((c) => c.url.includes("api.github.com/user/repos")),
        "all calls go to GitHub API"
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("throws on non-422 API errors", async () => {
    const { createGitHubRepo } = await import("../src/scaffold.js");

    const originalFetch = global.fetch;
    global.fetch = async (): Promise<Response> => {
      return new Response(JSON.stringify({ message: "Bad credentials" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      await assert.rejects(
        () => createGitHubRepo("bad-token", "some-repo", false),
        /GitHub API error/
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("silently ignores 422 (repo already exists)", async () => {
    const { createGitHubRepo } = await import("../src/scaffold.js");

    const originalFetch = global.fetch;
    global.fetch = async (): Promise<Response> => {
      return new Response(
        JSON.stringify({ message: "Repository creation failed.: name already exists on this account" }),
        {
          status: 422,
          headers: { "Content-Type": "application/json" },
        }
      );
    };

    try {
      // Should not throw
      await assert.doesNotReject(() => createGitHubRepo("token", "existing-repo", false));
    } finally {
      global.fetch = originalFetch;
    }
  });
});

// ─── validateToken (mocked) ───────────────────────────────────────────────────

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
      const result = await validateToken("valid-token");
      assert.equal(result, "alice");
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
      const result = await validateToken("bad-token");
      assert.equal(result, undefined);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("returns undefined on network error", async () => {
    const { validateToken } = await import("../src/scaffold.js");

    const originalFetch = global.fetch;
    global.fetch = async (): Promise<Response> => {
      throw new Error("ECONNREFUSED");
    };

    try {
      const result = await validateToken("any-token");
      assert.equal(result, undefined);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
