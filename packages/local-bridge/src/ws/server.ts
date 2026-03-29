/**
 * BridgeServer — authenticated WebSocket server for the local bridge.
 *
 * Authentication:
 *   Connections must include a GitHub PAT as a query parameter:
 *     ws://localhost:8787?token=ghp_...
 *   The token is validated against the GitHub API (/user endpoint).
 *   Invalid tokens receive a 401 close frame.
 *
 * Two parallel message protocols are supported:
 *   1. JSON-RPC 2.0  { "jsonrpc": "2.0", "method": "bridge/status", ... }
 *      → bridge/*, mcp/<agentId>/*, a2a/*
 *
 *   2. Typed messages { "type": "CHAT" | "BASH" | "FILE_EDIT" | "A2A_REQUEST", ... }
 *      → handled by dedicated streaming handlers that push multiple responses
 */

import { WebSocketServer, WebSocket } from "ws";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "http";
import { EventEmitter } from "events";
import type { AgentRouter } from "../agents/router.js";
import type { AgentSpawner } from "../agents/spawner.js";
import type { GitSync } from "../git/sync.js";
import type { BridgeConfig } from "../config/types.js";
import type { CloudAdapterRegistry } from "../CloudAdapter.js";
import type { Brain } from "../brain/index.js";
import { ModuleManager } from "../modules/manager.js";
import { AuditLogger } from "../security/audit.js";
import { authenticateConnection } from "../security/auth-handler.js";
import { ChatRouter } from "./chat-router.js";
import { ChatHandler } from "../handlers/chat-handler.js";
import { createSender, type Sender } from "./send.js";
import { attachDispatcher, type HandlerRegistry } from "./dispatcher.js";
import type {
  BridgeServerOptions,
  BridgeServerEventMap,
  JsonRpcRequest,
  TypedMessage,
  SessionState,
} from "./types.js";
import type { HandlerContext } from "../handlers/types.js";
import { handleBash } from "../handlers/bash.js";
import { handleFileEdit } from "../handlers/file.js";
import { handleA2aRequest } from "../handlers/a2a.js";
import { handleModuleInstall } from "../handlers/module.js";
import { handleChangeSkin } from "../handlers/skin.js";
import { handleHttpPeerRequest } from "../handlers/peer.js";
import { handleRunTests, handleGenerateTests, handleTestStatus } from "../handlers/test.js";
import { HealthChecker, checkGit, checkBrain, checkDisk, checkWebSocket, type SystemHealthStatus } from "../health/index.js";
import { createOfflineQueue, OfflineQueue } from "../cloud-bridge/offline-queue.js";
import { TokenTracker } from "../metrics/token-tracker.js";
import { RepoGraph } from "../graph/index.js";
import { handleSkillList, handleSkillLoad, handleSkillUnload, handleSkillMatch, handleSkillContext, handleSkillStats } from "../handlers/skills.js";
import { handleTreeSearch, handleTreeSearchStatus } from "../handlers/tree-search.js";
import { handleGraphQuery, handleGraphStats } from "../handlers/graph.js";
import { handleTokenStats, handleTokenEfficiency, handleTokenWaste } from "../handlers/metrics.js";
import { handleBrowser } from "../handlers/browser.js";
import {
  handleStreamingDiffStart,
  handleStreamingDiffChunk,
  handleStreamingDiffStatus,
  handleStreamingDiffFinalize,
  handleStreamingDiffRollback,
} from "../handlers/streaming-diff.js";
import {
  handleCloudStatus,
  handleCloudSubmitTask,
  handleCloudTaskResult,
} from "../handlers/cloud.js";
import type { CloudConnector } from "../cloud-bridge/connector.js";
import { SettingsManager } from "../settings/index.js";
import { handleChatStream } from "../handlers/llm.js";
import { handleMemoryListTyped, handleMemoryAddTyped, handleMemoryDeleteTyped, handleWikiListTyped, handleWikiReadTyped, handleSoulGetTyped } from "../handlers/memory.js";
import { handleFleetJoin, handleFleetSubmitTask, handleFleetTaskStatus, handleFleetListAgents, handleFleetHeartbeat } from "../handlers/fleet.js";
import { handleQueueStatus, handleQueueCancel } from "../handlers/queue.js";

