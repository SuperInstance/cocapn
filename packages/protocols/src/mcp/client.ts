/**
 * MCPClient — environment-agnostic MCP client.
 *
 * Performs the initialize handshake then exposes typed methods for
 * listing tools, calling tools, listing resources, and reading resources.
 * Works with any MCPTransport.
 */

import type { MCPTransport } from "./transport.js";
import type {
  JsonRpcId,
  JsonRpcMessage,
  JsonRpcRequest,
  JsonRpcSuccessResponse,
  JsonRpcErrorResponse,
  McpCallToolParams,
  McpCallToolResult,
  McpCapabilities,
  McpClientInfo,
  McpInitializeResult,
  McpReadResourceResult,
  McpResource,
  McpTool,
} from "./types.js";

type PendingRequest = {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
};

export interface McpClientOptions {
  clientInfo: McpClientInfo;
  capabilities?: McpCapabilities;
}

export class MCPClient {
  private transport: MCPTransport | null = null;
  private nextId = 1;
  private pending = new Map<JsonRpcId, PendingRequest>();
  private readonly clientInfo: McpClientInfo;
  private readonly capabilities: McpCapabilities;
  private serverInfo: McpInitializeResult | null = null;

  constructor(options: McpClientOptions) {
    this.clientInfo = options.clientInfo;
    this.capabilities = options.capabilities ?? {};
  }

  /** Connect to an MCP server via the given transport and perform the handshake. */
  async connect(transport: MCPTransport): Promise<McpInitializeResult> {
    this.transport = transport;

    transport.onMessage((msg) => this.handleMessage(msg));
    transport.onError((err) => {
      // Reject all pending requests on transport error
      for (const [, pending] of this.pending) {
        pending.reject(err);
      }
      this.pending.clear();
    });
    transport.onClose(() => {
      const err = new Error("MCPClient: transport closed");
      for (const [, pending] of this.pending) {
        pending.reject(err);
      }
      this.pending.clear();
      this.transport = null;
    });

    await transport.start();

    this.serverInfo = await this.request<McpInitializeResult>("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: this.capabilities,
      clientInfo: this.clientInfo,
    });

    return this.serverInfo;
  }

  async close(): Promise<void> {
    await this.transport?.close();
    this.transport = null;
  }

  // ---------------------------------------------------------------------------
  // MCP API methods
  // ---------------------------------------------------------------------------

  async listTools(): Promise<McpTool[]> {
    const result = await this.request<{ tools: McpTool[] }>("tools/list", {});
    return result.tools;
  }

  async callTool(params: McpCallToolParams): Promise<McpCallToolResult> {
    return this.request<McpCallToolResult>("tools/call", params);
  }

  async listResources(): Promise<McpResource[]> {
    const result = await this.request<{ resources: McpResource[] }>("resources/list", {});
    return result.resources;
  }

  async readResource(uri: string): Promise<McpReadResourceResult> {
    return this.request<McpReadResourceResult>("resources/read", { uri });
  }

  // ---------------------------------------------------------------------------
  // Internal request/response machinery
  // ---------------------------------------------------------------------------

  private async request<T>(method: string, params: unknown): Promise<T> {
    if (!this.transport) {
      throw new Error("MCPClient: not connected — call connect() first");
    }

    const id = this.nextId++;
    const message: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (result) => resolve(result as T),
        reject,
      });
      this.transport!.send(message).catch(reject);
    });
  }

  private handleMessage(msg: JsonRpcMessage): void {
    // Only process responses (has id, no method)
    if (!("id" in msg) || "method" in msg) return;

    const response = msg as JsonRpcSuccessResponse | JsonRpcErrorResponse;
    const pending = this.pending.get(response.id);
    if (!pending) return;

    this.pending.delete(response.id);

    if ("error" in response) {
      pending.reject(
        new Error(`MCP error ${response.error.code}: ${response.error.message}`)
      );
    } else {
      pending.resolve(response.result);
    }
  }
}
