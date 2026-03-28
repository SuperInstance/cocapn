/**
 * Tests for MCP protocol serialization/deserialization and core logic.
 *
 * Uses an in-memory transport to avoid any I/O dependencies.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  BaseTransport,
  MCPClient,
  MCPServer,
  JsonRpcErrorCode,
} from "../src/mcp/index.js";
import type {
  JsonRpcMessage,
  McpCallToolParams,
  McpCallToolResult,
  McpTool,
} from "../src/mcp/index.js";

// ---------------------------------------------------------------------------
// In-memory transport pair for testing — no stdio or WebSocket needed
// ---------------------------------------------------------------------------

/**
 * An in-memory transport that forwards outbound messages directly to a
 * linked peer transport, simulating a connected client/server pair.
 */
class MemoryTransport extends BaseTransport {
  private peer: MemoryTransport | null = null;

  link(peer: MemoryTransport): void {
    this.peer = peer;
    peer.peer = this;
  }

  async start(): Promise<void> {
    // Nothing to do — peer is already linked
  }

  async send(message: JsonRpcMessage): Promise<void> {
    if (!this.peer) throw new Error("MemoryTransport: no peer linked");
    // Deliver async so call-stacks don't interleave
    await Promise.resolve();
    await this.peer.notifyMessage(message);
  }

  async close(): Promise<void> {
    this.notifyClose();
    this.peer?.notifyClose();
  }
}

function makeConnectedPair(): [MemoryTransport, MemoryTransport] {
  const a = new MemoryTransport();
  const b = new MemoryTransport();
  a.link(b);
  return [a, b];
}

// ---------------------------------------------------------------------------
// Serialization unit tests
// ---------------------------------------------------------------------------

describe("MCP JSON-RPC serialization", () => {
  it("round-trips a request through JSON", () => {
    const msg: JsonRpcMessage = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    };
    const serialized = JSON.stringify(msg);
    const parsed = JSON.parse(serialized) as JsonRpcMessage;
    expect(parsed).toEqual(msg);
  });

  it("round-trips a success response", () => {
    const msg: JsonRpcMessage = {
      jsonrpc: "2.0",
      id: 42,
      result: { tools: [] },
    };
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
  });

  it("round-trips an error response", () => {
    const msg: JsonRpcMessage = {
      jsonrpc: "2.0",
      id: 3,
      error: {
        code: JsonRpcErrorCode.MethodNotFound,
        message: "Method not found: foo",
      },
    };
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
  });

  it("handles null id for notifications", () => {
    const msg: JsonRpcMessage = {
      jsonrpc: "2.0",
      id: null,
      method: "initialized",
    };
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
  });

  it("preserves nested tool result content", () => {
    const result: McpCallToolResult = {
      content: [
        { type: "text", text: "hello world" },
        { type: "image", data: "base64data", mimeType: "image/png" },
      ],
      isError: false,
    };
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});

// ---------------------------------------------------------------------------
// MCPServer and MCPClient integration tests
// ---------------------------------------------------------------------------

describe("MCPServer + MCPClient (in-memory transport)", () => {
  let server: MCPServer;
  let client: MCPClient;

  beforeEach(() => {
    server = new MCPServer({
      serverInfo: { name: "test-server", version: "0.1.0" },
      capabilities: { tools: {} },
    });

    client = new MCPClient({
      clientInfo: { name: "test-client", version: "0.1.0" },
    });
  });

  it("completes the initialize handshake", async () => {
    const [clientTransport, serverTransport] = makeConnectedPair();
    await server.connect(serverTransport);
    const result = await client.connect(clientTransport);

    expect(result.protocolVersion).toBe("2024-11-05");
    expect(result.serverInfo.name).toBe("test-server");
    expect(result.serverInfo.version).toBe("0.1.0");
  });

  it("lists registered tools", async () => {
    const echoTool: McpTool = {
      name: "echo",
      description: "Echoes input back",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", description: "Text to echo" },
        },
        required: ["message"],
      },
    };

    server.registerTool(echoTool, async (params) => ({
      content: [{ type: "text", text: String((params.arguments ?? {})["message"]) }],
    }));

    const [clientTransport, serverTransport] = makeConnectedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const tools = await client.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe("echo");
  });

  it("calls a tool and returns the result", async () => {
    server.registerTool(
      {
        name: "add",
        description: "Adds two numbers",
        inputSchema: {
          type: "object",
          properties: {
            a: { type: "number", description: "First operand" },
            b: { type: "number", description: "Second operand" },
          },
          required: ["a", "b"],
        },
      },
      async (params) => {
        const args = params.arguments ?? {};
        const sum = (args["a"] as number) + (args["b"] as number);
        return { content: [{ type: "text", text: String(sum) }] };
      }
    );

    const [clientTransport, serverTransport] = makeConnectedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const callParams: McpCallToolParams = {
      name: "add",
      arguments: { a: 3, b: 4 },
    };
    const result = await client.callTool(callParams);
    expect(result.isError).toBeFalsy();
    expect(result.content[0]).toMatchObject({ type: "text", text: "7" });
  });

  it("returns isError for unknown tools", async () => {
    const [clientTransport, serverTransport] = makeConnectedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.callTool({ name: "does-not-exist" });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ type: "text" });
  });

  it("rejects tool calls before initialize", async () => {
    // Connect transport but skip client.connect (no initialize sent)
    const [, serverTransport] = makeConnectedPair();
    await server.connect(serverTransport);

    // Directly send a tools/list without initializing
    const rawClient = new MemoryTransport();
    const rawServer = new MemoryTransport();
    rawClient.link(rawServer);
    await server.connect(rawServer);
    await rawClient.start();

    let receivedError: JsonRpcMessage | null = null;
    rawClient.onMessage((msg) => {
      receivedError = msg;
    });

    await rawClient.send({
      jsonrpc: "2.0",
      id: 99,
      method: "tools/list",
      params: {},
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(receivedError).not.toBeNull();
    expect(receivedError).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// StdioTransport serialization logic (buffer parsing)
// ---------------------------------------------------------------------------

describe("StdioTransport NDJSON buffer parsing", () => {
  it("correctly splits newline-delimited JSON messages", () => {
    const messages: JsonRpcMessage[] = [];
    const lines = [
      '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n',
      '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n',
    ].join("");

    // Simulate the same logic used in StdioTransport.processBuffer
    let buffer = lines;
    const lineArr = buffer.split("\n");
    buffer = lineArr.pop() ?? "";
    for (const line of lineArr) {
      const trimmed = line.trim();
      if (trimmed) messages.push(JSON.parse(trimmed) as JsonRpcMessage);
    }

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ method: "initialize" });
    expect(messages[1]).toMatchObject({ method: "tools/list" });
    expect(buffer).toBe(""); // no leftover
  });

  it("buffers partial lines correctly", () => {
    const partial = '{"jsonrpc":"2.0","id":1,"method":"init';
    const lineArr = partial.split("\n");
    const remaining = lineArr.pop() ?? "";
    expect(lineArr).toHaveLength(0);
    expect(remaining).toBe(partial);
  });
});
