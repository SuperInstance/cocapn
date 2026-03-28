/**
 * Bridge — top-level orchestrator for the Cocapn local bridge.
 *
 * Wires together:
 *   - Config loader + SchemaValidator
 *   - SecretManager (age encryption + OS keychain)
 *   - GitSync + RepoWatcher
 *   - AgentRegistry (loads from cocapn/agents/, injects soul.md)
 *   - AgentSpawner + AgentRouter
 *   - CloudAdapterRegistry (optional, when mode !== "local")
 *   - AdmiralClient (optional, for cross-device session sync)
 *   - BridgeServer (WebSocket with GitHub PAT auth)
 *   - Optional Cloudflare tunnel via cloudflared
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import { loadConfig } from "./config/loader.js";
import { GitSync } from "./git/sync.js";
import { RepoWatcher } from "./git/watcher.js";
import { AgentSpawner } from "./agents/spawner.js";
import { AgentRegistry } from "./agents/registry.js";
import { AgentRouter } from "./agents/router.js";
import { BridgeServer } from "./ws/server.js";
import { SecretManager } from "./secret-manager.js";
import { SchemaValidator } from "./schema-validator.js";
import {
  CloudAdapterRegistry,
  type CloudConfig,
} from "./CloudAdapter.js";
import { ModuleManager } from "./modules/manager.js";
import { FleetKeyManager } from "./security/fleet.js";
import { Brain } from "./brain/index.js";
import type { BridgeConfig } from "./config/types.js";

// ─── AdmiralClient (optional import — avoids hard dep on cloud-agents pkg) ────

type AdmiralClientLike = {
  heartbeat: (hb: { instanceId: string; hostname: string; repoRoot?: string }) => Promise<void>;
  notifyGitCommit: (sha: string) => Promise<void>;
};

export interface BridgeOptions {
  /** Root of the private encrypted repo (contains cocapn/config.yml, soul.md) */
  privateRepoRoot: string;
  /** Root of the public template repo (contains cocapn.yml) */
  publicRepoRoot: string;
  /** Override WebSocket port (takes precedence over config file) */
  port: number | undefined;
  /** Skip GitHub PAT authentication (useful for local-only use) */
  skipAuth: boolean | undefined;
}

// ─── Cloud YAML shape (cocapn/cocapn-cloud.yml) ───────────────────────────────

interface CloudYml {
  cloudflare?: {
    accountId?: string;
    apiToken?:  string;
    workers?:   Array<{ agentId: string; workerUrl: string }>;
    admiralUrl?: string;
  };
}

export class Bridge {
  private options:       BridgeOptions;
  private config:        BridgeConfig;
  private validator:     SchemaValidator;
  private secrets:       SecretManager;
  private sync:          GitSync;
  private watcher:       RepoWatcher;
  private spawner:       AgentSpawner;
  private registry:      AgentRegistry;
  private router:        AgentRouter;
  private server:        BridgeServer;
  private cloudAdapters: CloudAdapterRegistry | undefined;
  private admiral:       AdmiralClientLike | undefined;
  private instanceId:    string;
  private modules:       ModuleManager;
  private fleetKeys:     FleetKeyManager;
  private fleetKey:      string | undefined;
  private brain:         Brain;

