/**
 * CloudAdapter — routes tasks to cloud Cloudflare Worker agents via A2A protocol.
 *
 * Implements the same AgentAdapter interface used internally by AgentSpawner so
 * the router can treat cloud agents identically to local processes.
 *
 * Graceful degradation:
 *   - If the cloud endpoint is unreachable, reachable() returns false immediately
 *     (short 3s timeout, no retries) so the router can fall back locally.
 *   - All errors are caught and surfaced as structured results rather than throws,
 *     so a cloud outage never crashes the local bridge.
 *
 * Authentication:
 *   - Reads Cloudflare credentials from the SecretManager (age-encrypted in repo).
 *   - Sends the GitHub PAT stored in the session as a Bearer token so cloud agents
 *     can read from the private repo when they need context.
 */

import { A2AClient } from "@cocapn/protocols/a2a";
import type {
  Task,
  TaskMessage,
  TaskStreamEvent,
} from "@cocapn/protocols/a2a";
import type { AgentDefinition, OutputCallback } from "./agents/spawner.js";

// ─── Cloud agent endpoint config ─────────────────────────────────────────────

export interface CloudWorkerConfig {
  /** Agent id matching AgentDefinition.id — used for registry lookup */
  agentId: string;
  /** Full HTTPS URL of the Cloudflare Worker (e.g., https://claude.worker.cocapn.io) */
  workerUrl: string;
  /** Cloudflare API token — read from SecretManager at runtime */
  cfApiToken: string | undefined;
  /** GitHub PAT forwarded for repo access — from the triggering WebSocket session */
  githubToken: string | undefined;
}

// ─── Adapter result ───────────────────────────────────────────────────────────

export interface CloudTaskResult {
  /** Final task object returned by the cloud agent */
  task: Task | undefined;
  /** Whether the cloud agent was actually reached */
  reached: boolean;
  /** Human-readable error if reached === false */
  error: string | undefined;
}

// ─── CloudAdapter ─────────────────────────────────────────────────────────────

const REACHABILITY_TIMEOUT_MS = 3_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_POLL_MAX_ATTEMPTS = 60; // 2 min total

export class CloudAdapter {
  private workerUrl: string;
  private client: A2AClient;
  private agentId: string;

  constructor(config: CloudWorkerConfig) {
    this.agentId  = config.agentId;
    this.workerUrl = config.workerUrl;

    // Forward the GitHub PAT as Bearer token so cloud Workers can call GitHub API
    const token = config.githubToken ?? config.cfApiToken;
    this.client = new A2AClient({
      baseUrl:   config.workerUrl,
      ...(token ? { authToken: token } : {}),
    });
  }

  // ── Reachability check ────────────────────────────────────────────────────

