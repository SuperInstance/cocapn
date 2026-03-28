/**
 * AgentSpawner — spawns CLI agent processes and connects them via MCP StdioTransport.
 *
 * New in this version:
 *   - Injects COCAPN_SOUL env var from soul.md content
 *   - Streams stderr back via an optional outputCallback
 *   - Cleans up sessions on disconnect via detachSession()
 */

import { spawn, type ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { MCPClient, StdioTransport } from "@cocapn/protocols/mcp";
import type { McpInitializeResult } from "@cocapn/protocols/mcp";

export type OutputCallback = (chunk: string, stream: "stdout" | "stderr") => void;

export interface AgentDefinition {
  id: string;
  type: "local" | "mcp" | "remote";
  command: string;
  args: string[];
  env: Record<string, string>;
  capabilities: string[];
  cost: "low" | "medium" | "high";
}

export interface SpawnOptions {
  /** soul.md content injected as COCAPN_SOUL environment variable */
  soul?: string;
  /** Callback to stream stdout/stderr back to the caller (e.g. WebSocket client) */
  outputCallback?: OutputCallback;
}

export interface SpawnedAgent {
  definition: AgentDefinition;
  process: ChildProcess;
  client: MCPClient;
  serverInfo: McpInitializeResult;
  startedAt: Date;
  /** IDs of WebSocket sessions currently using this agent */
  sessions: Set<string>;
}

export type SpawnerEventMap = {
  spawned: [agent: SpawnedAgent];
  stopped: [id: string, code: number | null];
  error: [id: string, err: Error];
  output: [id: string, chunk: string, stream: "stdout" | "stderr"];
};

export class AgentSpawner extends EventEmitter<SpawnerEventMap> {
  private agents = new Map<string, SpawnedAgent>();

  // ---------------------------------------------------------------------------
  // Spawn
  // ---------------------------------------------------------------------------

  /**
   * Spawn a local CLI agent and connect to it via MCP stdio.
   * COCAPN_SOUL is injected if provided in options.
   * stderr is forwarded to outputCallback and the `output` event.
   */
  async spawn(
    definition: AgentDefinition,
    options: SpawnOptions = {}
  ): Promise<SpawnedAgent> {
    if (this.agents.has(definition.id)) {
      throw new Error(`Agent already running: ${definition.id}`);
    }

    const env: Record<string, string> = {
      ...definition.env,
    };
    if (options.soul) {
      env["COCAPN_SOUL"] = options.soul;
    }

    const proc = spawn(definition.command, definition.args, {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"], // pipe stderr so we can stream it
    });

    const stdinStream = proc.stdin;
    const stdoutStream = proc.stdout;
    const stderrStream = proc.stderr;

    if (!stdinStream || !stdoutStream) {
      proc.kill();
      throw new Error(`Agent ${definition.id}: failed to get stdio pipes`);
    }

    // Stream stderr to callback and emit event
    if (stderrStream) {
      stderrStream.setEncoding("utf8");
      stderrStream.on("data", (chunk: string) => {
        this.emit("output", definition.id, chunk, "stderr");
        options.outputCallback?.(chunk, "stderr");
      });
    }

    const transport = new StdioTransport({
      readable: stdoutStream,
      writable: stdinStream,
    });

    const client = new MCPClient({
      clientInfo: { name: "cocapn-bridge", version: "0.1.0" },
    });

    proc.on("exit", (code) => {
      this.agents.delete(definition.id);
      this.emit("stopped", definition.id, code);
    });

    proc.on("error", (err) => {
      this.emit("error", definition.id, err);
    });

    let serverInfo: McpInitializeResult;
    try {
      serverInfo = await client.connect(transport);
    } catch (err) {
      proc.kill();
      throw new Error(
        `Agent ${definition.id}: MCP handshake failed — ${err instanceof Error ? err.message : String(err)}`
      );
    }

    const agent: SpawnedAgent = {
      definition,
      process: proc,
      client,
      serverInfo,
      startedAt: new Date(),
      sessions: new Set(),
    };

    this.agents.set(definition.id, agent);
    this.emit("spawned", agent);
    return agent;
  }

  // ---------------------------------------------------------------------------
  // Session management
  // ---------------------------------------------------------------------------

  /** Associate a WebSocket session with a running agent. */
  attachSession(agentId: string, sessionId: string): void {
    this.agents.get(agentId)?.sessions.add(sessionId);
  }

  /**
   * Detach a session from all agents it was using.
   * Stops agents that have no remaining sessions and are not shared.
   */
  async detachSession(sessionId: string): Promise<void> {
    for (const [agentId, agent] of this.agents) {
      agent.sessions.delete(sessionId);
      if (agent.sessions.size === 0) {
        // Stop single-session agents on disconnect to free resources
        await this.stop(agentId);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async stop(id: string): Promise<void> {
    const agent = this.agents.get(id);
    if (!agent) return;

    await agent.client.close();
    agent.process.kill("SIGTERM");
    this.agents.delete(id);
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.agents.keys()].map((id) => this.stop(id)));
  }

  get(id: string): SpawnedAgent | undefined {
    return this.agents.get(id);
  }

  getAll(): SpawnedAgent[] {
    return [...this.agents.values()];
  }
}
