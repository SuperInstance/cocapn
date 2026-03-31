/**
 * Tests for github-setup.ts — GitHub CI/CD automation.
 */

import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { existsSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tmpDir(suffix: string): string {
  return join(tmpdir(), `cocapn-gh-test-${suffix}-${Date.now()}`);
}

// ─── Workflow generators ──────────────────────────────────────────────────────

describe("generateAgentWorkflow", () => {
  it("produces valid YAML with all triggers", async () => {
    const { generateAgentWorkflow } = await import("../src/github-setup.js");
    const yaml = generateAgentWorkflow();

    expect(yaml.includes("name: Cocapn Agent")).toBe(true);
    expect(yaml.includes("push:")).toBe(true);
    expect(yaml.includes("schedule:")).toBe(true);
    expect(yaml.includes("workflow_dispatch:")).toBe(true);
    expect(yaml.includes("*/30 * * * *")).toBe(true);
    expect(yaml.includes("actions/checkout@v4")).toBe(true);
    expect(yaml.includes("fetch-depth: 0")).toBe(true);
    expect(yaml.includes("cocapn start --ci")).toBe(true);
    expect(yaml.includes("COCAPN_CI: true")).toBe(true);
  });

  it("includes all workflow_dispatch options", async () => {
    const { generateAgentWorkflow } = await import("../src/github-setup.js");
    const yaml = generateAgentWorkflow();

    expect(yaml.includes("status")).toBe(true);
    expect(yaml.includes("sync")).toBe(true);
    expect(yaml.includes("health-check")).toBe(true);
    expect(yaml.includes("reindex")).toBe(true);
  });

  it("includes secret loading step", async () => {
    const { generateAgentWorkflow } = await import("../src/github-setup.js");
    const yaml = generateAgentWorkflow();

    expect(yaml.includes("DEEPSEEK_API_KEY")).toBe(true);
    expect(yaml.includes("OPENAI_API_KEY")).toBe(true);
  });

  it("includes auto-sync on push", async () => {
    const { generateAgentWorkflow } = await import("../src/github-setup.js");
    const yaml = generateAgentWorkflow();

    expect(yaml.includes("Auto-sync")).toBe(true);
    expect(yaml.includes("github.event_name == 'push'")).toBe(true);
    expect(yaml.includes("cocapn sync")).toBe(true);
  });

  it("uses node-version 22", async () => {
    const { generateAgentWorkflow } = await import("../src/github-setup.js");
    const yaml = generateAgentWorkflow();

    expect(yaml.includes("node-version: 22")).toBe(true);
  });
});

describe("generateDeployWorkflow", () => {
  it("produces valid deploy YAML", async () => {
    const { generateDeployWorkflow } = await import("../src/github-setup.js");
    const yaml = generateDeployWorkflow();

    expect(yaml.includes("name: Deploy to Cloudflare")).toBe(true);
    expect(yaml.includes("push:")).toBe(true);
    expect(yaml.includes("public/**")).toBe(true);
    expect(yaml.includes("wrangler.toml")).toBe(true);
    expect(yaml.includes("wrangler-action@v3")).toBe(true);
    expect(yaml.includes("CLOUDFLARE_API_TOKEN")).toBe(true);
    expect(yaml.includes("CLOUDFLARE_ACCOUNT_ID")).toBe(true);
  });
});

describe("generatePublicSyncWorkflow", () => {
  it("includes the public repo name", async () => {
    const { generatePublicSyncWorkflow } = await import("../src/github-setup.js");
    const yaml = generatePublicSyncWorkflow("my-agent");

    expect(yaml.includes("name: Sync Public Face")).toBe(true);
    expect(yaml.includes("my-agent")).toBe(true);
    expect(yaml.includes("workflow_run:")).toBe(true);
    expect(yaml.includes("Cocapn Agent")).toBe(true);
  });

  it("checks for success conclusion", async () => {
    const { generatePublicSyncWorkflow } = await import("../src/github-setup.js");
    const yaml = generatePublicSyncWorkflow("test-repo");

    expect(yaml.includes("conclusion == 'success'")).toBe(true);
  });

  it("uses PUBLIC_REPO_TOKEN", async () => {
    const { generatePublicSyncWorkflow } = await import("../src/github-setup.js");
    const yaml = generatePublicSyncWorkflow("test-repo");

    expect(yaml.includes("PUBLIC_REPO_TOKEN")).toBe(true);
  });

  it("includes cocapn publish command", async () => {
    const { generatePublicSyncWorkflow } = await import("../src/github-setup.js");
    const yaml = generatePublicSyncWorkflow("test-repo");

    expect(yaml.includes("cocapn publish")).toBe(true);
  });
});

// ─── writeWorkflows ───────────────────────────────────────────────────────────

describe("writeWorkflows", () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir("workflows");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes workflow files to target directory", async () => {
    const { writeWorkflows } = await import("../src/github-setup.js");
    const written = writeWorkflows(dir, [
      { filename: "test.yml", content: "name: Test\n" },
    ]);

    expect(written).toEqual(["test.yml"]);
    expect(existsSync(join(dir, ".github", "workflows", "test.yml"))).toBe(true);
  });

  it("creates .github/workflows/ directory structure", async () => {
    const { writeWorkflows } = await import("../src/github-setup.js");
    writeWorkflows(dir, [
      { filename: "a.yml", content: "a" },
      { filename: "b.yml", content: "b" },
    ]);

    expect(existsSync(join(dir, ".github"))).toBe(true);
    expect(existsSync(join(dir, ".github", "workflows"))).toBe(true);
    expect(existsSync(join(dir, ".github", "workflows", "a.yml"))).toBe(true);
    expect(existsSync(join(dir, ".github", "workflows", "b.yml"))).toBe(true);
  });

  it("returns list of written filenames", async () => {
    const { writeWorkflows } = await import("../src/github-setup.js");
    const written = writeWorkflows(dir, [
      { filename: "cocapn.yml", content: "name: Agent\n" },
      { filename: "deploy.yml", content: "name: Deploy\n" },
    ]);

    expect(written).toEqual(["cocapn.yml", "deploy.yml"]);
  });

  it("file contents match what was provided", async () => {
    const { writeWorkflows } = await import("../src/github-setup.js");
    const content = "name: My Workflow\non: push\n";
    writeWorkflows(dir, [{ filename: "check.yml", content }]);

    const written = readFileSync(join(dir, ".github", "workflows", "check.yml"), "utf8");
    expect(written).toBe(content);
  });
});