  constructor(options: BridgeOptions) {
    this.options    = options;
    this.instanceId = `bridge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.validator  = new SchemaValidator();
    this.config     = loadConfig(options.privateRepoRoot);

    if (options.port !== undefined) {
      this.config = {
        ...this.config,
        config: { ...this.config.config, port: options.port },
      };
    }

    this.secrets   = new SecretManager(options.privateRepoRoot);
    this.sync      = new GitSync(options.privateRepoRoot, this.config);
    this.modules   = new ModuleManager(options.privateRepoRoot);
    this.brain     = new Brain(options.privateRepoRoot, this.config, this.sync);
    this.fleetKeys = new FleetKeyManager(options.privateRepoRoot);

    this.watcher = new RepoWatcher(
      [options.privateRepoRoot],
      this.config,
      this.sync
    );

    this.spawner  = new AgentSpawner();
    this.registry = new AgentRegistry(this.validator);
    this.registry.loadFromPrivateRepo(options.privateRepoRoot, this.config.soul);
    this.registry.loadFromPublicConfig(options.publicRepoRoot);

    // Load cloud config and wire CloudAdapterRegistry if present
    this.cloudAdapters = this.loadCloudAdapters(options.privateRepoRoot);
    if (this.cloudAdapters) {
      this.registry.attachCloud(this.cloudAdapters);
    }

    this.router = new AgentRouter(
      {
        rules:         [],
        strategy:      "first-match",
        defaultAgent:  undefined,
        fallbackAgent: undefined,
      },
      this.registry,
      this.spawner,
      this.cloudAdapters
    );

    this.server = new BridgeServer({
      config:         this.config,
      router:         this.router,
      spawner:        this.spawner,
      sync:           this.sync,
      repoRoot:       options.privateRepoRoot,
      skipAuth:       options.skipAuth,
      cloudAdapters:  this.cloudAdapters,
      moduleManager:  this.modules,
      fleetKey:       this.fleetKey,
      brain:          this.brain,
      enablePeerApi:  true,
    });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async start(): Promise<void> {
    console.info("[bridge] Starting Cocapn local bridge…");
    console.info(`[bridge] Mode:      ${this.config.config.mode}`);
    console.info(`[bridge] Port:      ${this.config.config.port}`);
    console.info(`[bridge] Repo:      ${this.options.privateRepoRoot}`);
    console.info(`[bridge] Auth:      ${this.options.skipAuth ? "disabled" : "GitHub PAT"}`);
    console.info(`[bridge] Cloud:     ${this.cloudAdapters ? "enabled" : "local-only"}`);

    await this.secrets.loadIdentity();

    // Load fleet key (used for JWT auth between fleet members)
    this.fleetKey = await this.fleetKeys.load(
      (ct) => this.secrets.decrypt(ct)
    );
    if (this.fleetKey) {
      console.info("[bridge] Fleet key loaded — JWT auth enabled");
      // Inject into running server options (server not yet started)
      this.server["options"].fleetKey = this.fleetKey;
    }

    await this.sync.pull();
    this.sync.startTimers();
    this.watcher.start();
    this.server.start();

    // ── Git sync event logging ───────────────────────────────────────────────

    this.sync.on("committed", (msg, files) => {
      console.info(`[git] Committed: ${msg} (${files.length} files)`);
      // Notify Admiral DO so cloud agents know the repo changed
      void this.notifyAdmiralCommit();
    });
    this.sync.on("pushed",   () => console.info("[git] Pushed to remote"));
    this.sync.on("pulled",   () => console.info("[git] Pulled from remote"));
    this.sync.on("conflict", (files) =>
      console.warn(`[git] Merge conflicts written to: ${files.join(", ")}`)
    );
    this.sync.on("error", (err) => console.error("[git] Error:", err));

    // ── Admiral heartbeat (every 60s when cloud is configured) ───────────────
    if (this.admiral) {
      const beat = () => void this.admiral?.heartbeat({
        instanceId: this.instanceId,
        hostname:   process.env["HOSTNAME"] ?? "local",
        repoRoot:   this.options.privateRepoRoot,
      });
      beat();
      setInterval(beat, 60_000);
    }
  }

  async stop(): Promise<void> {
    console.info("[bridge] Stopping…");
    this.sync.stopTimers();
    await this.watcher.stop();
    await this.spawner.stopAll();
    await this.server.stop();
    this.secrets.clearCache();
    console.info("[bridge] Stopped.");
  }

  getConfig():      BridgeConfig           { return this.config; }
  getSecrets():     SecretManager          { return this.secrets; }
  getCloudAdapters(): CloudAdapterRegistry | undefined { return this.cloudAdapters; }

  // ---------------------------------------------------------------------------
  // Cloud config loading
  // ---------------------------------------------------------------------------

  private loadCloudAdapters(repoRoot: string): CloudAdapterRegistry | undefined {
    const cloudYmlPath = join(repoRoot, "cocapn", "cocapn-cloud.yml");
    if (!existsSync(cloudYmlPath)) return undefined;

    let raw: unknown;
    try {
      raw = parseYaml(readFileSync(cloudYmlPath, "utf8"));
    } catch {
      console.warn("[bridge] Failed to parse cocapn-cloud.yml");
      return undefined;
    }

    const yml = raw as CloudYml;
    const cf  = yml.cloudflare;
    if (!cf?.workers?.length) return undefined;

    const cloudConfig: CloudConfig = {
      accountId: cf.accountId ?? "",
      apiToken:  cf.apiToken,
      workers:   cf.workers.map((w) => ({
        agentId:   w.agentId,
        workerUrl: w.workerUrl,
      })),
      admiralUrl: cf.admiralUrl,
    };

    console.info(`[bridge] Cloud workers: ${cloudConfig.workers.map((w) => w.agentId).join(", ")}`);

    // Build Admiral client if configured
    if (cloudConfig.admiralUrl) {
      // Inline import to avoid hard dependency on cloud-agents package
      this.admiral = this.makeAdmiralClient(cloudConfig.admiralUrl, cloudConfig.apiToken);
    }

    return new CloudAdapterRegistry(cloudConfig);
  }

  private makeAdmiralClient(
    admiralUrl: string,
    token: string | undefined
  ): AdmiralClientLike {
    return {
      heartbeat: async (hb) => {
        try {
          await fetch(`${admiralUrl}/heartbeat`, {
            method:  "POST",
            headers: {
              "Content-Type":  "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(hb),
          });
        } catch { /* non-fatal */ }
      },
      notifyGitCommit: async (sha) => {
        try {
          await fetch(`${admiralUrl}/notify`, {
            method:  "POST",
            headers: {
              "Content-Type":  "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ sha }),
          });
        } catch { /* non-fatal */ }
      },
    };
  }

  private async notifyAdmiralCommit(): Promise<void> {
    if (!this.admiral) return;
    try {
      // Read latest commit SHA from git
      const result = await this.sync.latestCommitSha();
      if (result) await this.admiral.notifyGitCommit(result);
    } catch { /* non-fatal */ }
  }
}
