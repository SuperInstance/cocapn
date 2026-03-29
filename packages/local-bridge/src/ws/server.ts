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

import { WebSocketServer, WebSocket, type RawData } from "ws";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "http";
import { EventEmitter } from "events";
import { exec } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import type { AgentRouter } from "../agents/router.js";
import type { AgentSpawner } from "../agents/spawner.js";
import type { GitSync } from "../git/sync.js";
import type { BridgeConfig } from "../config/types.js";
import type { CloudAdapterRegistry } from "../CloudAdapter.js";
import type { Brain } from "../brain/index.js";
import { ModuleManager } from "../modules/manager.js";
import { AuditLogger } from "../security/audit.js";
import { verifyJwt } from "../security/jwt.js";
import { ChatRouter } from "./chat-router.js";
import { sanitizeRepoPath, SanitizationError } from "../utils/path-sanitizer.js";
import { ChatHandler } from "../handlers/chat-handler.js";
import type {
  BridgeServerOptions,
  BridgeServerEventMap,
  JsonRpcRequest,
  TypedMessage,
  SessionState,
} from "./types.js";

// Re-export types for backward compatibility
export type { BridgeServerOptions, BridgeServerEventMap, TypedMessage, JsonRpcRequest, SessionState };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GITHUB_API = "https://api.github.com";
let clientCounter = 0;

// ---------------------------------------------------------------------------
// BridgeServer
// ---------------------------------------------------------------------------

export class BridgeServer extends EventEmitter<BridgeServerEventMap> {
  private wss:         WebSocketServer | null = null;
  private httpSrv:     ReturnType<typeof createHttpServer> | null = null;
  private options:     BridgeServerOptions;
  private sessions =   new Map<string, SessionState>();
  private audit:       AuditLogger;
  private chatRouter:  ChatRouter;
  private chatHandler: ChatHandler;

  constructor(options: BridgeServerOptions) {
    super();
    this.options    = options;
    this.audit      = new AuditLogger(options.repoRoot);
    this.chatRouter = new ChatRouter();
    this.chatHandler = new ChatHandler({
      router:        options.router,
      spawner:       options.spawner,
      config:        options.config,
      moduleManager: this.getModuleManager(),
      chatRouter:    this.chatRouter,
      broadcast:     (payload) => this.broadcastToAll(payload),
      ...(options.cloudAdapters !== undefined ? { cloudAdapters: options.cloudAdapters } : {}),
      ...(options.brain        !== undefined ? { brain:        options.brain        } : {}),
      ...(options.fleetKey     !== undefined ? { fleetKey:     options.fleetKey     } : {}),
    });
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
   *
   *   GET /.well-known/cocapn/peer   → peer card (domain, capabilities, publicKey)
   *   GET /api/peer/fact?key=<k>     → { key, value } from Brain facts
   *   GET /api/peer/facts            → all facts (requires fleet JWT)
   */
  private async handleHttpRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const url = req.url ?? "/";
    const { pathname, searchParams } = new URL(url, "http://localhost");

    // ── Peer discovery card ───────────────────────────────────────────────────
    if (pathname === "/.well-known/cocapn/peer") {
      const card = {
        domain:       this.options.config.config.tunnel ?? `localhost:${this.options.config.config.port}`,
        capabilities: ["chat", "memory", "a2a"],
        publicKey:    this.options.config.encryption.publicKey || null,
        version:      "0.1.0",
      };
      res.writeHead(200).end(JSON.stringify(card));
      return;
    }

    // Remaining endpoints require fleet JWT auth
    if (!this.verifyPeerAuth(req)) {
      res.writeHead(401).end(JSON.stringify({ error: "Unauthorized — fleet JWT required" }));
      return;
    }

    // ── Single fact query ─────────────────────────────────────────────────────
    if (pathname === "/api/peer/fact") {
      const key = searchParams.get("key");
      if (!key) {
        res.writeHead(400).end(JSON.stringify({ error: "Missing key parameter" }));
        return;
      }
      const value = this.options.brain?.getFact(key);
      if (value === undefined) {
        res.writeHead(404).end(JSON.stringify({ error: "Fact not found", key }));
        return;
      }
      res.writeHead(200).end(JSON.stringify({ key, value }));
      return;
    }

    // ── All facts ─────────────────────────────────────────────────────────────
    if (pathname === "/api/peer/facts") {
      const facts = this.options.brain?.getAllFacts() ?? {};
      res.writeHead(200).end(JSON.stringify({ facts }));
      return;
    }

    res.writeHead(404).end(JSON.stringify({ error: "Not found" }));
  }