// ─── Repo creation (mocked gh CLI) ───────────────────────────────────────────

const mockCalls: string[] = [];
let mockCallCount = 0;
let mockShouldThrow = false;
let mockReturnValues: string[] = [];

vi.mock("child_process", () => ({
  execSync: (cmd: string) => {
    mockCalls.push(cmd);
    if (mockShouldThrow) throw new Error("Not Found");
    if (mockReturnValues.length > 0) return mockReturnValues.shift() ?? "";
    return "";
  },
}));

function resetMocks() {
  mockCalls.length = 0;
  mockCallCount = 0;
  mockShouldThrow = false;
  mockReturnValues = [];
}

describe("createRepos", () => {
  beforeEach(resetMocks);

  it("calls gh to create private and public repos", async () => {
    const { createRepos } = await import("../src/github-setup.js");
    const result = createRepos("alice", "my-agent");
    expect(result.owner).toBe("alice");
    expect(result.privateRepo).toBe("my-agent-brain");
    expect(result.publicRepo).toBe("my-agent");

    const privateCall = mockCalls.find((c) => c.includes("my-agent-brain") && c.includes("--private"));
    const publicCall = mockCalls.find((c) => c.includes("alice/my-agent") && c.includes("--public"));
    expect(privateCall).toBeDefined();
    expect(publicCall).toBeDefined();
  });
});

// ─── Secret configuration (mocked gh CLI) ─────────────────────────────────────

describe("configureSecrets", () => {
  beforeEach(resetMocks);

  it("sets secrets via gh secret set", async () => {
    const { configureSecrets } = await import("../src/github-setup.js");
    const result = configureSecrets("alice/my-agent-brain", [
      { name: "DEEPSEEK_API_KEY", value: "sk-test-123" },
      { name: "OPENAI_API_KEY", value: "sk-openai-456" },
    ]);

    expect(result).toEqual(["DEEPSEEK_API_KEY", "OPENAI_API_KEY"]);
    expect(mockCalls.length).toBe(2);
    expect(mockCalls[0]!.includes("DEEPSEEK_API_KEY")).toBe(true);
    expect(mockCalls[1]!.includes("OPENAI_API_KEY")).toBe(true);
  });

  it("skips secrets with empty values", async () => {
    const { configureSecrets } = await import("../src/github-setup.js");
    const result = configureSecrets("alice/repo", [
      { name: "KEY1", value: "val1" },
      { name: "KEY2", value: "" },
      { name: "KEY3", value: "val3" },
    ]);

    expect(result).toEqual(["KEY1", "KEY3"]);
    expect(mockCalls.length).toBe(2);
  });
});

// ─── verifySetup (mocked) ─────────────────────────────────────────────────────

describe("verifySetup", () => {
  beforeEach(resetMocks);

  it("returns true when all checks pass", async () => {
    const { verifySetup } = await import("../src/github-setup.js");
    mockReturnValues = ["cocapn.yml\ndeploy.yml\n", "DEEPSEEK_API_KEY   Updated 2024-01-01\n"];

    const result = await verifySetup("alice/my-agent-brain", ["DEEPSEEK_API_KEY"]);
    expect(result).toBe(true);
  });

  it("returns false when workflows are missing", async () => {
    const { verifySetup } = await import("../src/github-setup.js");
    mockShouldThrow = true;

    const result = await verifySetup("alice/missing-repo", ["KEY"]);
    expect(result).toBe(false);
  });

  it("returns false when expected secrets are missing", async () => {
    const { verifySetup } = await import("../src/github-setup.js");
    mockReturnValues = ["cocapn.yml\n", "OTHER_KEY   Updated 2024-01-01\n"];

    const result = await verifySetup("alice/repo", ["MISSING_KEY"]);
    expect(result).toBe(false);
  });
});

// ─── Types ────────────────────────────────────────────────────────────────────

describe("Types", () => {
  it("RepoInfo has correct shape", async () => {
    const mod = await import("../src/github-setup.js");
    const info: mod.RepoInfo = {
      owner: "alice",
      privateRepo: "my-agent-brain",
      publicRepo: "my-agent",
    };
    expect(info.owner).toBe("alice");
    expect(info.privateRepo).toBe("my-agent-brain");
    expect(info.publicRepo).toBe("my-agent");
  });

  it("SetupResult has correct shape", async () => {
    const mod = await import("../src/github-setup.js");
    const result: mod.SetupResult = {
      repos: { owner: "alice", privateRepo: "brain", publicRepo: "face" },
      secrets: ["KEY1"],
      workflows: ["cocapn.yml"],
      verified: true,
    };
    expect(result.repos.owner).toBe("alice");
    expect(result.secrets).toEqual(["KEY1"]);
    expect(result.workflows).toEqual(["cocapn.yml"]);
    expect(result.verified).toBe(true);
  });
});
