/**
 * Tests for cocapn setup wizard
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createDirectoryStructure,
  createSoulMd,
  createConfigYml,
  createMemoryStores,
  createWiki,
  storeSecret,
  ensureGitignore,
  getEnvVarName,
  getDefaultModel,
  testLlmConnection,
  TEMPLATES,
  TEMPLATE_NAMES,
  runSetup,
} from "../src/commands/setup.js";
import type { SetupOptions, SetupAnswers } from "../src/commands/setup.js";
import { existsSync, readFileSync, unlinkSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

// Temp dir for test fixtures
const TEST_DIR = join(process.cwd(), ".test-setup-wizard");

beforeEach(() => {
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

// --- Helper: non-interactive runSetup ---

async function runSetupNonInteractive(overrides: Partial<SetupOptions> = {}): Promise<void> {
  const options: SetupOptions = {
    nonInteractive: true,
    template: "bare",
    dir: TEST_DIR,
    force: true,
    ...overrides,
  };
  await runSetup(options);
}

// --- createDirectoryStructure ---

describe("createDirectoryStructure", () => {
  it("creates all required directories", () => {
    const cocapnDir = join(TEST_DIR, "cocapn");
    createDirectoryStructure(cocapnDir);

    const expectedDirs = ["memory", "wiki", "tasks", "skills", "modules"];
    for (const dir of expectedDirs) {
      expect(existsSync(join(cocapnDir, dir))).toBe(true);
    }
  });

  it("does not throw if directory already exists", () => {
    const cocapnDir = join(TEST_DIR, "cocapn");
    mkdirSync(cocapnDir, { recursive: true });
    expect(() => createDirectoryStructure(cocapnDir)).not.toThrow();
  });
});

// --- createSoulMd ---

describe("createSoulMd", () => {
  it("creates soul.md with project name and user name", () => {
    const cocapnDir = join(TEST_DIR, "cocapn");
    mkdirSync(cocapnDir, { recursive: true });

    const answers: SetupAnswers = {
      projectName: "test-agent",
      userName: "Alice",
      domain: "alice.example.com",
      llmProvider: "deepseek",
      apiKey: "",
    };

    createSoulMd(cocapnDir, answers, TEMPLATES.bare);

    const content = readFileSync(join(cocapnDir, "soul.md"), "utf8");
    expect(content).toContain("test-agent");
    expect(content).toContain("Alice");
    expect(content).toContain("deepseek");
    expect(content).toContain("## Identity");
    expect(content).toContain("## Personality");
  });

  it("includes template-specific soul content", () => {
    const cocapnDir = join(TEST_DIR, "cocapn");
    mkdirSync(cocapnDir, { recursive: true });

    const answers: SetupAnswers = {
      projectName: "dm-game",
      userName: "Bob",
      domain: "",
      llmProvider: "anthropic",
      apiKey: "",
    };

    createSoulMd(cocapnDir, answers, TEMPLATES.dmlog);

    const content = readFileSync(join(cocapnDir, "soul.md"), "utf8");
    expect(content).toContain("Dungeon Master");
    expect(content).toContain("campaign");
    expect(content).toContain("NPC");
  });

  it("handles empty user name gracefully", () => {
    const cocapnDir = join(TEST_DIR, "cocapn");
    mkdirSync(cocapnDir, { recursive: true });

    const answers: SetupAnswers = {
      projectName: "agent",
      userName: "",
      domain: "",
      llmProvider: "deepseek",
      apiKey: "",
    };

    createSoulMd(cocapnDir, answers, TEMPLATES.bare);

    const content = readFileSync(join(cocapnDir, "soul.md"), "utf8");
    expect(content).toContain("the user");
  });
});

// --- createConfigYml ---

describe("createConfigYml", () => {
  it("creates config.yml with LLM provider settings", () => {
    const cocapnDir = join(TEST_DIR, "cocapn");
    mkdirSync(cocapnDir, { recursive: true });

    const answers: SetupAnswers = {
      projectName: "test-agent",
      userName: "Alice",
      domain: "alice.example.com",
      llmProvider: "openai",
      apiKey: "",
    };

    createConfigYml(cocapnDir, answers, TEMPLATES.bare);

    const content = readFileSync(join(cocapnDir, "config.yml"), "utf8");
    expect(content).toContain("name: test-agent");
    expect(content).toContain("provider: openai");
    expect(content).toContain("model: gpt-4");
    expect(content).toContain("domain: alice.example.com");
    expect(content).toContain("port: 3100");
  });

  it("omits domain when not provided", () => {
    const cocapnDir = join(TEST_DIR, "cocapn");
    mkdirSync(cocapnDir, { recursive: true });

    const answers: SetupAnswers = {
      projectName: "agent",
      userName: "User",
      domain: "",
      llmProvider: "deepseek",
      apiKey: "",
    };

    createConfigYml(cocapnDir, answers, TEMPLATES.bare);

    const content = readFileSync(join(cocapnDir, "config.yml"), "utf8");
    expect(content).not.toContain("domain:");
  });

  it("includes template-specific config", () => {
    const cocapnDir = join(TEST_DIR, "cocapn");
    mkdirSync(cocapnDir, { recursive: true });

    const answers: SetupAnswers = {
      projectName: "study",
      userName: "Student",
      domain: "",
      llmProvider: "deepseek",
      apiKey: "",
    };

    createConfigYml(cocapnDir, answers, TEMPLATES.studylog);

    const content = readFileSync(join(cocapnDir, "config.yml"), "utf8");
    expect(content).toContain("note-taker");
    expect(content).toContain("flashcard-generator");
  });
});

// --- createMemoryStores ---

describe("createMemoryStores", () => {
  it("creates empty JSON files for all memory stores", () => {
    const cocapnDir = join(TEST_DIR, "cocapn");
    mkdirSync(join(cocapnDir, "memory"), { recursive: true });

    createMemoryStores(cocapnDir);

    const stores = ["facts.json", "memories.json", "procedures.json"];
    for (const store of stores) {
      const path = join(cocapnDir, "memory", store);
      expect(existsSync(path)).toBe(true);
      const content = readFileSync(path, "utf8");
      expect(JSON.parse(content)).toEqual({});
    }
  });
});

// --- createWiki ---

describe("createWiki", () => {
  it("creates wiki/README.md with project name", () => {
    const cocapnDir = join(TEST_DIR, "cocapn");
    mkdirSync(join(cocapnDir, "wiki"), { recursive: true });

    const answers: SetupAnswers = {
      projectName: "my-agent",
      userName: "Alice",
      domain: "",
      llmProvider: "deepseek",
      apiKey: "",
    };

    createWiki(cocapnDir, answers);

    const content = readFileSync(join(cocapnDir, "wiki", "README.md"), "utf8");
    expect(content).toContain("my-agent");
    expect(content).toContain("knowledge base");
  });
});

// --- storeSecret ---

describe("storeSecret", () => {
  it("creates .env.local with API key", () => {
    const envFile = join(TEST_DIR, ".env.local");
    storeSecret(envFile, "deepseek", "sk-test-key-123");

    const content = readFileSync(envFile, "utf8");
    expect(content).toContain("DEEPSEEK_API_KEY=sk-test-key-123");
  });

  it("appends to existing .env.local", () => {
    const envFile = join(TEST_DIR, ".env.local");
    writeFileSync(envFile, "EXISTING_VAR=hello\n", "utf8");
    storeSecret(envFile, "openai", "sk-openai-key");

    const content = readFileSync(envFile, "utf8");
    expect(content).toContain("EXISTING_VAR=hello");
    expect(content).toContain("OPENAI_API_KEY=sk-openai-key");
  });

  it("replaces existing key if same provider", () => {
    const envFile = join(TEST_DIR, ".env.local");
    storeSecret(envFile, "deepseek", "sk-old-key");
    storeSecret(envFile, "deepseek", "sk-new-key");

    const content = readFileSync(envFile, "utf8");
    expect(content).toContain("sk-new-key");
    expect(content).not.toContain("sk-old-key");
  });
});

// --- ensureGitignore ---

describe("ensureGitignore", () => {
  it("creates .gitignore with .env.local and secrets/", () => {
    ensureGitignore(TEST_DIR);

    const content = readFileSync(join(TEST_DIR, ".gitignore"), "utf8");
    expect(content).toContain(".env.local");
    expect(content).toContain("secrets/");
  });

  it("appends to existing .gitignore without duplicating", () => {
    const gitignorePath = join(TEST_DIR, ".gitignore");
    writeFileSync(gitignorePath, "node_modules/\n", "utf8");
    ensureGitignore(TEST_DIR);

    const content = readFileSync(gitignorePath, "utf8");
    expect(content).toContain("node_modules/");
    expect(content).toContain(".env.local");

    // Only one .env.local entry
    const matches = content.match(/\.env\.local/g);
    expect(matches?.length).toBe(1);
  });
});

// --- getEnvVarName ---

describe("getEnvVarName", () => {
  it("returns correct env var names for each provider", () => {
    expect(getEnvVarName("deepseek")).toBe("DEEPSEEK_API_KEY");
    expect(getEnvVarName("openai")).toBe("OPENAI_API_KEY");
    expect(getEnvVarName("anthropic")).toBe("ANTHROPIC_API_KEY");
    expect(getEnvVarName("ollama")).toBe("");
  });

  it("returns generic key for unknown provider", () => {
    expect(getEnvVarName("unknown-provider")).toBe("LLM_API_KEY");
  });
});

// --- getDefaultModel ---

describe("getDefaultModel", () => {
  it("returns correct default model for each provider", () => {
    expect(getDefaultModel("deepseek")).toBe("deepseek-chat");
    expect(getDefaultModel("openai")).toBe("gpt-4");
    expect(getDefaultModel("anthropic")).toBe("claude-3-sonnet-20240229");
    expect(getDefaultModel("ollama")).toBe("llama2");
  });

  it("returns deepseek-chat for unknown provider", () => {
    expect(getDefaultModel("unknown")).toBe("deepseek-chat");
  });
});

// --- testLlmConnection ---

describe("testLlmConnection", () => {
  it("returns false for invalid API key", async () => {
    const result = await testLlmConnection("deepseek", "sk-invalid-key");
    expect(result).toBe(false);
  });

  it("returns false for unknown provider", async () => {
    const result = await testLlmConnection("unknown-provider", "some-key");
    expect(result).toBe(false);
  });
});

// --- TEMPLATES ---

describe("TEMPLATES", () => {
  it("has all required templates", () => {
    const expected = ["bare", "makerlog", "studylog", "dmlog", "web-app"];
    for (const name of expected) {
      expect(TEMPLATES).toHaveProperty(name);
      expect(TEMPLATES[name].name).toBe(name);
      expect(TEMPLATES[name].description).toBeTruthy();
    }
  });

  it("TEMPLATE_NAMES matches TEMPLATES keys", () => {
    expect(TEMPLATE_NAMES.sort()).toEqual(Object.keys(TEMPLATES).sort());
  });
});

// --- Non-interactive setup integration ---

describe("runSetup (non-interactive)", () => {
  it("creates complete directory structure", async () => {
    await runSetupNonInteractive({
      projectName: "integration-test",
      userName: "TestUser",
      llmProvider: "deepseek",
    });

    // Check directory structure
    const expectedDirs = [
      "cocapn",
      "cocapn/memory",
      "cocapn/wiki",
      "cocapn/tasks",
      "cocapn/skills",
      "cocapn/modules",
    ];
    for (const dir of expectedDirs) {
      expect(existsSync(join(TEST_DIR, dir))).toBe(true);
    }

    // Check files
    expect(existsSync(join(TEST_DIR, "cocapn/soul.md"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "cocapn/config.yml"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "cocapn/memory/facts.json"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "cocapn/memory/memories.json"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "cocapn/memory/procedures.json"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "cocapn/wiki/README.md"))).toBe(true);
    expect(existsSync(join(TEST_DIR, ".gitignore"))).toBe(true);
  });

  it("uses default values when no overrides given", async () => {
    await runSetupNonInteractive();

    const soulContent = readFileSync(join(TEST_DIR, "cocapn/soul.md"), "utf8");
    expect(soulContent).toContain("my-agent");

    const configContent = readFileSync(join(TEST_DIR, "cocapn/config.yml"), "utf8");
    expect(configContent).toContain("provider: deepseek");
  });

  it("applies template-specific content", async () => {
    await runSetupNonInteractive({
      template: "makerlog",
      projectName: "maker-agent",
      userName: "Maker",
    });

    const soulContent = readFileSync(join(TEST_DIR, "cocapn/soul.md"), "utf8");
    expect(soulContent).toContain("maker companion");

    const configContent = readFileSync(join(TEST_DIR, "cocapn/config.yml"), "utf8");
    expect(configContent).toContain("shipping-log");
  });

  it("exits with error if cocapn/ exists without --force", async () => {
    mkdirSync(join(TEST_DIR, "cocapn"), { recursive: true });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });

    try {
      await runSetup({
        nonInteractive: true,
        template: "bare",
        dir: TEST_DIR,
        force: false,
      });
      expect(true).toBe(false); // Should not reach here
    } catch (err) {
      expect((err as Error).message).toBe("exit");
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it("overwrites with --force flag", async () => {
    mkdirSync(join(TEST_DIR, "cocapn"), { recursive: true });
    writeFileSync(join(TEST_DIR, "cocapn/soul.md"), "old content", "utf8");

    await runSetupNonInteractive({
      force: true,
      projectName: "force-test",
      userName: "Tester",
    });

    const soulContent = readFileSync(join(TEST_DIR, "cocapn/soul.md"), "utf8");
    expect(soulContent).toContain("force-test");
    expect(soulContent).not.toContain("old content");
  });

  it("stores API key in .env.local when provided in non-interactive", async () => {
    // For non-interactive, we need to test storeSecret directly since
    // runSetup non-interactive doesn't collect API keys
    const envFile = join(TEST_DIR, ".env.local");
    storeSecret(envFile, "anthropic", "sk-ant-test-key");

    const content = readFileSync(envFile, "utf8");
    expect(content).toContain("ANTHROPIC_API_KEY=sk-ant-test-key");
  });
});

// --- Commander integration ---

describe("setup command registration", () => {
  it("setup command can be created without error", async () => {
    const { createSetupCommand } = await import("../src/commands/setup.js");
    const cmd = createSetupCommand();
    expect(cmd.name()).toBe("setup");
    expect(cmd.description()).toContain("onboarding");
  });

  it("init command delegates to setup", async () => {
    const { createCLI } = await import("../src/index.js");
    const cli = createCLI();
    const setupCmd = cli.commands.find(c => c.name() === "setup");
    expect(setupCmd).toBeDefined();

    const initCmd = cli.commands.find(c => c.name() === "init");
    expect(initCmd).toBeDefined();
    expect(initCmd?.description()).toContain("alias for setup");
  });
});
