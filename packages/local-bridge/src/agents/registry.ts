/**
 * AgentRegistry — loads agent definitions from the private repo's `cocapn/agents/` directory.
 *
 * Each `*.agent.yml` file is validated against agent-definition.schema.json and registered.
 * The soul.md content is loaded and exposed for injection as COCAPN_SOUL.
 *
 * Hybrid routing priority:
 *   local (fast / cheap)  >  cloud remote (always-on)  >  none
 *
 * When a local agent definition is missing but a cloud equivalent exists
 * (same id registered in the CloudAdapterRegistry), `resolveHybrid()` will
 * suggest the cloud fallback and let the caller decide whether to use it.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join, basename } from "path";
import { parse as parseYaml } from "yaml";
import type { AgentDefinition } from "./spawner.js";
import type { SchemaValidator } from "../schema-validator.js";
import type { CloudAdapterRegistry } from "../CloudAdapter.js";

// ─── Hybrid resolution result ─────────────────────────────────────────────────

export type HybridSource = "local" | "cloud";

export interface HybridResolution {
  definition: AgentDefinition;
  source: HybridSource;
  /** True when source === "cloud" and local was absent or unavailable */
  isFallback: boolean;
}

// ─── AgentRegistry ────────────────────────────────────────────────────────────

export class AgentRegistry {
  private agents  = new Map<string, AgentDefinition>();
  private soulContent: string | undefined;
  private validator: SchemaValidator | undefined;
  private cloudRegistry: CloudAdapterRegistry | undefined;

  constructor(validator?: SchemaValidator) {
    this.validator = validator;
  }

  // ---------------------------------------------------------------------------
  // Cloud adapter wiring
  // ---------------------------------------------------------------------------

