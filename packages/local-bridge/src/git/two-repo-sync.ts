/**
 * TwoRepoSync — manages private brain + public face repos simultaneously.
 *
 * Uses the existing GitSync class for each repo and coordinates sync between them.
 * Private repo auto-commits memory changes, public repo auto-commits source changes.
 */

import { EventEmitter } from "events";
import { existsSync } from "fs";
import { simpleGit, type StatusResult } from "simple-git";
import { GitSync } from "./sync.js";
import { DEFAULT_CONFIG, type BridgeConfig } from "../config/types.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface TwoRepoConfig {
  privateRepo: {
    path: string;
    remote?: string;
  };
  publicRepo: {
    path: string;
    remote?: string;
  };
  autoSync: boolean;
  syncInterval: number; // seconds
}

export interface RepoStatus {
  path: string;
  branch: string;
  clean: boolean;
  changedFiles: string[];
  hasRemote: boolean;
  lastCommitSha?: string;
}

export interface TwoRepoStatus {
  privateRepo: RepoStatus;
  publicRepo: RepoStatus;
  linked: boolean;
  syncing: boolean;
}

export type TwoRepoEventMap = {
  "private-committed": [message: string, files: string[]];
  "public-committed":  [message: string, files: string[]];
  "private-pushed":    [];
  "public-pushed":     [];
  synced:              [];
  error:               [repo: "private" | "public", err: Error];
};

// ─── TwoRepoSync ───────────────────────────────────────────────────────────────

export class TwoRepoSync extends EventEmitter<TwoRepoEventMap> {
  private privateSync: GitSync | null;
  private publicSync: GitSync | null;
  private config: TwoRepoConfig;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private _linked = false;
  private _syncing = false;

