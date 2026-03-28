/**
 * Tests for bridge config loading and defaults.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { loadConfig } from "../src/config/loader.js";
import { DEFAULT_CONFIG } from "../src/config/types.js";

function makeTempRepo(): string {
  return mkdtempSync(join(tmpdir(), "cocapn-test-"));
}

describe("loadConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempRepo();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns defaults when no config file exists", () => {
    const config = loadConfig(tmpDir);
    expect(config.config.port).toBe(8787);
    expect(config.config.mode).toBe("local");
    expect(config.sync.autoCommit).toBe(true);
    expect(config.sync.autoPush).toBe(false);
  });

  it("merges values from config.yml", () => {
    mkdirSync(join(tmpDir, "cocapn"));
    writeFileSync(
      join(tmpDir, "cocapn", "config.yml"),
      `
soul: my-soul.md
config:
  mode: hybrid
  port: 9000
sync:
  autoPush: true
  interval: 120
encryption:
  publicKey: age1abc123
`
    );
    const config = loadConfig(tmpDir);
    expect(config.soul).toBe("my-soul.md");
    expect(config.config.mode).toBe("hybrid");
    expect(config.config.port).toBe(9000);
    expect(config.sync.autoPush).toBe(true);
    expect(config.sync.interval).toBe(120);
    expect(config.encryption.publicKey).toBe("age1abc123");
  });

  it("preserves defaults for unspecified keys", () => {
    mkdirSync(join(tmpDir, "cocapn"));
    writeFileSync(
      join(tmpDir, "cocapn", "config.yml"),
      `config:\n  port: 1234\n`
    );
    const config = loadConfig(tmpDir);
    expect(config.config.port).toBe(1234);
    // Unspecified keys fall back to defaults
    expect(config.config.mode).toBe(DEFAULT_CONFIG.config.mode);
    expect(config.memory.facts).toBe(DEFAULT_CONFIG.memory.facts);
  });

  it("overrides port with COCAPN_PORT env var", () => {
    process.env["COCAPN_PORT"] = "7777";
    try {
      const config = loadConfig(tmpDir);
      expect(config.config.port).toBe(7777);
    } finally {
      delete process.env["COCAPN_PORT"];
    }
  });

  it("overrides mode with COCAPN_MODE env var", () => {
    process.env["COCAPN_MODE"] = "cloud";
    try {
      const config = loadConfig(tmpDir);
      expect(config.config.mode).toBe("cloud");
    } finally {
      delete process.env["COCAPN_MODE"];
    }
  });

  it("ignores invalid mode from COCAPN_MODE", () => {
    process.env["COCAPN_MODE"] = "nonsense";
    try {
      const config = loadConfig(tmpDir);
      expect(config.config.mode).toBe("local"); // falls back to default
    } finally {
      delete process.env["COCAPN_MODE"];
    }
  });

  it("handles malformed YAML gracefully", () => {
    mkdirSync(join(tmpDir, "cocapn"));
    writeFileSync(join(tmpDir, "cocapn", "config.yml"), "{ bad yaml :::");
    // Should not throw
    expect(() => loadConfig(tmpDir)).not.toThrow();
  });
});
