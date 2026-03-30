/**
 * Tests for cocapn config command.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  parseYaml,
  serializeYaml,
  readConfig,
  writeConfig,
  backupConfig,
  getNestedValue,
  setNestedValue,
  maskSecrets,
  validateConfig,
  resolveConfigPath,
  DEFAULT_CONFIG,
} from "../src/commands/config.js";
import type { ValidationIssue } from "../src/commands/config.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "cocapn-config-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ─── YAML Parser ────────────────────────────────────────────────────────────

describe("parseYaml", () => {
  it("parses simple key-value pairs", () => {
    const yaml = "key: value\nfoo: bar";
    const result = parseYaml(yaml) as Record<string, string>;
    expect(result.key).toBe("value");
    expect(result.foo).toBe("bar");
  });

  it("parses nested objects", () => {
    const yaml = "config:\n  mode: local\n  port: 8787";
    const result = parseYaml(yaml) as Record<string, Record<string, unknown>>;
    expect(result.config.mode).toBe("local");
    expect(result.config.port).toBe(8787);
  });

  it("parses boolean values", () => {
    const yaml = "autoCommit: true\nautoPush: false";
    const result = parseYaml(yaml) as Record<string, boolean>;
    expect(result.autoCommit).toBe(true);
    expect(result.autoPush).toBe(false);
  });

  it("parses null values", () => {
    const yaml = "publicKey:\n";
    const result = parseYaml(yaml) as Record<string, unknown>;
    expect(result.publicKey).toBeNull();
  });

  it("parses lists", () => {
    const yaml = "paths:\n  - secrets/\n  - *.secret.yml";
    const result = parseYaml(yaml) as Record<string, string[]>;
    expect(result.paths).toEqual(["secrets/", "*.secret.yml"]);
  });

  it("parses numbers", () => {
    const yaml = "interval: 300\nport: 8787";
    const result = parseYaml(yaml) as Record<string, number>;
    expect(result.interval).toBe(300);
    expect(result.port).toBe(8787);
  });

  it("strips inline comments", () => {
    const yaml = "port: 8787  # default port";
    const result = parseYaml(yaml) as Record<string, number>;
    expect(result.port).toBe(8787);
  });

  it("parses quoted strings with colons", () => {
    const yaml = 'url: "https://example.com:443"';
    const result = parseYaml(yaml) as Record<string, string>;
    expect(result.url).toBe("https://example.com:443");
  });

  it("handles deeply nested objects", () => {
    const yaml = "llm:\n  providers:\n    deepseek:\n      apiKey: sk-test\n      baseUrl: https://api.deepseek.com";
    const result = parseYaml(yaml) as Record<string, Record<string, Record<string, Record<string, string>>>>;
    expect(result.llm.providers.deepseek.apiKey).toBe("sk-test");
    expect(result.llm.providers.deepseek.baseUrl).toBe("https://api.deepseek.com");
  });

  it("parses empty document", () => {
    expect(parseYaml("")).toBeNull();
    expect(parseYaml("# just a comment")).toBeNull();
  });
});

// ─── YAML Serializer ────────────────────────────────────────────────────────

describe("serializeYaml", () => {
  it("serializes simple key-value pairs", () => {
    const result = serializeYaml({ key: "value", port: 8787 });
    expect(result).toContain("key: value");
    expect(result).toContain("port: 8787");
  });

  it("serializes nested objects", () => {
    const result = serializeYaml({ config: { mode: "local", port: 8787 } });
    expect(result).toContain("config:");
    expect(result).toContain("mode: local");
    expect(result).toContain("port: 8787");
  });

  it("serializes lists", () => {
    const result = serializeYaml({ paths: ["secrets/", "*.yml"] });
    expect(result).toContain("- secrets/");
    expect(result).toContain("- *.yml");
  });

  it("serializes booleans and null", () => {
    const result = serializeYaml({ autoCommit: true, autoPush: false, key: null });
    expect(result).toContain("autoCommit: true");
    expect(result).toContain("autoPush: false");
    expect(result).toContain("key:");
  });

  it("round-trips through parse and serialize", () => {
    const original = {
      soul: "cocapn/soul.md",
      config: { mode: "local", port: 8787 },
      sync: { interval: 300, autoCommit: true },
      encryption: { publicKey: "", encryptedPaths: ["secrets/"] },
    };
    const serialized = serializeYaml(original);
    const parsed = parseYaml(serialized);
    expect(parsed).toEqual(original);
  });
});

// ─── Config I/O ─────────────────────────────────────────────────────────────

describe("readConfig / writeConfig", () => {
  it("reads a config file", () => {
    const configPath = join(tmpDir, "config.yml");
    writeFileSync(configPath, "soul: cocapn/soul.md\nconfig:\n  mode: local\n  port: 8787\n", "utf-8");
    const data = readConfig(configPath) as Record<string, unknown>;
    expect(data.soul).toBe("cocapn/soul.md");
  });

  it("writes a config file", () => {
    const configPath = join(tmpDir, "config.yml");
    const data = { soul: "soul.md", config: { port: 9000 } };
    writeConfig(configPath, data);
    const raw = readFileSync(configPath, "utf-8");
    expect(raw).toContain("soul: soul.md");
    expect(raw).toContain("port: 9000");
  });

  it("round-trips config through read/write", () => {
    const configPath = join(tmpDir, "config.yml");
    const original = {
      soul: "cocapn/soul.md",
      config: { mode: "hybrid", port: 3000 },
      sync: { interval: 60, autoCommit: true, autoPush: true },
    };
    writeConfig(configPath, original);
    const readBack = readConfig(configPath);
    expect(readBack).toEqual(original);
  });
});

// ─── Backup ─────────────────────────────────────────────────────────────────

describe("backupConfig", () => {
  it("creates a .bak copy of the config", () => {
    const configPath = join(tmpDir, "config.yml");
    writeFileSync(configPath, "soul: test\n", "utf-8");
    const backupPath = backupConfig(configPath);
    expect(backupPath).toBe(configPath + ".bak");
    expect(existsSync(backupPath)).toBe(true);
    expect(readFileSync(backupPath, "utf-8")).toBe("soul: test\n");
  });
});

// ─── Resolve Config Path ────────────────────────────────────────────────────

describe("resolveConfigPath", () => {
  it("finds config in cocapn/config.yml", () => {
    const cocapnDir = join(tmpDir, "cocapn");
    mkdirSync(cocapnDir, { recursive: true });
    writeFileSync(join(cocapnDir, "config.yml"), "soul: test\n", "utf-8");
    expect(resolveConfigPath(tmpDir)).toBe(join(tmpDir, "cocapn", "config.yml"));
  });

  it("finds config in root config.yml", () => {
    writeFileSync(join(tmpDir, "config.yml"), "soul: test\n", "utf-8");
    expect(resolveConfigPath(tmpDir)).toBe(join(tmpDir, "config.yml"));
  });

  it("prefers cocapn/config.yml over root", () => {
    writeFileSync(join(tmpDir, "config.yml"), "root: true\n", "utf-8");
    const cocapnDir = join(tmpDir, "cocapn");
    mkdirSync(cocapnDir, { recursive: true });
    writeFileSync(join(cocapnDir, "config.yml"), "cocapn: true\n", "utf-8");
    expect(resolveConfigPath(tmpDir)).toBe(join(tmpDir, "cocapn", "config.yml"));
  });

  it("returns null when no config found", () => {
    expect(resolveConfigPath(tmpDir)).toBeNull();
  });
});

// ─── Nested Value Get/Set ───────────────────────────────────────────────────

describe("getNestedValue", () => {
  const data = {
    config: { mode: "local", port: 8787 },
    llm: { defaultModel: "deepseek-chat", providers: { deepseek: { apiKey: "sk-test" } } },
  };

  it("gets a top-level key", () => {
    expect(getNestedValue(data, "config")).toEqual({ mode: "local", port: 8787 });
  });

  it("gets a nested key with dot notation", () => {
    expect(getNestedValue(data, "config.mode")).toBe("local");
    expect(getNestedValue(data, "config.port")).toBe(8787);
  });

  it("gets a deeply nested key", () => {
    expect(getNestedValue(data, "llm.providers.deepseek.apiKey")).toBe("sk-test");
  });

  it("returns undefined for missing keys", () => {
    expect(getNestedValue(data, "nonexistent")).toBeUndefined();
    expect(getNestedValue(data, "config.nonexistent")).toBeUndefined();
    expect(getNestedValue(data, "llm.providers.openai")).toBeUndefined();
  });
});

describe("setNestedValue", () => {
  it("sets a top-level key", () => {
    const result = setNestedValue({}, "soul", "new-soul.md");
    expect(result).toEqual({ soul: "new-soul.md" });
  });

  it("sets a nested key preserving other keys", () => {
    const data = { config: { mode: "local", port: 8787 } };
    const result = setNestedValue(data, "config.port", 9000);
    expect(result).toEqual({ config: { mode: "local", port: 9000 } });
  });

  it("creates intermediate keys", () => {
    const result = setNestedValue({}, "llm.providers.openai.apiKey", "sk-test");
    expect((result as Record<string, any>).llm.providers.openai.apiKey).toBe("sk-test");
  });

  it("overwrites a scalar with an object", () => {
    const data = { config: "simple" };
    const result = setNestedValue(data, "config.mode", "cloud");
    expect(result).toEqual({ config: { mode: "cloud" } });
  });
});

// ─── Secret Masking ─────────────────────────────────────────────────────────

describe("maskSecrets", () => {
  it("masks apiKey values", () => {
    const data = { apiKey: "sk-12345", name: "test" };
    const masked = maskSecrets(data, false) as Record<string, string>;
    expect(masked.apiKey).toBe("********");
    expect(masked.name).toBe("test");
  });

  it("masks nested secrets", () => {
    const data = {
      llm: {
        providers: {
          deepseek: { apiKey: "sk-secret", baseUrl: "https://api.deepseek.com" },
          openai: { apiKey: "", baseUrl: "https://api.openai.com" },
        },
      },
    };
    const masked = maskSecrets(data, false) as Record<string, any>;
    expect(masked.llm.providers.deepseek.apiKey).toBe("********");
    expect(masked.llm.providers.deepseek.baseUrl).toBe("https://api.deepseek.com");
    expect(masked.llm.providers.openai.apiKey).toBe(""); // empty stays empty
  });

  it("masks publicKey", () => {
    const data = { publicKey: "age1test" };
    const masked = maskSecrets(data, false) as Record<string, string>;
    expect(masked.publicKey).toBe("********");
  });

  it("masks token and secret fields", () => {
    const data = { token: "ghp_123", secret: "my-secret", password: "pw123" };
    const masked = maskSecrets(data, false) as Record<string, string>;
    expect(masked.token).toBe("********");
    expect(masked.secret).toBe("********");
    expect(masked.password).toBe("********");
  });

  it("shows all secrets with --all flag", () => {
    const data = { apiKey: "sk-12345" };
    const shown = maskSecrets(data, true) as Record<string, string>;
    expect(shown.apiKey).toBe("sk-12345");
  });

  it("handles null and primitive values", () => {
    expect(maskSecrets(null, false)).toBeNull();
    expect(maskSecrets("string", false)).toBe("string");
    expect(maskSecrets(42, false)).toBe(42);
  });
});

// ─── Validation ─────────────────────────────────────────────────────────────

describe("validateConfig", () => {
  it("returns error for empty config", () => {
    const issues = validateConfig(null);
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("error");
  });

  it("warns about missing required sections", () => {
    const issues = validateConfig({ soul: "test" });
    const warnings = issues.filter((i) => i.level === "warning");
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings.some((w) => w.path === "config")).toBe(true);
  });

  it("valid config has no issues", () => {
    const issues = validateConfig(DEFAULT_CONFIG);
    expect(issues).toHaveLength(0);
  });

  it("detects invalid mode", () => {
    const data = { ...DEFAULT_CONFIG, config: { mode: "invalid", port: 8787 } } as any;
    const issues = validateConfig(data);
    const errors = issues.filter((i) => i.level === "error");
    expect(errors.some((e) => e.path === "config.mode")).toBe(true);
  });

  it("detects invalid port", () => {
    const data = { ...DEFAULT_CONFIG, config: { mode: "local", port: 99999 } } as any;
    const issues = validateConfig(data);
    const errors = issues.filter((i) => i.level === "error");
    expect(errors.some((e) => e.path === "config.port")).toBe(true);
  });

  it("warns about negative sync intervals", () => {
    const data = { ...DEFAULT_CONFIG, sync: { interval: -1, memoryInterval: 60, autoCommit: true, autoPush: false } } as any;
    const issues = validateConfig(data);
    const warnings = issues.filter((i) => i.level === "warning");
    expect(warnings.some((w) => w.path === "sync.interval")).toBe(true);
  });

  it("warns about missing LLM API keys", () => {
    const data = {
      ...DEFAULT_CONFIG,
      llm: { providers: { deepseek: { apiKey: "" } } },
    } as any;
    const issues = validateConfig(data);
    const warnings = issues.filter((i) => i.level === "warning");
    expect(warnings.some((w) => w.path.includes("apiKey"))).toBe(true);
  });

  it("warns about missing default model", () => {
    const data = {
      ...DEFAULT_CONFIG,
      llm: { defaultModel: "", providers: {} },
    } as any;
    const issues = validateConfig(data);
    const warnings = issues.filter((i) => i.level === "warning");
    expect(warnings.some((w) => w.path === "llm.defaultModel")).toBe(true);
  });
});