  /**
   * Attach a CloudAdapterRegistry so remote agents can be auto-registered
   * as AgentDefinition stubs (type === "remote") and used for fallback.
   */
  attachCloud(cloudRegistry: CloudAdapterRegistry): void {
    this.cloudRegistry = cloudRegistry;

    // Register a stub definition for every cloud worker so the router can
    // reference them.  Local .agent.yml definitions with the same id take
    // precedence and will overwrite these stubs.
    for (const adapter of cloudRegistry.getAll()) {
      const id = adapter.getAgentId();
      if (!this.agents.has(id)) {
        this.agents.set(id, this.makeCloudStub(id, adapter.getWorkerUrl()));
        console.info(`[registry] Cloud agent registered: ${id} → ${adapter.getWorkerUrl()}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Hybrid resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolve an agent with hybrid fallback:
   *
   *   1. Return local definition if registered and type !== "remote"
   *   2. If no local definition (or type === "remote"), check cloud
   *   3. Return undefined if neither exists
   *
   * Does NOT spawn anything — the caller is responsible for that.
   */
  resolveHybrid(agentId: string): HybridResolution | undefined {
    const local = this.agents.get(agentId);

    // Prefer local non-remote definition
    if (local && local.type !== "remote") {
      return { definition: local, source: "local", isFallback: false };
    }

    // Fall through to cloud if available
    if (this.cloudRegistry?.get(agentId)) {
      const stub = this.makeCloudStub(
        agentId,
        this.cloudRegistry.get(agentId)!.getWorkerUrl()
      );
      return { definition: stub, source: "cloud", isFallback: local === undefined };
    }

    // Return existing remote stub (already auto-registered above)
    if (local?.type === "remote") {
      return { definition: local, source: "cloud", isFallback: false };
    }

    return undefined;
  }

  /**
   * Like resolveHybrid(), but also checks whether the local process is actually
   * running (via the spawner-supplied predicate).  If local is registered but
   * not running, the caller can decide whether to spawn or go cloud.
   */
  resolveWithRunningCheck(
    agentId: string,
    isRunning: (id: string) => boolean
  ): HybridResolution & { localIsRunning: boolean } | undefined {
    const resolution = this.resolveHybrid(agentId);
    if (!resolution) return undefined;

    const localIsRunning =
      resolution.source === "local" && isRunning(agentId);

    return { ...resolution, localIsRunning };
  }

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  /**
   * Scan `<repoRoot>/cocapn/agents/` for *.agent.yml files and register each.
   * Also loads soul.md from the repo root path specified in config.
   */
  loadFromPrivateRepo(repoRoot: string, soulRelPath = "soul.md"): void {
    this.loadSoul(repoRoot, soulRelPath);
    this.loadAgentFiles(repoRoot);
  }

  /**
   * Load agent definitions from a cocapn.yml public config file (fallback).
   * Only registers stubs — real definitions come from .agent.yml files.
   */
  loadFromPublicConfig(repoRoot: string): void {
    const configPath = join(repoRoot, "cocapn.yml");
    if (!existsSync(configPath)) return;

    let raw: unknown;
    try {
      raw = parseYaml(readFileSync(configPath, "utf8"));
    } catch {
      console.warn(`[registry] Failed to parse ${configPath}`);
      return;
    }

    const config = raw as Partial<{ agents: { available: string[] } }>;
    if (!Array.isArray(config.agents?.available)) return;

    for (const id of config.agents.available) {
      if (!this.agents.has(id)) {
        console.info(`[registry] Agent referenced in config but no .agent.yml found: ${id}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Soul
  // ---------------------------------------------------------------------------

  /** Read the soul.md file for this repo. Returns empty string if missing. */
  getSoul(): string {
    return this.soulContent ?? "";
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  register(definition: AgentDefinition): void {
    this.agents.set(definition.id, definition);
  }

  get(id: string): AgentDefinition | undefined {
    return this.agents.get(id);
  }

  getAll(): AgentDefinition[] {
    return [...this.agents.values()];
  }

  unregister(id: string): void {
    this.agents.delete(id);
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private makeCloudStub(id: string, workerUrl: string): AgentDefinition {
    return {
      id,
      type:         "remote",
      command:      workerUrl,   // stored in command field for display; not exec'd
      args:         [],
      env:          {},
      capabilities: ["chat", "tasks"],
      cost:         "medium",
    };
  }

  private loadSoul(repoRoot: string, soulRelPath: string): void {
    const soulPath = join(repoRoot, soulRelPath);
    if (!existsSync(soulPath)) {
      console.warn(`[registry] soul.md not found at ${soulPath}`);
      return;
    }
    try {
      this.soulContent = readFileSync(soulPath, "utf8");
      console.info(`[registry] Loaded soul.md (${this.soulContent.length} chars)`);
    } catch (err) {
      console.warn("[registry] Failed to read soul.md:", err);
    }
  }

  private loadAgentFiles(repoRoot: string): void {
    const agentsDir = join(repoRoot, "cocapn", "agents");
    if (!existsSync(agentsDir)) {
      console.info(`[registry] No agents directory at ${agentsDir}`);
      return;
    }

    let entries: string[];
    try {
      entries = readdirSync(agentsDir);
    } catch (err) {
      console.warn("[registry] Failed to read agents directory:", err);
      return;
    }

    for (const filename of entries) {
      if (!filename.endsWith(".agent.yml")) continue;

      const filePath = join(agentsDir, filename);
      try {
        const raw = parseYaml(readFileSync(filePath, "utf8")) as unknown;
        const definition = this.parseAgentDefinition(raw, filename);
        if (definition) {
          // Local definition overwrites any cloud stub with the same id
          this.agents.set(definition.id, definition);
          console.info(`[registry] Loaded agent: ${definition.id} (${definition.type})`);
        }
      } catch (err) {
        console.warn(`[registry] Failed to load ${filename}:`, err);
      }
    }
  }

  private parseAgentDefinition(
    raw: unknown,
    filename: string
  ): AgentDefinition | null {
    if (!raw || typeof raw !== "object") {
      console.warn(`[registry] ${filename}: expected object, got ${typeof raw}`);
      return null;
    }

    if (this.validator) {
      const errors = this.validator.validateAgentDefinition(raw);
      if (errors) {
        console.warn(`[registry] ${filename} schema validation failed:`, errors);
        return null;
      }
    }

    const def = raw as Record<string, unknown>;

    const id =
      typeof def["id"] === "string"
        ? def["id"]
        : basename(filename, ".agent.yml");

    const type = (def["type"] as AgentDefinition["type"]) ?? "local";
    const command = typeof def["command"] === "string" ? def["command"] : "";

    if (type === "local" && !command) {
      console.warn(`[registry] ${filename}: local agent must specify 'command'`);
      return null;
    }

    return {
      id,
      type,
      command,
      args: Array.isArray(def["args"])
        ? (def["args"] as string[]).filter((a) => typeof a === "string")
        : [],
      env: this.parseEnvObject(def["env"]),
      capabilities: Array.isArray(def["capabilities"])
        ? (def["capabilities"] as string[]).filter((c) => typeof c === "string")
        : [],
      cost: (def["cost"] as AgentDefinition["cost"]) ?? "medium",
    };
  }

  private parseEnvObject(raw: unknown): Record<string, string> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "string") result[k] = v;
    }
    return result;
  }
}
