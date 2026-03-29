/**
 * Tests for cocapn run command
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRunCommand } from "../src/commands/run.js";

describe("run command", () => {
  describe("command creation", () => {
    it("should create a run command with correct name", () => {
      const cmd = createRunCommand();
      expect(cmd.name()).toBe("run");
    });

    it("should have --task as a required option", () => {
      const cmd = createRunCommand();
      const taskOption = cmd.options.find((o) => o.long === "--task");
      expect(taskOption).toBeDefined();
      expect(taskOption?.required).toBe(true);
    });

    it("should have --model with default deepseek-chat", () => {
      const cmd = createRunCommand();
      const modelOption = cmd.options.find((o) => o.long === "--model");
      expect(modelOption).toBeDefined();
      expect(modelOption?.defaultValue).toBe("deepseek-chat");
    });

    it("should have --max-tokens with default 4096", () => {
      const cmd = createRunCommand();
      const maxTokensOption = cmd.options.find((o) => o.long === "--max-tokens");
      expect(maxTokensOption).toBeDefined();
      expect(maxTokensOption?.defaultValue).toBe("4096");
    });

    it("should have --api-base with default deepseek URL", () => {
      const cmd = createRunCommand();
      const apiBaseOption = cmd.options.find((o) => o.long === "--api-base");
      expect(apiBaseOption).toBeDefined();
      expect(apiBaseOption?.defaultValue).toBe("https://api.deepseek.com");
    });

    it("should have --api-key option", () => {
      const cmd = createRunCommand();
      const apiKeyOption = cmd.options.find((o) => o.long === "--api-key");
      expect(apiKeyOption).toBeDefined();
    });

    it("should have --context with default diff", () => {
      const cmd = createRunCommand();
      const contextOption = cmd.options.find((o) => o.long === "--context");
      expect(contextOption).toBeDefined();
      expect(contextOption?.defaultValue).toBe("diff");
    });
  });

  describe("help output", () => {
    it("should show --task in help", async () => {
      const cmd = createRunCommand();
      const helpOutput = cmd.helpInformation();
      expect(helpOutput).toContain("--task <task>");
    });

    it("should show all options in help", async () => {
      const cmd = createRunCommand();
      const helpOutput = cmd.helpInformation();
      expect(helpOutput).toContain("--model");
      expect(helpOutput).toContain("--max-tokens");
      expect(helpOutput).toContain("--api-base");
      expect(helpOutput).toContain("--api-key");
      expect(helpOutput).toContain("--context");
      expect(helpOutput).toContain("--working-directory");
    });
  });
});

describe("run command execution", () => {
  const originalFetch = global.fetch;
  const originalExit = process.exit;

  beforeEach(() => {
    process.exit = vi.fn() as unknown as typeof process.exit;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.exit = originalExit;
  });

  it("should exit with error when no API key", async () => {
    const cmd = createRunCommand();
    delete process.env.COCAPN_API_KEY;

    await cmd.parseAsync([
      "node", "cocapn",
      "--task", "review code",
      "--working-directory", "/tmp",
    ]);

    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("should call LLM and output result on success", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Code looks good!" } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
    });

    // Capture stdout
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    process.env.COCAPN_API_KEY = "test-key";

    const cmd = createRunCommand();
    await cmd.parseAsync([
      "node", "cocapn",
      "--task", "review code",
      "--working-directory", "/tmp",
      "--model", "deepseek-chat",
    ]);

    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Verify the API call was made with correct parameters
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer test-key");

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("deepseek-chat");
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].content).toContain("review code");
    expect(body.max_tokens).toBe(4096);

    expect(process.exit).toHaveBeenCalledWith(0);

    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    delete process.env.COCAPN_API_KEY;
  });

  it("should use custom api-base when provided", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Custom response" } }],
        usage: { prompt_tokens: 50, completion_tokens: 25, total_tokens: 75 },
      }),
    });

    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const cmd = createRunCommand();
    await cmd.parseAsync([
      "node", "cocapn",
      "--task", "review",
      "--api-base", "https://custom.api.com",
      "--api-key", "sk-custom",
      "--working-directory", "/tmp",
    ]);

    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://custom.api.com/v1/chat/completions");

    vi.restoreAllMocks();
  });

  it("should exit with error on API failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const cmd = createRunCommand();
    await cmd.parseAsync([
      "node", "cocapn",
      "--task", "review",
      "--api-key", "bad-key",
      "--working-directory", "/tmp",
    ]);

    expect(process.exit).toHaveBeenCalledWith(1);

    vi.restoreAllMocks();
  });
});
