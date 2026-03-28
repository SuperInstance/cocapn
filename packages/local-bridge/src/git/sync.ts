/**
 * GitSync — wraps simple-git to keep the private repo in sync.
 *
 * Responsibilities:
 *   - Auto-commit changed files on a timer (if autoCommit = true)
 *   - Auto-push to remote (if autoPush = true)
 *   - Pull on startup and every 30 seconds to sync across devices
 *   - Handle merge conflicts by writing .conflict files (never auto-resolve)
 *   - Emit events when sync completes or fails
 */

import { writeFileSync, existsSync } from "fs";
import { join } from "path";
import { EventEmitter } from "events";
import { simpleGit, type SimpleGit, type StatusResult } from "simple-git";
import type { BridgeConfig } from "../config/types.js";

const PULL_INTERVAL_MS = 30_000;

export type SyncEventMap = {
  committed: [message: string, files: string[]];
  pushed: [];
  pulled: [];
  conflict: [files: string[]];
  error: [err: Error];
};

export class GitSync extends EventEmitter<SyncEventMap> {
  private git: SimpleGit;
  private repoRoot: string;
  private config: BridgeConfig;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private memoryTimer: ReturnType<typeof setInterval> | null = null;
  private pullTimer: ReturnType<typeof setInterval> | null = null;

  constructor(repoRoot: string, config: BridgeConfig) {
    super();
    this.repoRoot = repoRoot;
    this.git = simpleGit(repoRoot);
    this.config = config;
  }

  // ---------------------------------------------------------------------------
  // Pull with conflict handling
  // ---------------------------------------------------------------------------

  /**
   * Pull latest from remote.
   * On merge conflict: writes .conflict files for each affected path
   * and emits a `conflict` event instead of rejecting.
   */
  async pull(): Promise<void> {
    try {
      await this.git.pull();
      this.emit("pulled");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (this.isConflictError(message)) {
        const conflictFiles = await this.handleMergeConflicts();
        this.emit("conflict", conflictFiles);
      } else {
        this.emit("error", err instanceof Error ? err : new Error(message));
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Commit
  // ---------------------------------------------------------------------------

  /**
   * Commit all currently modified/untracked files (excluding encrypted patterns).
   * Uses the commit message format: "Cocapn: {filenames}"
   * Returns false if there was nothing to commit.
   */
  async commit(message: string): Promise<boolean> {
    let status: StatusResult;
    try {
      status = await this.git.status();
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
      return false;
    }

    const changed = [
      ...status.modified,
      ...status.not_added,
      ...status.created,
      ...status.renamed.map((r) => r.to),
    ].filter((f) => !this.isEncryptedPath(f));

    if (changed.length === 0) return false;

    // Format: "Cocapn: filename1, filename2" — single file uses just the filename
    const autoMessage =
      message.startsWith("[cocapn]") || message.startsWith("Cocapn:")
        ? message
        : `Cocapn: ${changed.slice(0, 3).join(", ")}${changed.length > 3 ? ` +${changed.length - 3} more` : ""}`;

    try {
      await this.git.add(changed);
      await this.git.commit(autoMessage);
      this.emit("committed", autoMessage, changed);

      if (this.config.sync.autoPush) {
        await this.push();
      }
      return true;
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  }

  /**
   * Convenience method for file-change commits.
   * Uses the prescribed message format: "Cocapn: {filename} modified"
   */
  async commitFile(filename: string): Promise<boolean> {
    return this.commit(`Cocapn: ${filename} modified`);
  }

  // ---------------------------------------------------------------------------
  // Push
  // ---------------------------------------------------------------------------

  async push(): Promise<void> {
    try {
      await this.git.push();
      this.emit("pushed");
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    }
  }

  /** Return the SHA of the latest commit, or undefined if the repo has no commits. */
  async latestCommitSha(): Promise<string | undefined> {
    try {
      const log = await this.git.log({ maxCount: 1 });
      return log.latest?.hash;
    } catch {
      return undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Timers
  // ---------------------------------------------------------------------------

  /**
   * Start automatic sync timers:
   *   - Pull every 30 seconds (cross-device sync)
   *   - General commit at config.sync.interval
   *   - Memory commit at config.sync.memoryInterval
   */
  startTimers(): void {
    // Always pull on a fixed 30-second cadence regardless of autoCommit setting
    this.pullTimer = setInterval(() => {
      this.pull().catch(() => undefined);
    }, PULL_INTERVAL_MS);

    if (!this.config.sync.autoCommit) return;

    this.syncTimer = setInterval(() => {
      this.commit("[cocapn] auto-sync").catch(() => undefined);
    }, this.config.sync.interval * 1000);

    this.memoryTimer = setInterval(() => {
      this.commit("[cocapn] memory sync").catch(() => undefined);
    }, this.config.sync.memoryInterval * 1000);
  }

  /** Stop all timers. */
  stopTimers(): void {
    if (this.pullTimer) {
      clearInterval(this.pullTimer);
      this.pullTimer = null;
    }
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.memoryTimer) {
      clearInterval(this.memoryTimer);
      this.memoryTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Conflict handling
  // ---------------------------------------------------------------------------

  /**
   * When a pull produces merge conflicts, git leaves conflict markers in the
   * affected files. We:
   *   1. Read the list of conflicting files from git status
   *   2. Write a sidecar <file>.conflict containing the raw conflict content
   *   3. Abort the merge so the repo stays clean
   *   4. Return the list of conflict sidecar paths
   */
  private async handleMergeConflicts(): Promise<string[]> {
    const conflictPaths: string[] = [];

    try {
      const status = await this.git.status();
      const conflicted = status.conflicted;

      for (const file of conflicted) {
        const absPath = join(this.repoRoot, file);
        const conflictPath = `${absPath}.conflict`;

        if (existsSync(absPath)) {
          const { readFileSync } = await import("fs");
          const conflictContent = readFileSync(absPath, "utf8");
          writeFileSync(conflictPath, conflictContent);
          conflictPaths.push(`${file}.conflict`);
        }
      }

      // Abort the failed merge to restore a clean state
      await this.git.merge(["--abort"]).catch(() => undefined);
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    }

    return conflictPaths;
  }

  private isConflictError(message: string): boolean {
    return (
      message.includes("CONFLICT") ||
      message.includes("Automatic merge failed") ||
      message.includes("merge conflict")
    );
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private isEncryptedPath(filePath: string): boolean {
    return this.config.encryption.encryptedPaths.some((pattern) => {
      if (pattern.endsWith("/**")) {
        return filePath.startsWith(pattern.slice(0, -3));
      }
      if (pattern.startsWith("*.")) {
        return filePath.endsWith(pattern.slice(1));
      }
      return filePath === pattern;
    });
  }
}
