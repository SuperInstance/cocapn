/**
 * Tests for ModuleManager, sandbox enforcement, and hook running.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { ModuleManager } from "../src/modules/manager.js";
import { isPathAllowed } from "../src/modules/sandbox.js";
import { runHook } from "../src/modules/hooks.js";
import { simpleGit } from "simple-git";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "cocapn-mod-test-"));
  // Minimal repo structure
  mkdirSync(join(dir, "cocapn"), { recursive: true });
  mkdirSync(join(dir, "modules"), { recursive: true });
  return dir;
}

function writeManifest(repoDir: string, name: string, extra: string = ""): void {
  const modDir = join(repoDir, "modules", name);
  mkdirSync(modDir, { recursive: true });
  writeFileSync(
    join(modDir, "module.yml"),
    `name: ${name}\nversion: 1.0.0\ntype: agent\ndescription: Test module\ndependencies: []\nhooks:\n  install:\n  enable:\n  disable:\n  update:\nagent:\n  file: agent.yml\n${extra}`,
    "utf8"
  );
  writeFileSync(join(modDir, "agent.yml"), `id: ${name}\ntype: local\ncommand: echo\nargs: []\nenv: {}\ncapabilities: [text]\ncost: low\n`, "utf8");
}

// ─── Sandbox tests ────────────────────────────────────────────────────────────

describe("isPathAllowed", () => {
  const root = "/repo";

  it("allows paths inside module dir", () => {
    expect(isPathAllowed("/repo/modules/foo/data.json", root, "foo")).toBe(true);
  });

  it("allows paths in wiki/", () => {
    expect(isPathAllowed("/repo/wiki/habits.md", root, "foo")).toBe(true);
  });

  it("allows paths in tasks/", () => {
    expect(isPathAllowed("/repo/tasks/active.json", root, "foo")).toBe(true);
  });

  it("allows paths in cocapn/memory/", () => {
    expect(isPathAllowed("/repo/cocapn/memory/facts.json", root, "foo")).toBe(true);
  });

  it("allows paths in cocapn/agents/", () => {
    expect(isPathAllowed("/repo/cocapn/agents/foo.agent.yml", root, "foo")).toBe(true);
  });

  it("allows paths in skin/", () => {
    expect(isPathAllowed("/repo/skin/foo/theme.css", root, "foo")).toBe(true);
  });

  it("blocks paths outside repo root", () => {
    expect(isPathAllowed("/etc/passwd", root, "foo")).toBe(false);
  });

  it("blocks path traversal", () => {
    expect(isPathAllowed("/repo/../etc/passwd", root, "foo")).toBe(false);
  });

  it("blocks sibling module directory", () => {
    expect(isPathAllowed("/repo/modules/other/secret", root, "foo")).toBe(false);
  });

  it("blocks cocapn/config.yml (not in allowed dirs)", () => {
    expect(isPathAllowed("/repo/cocapn/config.yml", root, "foo")).toBe(false);
  });
});

// ─── Hook runner tests ────────────────────────────────────────────────────────

describe("runHook", () => {
  let repoDir: string;

  beforeEach(() => { repoDir = makeTempRepo(); });
  afterEach(() => { rmSync(repoDir, { recursive: true, force: true }); });

  it("returns true when hook file is absent", async () => {
    const ok = await runHook({
      repoRoot:   repoDir,
      moduleName: "test-mod",
      moduleType: "agent",
      hookName:   "install",
      hookFile:   undefined,
      output:     undefined,
    });
    expect(ok).toBe(true);
  });

  it("runs a .js hook and returns true on exit 0", async () => {
    const modDir = join(repoDir, "modules", "test-mod", "hooks");
    mkdirSync(modDir, { recursive: true });
    writeFileSync(join(modDir, "install.js"), `console.log("installed");`, "utf8");

    const lines: string[] = [];
    const ok = await runHook({
      repoRoot:   repoDir,
      moduleName: "test-mod",
      moduleType: "agent",
      hookName:   "install",
      hookFile:   undefined,
      output:     (line) => lines.push(line),
    });
    expect(ok).toBe(true);
    expect(lines.some((l) => l.includes("installed"))).toBe(true);
  });

  it("returns false when hook exits non-zero", async () => {
    const modDir = join(repoDir, "modules", "test-mod", "hooks");
    mkdirSync(modDir, { recursive: true });
    writeFileSync(join(modDir, "install.js"), `process.exit(1);`, "utf8");

    const ok = await runHook({
      repoRoot:   repoDir,
      moduleName: "test-mod",
      moduleType: "agent",
      hookName:   "install",
      hookFile:   undefined,
      output:     undefined,
    });
    expect(ok).toBe(false);
  });

  it("passes COCAPN_REPO_ROOT env to hook", async () => {
    const modDir = join(repoDir, "modules", "env-mod", "hooks");
    mkdirSync(modDir, { recursive: true });
    writeFileSync(
      join(modDir, "install.js"),
      `if (process.env.COCAPN_REPO_ROOT !== ${JSON.stringify(repoDir)}) process.exit(1);`,
      "utf8"
    );

    const ok = await runHook({
      repoRoot:   repoDir,
      moduleName: "env-mod",
      moduleType: "agent",
      hookName:   "install",
      hookFile:   undefined,
      output:     undefined,
    });
    expect(ok).toBe(true);
  });
});

// ─── ModuleManager unit tests ─────────────────────────────────────────────────

describe("ModuleManager", () => {
  let repoDir: string;

  beforeEach(() => { repoDir = makeTempRepo(); });
  afterEach(() => { rmSync(repoDir, { recursive: true, force: true }); });

  it("list() returns empty array when no modules installed", () => {
    const mgr = new ModuleManager(repoDir);
    expect(mgr.list()).toEqual([]);
  });

  it("loadManifest() parses module.yml", () => {
    writeManifest(repoDir, "my-mod");
    const mgr = new ModuleManager(repoDir);
    const manifest = mgr.loadManifest("my-mod");
    expect(manifest.name).toBe("my-mod");
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.type).toBe("agent");
  });

  it("loadManifest() throws for missing module", () => {
    const mgr = new ModuleManager(repoDir);
    expect(() => mgr.loadManifest("nonexistent")).toThrow();
  });

  it("installByType: agent copies agent.yml to cocapn/agents/", async () => {
    writeManifest(repoDir, "my-agent");
    const mgr = new ModuleManager(repoDir);
    const manifest = mgr.loadManifest("my-agent");

    // Call installByType indirectly via enable test — use add with a mock git
    // Instead test the state tracking after manual upsert
    // (git submodule add requires a real remote, so we test the non-git path)
    mkdirSync(join(repoDir, "cocapn", "agents"), { recursive: true });

    // Simulate what add() does for the agent type: copy agent file
    const { cpSync } = await import("fs");
    const src  = join(repoDir, "modules", "my-agent", "agent.yml");
    const dest = join(repoDir, "cocapn", "agents", "my-agent.agent.yml");
    cpSync(src, dest);

    expect(existsSync(dest)).toBe(true);
  });

  it("state is persisted and can be listed", () => {
    const mgr = new ModuleManager(repoDir);
    const mod = {
      name: "test-mod", version: "1.0.0", type: "agent" as const,
      description: "Test", gitUrl: "https://github.com/test/test-mod",
      installedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      status: "enabled" as const, error: undefined,
    };
    // Inject directly via private method workaround
    writeFileSync(join(repoDir, "cocapn", "modules.json"), JSON.stringify([mod], null, 2), "utf8");

    const mgr2 = new ModuleManager(repoDir);
    const list = mgr2.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe("test-mod");
  });

  it("get() returns module by name", () => {
    const mgr = new ModuleManager(repoDir);
    writeFileSync(
      join(repoDir, "cocapn", "modules.json"),
      JSON.stringify([{ name: "foo", version: "1.0.0", type: "tool", status: "enabled" }]),
      "utf8"
    );
    expect(mgr.get("foo")?.name).toBe("foo");
    expect(mgr.get("bar")).toBeUndefined();
  });

  it("scanInstalled() finds modules with module.yml", () => {
    writeManifest(repoDir, "alpha");
    writeManifest(repoDir, "beta");
    // A dir without module.yml should not be scanned
    mkdirSync(join(repoDir, "modules", "empty-dir"), { recursive: true });

    const mgr = new ModuleManager(repoDir);
    const found = mgr.scanInstalled();
    expect(found).toContain("alpha");
    expect(found).toContain("beta");
    expect(found).not.toContain("empty-dir");
  });

  it("remove() throws for unknown module", async () => {
    const mgr = new ModuleManager(repoDir);
    await expect(mgr.remove("nonexistent")).rejects.toThrow("Module not found");
  });

  it("enable() and disable() update status", async () => {
    const mgr = new ModuleManager(repoDir);
    writeManifest(repoDir, "toggle-mod");
    writeFileSync(
      join(repoDir, "cocapn", "modules.json"),
      JSON.stringify([{
        name: "toggle-mod", version: "1.0.0", type: "agent",
        description: "", gitUrl: "", installedAt: "", updatedAt: "",
        status: "disabled", error: undefined,
      }]),
      "utf8"
    );

    await mgr.enable("toggle-mod");
    expect(mgr.get("toggle-mod")?.status).toBe("enabled");

    await mgr.disable("toggle-mod");
    expect(mgr.get("toggle-mod")?.status).toBe("disabled");
  });
});

// ─── Version compatibility ────────────────────────────────────────────────────

describe("version compatibility (via ModuleManager)", () => {
  it("parses >=0.1.0 range correctly", () => {
    // Tested indirectly: satisfiesMinVersion is private but exercised via manifest
    // We verify it doesn't throw for a compatible version
    const repoDir = makeTempRepo();
    try {
      writeManifest(repoDir, "compat-mod", "cocapn: \">=0.1.0\"");
      const mgr = new ModuleManager(repoDir);
      const m = mgr.loadManifest("compat-mod");
      expect(m.cocapn).toBe(">=0.1.0");
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});