  /**
   * Returns true if the cloud worker responds to its agent card endpoint
   * within REACHABILITY_TIMEOUT_MS.  Never throws.
   */
  async reachable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        REACHABILITY_TIMEOUT_MS
      );
      const res = await fetch(
        `${this.workerUrl}/.well-known/agent.json`,
        { signal: controller.signal }
      );
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }

  // ── Send a task (fire-and-poll) ───────────────────────────────────────────

  /**
   * Send a task to the cloud agent and poll until it reaches a terminal state.
   * Streams progress chunks to `outputCallback` if provided.
   */
  async sendTask(
    taskDescription: string,
    outputCallback?: OutputCallback,
    sessionId?: string
  ): Promise<CloudTaskResult> {
    let task: Task | undefined;

    const message: TaskMessage = {
      role:  "user",
      parts: [{ type: "text", text: taskDescription }],
    };

    try {
      task = await this.client.sendTask({
        id:      `${this.agentId}-${Date.now()}`,
        message,
        ...(sessionId ? { metadata: { sessionId } } : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[cloud] Failed to send task to ${this.agentId}: ${msg}`);
      return { task: undefined, reached: false, error: msg };
    }

    // Poll until terminal
    task = await this.pollUntilDone(task, outputCallback);
    return { task, reached: true, error: undefined };
  }

  // ── Send a task with SSE streaming ────────────────────────────────────────

  /**
   * Stream a task to the cloud agent via Server-Sent Events.
   * Yields each TaskStreamEvent as it arrives.
   */
  async *streamTask(
    taskDescription: string,
    sessionId?: string
  ): AsyncGenerator<TaskStreamEvent, CloudTaskResult> {
    const message: TaskMessage = {
      role:  "user",
      parts: [{ type: "text", text: taskDescription }],
    };

    try {
      yield* this.client.sendTaskStream({
        id:      `${this.agentId}-${Date.now()}`,
        message,
        ...(sessionId ? { metadata: { sessionId } } : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[cloud] Stream failed for ${this.agentId}: ${msg}`);
      return { task: undefined, reached: false, error: msg };
    }

    return { task: undefined, reached: true, error: undefined };
  }

  // ── Cancel ────────────────────────────────────────────────────────────────

  async cancelTask(taskId: string): Promise<boolean> {
    try {
      await this.client.cancelTask({ id: taskId });
      return true;
    } catch {
      return false;
    }
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  getAgentId(): string { return this.agentId; }
  getWorkerUrl(): string { return this.workerUrl; }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async pollUntilDone(
    initial: Task,
    outputCallback?: OutputCallback,
    intervalMs = DEFAULT_POLL_INTERVAL_MS,
    maxAttempts = DEFAULT_POLL_MAX_ATTEMPTS
  ): Promise<Task> {
    let task = initial;
    const TERMINAL = new Set(["completed", "failed", "cancelled", "rejected"]);
    let lastOutputLen = 0;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (TERMINAL.has(task.status.state)) break;

      await sleep(intervalMs);

      try {
        task = await this.client.getTask({ id: task.id });
      } catch (err) {
        console.warn(`[cloud] Poll failed for task ${task.id}:`, err);
        break;
      }

      // Stream any new text parts to outputCallback
      if (outputCallback && task.status.message?.parts) {
        const parts = task.status.message.parts;
        for (let i = lastOutputLen; i < parts.length; i++) {
          const part = parts[i];
          if (part?.type === "text" && part.text) {
            outputCallback(part.text, "stdout");
          }
        }
        lastOutputLen = parts.length;
      }
    }

    return task;
  }
}

// ─── CloudAdapterRegistry ─────────────────────────────────────────────────────
//
// Manages a set of CloudAdapters keyed by agent id.
// Created by Bridge on startup from the cloud config.

export interface CloudConfig {
  accountId: string;
  apiToken: string | undefined;
  workers: Array<{
    agentId:    string;
    workerUrl:  string;
  }>;
  /** Admiral Durable Object base URL for session persistence sync */
  admiralUrl: string | undefined;
}

export class CloudAdapterRegistry {
  private adapters = new Map<string, CloudAdapter>();
  private config: CloudConfig;
  private githubToken: string | undefined;

  constructor(config: CloudConfig, githubToken?: string) {
    this.config      = config;
    this.githubToken = githubToken;
    this.init();
  }

  private init(): void {
    for (const worker of this.config.workers) {
      const adapter = new CloudAdapter({
        agentId:      worker.agentId,
        workerUrl:    worker.workerUrl,
        cfApiToken:   this.config.apiToken,
        githubToken:  this.githubToken,
      });
      this.adapters.set(worker.agentId, adapter);
    }
  }

  get(agentId: string): CloudAdapter | undefined {
    return this.adapters.get(agentId);
  }

  getAll(): CloudAdapter[] {
    return [...this.adapters.values()];
  }

  /** Check all workers in parallel; return ids of reachable ones. */
  async reachableAgents(): Promise<string[]> {
    const results = await Promise.all(
      [...this.adapters.entries()].map(async ([id, adapter]) => ({
        id,
        ok: await adapter.reachable(),
      }))
    );
    return results.filter((r) => r.ok).map((r) => r.id);
  }

  /** Update the GitHub token (e.g., after a new PAT is set in a session). */
  setGitHubToken(token: string): void {
    this.githubToken = token;
    this.init(); // re-create adapters with new token
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