// Re-export types for backward compatibility
export type { BridgeServerOptions, BridgeServerEventMap, TypedMessage, JsonRpcRequest, SessionState };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

let clientCounter = 0;

// ---------------------------------------------------------------------------
// BridgeServer
// ---------------------------------------------------------------------------

export class BridgeServer extends EventEmitter<BridgeServerEventMap> {
  private wss:           WebSocketServer | null = null;
  private httpSrv:       ReturnType<typeof createHttpServer> | null = null;
  private options:       BridgeServerOptions;
  private sessions =     new Map<string, SessionState>();
  private audit:         AuditLogger;
  private chatRouter:    ChatRouter;
  private chatHandler:   ChatHandler;
  private sender:        Sender;
  private handlerCtx:    HandlerContext;
  private handlerRegistry: HandlerRegistry;
  private healthChecker: HealthChecker;
  private offlineQueue:  OfflineQueue;
  private tokenTracker:  TokenTracker;
  private settingsManager: SettingsManager;
  private healthInterval?: ReturnType<typeof setInterval>;

  constructor(options: BridgeServerOptions) {
    super();
    this.options    = options;
    this.audit      = new AuditLogger(options.repoRoot);
    this.chatRouter = new ChatRouter();
    this.sender     = createSender();

    // Initialize RepoGraph if not provided
    const repoGraph = options.repoGraph || new RepoGraph(options.repoRoot);

    // Initialize HealthChecker with standard checks
    this.healthChecker = new HealthChecker();
    this.setupHealthChecks(repoGraph);

    // Initialize OfflineQueue
    this.offlineQueue = new OfflineQueue(options.repoRoot);
    this.offlineQueue.load().catch((err) => {
      console.error('[bridge] Failed to load offline queue:', err);
    });

    // Initialize TokenTracker
    this.tokenTracker = new TokenTracker({ maxRecords: 10000 });

    // Initialize SettingsManager
    this.settingsManager = new SettingsManager();
    this.settingsManager.load().catch((err) => {
      console.error('[bridge] Failed to load settings:', err);
    });

    // Build HandlerContext with all services
    this.handlerCtx = this.buildHandlerContext(repoGraph);

    // Build HandlerRegistry with all typed message handlers
    this.handlerRegistry = new Map([
      ["CHAT", async (ws, clientId, msg, ctx) => this.chatHandler.handle(ws, clientId, msg)],
      ["CHAT_STREAM", handleChatStream],
      ["BASH", handleBash],
      ["FILE_EDIT", handleFileEdit],
      ["A2A_REQUEST", handleA2aRequest],
      ["MODULE_INSTALL", handleModuleInstall],
      ["INSTALL_MODULE", handleModuleInstall],
      ["CHANGE_SKIN", handleChangeSkin],
      ["RUN_TESTS", handleRunTests],
      ["GENERATE_TESTS", handleGenerateTests],
      ["TEST_STATUS", handleTestStatus],
      ["BROWSER", handleBrowser],
      ["STREAMING_DIFF_START", handleStreamingDiffStart],
      ["STREAMING_DIFF_CHUNK", handleStreamingDiffChunk],
      ["STREAMING_DIFF_STATUS", handleStreamingDiffStatus],
      ["STREAMING_DIFF_FINALIZE", handleStreamingDiffFinalize],
      ["STREAMING_DIFF_ROLLBACK", handleStreamingDiffRollback],
      ["CLOUD_STATUS", handleCloudStatus],
      ["CLOUD_SUBMIT_TASK", handleCloudSubmitTask],
      ["CLOUD_TASK_RESULT", handleCloudTaskResult],
      ["MEMORY_LIST", handleMemoryListTyped],
      ["MEMORY_ADD", handleMemoryAddTyped],
      ["MEMORY_DELETE", handleMemoryDeleteTyped],
      ["WIKI_LIST", handleWikiListTyped],
      ["WIKI_READ", handleWikiReadTyped],
      ["SOUL_GET", handleSoulGetTyped],
      ["FLEET_JOIN", handleFleetJoin],
      ["FLEET_SUBMIT_TASK", handleFleetSubmitTask],
      ["FLEET_TASK_STATUS", handleFleetTaskStatus],
      ["FLEET_LIST_AGENTS", handleFleetListAgents],
      ["FLEET_HEARTBEAT", handleFleetHeartbeat],
      ["QUEUE_STATUS", handleQueueStatus],
      ["QUEUE_CANCEL", handleQueueCancel],
    ]);

    // ChatHandler needs broadcast and moduleManager
    this.chatHandler = new ChatHandler({
      router:        options.router,
      spawner:       options.spawner,
      config:        options.config,
      moduleManager: this.handlerCtx.getModuleManager(),
      chatRouter:    this.chatRouter,
      broadcast:     (payload) => this.broadcastToAll(payload),
      tokenTracker:  this.tokenTracker,
      skillLoader:   options.skillLoader,
      decisionTree:  options.decisionTree,
      ...(options.cloudAdapters !== undefined ? { cloudAdapters: options.cloudAdapters } : {}),
      ...(options.brain        !== undefined ? { brain:        options.brain        } : {}),
      ...(options.fleetKey     !== undefined ? { fleetKey:     options.fleetKey     } : {}),
      ...(options.conversationMemory !== undefined ? { conversationMemory: options.conversationMemory } : {}),
    });

    // Build graph asynchronously (non-blocking)
    setImmediate(async () => {
      try {
        await repoGraph.initialize();
        await repoGraph.build();
        console.info('[bridge] Repo graph built successfully');
      } catch (error) {
        console.error('[bridge] Failed to build repo graph:', error);
      }
    });
  }