  /** Verify fleet JWT in Authorization header. Returns true when auth is disabled (skipAuth). */
  private verifyPeerAuth(req: IncomingMessage): boolean {
    if (this.options.skipAuth) return true;
    if (!this.options.fleetKey) return false;

    const auth = req.headers["authorization"] ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    try {
      verifyJwt(token, this.options.fleetKey);
      return true;
    } catch {
      return false;
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
    let githubLogin: string | undefined;
    let githubToken: string | undefined;

    const rawToken = this.extractToken(req.url ?? "");

    if (!this.options.skipAuth) {
      if (!rawToken) {
        this.audit.log({ action: "auth.reject", agent: undefined, user: undefined,
          command: undefined, files: undefined, result: "denied",
          detail: "Missing token", durationMs: undefined });
        ws.close(4001, "Missing token — provide ?token=<github-pat> or ?token=<fleet-jwt>");
        return;
      }

      // ── Fleet JWT auth (starts with "eyJ") ──────────────────────────────
      if (rawToken.startsWith("eyJ") && this.options.fleetKey) {
        try {
          const payload = verifyJwt(rawToken, this.options.fleetKey);
          githubLogin = payload.sub;
          console.info(`[bridge] Fleet JWT authenticated: ${githubLogin} → ${clientId}`);
          this.audit.log({ action: "auth.connect", agent: undefined, user: githubLogin,
            command: undefined, files: undefined, result: "ok",
            detail: "fleet-jwt", durationMs: undefined });
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          this.audit.log({ action: "auth.reject", agent: undefined, user: undefined,
            command: undefined, files: undefined, result: "denied", detail, durationMs: undefined });
          ws.close(4001, "Invalid fleet JWT");
          return;
        }
      } else {
        // ── GitHub PAT auth ────────────────────────────────────────────────
        githubLogin = await this.validateGithubPat(rawToken);
        if (!githubLogin) {
          this.audit.log({ action: "auth.reject", agent: undefined, user: undefined,
            command: undefined, files: undefined, result: "denied",
            detail: "Invalid GitHub PAT", durationMs: undefined });
          ws.close(4001, "Invalid or expired GitHub PAT");
          return;
        }
        githubToken = rawToken;
        console.info(`[bridge] Authenticated: ${githubLogin} → ${clientId}`);
        this.audit.log({ action: "auth.connect", agent: undefined, user: githubLogin,
          command: undefined, files: undefined, result: "ok",
          detail: "github-pat", durationMs: undefined });
        // Forward the token to cloud adapters so they can call GitHub API
        this.options.cloudAdapters?.setGitHubToken(rawToken);
      }
    }

    this.sessions.set(clientId, {
      clientId,
      githubLogin,
      githubToken,
      connectedAt: new Date(),
    });

    this.emit("connection", clientId);
    this.handleConnection(ws, clientId);
  }

  private extractToken(url: string): string | undefined {
    try {
      // url may be a path like /?token=ghp_...
      const params = new URLSearchParams(url.includes("?") ? url.slice(url.indexOf("?") + 1) : "");
      return params.get("token") ?? undefined;
    } catch {
      return undefined;
    }
  }

  private async validateGithubPat(token: string): Promise<string | undefined> {
    try {
      const res = await fetch(`${GITHUB_API}/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "cocapn-bridge/0.1.0",
        },
      });
      if (!res.ok) return undefined;
      const body = (await res.json()) as { login?: string };
      return body.login ?? undefined;
    } catch {
      return undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Connection handler
  // ---------------------------------------------------------------------------

  private handleConnection(ws: WebSocket, clientId: string): void {
    console.info(`[bridge] Client connected: ${clientId}`);

    ws.on("message", (data: RawData) => {
      const raw = data.toString();
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        this.sendError(ws, null, -32700, "Parse error");
        return;
      }

      // Route by protocol discriminant
      if (typeof msg["type"] === "string") {
        this.dispatchTyped(ws, clientId, msg as unknown as TypedMessage).catch(
          (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            this.sendTyped(ws, {
              type: `${(msg as TypedMessage).type}_ERROR`,
              id: (msg as TypedMessage).id,
              error: message,
            });
          }
        );
      } else {
        const rpc = msg as unknown as JsonRpcRequest;
        this.dispatchRpc(ws, rpc).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          const code =
            err !== null &&
            typeof err === "object" &&
            "code" in err &&
            typeof (err as { code: unknown }).code === "number"
              ? (err as { code: number }).code
              : -32603;
          this.sendError(ws, rpc.id, code, message);
        });
      }
    });

    ws.on("close", () => {
      this.sessions.delete(clientId);
      // Clean up any agent sessions owned by this client
      this.options.spawner.detachSession(clientId).catch(() => undefined);
      this.emit("disconnection", clientId);
      console.info(`[bridge] Client disconnected: ${clientId}`);
    });

    ws.on("error", (err: Error) => {
      console.error(`[bridge] Client ${clientId} error:`, err);
    });

    this.sendResult(ws, null, this.getBridgeStatus());
  }

  // ---------------------------------------------------------------------------
  // Typed message dispatch
  // ---------------------------------------------------------------------------

  private async dispatchTyped(
    ws: WebSocket,
    clientId: string,
    msg: TypedMessage
  ): Promise<void> {
    switch (msg.type) {
      case "CHAT":
        await this.chatHandler.handle(ws, clientId, msg);
        break;
      case "BASH":
        await this.handleBash(ws, msg);
        break;
      case "FILE_EDIT":
        await this.handleFileEdit(ws, msg);
        break;
      case "A2A_REQUEST":
        await this.handleA2aRequest(ws, msg);
        break;
      case "MODULE_INSTALL":
      case "INSTALL_MODULE":
        await this.handleModuleInstall(ws, msg);
        break;
      case "CHANGE_SKIN":
        await this.handleChangeSkin(ws, msg);
        break;
      default:
        this.sendTyped(ws, {
          type: "ERROR",
          id: msg.id,
          error: `Unknown message type: ${msg.type}`,
        });
    }
  }

  /**
   * BASH — execute a shell command and stream stdout/stderr.
   * Expects: { type: "BASH", id, command, cwd? }
   * Emits:   { type: "BASH_OUTPUT", id, stdout?, stderr?, done, exitCode? }
   *
   * Security: cwd is resolved relative to the repo root and must not escape it.
   */
  private async handleBash(ws: WebSocket, msg: TypedMessage): Promise<void> {
    const command = msg["command"] as string | undefined;
    const rawCwd = (msg["cwd"] as string | undefined) ?? this.options.repoRoot;

    if (!command) {
      this.sendTyped(ws, { type: "BASH_OUTPUT", id: msg.id, done: true, error: "Missing command" });
      return;
    }

    // Ensure cwd stays within repo root
    const cwd = resolve(this.options.repoRoot, rawCwd);
    if (!cwd.startsWith(this.options.repoRoot)) {
      this.audit.log({ action: "bash.exec", agent: undefined, user: undefined,
        command, files: undefined, result: "denied",
        detail: "cwd outside repo root", durationMs: undefined });
      this.sendTyped(ws, { type: "BASH_OUTPUT", id: msg.id, done: true, error: "cwd outside repo root" });
      return;
    }

    const finish = this.audit.start({ action: "bash.exec", agent: undefined, user: undefined,
      command, files: undefined });

    await new Promise<void>((resolveFn) => {
      const child = exec(command, { cwd });

      child.stdout?.on("data", (chunk: string) => {
        this.sendTyped(ws, { type: "BASH_OUTPUT", id: msg.id, stdout: chunk, done: false });
      });

      child.stderr?.on("data", (chunk: string) => {
        this.sendTyped(ws, { type: "BASH_OUTPUT", id: msg.id, stderr: chunk, done: false });
      });

      child.on("close", (exitCode) => {
        finish(exitCode === 0 ? "ok" : "error", `exit ${exitCode ?? "null"}`);
        this.sendTyped(ws, { type: "BASH_OUTPUT", id: msg.id, done: true, exitCode });
        resolveFn();
      });

      child.on("error", (err) => {
        finish("error", err.message);
        this.sendTyped(ws, { type: "BASH_OUTPUT", id: msg.id, done: true, error: err.message });
        resolveFn();
      });
    });
  }

  /**
   * FILE_EDIT — write content to a file within the repo and auto-commit.
   * Expects: { type: "FILE_EDIT", id, path, content }
   * Emits:   { type: "FILE_EDIT_RESULT", id, ok, path?, error? }
   */
  private async handleFileEdit(ws: WebSocket, msg: TypedMessage): Promise<void> {
    const relPath = msg["path"] as string | undefined;
    const content = msg["content"] as string | undefined;

    if (!relPath || content === undefined) {
      this.sendTyped(ws, { type: "FILE_EDIT_RESULT", id: msg.id, ok: false, error: "Missing path or content" });
      return;
    }

    let absPath: string;
    try {
      absPath = sanitizeRepoPath(relPath, this.options.repoRoot);
    } catch (err) {
      const detail = err instanceof SanitizationError ? err.message : "Invalid path";
      this.audit.log({ action: "file.edit", agent: undefined, user: undefined,
        command: undefined, files: [relPath], result: "denied", detail, durationMs: undefined });
      this.sendTyped(ws, { type: "FILE_EDIT_RESULT", id: msg.id, ok: false, error: detail });
      return;
    }

    const finish = this.audit.start({ action: "file.edit", agent: undefined, user: undefined,
      command: undefined, files: [relPath] });
    try {
      writeFileSync(absPath, content, "utf8");
      const filename = relPath.split("/").pop() ?? relPath;
      await this.options.sync.commitFile(filename);
      finish("ok");
      this.sendTyped(ws, { type: "FILE_EDIT_RESULT", id: msg.id, ok: true, path: relPath });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      finish("error", message);
      this.sendTyped(ws, {
        type: "FILE_EDIT_RESULT",
        id: msg.id,
        ok: false,
        error: message,
      });
    }
  }

  /**
   * A2A_REQUEST — route an A2A task to the best available agent.
   * Expects: { type: "A2A_REQUEST", id, task }
   * Emits:   { type: "A2A_RESPONSE", id, routed, agent?, error? }
   */
  private async handleA2aRequest(ws: WebSocket, msg: TypedMessage): Promise<void> {
    const taskDescription = JSON.stringify(msg["task"] ?? msg);
    const routeResult = await this.options.router.resolveAndEnsureRunning(taskDescription);

    if (!routeResult) {
      this.sendTyped(ws, { type: "A2A_RESPONSE", id: msg.id, routed: false, error: "No agent available" });
      return;
    }

    this.sendTyped(ws, {
      type:   "A2A_RESPONSE",
      id:     msg.id,
      routed: true,
      agent:  routeResult.definition.id,
      source: routeResult.source,
    });
  }

  /**
   * MODULE_INSTALL — install a module by git URL, streaming progress.
   * Expects: { type: "MODULE_INSTALL", id, gitUrl }
   * Emits:   { type: "MODULE_PROGRESS", id, line, stream }
   *          { type: "MODULE_RESULT", id, ok, module?, error? }
   */
  private async handleModuleInstall(ws: WebSocket, msg: TypedMessage): Promise<void> {
    const gitUrl = msg["gitUrl"] as string | undefined;
    if (!gitUrl) {
      this.sendTyped(ws, { type: "MODULE_RESULT", id: msg.id, ok: false, error: "Missing gitUrl" });
      return;
    }

    const manager = this.getModuleManager();

    try {
      const mod = await manager.add(gitUrl, (line, stream) => {
        this.sendTyped(ws, { type: "MODULE_PROGRESS", id: msg.id, line, stream });
      });
      this.sendTyped(ws, { type: "MODULE_RESULT", id: msg.id, ok: true, module: mod });
      // Broadcast updated module list to all connected clients
      this.broadcastModuleList();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.sendTyped(ws, { type: "MODULE_RESULT", id: msg.id, ok: false, error: message });
    }
  }

  private broadcastModuleList(): void {
    this.broadcastToAll({ type: "MODULE_LIST_UPDATE", modules: this.getModuleManager().list() });
  }

  private getModuleManager(): ModuleManager {
    if (!this.options.moduleManager) {
      this.options.moduleManager = new ModuleManager(this.options.repoRoot);
    }
    return this.options.moduleManager;
  }

  // ---------------------------------------------------------------------------
  // JSON-RPC dispatch
  // ---------------------------------------------------------------------------

  private async dispatchRpc(ws: WebSocket, req: JsonRpcRequest): Promise<void> {
    const { method, params, id } = req;

    if (method.startsWith("bridge/")) {
      const result = await this.handleBridgeMethod(method, params);
      this.sendResult(ws, id, result);
      return;
    }

    if (method.startsWith("module/")) {
      const result = await this.handleModuleMethod(ws, method, params);
      this.sendResult(ws, id, result);
      return;
    }

    if (method.startsWith("mcp/")) {
      const result = await this.handleMcpMethod(method, params);
      this.sendResult(ws, id, result);
      return;
    }

    if (method.startsWith("a2a/")) {
      const result = await this.handleA2aMethod(method, params);
      this.sendResult(ws, id, result);
      return;
    }

    this.sendError(ws, id, -32601, `Method not found: ${method}`);
  }

  private async handleBridgeMethod(method: string, _params: unknown): Promise<unknown> {
    switch (method) {
      case "bridge/status":
        return this.getBridgeStatus();

      case "bridge/agents":
        return this.options.spawner.getAll().map((a) => ({
          id: a.definition.id,
          capabilities: a.definition.capabilities,
          startedAt: a.startedAt.toISOString(),
        }));

      case "bridge/sessions":
        return [...this.sessions.values()].map((s) => ({
          clientId: s.clientId,
          githubLogin: s.githubLogin,
          connectedAt: s.connectedAt.toISOString(),
        }));

      case "bridge/sync":
        await this.options.sync.commit("[cocapn] manual sync");
        return { ok: true };

      default:
        throw Object.assign(new Error(`Unknown bridge method: ${method}`), { code: -32601 });
    }
  }

  private async handleMcpMethod(method: string, params: unknown): Promise<unknown> {
    const parts = method.split("/");
    const agentId = parts[1];
    const mcpMethod = parts.slice(2).join("/");

    if (!agentId || !mcpMethod) {
      throw new Error(`Invalid MCP method path: ${method}`);
    }

    const agent = this.options.spawner.get(agentId);
    if (!agent) {
      throw new Error(`Agent not running: ${agentId}`);
    }

    switch (mcpMethod) {
      case "tools/list":
        return agent.client.listTools();
      case "tools/call":
        return agent.client.callTool(params as Parameters<typeof agent.client.callTool>[0]);
      case "resources/list":
        return agent.client.listResources();
      case "resources/read":
        return agent.client.readResource((params as { uri: string }).uri);
      default:
        throw new Error(`Unsupported MCP method: ${mcpMethod}`);
    }
  }

  private async handleModuleMethod(
    ws: WebSocket,
    method: string,
    params: unknown
  ): Promise<unknown> {
    const manager = this.getModuleManager();
    const p = (params ?? {}) as Record<string, unknown>;

    switch (method) {
      case "module/list":
        return manager.list();

      case "module/install": {
        const gitUrl = p["gitUrl"] as string | undefined;
        if (!gitUrl) throw new Error("Missing gitUrl");
        const mod = await manager.add(gitUrl, (line, stream) => {
          this.sendTyped(ws, { type: "MODULE_PROGRESS", id: "rpc", line, stream });
        });
        this.broadcastModuleList();
        return mod;
      }

      case "module/remove": {
        const name = p["name"] as string | undefined;
        if (!name) throw new Error("Missing name");
        await manager.remove(name);
        this.broadcastModuleList();
        return { ok: true };
      }

      case "module/update": {
        const name = p["name"] as string | undefined;
        if (!name) throw new Error("Missing name");
        const updated = await manager.update(name);
        this.broadcastModuleList();
        return updated;
      }

      case "module/enable": {
        const name = p["name"] as string | undefined;
        if (!name) throw new Error("Missing name");
        await manager.enable(name);
        return { ok: true };
      }

      case "module/disable": {
        const name = p["name"] as string | undefined;
        if (!name) throw new Error("Missing name");
        await manager.disable(name);
        return { ok: true };
      }

      default:
        throw Object.assign(new Error(`Unknown module method: ${method}`), { code: -32601 });
    }
  }

  private async handleA2aMethod(method: string, params: unknown): Promise<unknown> {
    const agentDef = await this.options.router.resolveAndEnsureRunning(JSON.stringify(params));
    if (!agentDef) throw new Error("No agent available for this task");
    return { routed: true, agent: agentDef.definition.id, source: agentDef.source, method };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

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

  private sendTyped(ws: WebSocket, payload: Record<string, unknown>): void {
    ws.send(JSON.stringify(payload));
  }

  private sendResult(ws: WebSocket, id: JsonRpcRequest["id"], result: unknown): void {
    ws.send(JSON.stringify({ jsonrpc: "2.0", id, result }));
  }

  private sendError(ws: WebSocket, id: JsonRpcRequest["id"], code: number, message: string): void {
    ws.send(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }));
  }

  // ---------------------------------------------------------------------------
  // CHANGE_SKIN handler (2.4) — direct CHANGE_SKIN typed message path
  // ---------------------------------------------------------------------------

  /**
   * CHANGE_SKIN — switch the active UI skin/theme.
   * Expects: { type: "CHANGE_SKIN", id, skin, preview? }
   * Emits:   { type: "SKIN_UPDATE", id, skin, previewBranch?, cssVars?, done }
   */
  private async handleChangeSkin(ws: WebSocket, msg: TypedMessage): Promise<void> {
    const skin    = msg["skin"] as string | undefined;
    const preview = msg["preview"] as boolean | undefined;

    if (!skin) {
      this.sendTyped(ws, { type: "SKIN_UPDATE", id: msg.id, done: true, error: "Missing skin name" });
      return;
    }

    const manager = this.getModuleManager();
    const modules  = manager.list();
    const skinMod  = modules.find(
      (m) => m.type === "skin" && (m.name === skin || m.name.includes(skin))
    );

    if (skinMod) {
      const otherSkins = modules.filter((m) => m.type === "skin" && m.name !== skinMod.name);
      for (const s of otherSkins) {
        try { await manager.disable(s.name); } catch { /* ignore */ }
      }
      try {
        await manager.enable(skinMod.name);
        this.sendTyped(ws, {
          type: "SKIN_UPDATE", id: msg.id,
          skin: skinMod.name, done: true,
          message: `Skin **${skinMod.name}** activated.`,
        });
        this.broadcastToAll({ type: "SKIN_UPDATE_BROADCAST", skin: skinMod.name });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.sendTyped(ws, { type: "SKIN_UPDATE", id: msg.id, done: true, error: message });
      }
      return;
    }

    const BUILTIN_VARS: Record<string, Record<string, string>> = {
      dark:  { "--color-bg": "#0d0d0d", "--color-surface": "#1a1a1a", "--color-text": "#e8e8e8", "--color-primary": "#7c8aff" },
      light: { "--color-bg": "#ffffff", "--color-surface": "#f4f4f5", "--color-text": "#18181b", "--color-primary": "#3b5bdb" },
    };

    const cssVars = BUILTIN_VARS[skin.toLowerCase()];
    if (cssVars) {
      const branchName = preview ? `skin-preview-${skin}-${Date.now()}` : undefined;
      this.sendTyped(ws, {
        type: "SKIN_UPDATE", id: msg.id,
        skin, cssVars, done: true,
        previewBranch: branchName,
        message: preview
          ? `Skin preview created. Reply **"looks good, merge it"** to apply.`
          : `Theme **${skin}** applied.`,
      });
      this.broadcastToAll({ type: "SKIN_UPDATE_BROADCAST", skin, cssVars });
      return;
    }

    this.sendTyped(ws, {
      type: "SKIN_UPDATE", id: msg.id, done: true,
      error: `Unknown skin: ${skin}. Available: dark, light, or an installed skin module.`,
    });
  }

  /** Send a JSON payload to every open WebSocket client. */
  private broadcastToAll(payload: Record<string, unknown>): void {
    if (!this.wss) return;
    const raw = JSON.stringify(payload);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(raw);
    }
  }
}