  constructor(config: TwoRepoConfig) {
    super();
    this.config = config;

    const privateConfig = this.buildBridgeConfig(config, "private");
    const publicConfig = this.buildBridgeConfig(config, "public");

    // GitSync requires the directory to exist — only init when available.
    this.privateSync = existsSync(config.privateRepo.path)
      ? new GitSync(config.privateRepo.path, privateConfig)
      : null;
    this.publicSync = existsSync(config.publicRepo.path)
      ? new GitSync(config.publicRepo.path, publicConfig)
      : null;

    if (this.privateSync) this.forwardEvents(this.privateSync, "private");
    if (this.publicSync) this.forwardEvents(this.publicSync, "public");
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Start periodic sync for both repos.
   * Private: auto-commits memory changes.
   * Public: auto-commits source changes.
   */
  start(): void {
    if (this.syncTimer) return;

    if (this.config.autoSync) {
      this.syncTimer = setInterval(() => {
        this.syncBoth().catch(() => undefined);
      }, this.config.syncInterval * 1000);
    }

    this.privateSync?.startTimers();
    this.publicSync?.startTimers();
  }

  /** Stop periodic sync and timers. */
  stop(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    this.privateSync?.stopTimers();
    this.publicSync?.stopTimers();
  }

  // ---------------------------------------------------------------------------
  // Sync operations
  // ---------------------------------------------------------------------------

  /** Commit + push private repo (if remote configured). */
  async syncPrivate(): Promise<boolean> {
    if (!this.privateSync) return false;
    const committed = await this.privateSync.commit("[cocapn] brain sync");
    if (committed && this.config.privateRepo.remote) {
      await this.privateSync.push();
    }
    return committed;
  }

  /** Commit + push public repo (if remote configured). */
  async syncPublic(): Promise<boolean> {
    if (!this.publicSync) return false;
    const committed = await this.publicSync.commit("[cocapn] face sync");
    if (committed && this.config.publicRepo.remote) {
      await this.publicSync.push();
    }
    return committed;
  }

  /** Sync both repos and emit a `synced` event when done. */
  async syncBoth(): Promise<{ privateCommitted: boolean; publicCommitted: boolean }> {
    this._syncing = true;
    try {
      const [privateCommitted, publicCommitted] = await Promise.all([
        this.syncPrivate().catch(() => false),
        this.syncPublic().catch(() => false),
      ]);
      this.emit("synced");
      return { privateCommitted, publicCommitted };
    } finally {
      this._syncing = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Status & linking
  // ---------------------------------------------------------------------------

  /** Verify both repos exist and are initialized as git repos. */
  async linkRepos(): Promise<boolean> {
    const privateOk = await this.isGitRepo(this.config.privateRepo.path);
    const publicOk = await this.isGitRepo(this.config.publicRepo.path);
    this._linked = privateOk && publicOk;
    return this._linked;
  }

  /** Return sync status for both repos. */
  async getStatus(): Promise<TwoRepoStatus> {
    const [privateStatus, publicStatus] = await Promise.all([
      this.getRepoStatus(this.config.privateRepo.path, this.config.privateRepo.remote, this.privateSync),
      this.getRepoStatus(this.config.publicRepo.path, this.config.publicRepo.remote, this.publicSync),
    ]);

    return {
      privateRepo: privateStatus,
      publicRepo: publicStatus,
      linked: this._linked,
      syncing: this._syncing,
    };
  }

  /** List uncommitted changes in public repo. */
  async getPublicChanges(): Promise<string[]> {
    return this.getChangedFiles(this.config.publicRepo.path);
  }

  /** List uncommitted changes in private repo. */
  async getPrivateChanges(): Promise<string[]> {
    return this.getChangedFiles(this.config.privateRepo.path);
  }

  /** Get access to the underlying GitSync instances. */
  getPrivateGitSync(): GitSync | null {
    return this.privateSync;
  }

  getPublicGitSync(): GitSync | null {
    return this.publicSync;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private buildBridgeConfig(config: TwoRepoConfig, _role: "private" | "public"): BridgeConfig {
    return {
      ...DEFAULT_CONFIG,
      sync: {
        interval: config.syncInterval,
        memoryInterval: Math.max(30, Math.floor(config.syncInterval / 4)),
        autoCommit: config.autoSync,
        autoPush: false, // We handle push ourselves in syncPrivate/syncPublic
      },
    };
  }

  private forwardEvents(sync: GitSync, repo: "private" | "public"): void {
    sync.on("committed", (message, files) => {
      this.emit(`${repo}-committed` as "private-committed" | "public-committed", message, files);
    });
    sync.on("pushed", () => {
      this.emit(`${repo}-pushed` as "private-pushed" | "public-pushed");
    });
    sync.on("error", (err) => {
      this.emit("error", repo, err);
    });
  }

  private async isGitRepo(path: string): Promise<boolean> {
    if (!existsSync(path)) return false;
    try {
      const git = simpleGit(path);
      await git.status();
      return true;
    } catch {
      return false;
    }
  }

  private async getRepoStatus(
    path: string,
    remote: string | undefined,
    sync: GitSync | null,
  ): Promise<RepoStatus> {
    let branch = "unknown";
    let changedFiles: string[] = [];
    let clean = true;

    try {
      const git = simpleGit(path);
      const status: StatusResult = await git.status();
      branch = status.current || "unknown";
      changedFiles = [
        ...status.modified,
        ...status.not_added,
        ...status.created,
        ...status.renamed.map((r) => r.to),
        ...status.deleted,
      ];
      clean = changedFiles.length === 0;
    } catch {
      clean = false;
    }

    const lastCommitSha = sync ? await sync.latestCommitSha() : undefined;

    return { path, branch, clean, changedFiles, hasRemote: !!remote, lastCommitSha };
  }

  private async getChangedFiles(path: string): Promise<string[]> {
    try {
      const git = simpleGit(path);
      const status = await git.status();
      return [
        ...status.modified,
        ...status.not_added,
        ...status.created,
        ...status.renamed.map((r) => r.to),
        ...status.deleted,
      ];
    } catch {
      return [];
    }
  }
}
