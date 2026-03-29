/**
 * Handler interface for typed WebSocket messages.
 *
 * Each handler is a plain function (not a class method). It receives:
 *   - ws:  the WebSocket connection to send responses to
 *   - msg: the parsed TypedMessage
 *   - ctx: a HandlerContext with all services the handler might need
 *
 * Handlers are async and may throw — the dispatcher catches and sends
 * an error frame automatically.
 */

import type { WebSocket } from "ws";
import type { TypedMessage } from "../ws/types.js";
import type { AgentRouter } from "../agents/router.js";
import type { AgentSpawner } from "../agents/spawner.js";
import type { GitSync } from "../git/sync.js";
import type { BridgeConfig } from "../config/types.js";
import type { CloudAdapterRegistry } from "../CloudAdapter.js";
import type { Brain } from "../brain/index.js";
import type { ModuleManager } from "../modules/manager.js";
import type { AuditLogger } from "../security/audit.js";
import type { ChatRouter } from "../ws/chat-router.js";
import type { Sender } from "../ws/send.js";
import type { TokenTracker } from "../metrics/token-tracker.js";
import type { SkillLoader } from "../skills/loader.js";
import type { SkillDecisionTree } from "../skills/decision-tree.js";
import type { RepoGraph } from "../graph/index.js";
import type { HandoffProcessor } from "../handoff/processor.js";
import type { SettingsManager } from "../settings/index.js";
import type { Analytics } from "../analytics/index.js";
import type { LLMRouter } from "../llm/index.js";
import type { PersonalityManager } from "../personality/index.js";
import type { RequestQueue } from "../queue/index.js";
import type { TenantRegistry } from "../multi-tenant/tenant-registry.js";
import type { TenantBridge } from "../multi-tenant/tenant-bridge.js";

// Forward declaration for Bridge to avoid circular dependency
export interface BridgeLike {
  getAssembly(): {
    success: boolean;
    profile: {
      language: string;
      framework: string | undefined;
      packageManager: string;
      hasTests: boolean;
      hasCI: boolean;
      testCommand: string;
      buildCommand: string | undefined;
      entryPoints: string[];
      totalFiles: number;
      totalDirs: number;
    };
    template: {
      template: string;
      confidence: number;
      modules: string[];
      personality: string;
      displayName: string;
      description: string;
    };
    modules: string[];
    skills: string[];
    config: Record<string, unknown>;
    duration: number;
    error?: string;
  } | undefined;
}

/**
 * Everything a handler needs to do its job.
 * Passed by reference — handlers must NOT mutate config.
 */
export interface HandlerContext {
  readonly config: BridgeConfig;
  readonly router: AgentRouter;
  readonly spawner: AgentSpawner;
  readonly sync: GitSync;
  readonly repoRoot: string;
  readonly audit: AuditLogger;
  readonly chatRouter: ChatRouter;
  readonly sender: Sender;

  // Optional services (may be undefined)
  readonly brain: Brain | undefined;
  readonly cloudAdapters: CloudAdapterRegistry | undefined;
  readonly fleetKey: string | undefined;
  readonly tokenTracker: TokenTracker | undefined;
  readonly skillLoader: SkillLoader | undefined;
  readonly decisionTree: SkillDecisionTree | undefined;
  readonly repoGraph: RepoGraph | undefined;
  readonly handoffProcessor: HandoffProcessor | undefined;
  readonly bridge: BridgeLike | undefined;
  readonly settingsManager: SettingsManager | undefined;
  readonly analytics: Analytics | undefined;
  readonly llmRouter: LLMRouter | undefined;
  readonly personalityManager: PersonalityManager | undefined;
  readonly tenantRegistry: TenantRegistry | undefined;
  readonly tenantBridge: TenantBridge | undefined;
  readonly requestQueue: RequestQueue | undefined;

  // Mutable — lazily created
  getModuleManager(): ModuleManager;

  // Broadcast to all connected clients
  broadcast(payload: Record<string, unknown>): void;
}

/**
 * A typed message handler function.
 * Returns void — all responses are sent via ctx.sender.
 */
export type TypedHandler = (
  ws: WebSocket,
  clientId: string,
  msg: TypedMessage,
  ctx: HandlerContext,
) => Promise<void>;