  /**
   * Setup standard health checks
   */
  private setupHealthChecks(repoGraph: RepoGraph): void {
    const port = this.options.config.config.port;

    // Git repository check
    this.healthChecker.addCheck('git', checkGit(this.options.repoRoot));

    // Brain/facts check
    const factsPath = 'cocapn/memory/facts.json';
    this.healthChecker.addCheck('brain', checkBrain(this.options.repoRoot, factsPath));

    // Disk write check
    this.healthChecker.addCheck('disk', checkDisk(this.options.repoRoot));

    // WebSocket server check
    this.healthChecker.addCheck('websocket', checkWebSocket(port));

    // Repo graph check
    this.healthChecker.addCheck('graph', async () => {
      try {
        const stats = await repoGraph.stats();
        if (stats.nodes === 0) {
          return { status: 'degraded', message: 'Graph not built yet' };
        }
        return { status: 'healthy', message: `Graph has ${stats.nodes} nodes` };
      } catch (error) {
        return { status: 'unhealthy', message: error instanceof Error ? error.message : String(error) };
      }
    });

    // Skills check
    this.healthChecker.addCheck('skills', () => {
      const skillCount = this.options.skillLoader?.stats().total || 0;
      if (skillCount === 0) {
        return { status: 'degraded', message: 'No skills registered' };
      }
      return { status: 'healthy', message: `${skillCount} skills registered` };
    });

    // Cloud connectivity check (optional)
    this.healthChecker.addCheck('cloud', async () => {
      const cloudConnector = (this.options.bridge as any)?.cloudConnector as CloudConnector | undefined;
      if (!cloudConnector) {
        return { status: 'degraded', message: 'Cloud connector not configured' };
      }

      const status = await cloudConnector.getStatus();
      if (!status.connected) {
        return { status: 'unhealthy', message: status.error || 'Cloud worker unreachable' };
      }

      return { status: 'healthy', message: `Connected to ${status.workerUrl} (${status.latency}ms latency)` };
    });
  }

