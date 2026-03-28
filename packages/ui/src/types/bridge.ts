// ─── Bridge wire types ────────────────────────────────────────────────────────
// Mirror of the BridgeServer's typed + JSON-RPC protocol.

export type BridgeStatus = "connected" | "connecting" | "disconnected";

// Outgoing typed messages (client → bridge)
export interface ChatRequest {
  type: "CHAT";
  id: string;
  content: string;
  agentId?: string;
  sessionId?: string;
}

export interface BashRequest {
  type: "BASH";
  id: string;
  command: string;
  cwd?: string;
}

export interface FileEditRequest {
  type: "FILE_EDIT";
  id: string;
  path: string;
  content: string;
}

export interface A2ARequest {
  type: "A2A_REQUEST";
  id: string;
  taskId: string;
  message: string;
  agentId?: string;
}

export type OutgoingTyped = ChatRequest | BashRequest | FileEditRequest | A2ARequest;

// Incoming typed messages (bridge → client)
export interface ChatStream {
  type: "CHAT_STREAM";
  id: string;
  chunk: string;
  done: boolean;
  stream?: boolean;
  error?: string;
}

export interface BashOutput {
  type: "BASH_OUTPUT";
  id: string;
  stdout?: string;
  stderr?: string;
  done: boolean;
  exitCode?: number;
  error?: string;
}

export interface FileEditResult {
  type: "FILE_EDIT_RESULT";
  id: string;
  ok: boolean;
  path?: string;
  error?: string;
}

export interface A2AResponse {
  type: "A2A_RESPONSE";
  id: string;
  routed: boolean;
  agent?: string;
  error?: string;
}

export interface BridgeStatusPush {
  type: "STATUS";
  version: string;
  repoRoot: string;
  uptime: number;
}

export type IncomingTyped =
  | ChatStream
  | BashOutput
  | FileEditResult
  | A2AResponse
  | BridgeStatusPush;

// JSON-RPC 2.0
export interface RpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
}

export interface RpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// Bridge-specific RPC result shapes
export interface BridgeStatusResult {
  version: string;
  uptime: number;
  repoRoot: string;
  config: Record<string, unknown>;
  gitStatus: Record<string, unknown>;
}

export interface AgentInfo {
  id: string;
  type: string;
  pid: number | undefined;
  sessions: string[];
  startedAt: string;
}

export interface SessionInfo {
  clientId: string;
  githubLogin: string | undefined;
  connectedAt: string;
}
