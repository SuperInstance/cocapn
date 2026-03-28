/**
 * A2AServer — receives A2A tasks from remote agents.
 *
 * Handles inbound JSON-RPC 2.0 HTTP requests at a single endpoint.
 * Works in both Node.js (via http.IncomingMessage) and Cloudflare Workers
 * (via the Fetch API Request/Response types).
 *
 * Usage:
 *   const server = new A2AServer({ agentCard, taskHandler });
 *   // In a Worker:
 *   export default { fetch: (req) => server.handleRequest(req) };
 *   // In Node.js:
 *   http.createServer((req, res) => server.handleNodeRequest(req, res));
 */

import type {
  A2AAgentCard,
  CancelTaskParams,
  GetTaskParams,
  SendTaskParams,
  Task,
  TaskStatus,
} from "./types.js";
import { A2AErrorCode } from "./types.js";

export type TaskHandler = (params: SendTaskParams) => Promise<Task>;
export type TaskLookup = (id: string) => Promise<Task | null>;
export type TaskCancel = (id: string) => Promise<Task | null>;

export interface A2AServerOptions {
  agentCard: A2AAgentCard;
  /** Called when a new task arrives via tasks/send */
  onSendTask: TaskHandler;
  /** Called when a client requests task status via tasks/get */
  onGetTask?: TaskLookup;
  /** Called when a client cancels a task via tasks/cancel */
  onCancelTask?: TaskCancel;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: unknown;
}

export class A2AServer {
  private agentCard: A2AAgentCard;
  private onSendTask: TaskHandler;
  private onGetTask: TaskLookup;
  private onCancelTask: TaskCancel;

  constructor(options: A2AServerOptions) {
    this.agentCard = options.agentCard;
    this.onSendTask = options.onSendTask;
    this.onGetTask = options.onGetTask ?? (() => Promise.resolve(null));
    this.onCancelTask = options.onCancelTask ?? (() => Promise.resolve(null));
  }

  /**
   * Handle a Fetch API Request (Cloudflare Workers or Node.js 18+).
   * Returns a Fetch API Response.
   */
  async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Serve agent card at the well-known path
    if (url.pathname === "/.well-known/agent.json") {
      return new Response(JSON.stringify(this.agentCard), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // All other requests are JSON-RPC
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return this.errorResponse(null, -32700, "Parse error");
    }

    return this.dispatchRpc(body as JsonRpcRequest);
  }

  // ---------------------------------------------------------------------------
  // JSON-RPC dispatch
  // ---------------------------------------------------------------------------

  private async dispatchRpc(req: JsonRpcRequest): Promise<Response> {
    const id = req.id ?? null;

    try {
      switch (req.method) {
        case "tasks/send": {
          const task = await this.onSendTask(req.params as SendTaskParams);
          return this.successResponse(id, task);
        }

        case "tasks/get": {
          const params = req.params as GetTaskParams;
          const task = await this.onGetTask(params.id);
          if (!task) {
            return this.errorResponse(id, A2AErrorCode.TaskNotFound, "Task not found");
          }
          return this.successResponse(id, task);
        }

        case "tasks/cancel": {
          const params = req.params as CancelTaskParams;
          const task = await this.onCancelTask(params.id);
          if (!task) {
            return this.errorResponse(
              id,
              A2AErrorCode.TaskNotCancelable,
              "Task not found or cannot be canceled"
            );
          }
          return this.successResponse(id, task);
        }

        default:
          return this.errorResponse(id, -32601, `Method not found: ${req.method}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return this.errorResponse(id, -32603, message);
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers for building task objects
  // ---------------------------------------------------------------------------

  static makeTask(id: string, status: TaskStatus, sessionId?: string): Task {
    const task: Task = { id, status, artifacts: [], history: [] };
    if (sessionId !== undefined) task.sessionId = sessionId;
    return task;
  }

  // ---------------------------------------------------------------------------
  // Response helpers
  // ---------------------------------------------------------------------------

  private successResponse(id: JsonRpcRequest["id"], result: unknown): Response {
    return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  private errorResponse(
    id: JsonRpcRequest["id"],
    code: number,
    message: string
  ): Response {
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }),
      {
        status: 200, // A2A spec: error responses still return 200
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