  /**
   * Build the HandlerContext that all handlers need.
   * This provides access to all services without passing 8+ parameters.
   */
  private buildHandlerContext(repoGraph: RepoGraph): HandlerContext {
    const moduleManagerRef = { current: this.options.moduleManager };

    return {
      config: this.options.config,
      router: this.options.router,
      spawner: this.options.spawner,
      sync: this.options.sync,
      repoRoot: this.options.repoRoot,
      audit: this.audit,
      chatRouter: this.chatRouter,
      sender: this.sender,
      brain: this.options.brain,
      cloudAdapters: this.options.cloudAdapters,
      fleetKey: this.options.fleetKey,
      tokenTracker: this.tokenTracker,
      skillLoader: this.options.skillLoader,
      decisionTree: this.options.decisionTree,
      repoGraph,
      bridge: this.options.bridge,
      settingsManager: this.settingsManager,
      analytics: this.options.analytics,
      llmRouter: this.options.llmRouter,
      personalityManager: this.options.personalityManager,
      tenantRegistry: this.options.tenantRegistry,
      tenantBridge: this.options.tenantBridge,
      requestQueue: this.options.requestQueue,
      getModuleManager: () => {
        if (!moduleManagerRef.current) {
          moduleManagerRef.current = new ModuleManager(this.options.repoRoot);
        }
        return moduleManagerRef.current;
      },
      broadcast: (payload) => this.broadcastToAll(payload),
    };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  start(): void {
    const port = this.options.config.config.port;

    // ── HTTP server for A2A peer API endpoints (opt-in) ──────────────────────
    if (this.options.enablePeerApi) {
      this.httpSrv = createHttpServer((req, res) => {
        this.handleHttpRequest(req, res).catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          res.writeHead(500).end(JSON.stringify({ error: msg }));
        });
      });
      this.httpSrv.listen(port + 1, () => {
        console.info(`[bridge] HTTP peer API listening on http://localhost:${port + 1}`);
      });
    }

    // ── WebSocket server (shares same port base) ──────────────────────────────
    this.wss = new WebSocketServer({ server: undefined, port });

    this.wss.on("listening", () => {
      this.emit("listening", port);
      console.info(`[bridge] WebSocket server listening on ws://localhost:${port}`);
    });

    this.wss.on(
      "connection",
      (ws: WebSocket, req: IncomingMessage) => {
        const clientId = `client-${++clientCounter}`;
        this.authenticateAndConnect(ws, req, clientId).catch((err) => {
          console.error(`[bridge] Auth error for ${clientId}:`, err);
          ws.close(1011, "Internal error");
        });
      }
    );

