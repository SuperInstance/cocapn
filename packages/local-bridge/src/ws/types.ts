/**
 * Shared type definitions for the BridgeServer WebSocket protocol.
 * Extracted from the monolithic server.ts to enable handler-level imports
 * without circular dependencies.
 */

import type { WebSocket } from "ws";
import type { AgentRouter } from "../agents/router.js";
import type { AgentSpawner } from "../agents/spawner.js";
import type { GitSync } from "../git/sync.js";
import type { BridgeConfig } from "../config/types.js";
import type { CloudAdapterRegistry } from "../CloudAdapter.js";
import type { Brain } from "../brain/index.js";
import type { ModuleManager } from "../modules/manager.js";
import type { AuditLogger } from "../security/audit.js";
import type { ChatRouter } from "./chat-router.js";

// ─── Server options (unchanged from current contract) ────────────────────────

export interface BridgeServerOptions {
  config: BridgeConfig;
  router: AgentRouter;
  spawner: AgentSpawner;
  sync: GitSync;
  /** Root of the private repo — used for FILE_EDIT path resolution */
  repoRoot: string;
  /** Skip GitHub token validation (for local-only / testing) */
  skipAuth: boolean | undefined;
  /** Cloud adapter registry — set when mode !== "local" */
  cloudAdapters: CloudAdapterRegistry | undefined;
  /** Module manager — lazily created if not provided */
  moduleManager: ModuleManager | undefined;
  /** Fleet symmetric key for JWT auth (alternative to GitHub PAT) */
  fleetKey: string | undefined;
  /** Brain — provides soul + memory context for agent spawning */
  brain: Brain | undefined;
  /**
   * Enable the A2A peer HTTP API on port+1.
   * Disabled by default to avoid port conflicts in tests.
   */
  enablePeerApi?: boolean;
}

// ─── Event map ───────────────────────────────────────────────────────────────

export type BridgeServerEventMap = {
  listening: [port: number];
  connection: [clientId: string];
  disconnection: [clientId: string];
  error: [err: Error];
};

// ─── Protocol messages ───────────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: unknown;
}

export type TypedMessageType =
  | "CHAT"
  | "BASH"
  | "FILE_EDIT"
  | "A2A_REQUEST"
  | "MODULE_INSTALL"
  | "INSTALL_MODULE"
  | "CHANGE_SKIN";

export interface TypedMessage {
  type: TypedMessageType;
  id: string;
  [key: string]: unknown;
}

// ─── Session state ───────────────────────────────────────────────────────────

export interface SessionState {
  clientId: string;
  githubLogin: string | undefined;
  githubToken: string | undefined;
  connectedAt: Date;
}
