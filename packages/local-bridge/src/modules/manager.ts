/**
 * ModuleManager — install, remove, update, enable/disable modules.
 *
 * Modules are git submodules cloned into <repoRoot>/modules/<name>/.
 * Each module has a module.yml manifest describing its type and hooks.
 * Installed module state is persisted in cocapn/modules.json.
 *
 * Module types and what they do on install:
 *   skin        — copies CSS to skin/<name>/, merges layout.json
 *   agent       — copies agent.yml to cocapn/agents/
 *   tool        — copies mcp config, runs npm install if package.json present
 *   integration — runs install hook to wire webhooks/APIs
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  cpSync,
  rmSync,
  readdirSync,
} from "fs";
import { join, resolve } from "path";
import { EventEmitter } from "events";
import { simpleGit } from "simple-git";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { runHook } from "./hooks.js";
import { isPathAllowed } from "./sandbox.js";
import type {
  ModuleManifest,
  InstalledModule,
  ModuleStatus,
} from "./schema.js";
import type { OutputCb } from "./hooks.js";

// ─── Semver compat check (simple, no external dep) ───────────────────────────

const COCAPN_VERSION = "0.1.0";

function satisfiesMinVersion(range: string | undefined): boolean {
  if (!range) return true;
  // Support ">=X.Y.Z" only (sufficient for now)
  const m = range.match(/^>=(\d+\.\d+\.\d+)$/);
  if (!m) return true; // unknown format — allow
  const [rMaj, rMin, rPatch] = m[1]!.split(".").map(Number);
  const [cMaj, cMin, cPatch] = COCAPN_VERSION.split(".").map(Number);
  if (cMaj! > rMaj!) return true;
  if (cMaj! < rMaj!) return false;
  if (cMin! > rMin!) return true;
  if (cMin! < rMin!) return false;
  return (cPatch ?? 0) >= (rPatch ?? 0);
}

// ─── Event map ───────────────────────────────────────────────────────────────

export type ModuleManagerEventMap = {
  progress: [moduleName: string, line: string, stream: "stdout" | "stderr"];
  installed: [mod: InstalledModule];
  removed: [moduleName: string];
  updated: [mod: InstalledModule];
  enabled: [moduleName: string];
  disabled: [moduleName: string];
  error: [moduleName: string, err: Error];
};

// ─── ModuleManager ────────────────────────────────────────────────────────────

export class ModuleManager extends EventEmitter<ModuleManagerEventMap> {
  private repoRoot:    string;
  private modulesDir:  string;
  private stateFile:   string;

  constructor(repoRoot: string) {
    super();
    this.repoRoot   = repoRoot;
    this.modulesDir = join(repoRoot, "modules");
    this.stateFile  = join(repoRoot, "cocapn", "modules.json");
    this.ensureDirs();
  }

  // ── State ──────────────────────────────────────────────────────────────────

  list(): InstalledModule[] {
    return this.readState();
  }

  get(name: string): InstalledModule | undefined {
    return this.readState().find((m) => m.name === name);
  }

  // ── Add ───────────────────────────────────────────────────────────────────

  async add(gitUrl: string, output?: OutputCb): Promise<InstalledModule> {
    const name = this.nameFromUrl(gitUrl);
    const moduleDir = join(this.modulesDir, name);

    this.emit_progress(name, `Cloning ${gitUrl}…`, output);

    // Clone (or pull if already present — idempotent)
    if (existsSync(moduleDir)) {
      this.emit_progress(name, "Module directory already exists, pulling…", output);
      const git = simpleGit(moduleDir);
      await git.pull();
    } else {
      const git = simpleGit(this.repoRoot);
      await git.submoduleAdd(gitUrl, `modules/${name}`);
    }

    // Read manifest
    const manifest = this.loadManifest(name);

    // Version compatibility check
    if (!satisfiesMinVersion(manifest.cocapn)) {
      throw new Error(
        `Module ${name} requires cocapn ${manifest.cocapn ?? "?"} but running ${COCAPN_VERSION}`
      );
    }

    // Type-specific install
    await this.installByType(name, manifest, output);

    // Run install hook
    const hookOk = await runHook({
      repoRoot:   this.repoRoot,
      moduleName: name,
      moduleType: manifest.type,
      hookName:   "install",
      hookFile:   manifest.hooks.install,
      output,
    });

    const status: ModuleStatus = hookOk ? "enabled" : "error";
    const error = hookOk ? undefined : "Install hook failed";

    const installed: InstalledModule = {
      name,
      version:     manifest.version,
      type:        manifest.type,
      description: manifest.description,
      gitUrl,
      installedAt: new Date().toISOString(),
      updatedAt:   new Date().toISOString(),
      status,
      error,
    };

    this.upsertState(installed);
    this.emit("installed", installed);
    this.emit_progress(name, `Installed ${name}@${manifest.version} (${status})`, output);
    return installed;
  }

  // ── Remove ────────────────────────────────────────────────────────────────

  async remove(name: string, output?: OutputCb): Promise<void> {
    const mod = this.get(name);
    if (!mod) throw new Error(`Module not found: ${name}`);

    // Run disable hook first
    if (mod.status === "enabled") {
      await this.runLifecycleHook(name, mod.type, "disable", output);
    }

    const manifest = this.loadManifestMaybe(name);

    // Type-specific cleanup
    if (manifest) await this.uninstallByType(name, manifest, output);

    // Remove submodule
    const moduleDir = join(this.modulesDir, name);
    const git = simpleGit(this.repoRoot);
    try {
      await git.submoduleUpdate(["--init", "--recursive", `modules/${name}`]);
      // Deinit then remove
      await git.raw(["submodule", "deinit", "-f", `modules/${name}`]);
      await git.raw(["rm", "-f", `modules/${name}`]);
    } catch {
      // Fallback: just delete the directory
    }

    if (existsSync(moduleDir)) {
      rmSync(moduleDir, { recursive: true, force: true });
    }

    this.removeFromState(name);
    this.emit("removed", name);
    this.emit_progress(name, `Removed module ${name}`, output);
  }

  // ── Update ────────────────────────────────────────────────────────────────

  async update(name: string, output?: OutputCb): Promise<InstalledModule> {
    const mod = this.get(name);
    if (!mod) throw new Error(`Module not found: ${name}`);

    const moduleDir = join(this.modulesDir, name);
    const git = simpleGit(moduleDir);

    this.emit_progress(name, "Pulling latest…", output);
    await git.pull();

    const manifest = this.loadManifest(name);

    // Version check
    if (!satisfiesMinVersion(manifest.cocapn)) {
      throw new Error(
        `Updated module ${name} requires cocapn ${manifest.cocapn ?? "?"} but running ${COCAPN_VERSION}`
      );
    }

    // Re-run type-specific install (idempotent)
    await this.installByType(name, manifest, output);

    const hookOk = await runHook({
      repoRoot:   this.repoRoot,
      moduleName: name,
      moduleType: manifest.type,
      hookName:   "update",
      hookFile:   manifest.hooks.update,
      output,
    });

    const updated: InstalledModule = {
      ...mod,
      version:   manifest.version,
      updatedAt: new Date().toISOString(),
      status:    hookOk ? "enabled" : "error",
      error:     hookOk ? undefined : "Update hook failed",
    };

    this.upsertState(updated);
    this.emit("updated", updated);
    this.emit_progress(name, `Updated to ${name}@${manifest.version}`, output);
    return updated;
  }

  // ── Enable / Disable ──────────────────────────────────────────────────────

  async enable(name: string, output?: OutputCb): Promise<void> {
    const mod = this.get(name);
    if (!mod) throw new Error(`Module not found: ${name}`);

    await this.runLifecycleHook(name, mod.type, "enable", output);

    this.upsertState({ ...mod, status: "enabled", error: undefined });
    this.emit("enabled", name);
  }

  async disable(name: string, output?: OutputCb): Promise<void> {
    const mod = this.get(name);
    if (!mod) throw new Error(`Module not found: ${name}`);

    await this.runLifecycleHook(name, mod.type, "disable", output);

    this.upsertState({ ...mod, status: "disabled" });
    this.emit("disabled", name);
  }

  // ── Manifest ──────────────────────────────────────────────────────────────

  loadManifest(moduleName: string): ModuleManifest {
    const manifestPath = join(this.modulesDir, moduleName, "module.yml");
    if (!existsSync(manifestPath)) {
      throw new Error(`No module.yml found in modules/${moduleName}/`);
    }
    const raw = parseYaml(readFileSync(manifestPath, "utf8")) as Partial<ModuleManifest>;
    return this.normalizeManifest(raw);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private loadManifestMaybe(moduleName: string): ModuleManifest | undefined {
    try { return this.loadManifest(moduleName); } catch { return undefined; }
  }

  private normalizeManifest(raw: Partial<ModuleManifest>): ModuleManifest {
    return {
      name:         raw.name        ?? "unknown",
      version:      raw.version     ?? "0.0.0",
      type:         raw.type        ?? "tool",
      description:  raw.description ?? "",
      cocapn:       raw.cocapn,
      dependencies: raw.dependencies ?? [],
      hooks: {
        install:  raw.hooks?.install,
        enable:   raw.hooks?.enable,
        disable:  raw.hooks?.disable,
        update:   raw.hooks?.update,
      },
      skin:        raw.skin,
      agent:       raw.agent,
      tool:        raw.tool,
      integration: raw.integration,
    };
  }

  private async installByType(
    name: string,
    manifest: ModuleManifest,
    output?: OutputCb
  ): Promise<void> {
    const moduleDir = join(this.modulesDir, name);

    switch (manifest.type) {
      case "skin": {
        // Copy CSS to skin/<name>/
        const skinDest = join(this.repoRoot, "skin", name);
        mkdirSync(skinDest, { recursive: true });

        const cssSrc = manifest.skin?.css
          ? join(moduleDir, manifest.skin.css)
          : join(moduleDir, "skin");

        if (existsSync(cssSrc)) {
          cpSync(cssSrc, skinDest, { recursive: true });
          this.emit_progress(name, `Copied skin assets to skin/${name}/`, output);
        }

        // Merge layout.json
        const layoutSrc = manifest.skin?.layout
          ? join(moduleDir, manifest.skin.layout)
          : join(moduleDir, "skin", "layout.json");

        if (existsSync(layoutSrc)) {
          const destLayout = join(this.repoRoot, "skin", name, "layout.json");
          cpSync(layoutSrc, destLayout);
          this.emit_progress(name, "Merged layout.json", output);
        }
        break;
      }

      case "agent": {
        // Copy agent .yml to cocapn/agents/
        const agentFile = manifest.agent?.file ?? "agent.yml";
        const agentSrc  = join(moduleDir, agentFile);
        if (!existsSync(agentSrc)) {
          this.emit_progress(name, `Warning: agent file not found: ${agentFile}`, output);
          break;
        }

        const agentsDest = join(this.repoRoot, "cocapn", "agents");
        mkdirSync(agentsDest, { recursive: true });
        // Validate path stays in sandbox
        const destPath = resolve(agentsDest, `${name}.agent.yml`);
        if (!isPathAllowed(destPath, this.repoRoot, name)) {
          throw new Error(`Agent file destination outside sandbox: ${destPath}`);
        }
        cpSync(agentSrc, destPath);
        this.emit_progress(name, `Registered agent definition in cocapn/agents/${name}.agent.yml`, output);
        break;
      }

      case "tool": {
        // Copy MCP server config
        const mcpFile = manifest.tool?.mcp ?? "mcp.json";
        const mcpSrc  = join(moduleDir, mcpFile);
        if (existsSync(mcpSrc)) {
          const agentsDest = join(this.repoRoot, "cocapn", "agents");
          mkdirSync(agentsDest, { recursive: true });
          const destPath = resolve(agentsDest, `${name}.mcp.json`);
          if (!isPathAllowed(destPath, this.repoRoot, name)) {
            throw new Error(`MCP config destination outside sandbox`);
          }
          cpSync(mcpSrc, destPath);
          this.emit_progress(name, `Installed MCP config to cocapn/agents/${name}.mcp.json`, output);
        }

        // npm install if package.json present
        const pkgJson = join(moduleDir, "package.json");
        if (existsSync(pkgJson)) {
          this.emit_progress(name, "Running npm install…", output);
          await this.runNpm(moduleDir, ["install", "--omit=dev"], output);
        }
        break;
      }

      case "integration":
        // Integration setup is fully hook-driven
        this.emit_progress(name, "Integration module — setup via install hook", output);
        break;
    }
  }

  private async uninstallByType(
    name: string,
    manifest: ModuleManifest,
    output?: OutputCb
  ): Promise<void> {
    switch (manifest.type) {
      case "skin": {
        const skinDest = join(this.repoRoot, "skin", name);
        if (existsSync(skinDest)) {
          rmSync(skinDest, { recursive: true, force: true });
          this.emit_progress(name, `Removed skin/${name}/`, output);
        }
        break;
      }
      case "agent": {
        const agentFile = join(this.repoRoot, "cocapn", "agents", `${name}.agent.yml`);
        if (existsSync(agentFile)) {
          rmSync(agentFile);
          this.emit_progress(name, `Removed cocapn/agents/${name}.agent.yml`, output);
        }
        break;
      }
      case "tool": {
        const mcpFile = join(this.repoRoot, "cocapn", "agents", `${name}.mcp.json`);
        if (existsSync(mcpFile)) {
          rmSync(mcpFile);
          this.emit_progress(name, `Removed cocapn/agents/${name}.mcp.json`, output);
        }
        break;
      }
      case "integration":
        break;
    }
  }

  private async runLifecycleHook(
    name: string,
    type: ModuleManifest["type"],
    hook: "enable" | "disable" | "update",
    output?: OutputCb
  ): Promise<void> {
    const manifest = this.loadManifestMaybe(name);
    await runHook({
      repoRoot:   this.repoRoot,
      moduleName: name,
      moduleType: type,
      hookName:   hook,
      hookFile:   manifest?.hooks?.[hook],
      output,
    });
  }

  private async runNpm(
    cwd: string,
    args: string[],
    output?: OutputCb
  ): Promise<boolean> {
    const { spawn } = await import("child_process");
    return new Promise<boolean>((resolve) => {
      const child = spawn("npm", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
      child.stdout?.on("data", (c: Buffer) => output?.(c.toString().trim(), "stdout"));
      child.stderr?.on("data", (c: Buffer) => output?.(c.toString().trim(), "stderr"));
      child.on("close", (code) => resolve(code === 0));
      child.on("error", () => resolve(false));
    });
  }

  // ── State persistence ─────────────────────────────────────────────────────

  private readState(): InstalledModule[] {
    if (!existsSync(this.stateFile)) return [];
    try {
      return JSON.parse(readFileSync(this.stateFile, "utf8")) as InstalledModule[];
    } catch {
      return [];
    }
  }

  private writeState(mods: InstalledModule[]): void {
    const cocapnDir = join(this.repoRoot, "cocapn");
    mkdirSync(cocapnDir, { recursive: true });
    writeFileSync(this.stateFile, JSON.stringify(mods, null, 2), "utf8");
  }

  private upsertState(mod: InstalledModule): void {
    const mods = this.readState().filter((m) => m.name !== mod.name);
    this.writeState([...mods, mod]);
  }

  private removeFromState(name: string): void {
    this.writeState(this.readState().filter((m) => m.name !== name));
  }

  // ── Misc ──────────────────────────────────────────────────────────────────

  private ensureDirs(): void {
    mkdirSync(this.modulesDir, { recursive: true });
  }

  private nameFromUrl(gitUrl: string): string {
    return gitUrl.replace(/\.git$/, "").split("/").pop() ?? "module";
  }

  private emit_progress(name: string, line: string, output?: OutputCb): void {
    output?.(line, "stdout");
    this.emit("progress", name, line, "stdout");
  }

  // ── Scan for available modules (for listing) ──────────────────────────────

  scanInstalled(): string[] {
    if (!existsSync(this.modulesDir)) return [];
    return readdirSync(this.modulesDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(this.modulesDir, e.name, "module.yml")))
      .map((e) => e.name);
  }
}