    this.wss.on("error", (err: Error) => {
      this.emit("error", err);
      console.error("[bridge] WebSocket server error:", err);
    });
  }

  /**
   * Broadcast a shutdown event to all connected WebSocket clients,
   * then close the server gracefully.
   */
  async shutdown(): Promise<void> {
    if (!this.wss) return;
    // Send shutdown event to all clients before terminating
    for (const client of this.wss.clients) {
      try {
        client.send(JSON.stringify({ type: "SHUTDOWN", message: "Bridge is shutting down" }));
      } catch {
        // Client may already be disconnected
      }
    }
    // Brief grace period for clients to receive the event
    await new Promise((r) => setTimeout(r, 100));
    await this.stop();
  }

  async stop(): Promise<void> {
    if (!this.wss) return;
    for (const client of this.wss.clients) {
      client.terminate();
    }
    await new Promise<void>((resolve, reject) => {
      this.wss!.close((err) => (err ? reject(err) : resolve()));
    });
    this.wss = null;
    this.httpSrv?.close();
    this.httpSrv = null;
    this.sessions.clear();
  }

  // ---------------------------------------------------------------------------
  // A2A Peer HTTP API (2.5)
  // ---------------------------------------------------------------------------

  /**
   * HTTP request handler for A2A peer discovery and fact query endpoints.
   * Delegates to the peer handler.
   *
   *   GET /.well-known/cocapn/peer   → peer card (domain, capabilities, publicKey)
   *   GET /api/peer/fact?key=<k>     → { key, value } from Brain facts
   *   GET /api/peer/facts            → all facts (requires fleet JWT)
   *   GET /health                    → health status JSON
   */
  private async handleHttpRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const url = req.url || '';

    // Handle health check endpoint
    if (url === '/health') {
      const health = await this.getHealthStatus();
      const statusCode = health.status === 'unhealthy' ? 503 :
                        health.status === 'degraded' ? 200 : 200;
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(health, null, 2));
      return;
    }

    // Handle multi-tenant API endpoints
    if (url.startsWith('/api/tenant/')) {
      await this.handleTenantHttpRequest(req, res, url);
      return;
    }

    // Handle A2A peer endpoints
    await handleHttpPeerRequest(req, res, this.handlerCtx);
  }

  // ---------------------------------------------------------------------------
  // Multi-tenant HTTP API
  // ---------------------------------------------------------------------------

  /**
   * HTTP endpoints for multi-tenant management.
   *
   *   GET  /api/tenant/list           → list all tenants
   *   GET  /api/tenant/:id            → get tenant by ID
   *   POST /api/tenant/create         → create a new tenant
   *   PUT  /api/tenant/:id            → update tenant
   *   DEL  /api/tenant/:id            → delete tenant
   *   GET  /api/tenant/:id/status     → tenant status
   *   GET  /api/tenant/:id/usage      → tenant usage
   *   POST /api/tenant/:id/chat       → chat with tenant brain
   *
   * All endpoints accept X-Tenant-ID header for tenant identification.
   */
  private async handleTenantHttpRequest(
    req: IncomingMessage,
    res: ServerResponse,
    url: string,
  ): Promise<void> {
    const setJson = (code: number, body: unknown) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };

    const registry = this.options.tenantRegistry;
    const tBridge = this.options.tenantBridge;

    if (!registry) {
      setJson(503, { error: "Multi-tenancy not enabled" });
      return;
    }

    // Parse URL path
    const path = url.replace("/api/tenant/", "");
    const segments = path.split("/").filter(Boolean);
    const method = req.method || "GET";

    try {
      // GET /api/tenant/list
      if (segments[0] === "list" && method === "GET") {
        const tenants = await registry.listTenants();
        setJson(200, { tenants, count: tenants.length });
        return;
      }

      // Extract tenant ID from path or header
      const tenantId = segments[0] || req.headers["x-tenant-id"] as string | undefined;

      // POST /api/tenant/create
      if (segments[0] === "create" && method === "POST") {
        const body = await readBody(req);
        const data = JSON.parse(body) as Record<string, unknown>;
        if (!data.name || typeof data.name !== "string") {
          setJson(400, { error: "Missing required field: name" });
          return;
        }
        const tenant = await registry.createTenant({
          name: data.name,
          ...(data.plan !== undefined ? { plan: data.plan as "free" | "pro" | "enterprise" } : {}),
          ...(data.config !== undefined ? { config: data.config as Partial<import("../multi-tenant/types.js").TenantConfig> } : {}),
          ...(data.allowedOrigins !== undefined ? { allowedOrigins: data.allowedOrigins as string[] } : {}),
        });
        if (tBridge) {
          await tBridge.initializeTenant(tenant.id);
        }
        setJson(201, { ok: true, tenant });
        return;
      }

      if (!tenantId) {
        setJson(400, { error: "Tenant ID required" });
        return;
      }

      // GET /api/tenant/:id
      if (segments.length === 1 && method === "GET") {
        const tenant = await registry.getTenant(tenantId);
        if (!tenant) {
          setJson(404, { error: `Tenant not found: ${tenantId}` });
          return;
        }
        setJson(200, tenant);
        return;
      }

      // PUT /api/tenant/:id
      if (segments.length === 1 && method === "PUT") {
        const body = await readBody(req);
        const data = JSON.parse(body) as Record<string, unknown>;
        const updates: Record<string, unknown> = {};
        if (data.name !== undefined) updates.name = data.name;
        if (data.plan !== undefined) updates.plan = data.plan;
        if (data.config !== undefined) updates.config = data.config;
        if (data.allowedOrigins !== undefined) updates.allowedOrigins = data.allowedOrigins;
        const updated = await registry.updateTenant(tenantId, updates as Parameters<typeof registry.updateTenant>[1]);
        setJson(200, { ok: true, tenant: updated });
        return;
      }

      // DELETE /api/tenant/:id
      if (segments.length === 1 && method === "DELETE") {
        await registry.deleteTenant(tenantId);
        if (tBridge) tBridge.disposeContext(tenantId);
        setJson(200, { ok: true });
        return;
      }

      // GET /api/tenant/:id/status
      if (segments[1] === "status" && method === "GET") {
        if (!tBridge) {
          setJson(503, { error: "Multi-tenancy not enabled" });
          return;
        }
        const status = await tBridge.getStatus(tenantId);
        setJson(200, { ok: true, ...status });
        return;
      }

      // GET /api/tenant/:id/usage
      if (segments[1] === "usage" && method === "GET") {
        const usage = await registry.getUsage(tenantId);
        setJson(200, { ok: true, usage });
        return;
      }

      // POST /api/tenant/:id/chat
      if (segments[1] === "chat" && method === "POST") {
        if (!tBridge) {
          setJson(503, { error: "Multi-tenancy not enabled" });
          return;
        }
        const body = await readBody(req);
        const data = JSON.parse(body) as Record<string, unknown>;
        if (!data.message || typeof data.message !== "string") {
          setJson(400, { error: "Missing required field: message" });
          return;
        }
        const response = await tBridge.chat(tenantId, data.message);
        setJson(200, { ok: true, response });
        return;
      }

      setJson(404, { error: "Not found" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = message.includes("not found") ? 404 : 500;
      setJson(code, { error: message });
    }
  }

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  private async authenticateAndConnect(
    ws: WebSocket,
    req: IncomingMessage,
    clientId: string
  ): Promise<void> {
    const authResult = await authenticateConnection(ws, req, {
      skipAuth: this.options.skipAuth,
      fleetKey: this.options.fleetKey,
      audit: this.audit,
      onGithubToken: (token) => this.options.cloudAdapters?.setGitHubToken(token),
    });

    if (!authResult) {
      // WebSocket already closed by authenticateConnection
      return;
    }

    const { githubLogin, githubToken } = authResult;

    this.sessions.set(clientId, {
      clientId,
      githubLogin,
      githubToken,
      connectedAt: new Date(),
    });

    this.emit("connection", clientId);
    this.handleConnection(ws, clientId);
  }

  // ---------------------------------------------------------------------------
  // Connection handler
  // ---------------------------------------------------------------------------

  private handleConnection(ws: WebSocket, clientId: string): void {
    // Send initial bridge status
    this.sender.result(ws, null, this.getBridgeStatus());

    // Attach the dispatcher to handle all subsequent messages
    attachDispatcher(ws, clientId, this.handlerRegistry, this.handlerCtx);

    // Emit connection event for listeners
    this.emit("connection", clientId);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Broadcast a payload to all connected WebSocket clients.
   * Used by handlers via ctx.broadcast().
   */
  private broadcastToAll(payload: Record<string, unknown>): void {
    if (!this.wss) return;
    this.sender.broadcast(this.wss, payload);
  }

  private getBridgeStatus(): Record<string, unknown> {
    return {
      version: "0.1.0",
      mode: this.options.config.config.mode,
      port: this.options.config.config.port,
      agentCount: this.options.spawner.getAll().length,
      sessionCount: this.sessions.size,
      uptime: process.uptime(),
    };
  }

  // ---------------------------------------------------------------------------
  // Health Check API
  // ---------------------------------------------------------------------------

  /**
   * Get the current health status of the bridge
   */
  async getHealthStatus(): Promise<SystemHealthStatus> {
    return this.healthChecker.runAll();
  }

  /**
   * Get the HealthChecker instance for custom checks
   */
  getHealthChecker(): HealthChecker {
    return this.healthChecker;
  }

  /**
   * Start periodic health checks (emits events on status change)
   * @param intervalMs - Check interval in milliseconds (default: 30000)
   */
  startHealthMonitoring(intervalMs: number = 30000): void {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
    }

    let lastStatus: 'healthy' | 'degraded' | 'unhealthy' | null = null;

    this.healthInterval = setInterval(async () => {
      const health = await this.getHealthStatus();

      if (lastStatus !== health.status) {
        this.emit('health-change', health);
        lastStatus = health.status;
      }
    }, intervalMs);
  }

  /**
   * Stop periodic health monitoring
   */
  stopHealthMonitoring(): void {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Offline Queue API
  // ---------------------------------------------------------------------------

  /**
   * Get the offline queue instance
   */
  getOfflineQueue(): OfflineQueue {
    return this.offlineQueue;
  }

  /**
   * Process pending offline queue operations
   */
  async flushOfflineQueue(): Promise<{ succeeded: number; failed: number; remaining: number }> {
    const stats = this.offlineQueue.getStats();

    if (stats.ready === 0) {
      return { succeeded: 0, failed: 0, remaining: stats.total };
    }

    // Define operation executor based on operation type
    const executor = async (op: import('../cloud-bridge/offline-queue.js').QueuedOperation) => {
      // Operations will be executed based on their type
      // This is a placeholder - actual implementation depends on the operation type
      switch (op.type) {
        case 'chat':
        case 'complete':
          // These would be retried via the cloud bridge
          throw new Error('Cloud operation not yet implemented');
        case 'fact_set':
          if (!this.options.brain) {
            throw new Error('Brain not available');
          }
          const { key, value } = op.payload as { key: string; value: string };
          await this.options.brain.setFact(key, value);
          break;
        case 'wiki_update':
          // Wiki updates would be retried here
          throw new Error('Wiki update not yet implemented');
        case 'a2a_send':
          // A2A messages would be retried here
          throw new Error('A2A send not yet implemented');
        default:
          throw new Error(`Unknown operation type: ${(op as any).type}`);
      }
    };

    return this.offlineQueue.retryAll(executor);
  }

  /**
   * Get offline queue statistics
   */
  getOfflineQueueStats(): ReturnType<OfflineQueue['getStats']> {
    return this.offlineQueue.getStats();
  }

  // ---------------------------------------------------------------------------
  // Token Tracker API
  // ---------------------------------------------------------------------------

  /**
   * Get the TokenTracker instance
   */
  getTokenTracker(): TokenTracker {
    return this.tokenTracker;
  }

  /**
   * Get token statistics for a time period
   */
  async getTokenStats(since?: Date, until?: Date): Promise<ReturnType<TokenTracker['getStats']>> {
    return this.tokenTracker.getStats(since, until);
  }

  /**
   * Get efficiency trend over time
   */
  async getTokenEfficiency(buckets: number = 24): Promise<ReturnType<TokenTracker['getEfficiencyTrend']>> {
    return this.tokenTracker.getEfficiencyTrend(buckets);
  }

  /**
   * Find and report token waste
   */
  async findTokenWaste(): Promise<ReturnType<TokenTracker['findWaste']>> {
    return this.tokenTracker.findWaste();
  }
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
