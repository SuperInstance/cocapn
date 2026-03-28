/**
 * A2AClient — sends A2A tasks to a remote agent.
 *
 * Used by the local bridge to delegate tasks to cloud Workers,
 * or by Workers to call other Workers.
 *
 * Transport: HTTP POST with JSON-RPC 2.0 body.
 * Streaming: Server-Sent Events (SSE) for tasks/sendSubscribe.
 */

import type {
  A2AAgentCard,
  CancelTaskParams,
  GetTaskParams,
  GetTaskResponse,
  SendTaskParams,
  SendTaskResponse,
  Task,
  TaskStreamEvent,
} from "./types.js";

export interface A2AClientOptions {
  /** Base URL of the remote A2A agent (e.g., https://agent.cocapn.io) */
  baseUrl: string;
  /** Optional bearer token for authenticated agents */
  authToken?: string;
  /** Fetch implementation — defaults to global fetch (available in Node 18+, Workers, browsers) */
  fetch?: typeof globalThis.fetch;
}

export class A2AClient {
  private baseUrl: string;
  private authToken: string | undefined;
  private fetch: typeof globalThis.fetch;
  private nextId = 1;

  constructor(options: A2AClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.authToken = options.authToken;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  // ---------------------------------------------------------------------------
  // Agent card discovery
  // ---------------------------------------------------------------------------

  async getAgentCard(): Promise<A2AAgentCard> {
    const response = await this.fetch(`${this.baseUrl}/.well-known/agent.json`, {
      headers: this.baseHeaders(),
    });
    if (!response.ok) {
      throw new Error(`A2AClient: failed to fetch agent card (${response.status})`);
    }
    return response.json() as Promise<A2AAgentCard>;
  }

  // ---------------------------------------------------------------------------
  // Task operations
  // ---------------------------------------------------------------------------

  async sendTask(params: SendTaskParams): Promise<Task> {
    const response = await this.rpc<SendTaskResponse>("tasks/send", params);
    if (response.error) {
      throw new Error(`A2A error ${response.error.code}: ${response.error.message}`);
    }
    if (!response.result) {
      throw new Error("A2AClient: tasks/send returned no result");
    }
    return response.result;
  }

  async getTask(params: GetTaskParams): Promise<Task> {
    const response = await this.rpc<GetTaskResponse>("tasks/get", params);
    if (response.error) {
      throw new Error(`A2A error ${response.error.code}: ${response.error.message}`);
    }
    if (!response.result) {
      throw new Error("A2AClient: tasks/get returned no result");
    }
    return response.result;
  }

  async cancelTask(params: CancelTaskParams): Promise<Task> {
    const response = await this.rpc<GetTaskResponse>("tasks/cancel", params);
    if (response.error) {
      throw new Error(`A2A error ${response.error.code}: ${response.error.message}`);
    }
    if (!response.result) {
      throw new Error("A2AClient: tasks/cancel returned no result");
    }
    return response.result;
  }

  /**
   * Subscribe to streaming task updates via Server-Sent Events.
   * The callback is called for each event until the stream ends.
   */
  async *sendTaskStream(params: SendTaskParams): AsyncGenerator<TaskStreamEvent> {
    const body = {
      jsonrpc: "2.0" as const,
      id: this.nextId++,
      method: "tasks/sendSubscribe",
      params,
    };

    const response = await this.fetch(`${this.baseUrl}`, {
      method: "POST",
      headers: {
        ...this.baseHeaders(),
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      throw new Error(`A2AClient: SSE request failed (${response.status})`);
    }

    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const eventBlock of events) {
          const dataLine = eventBlock.split("\n").find((l) => l.startsWith("data:"));
          if (!dataLine) continue;

          const jsonStr = dataLine.slice("data:".length).trim();
          try {
            const event = JSON.parse(jsonStr) as TaskStreamEvent;
            yield event;
          } catch {
            // Skip malformed SSE events
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ---------------------------------------------------------------------------
  // Internal JSON-RPC helpers
  // ---------------------------------------------------------------------------

  private async rpc<T>(method: string, params: unknown): Promise<T> {
    const body = {
      jsonrpc: "2.0" as const,
      id: this.nextId++,
      method,
      params,
    };

    const response = await this.fetch(`${this.baseUrl}`, {
      method: "POST",
      headers: {
        ...this.baseHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`A2AClient: HTTP ${response.status} from ${method}`);
    }

    return response.json() as Promise<T>;
  }

  private baseHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }
    return headers;
  }
}
