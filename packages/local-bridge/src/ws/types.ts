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
import type { SkillLoader } from "../skills/loader.js";
import type { SkillDecisionTree } from "../skills/decision-tree.js";
import type { HandoffProcessor } from "../handoff/processor.js";
import type { SettingsManager } from "../settings/index.js";
import type { Analytics } from "../analytics/index.js";
import type { LLMRouter } from "../llm/index.js";
import type { ConversationMemory } from "../brain/conversation-memory.js";
import type { PersonalityManager } from "../personality/index.js";
import type { TenantRegistry } from "../multi-tenant/tenant-registry.js";
import type { TenantBridge } from "../multi-tenant/tenant-bridge.js";

// Forward declaration for Bridge to avoid circular dependency
export interface BridgeLike {}

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
  /** Skill loader — manages skill cartridges */
  skillLoader: SkillLoader | undefined;
  /** Decision tree — zero-shot skill discovery */
  decisionTree: SkillDecisionTree | undefined;
  /** Handoff processor — enables inter-module delegation */
  handoffProcessor?: HandoffProcessor;
  /** Bridge instance — provides access to assembly and other bridge-level data */
  bridge?: BridgeLike;
  /** Settings manager — manages bridge settings */
  settingsManager?: SettingsManager;
  /** Analytics — tracks usage, metrics, and exports */
  analytics?: Analytics;
  /** LLM router — direct LLM provider integration */
  llmRouter?: LLMRouter;
  /** Conversation memory — fact extraction and context injection */
  conversationMemory?: ConversationMemory;
  /** Personality manager — agent personality customization */
  personalityManager?: PersonalityManager;
  /** Tenant registry — multi-tenant brain isolation */
  tenantRegistry?: TenantRegistry;
  /** Tenant bridge — tenant-scoped brain contexts */
  tenantBridge?: TenantBridge;
  /** Request queue — LLM request queue with backpressure */
  requestQueue?: import('../queue/index.js').RequestQueue;
  /** Mode switcher — detects agent mode from request context */
  modeSwitcher?: import('../publishing/mode-switcher.js').ModeSwitcher;
}

// ─── Event map ───────────────────────────────────────────────────────────────

export type BridgeServerEventMap = {
  listening: [port: number];
  connection: [clientId: string];
  disconnection: [clientId: string];
  error: [err: Error];
  'health-change': [status: import('../health/index.js').SystemHealthStatus];
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
  | "CHAT_STREAM"
  | "BASH"
  | "FILE_EDIT"
  | "A2A_REQUEST"
  | "MODULE_INSTALL"
  | "INSTALL_MODULE"
  | "CHANGE_SKIN"
  | "RUN_TESTS"
  | "GENERATE_TESTS"
  | "TEST_STATUS"
  | "BROWSER"
  | "STREAMING_DIFF_START"
  | "STREAMING_DIFF_CHUNK"
  | "STREAMING_DIFF_STATUS"
  | "STREAMING_DIFF_FINALIZE"
  | "STREAMING_DIFF_ROLLBACK"
  | "GET_SETTINGS"
  | "UPDATE_SETTINGS"
  | "MEMORY_LIST"
  | "MEMORY_ADD"
  | "MEMORY_DELETE"
  | "WIKI_LIST"
  | "WIKI_READ"
  | "SOUL_GET"
  | "FLEET_JOIN"
  | "FLEET_SUBMIT_TASK"
  | "FLEET_TASK_STATUS"
  | "FLEET_LIST_AGENTS"
  | "FLEET_HEARTBEAT"
  | "QUEUE_STATUS"
  | "QUEUE_CANCEL";

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
