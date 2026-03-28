/**
 * MCPServer — environment-agnostic MCP server.
 *
 * Accepts any MCPTransport so it can run on the local bridge (StdioTransport)
 * or inside a Cloudflare Worker (WorkerTransport). Handles the initialize
 * handshake and routes JSON-RPC method calls to registered handlers.
 */

import type { MCPTransport } from "./transport.js";
import type {
  JsonRpcId,
  JsonRpcMessage,
  JsonRpcRequest,
  McpCapabilities,
  McpCallToolParams,
  McpCallToolResult,
  McpInitializeParams,
  McpInitializeResult,
  McpServerInfo,
  McpTool,
} from "./types.js";
import { JsonRpcErrorCode } from "./types.js";

export type ToolHandler = (params: McpCallToolParams) => Promise<McpCallToolResult>;

export interface McpServerOptions {
  serverInfo: McpServerInfo;
  capabilities?: McpCapabilities;
}

export class MCPServer {
  private transport: MCPTransport | null = null;
  private tools = new Map<string, { definition: McpTool; handler: ToolHandler }>();
  private readonly serverInfo: McpServerInfo;
  private readonly capabilities: McpCapabilities;
  private initialized = false;

  constructor(options: McpServerOptions) {
    this.serverInfo = options.serverInfo;
    this.capabilities = options.capabilities ?? { tools: {} };
  }

  /** Register a tool and its handler. */
  registerTool(definition: McpTool, handler: ToolHandler): void {
    this.tools.set(definition.name, { definition, handler });
  }

  /** Connect a transport and start serving. */
  async connect(transport: MCPTransport): Promise<void> {
    this.transport = transport;
    transport.onMessage((msg) => this.handleMessage(msg));
    transport.onError((err) => console.error("[MCPServer] transport error:", err));
    transport.onClose(() => {
      this.initialized = false;
      this.transport = null;
    });
    await transport.start();
  }

  async close(): Promise<void> {
    await this.transport?.close();
    this.transport = null;
    this.initialized = false;
  }

  // ---------------------------------------------------------------------------
  // Message routing
  // ---------------------------------------------------------------------------

  private async handleMessage(msg: JsonRpcMessage): Promise<void> {
    // Only handle requests (has id + method)
    if (!("method" in msg)) return;

    const req = msg as JsonRpcRequest;

    try {
      const result = await this.dispatch(req);
      await this.reply(req.id, result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.replyError(req.id, JsonRpcErrorCode.InternalError, message);
    }
  }

  private async dispatch(req: JsonRpcRequest): Promise<unknown> {
    switch (req.method) {
      case "initialize":
        return this.handleInitialize(req.params as McpInitializeParams);

      case "tools/list":
        this.requireInitialized();
        return { tools: [...this.tools.values()].map((t) => t.definition) };

      case "tools/call":
        this.requireInitialized();
        return this.handleToolCall(req.params as McpCallToolParams);

      default:
        throw Object.assign(
          new Error(`Method not found: ${req.method}`),
          { code: JsonRpcErrorCode.MethodNotFound }
        );
    }
  }

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  private handleInitialize(params: McpInitializeParams): McpInitializeResult {
    // Accept any protocol version for now; real implementation would negotiate
    void params;
    this.initialized = true;
    return {
      protocolVersion: "2024-11-05",
      capabilities: this.capabilities,
      serverInfo: this.serverInfo,
    };
  }

  private async handleToolCall(params: McpCallToolParams): Promise<McpCallToolResult> {
    const entry = this.tools.get(params.name);
    if (!entry) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${params.name}` }],
        isError: true,
      };
    }
    return entry.handler(params);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private requireInitialized(): void {
    if (!this.initialized) {
      throw Object.assign(
        new Error("Server not initialized — client must call initialize first"),
        { code: JsonRpcErrorCode.InvalidRequest }
      );
    }
  }

  private async reply(id: JsonRpcId, result: unknown): Promise<void> {
    await this.transport?.send({ jsonrpc: "2.0", id, result });
  }

  private async replyError(id: JsonRpcId, code: number, message: string): Promise<void> {
    await this.transport?.send({ jsonrpc: "2.0", id, error: { code, message } });
  }
}
