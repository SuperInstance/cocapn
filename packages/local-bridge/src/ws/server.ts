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
import { HealthChecker, checkGit, checkBrain, checkDisk, checkWebSocket, type SystemHealthStatus } from "../health/index.js";
import { createOfflineQueue, type OfflineQueue } from "../cloud-bridge/offline-queue.js";

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
  private healthInterval?: ReturnType<typeof setInterval>;

  constructor(options: BridgeServerOptions) {
    super();
    this.options    = options;
    this.audit      = new AuditLogger(options.repoRoot);
    this.chatRouter = new ChatRouter();
    this.sender     = createSender();

    // Initialize HealthChecker with standard checks
    this.healthChecker = new HealthChecker();
    this.setupHealthChecks();

    // Initialize OfflineQueue
    this.offlineQueue = new OfflineQueue(options.repoRoot);
    this.offlineQueue.load().catch((err) => {
      console.error('[bridge] Failed to load offline queue:', err);
    });

    // Build HandlerContext with all services
    this.handlerCtx = this.buildHandlerContext();

    // Build HandlerRegistry with all typed message handlers
    this.handlerRegistry = new Map([
      ["CHAT", async (ws, clientId, msg, ctx) => this.chatHandler.handle(ws, clientId, msg)],
      ["BASH", handleBash],
      ["FILE_EDIT", handleFileEdit],
      ["A2A_REQUEST", handleA2aRequest],
      ["MODULE_INSTALL", handleModuleInstall],
      ["INSTALL_MODULE", handleModuleInstall],
      ["CHANGE_SKIN", handleChangeSkin],
    ]);

    // ChatHandler needs broadcast and moduleManager
    this.chatHandler = new ChatHandler({
      router:        options.router,
      spawner:       options.spawner,
      config:        options.config,
      moduleManager: this.handlerCtx.getModuleManager(),
      chatRouter:    this.chatRouter,
      broadcast:     (payload) => this.broadcastToAll(payload),
      ...(options.cloudAdapters !== undefined ? { cloudAdapters: options.cloudAdapters } : {}),
      ...(options.brain        !== undefined ? { brain:        options.brain        } : {}),
      ...(options.fleetKey     !== undefined ? { fleetKey:     options.fleetKey     } : {}),
    });
  }

  /**
   * Setup standard health checks
   */
  private setupHealthChecks(): void {
    const port = this.options.config.config.port;

    // Git repository check
    this.healthChecker.addCheck('git', checkGit(this.options.repoRoot));

    // Brain/facts check
    const factsPath = this.options.config.config.facts || 'cocapn/memory/facts.json';
    this.healthChecker.addCheck('brain', checkBrain(this.options.repoRoot, factsPath));

    // Disk write check
    this.healthChecker.addCheck('disk', checkDisk(this.options.repoRoot));

    // WebSocket server check
    this.healthChecker.addCheck('websocket', checkWebSocket(port));
  }

  /**
   * Build the HandlerContext that all handlers need.
   * This provides access to all services without passing 8+ parameters.
   */
  private buildHandlerContext(): HandlerContext {
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

    // Handle A2A peer endpoints
    await handleHttpPeerRequest(req, res, this.handlerCtx);
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
}
