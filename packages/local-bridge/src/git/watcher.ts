/**
 * RepoWatcher — watches the private repo for file changes using chokidar.
 *
 * Triggers debounced Git commits when files in watched directories change.
 * Respects encrypted path patterns (unencrypted secrets must never be committed).
 */

import { EventEmitter } from "events";
import chokidar, { type FSWatcher } from "chokidar";
import type { BridgeConfig } from "../config/types.js";
import type { GitSync } from "./sync.js";

const DEBOUNCE_MS = 2_000;

export type WatcherEventMap = {
  change: [path: string];
  ready: [];
};

export class RepoWatcher extends EventEmitter<WatcherEventMap> {
  private watcher: FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPaths = new Set<string>();
  private readonly config: BridgeConfig;
  private readonly sync: GitSync;
  private readonly watchPaths: string[];

  constructor(
    watchPaths: string[],
    config: BridgeConfig,
    sync: GitSync
  ) {
    super();
    this.watchPaths = watchPaths;
    this.config = config;
    this.sync = sync;
  }

  start(): void {
    this.watcher = chokidar.watch(this.watchPaths, {
      ignoreInitial: true,
      ignored: [
        /(^|[/\\])\../, // dotfiles
        /node_modules/,
        // Encrypted paths should never trigger an auto-commit (they'd be unencrypted)
        ...this.config.encryption.encryptedPaths.map(
          (p) => new RegExp(p.replace("**", ".*").replace("*.", "\\."))
        ),
      ],
      persistent: true,
    });

    this.watcher.on("change", (path: string) => this.onFileEvent(path));
    this.watcher.on("add", (path: string) => this.onFileEvent(path));
    this.watcher.on("unlink", (path: string) => this.onFileEvent(path));
    this.watcher.on("ready", () => this.emit("ready"));
  }

  async stop(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    await this.watcher?.close();
    this.watcher = null;
  }

  private onFileEvent(path: string): void {
    this.pendingPaths.add(path);
    this.emit("change", path);

    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      const paths = [...this.pendingPaths];
      this.pendingPaths.clear();
      if (this.config.sync.autoCommit) {
        const msg = `[cocapn] file change: ${paths.slice(0, 3).join(", ")}${paths.length > 3 ? " …" : ""}`;
        this.sync.commit(msg).catch(() => undefined);
      }
    }, DEBOUNCE_MS);
  }
}
