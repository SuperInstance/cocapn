/**
 * MCP (Model Context Protocol) types based on JSON-RPC 2.0.
 * These types are environment-agnostic and work in both Node.js and Cloudflare Workers.
 */

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 base types
// ---------------------------------------------------------------------------

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccessResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;
export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

// Standard JSON-RPC error codes
export const JsonRpcErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
} as const;

// ---------------------------------------------------------------------------
// MCP protocol-level types
// ---------------------------------------------------------------------------

export interface McpCapabilities {
  tools?: Record<string, unknown>;
  resources?: Record<string, unknown>;
  prompts?: Record<string, unknown>;
  sampling?: Record<string, unknown>;
  logging?: Record<string, unknown>;
}

export interface McpClientInfo {
  name: string;
  version: string;
}

export interface McpServerInfo {
  name: string;
  version: string;
}

// ---------------------------------------------------------------------------
// MCP initialize handshake
// ---------------------------------------------------------------------------

export interface McpInitializeParams {
  protocolVersion: string;
  capabilities: McpCapabilities;
  clientInfo: McpClientInfo;
}

export interface McpInitializeResult {
  protocolVersion: string;
  capabilities: McpCapabilities;
  serverInfo: McpServerInfo;
}

// ---------------------------------------------------------------------------
// MCP tool types
// ---------------------------------------------------------------------------

export interface McpToolParameter {
  type: string;
  description?: string;
  enum?: unknown[];
  items?: McpToolParameter;
  properties?: Record<string, McpToolParameter>;
  required?: string[];
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, McpToolParameter>;
    required?: string[];
  };
}

export interface McpCallToolParams {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface McpToolResultContent {
  type: "text" | "image" | "resource";
  text?: string;
  data?: string;
  mimeType?: string;
  uri?: string;
}

export interface McpCallToolResult {
  content: McpToolResultContent[];
  isError?: boolean;
}

// ---------------------------------------------------------------------------
// MCP resource types
// ---------------------------------------------------------------------------

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export interface McpReadResourceResult {
  contents: McpResourceContent[];
}

// ---------------------------------------------------------------------------
// MCP prompt types
// ---------------------------------------------------------------------------

export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface McpPromptMessage {
  role: "user" | "assistant";
  content: {
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
  };
}

export interface McpGetPromptResult {
  description?: string;
  messages: McpPromptMessage[];
}

// ---------------------------------------------------------------------------
// Transport-level message envelope
// ---------------------------------------------------------------------------

export interface McpTransportMessage {
  /** Raw JSON string of the JSON-RPC message */
  raw: string;
  /** Parsed JSON-RPC message */
  parsed: JsonRpcMessage;
}
