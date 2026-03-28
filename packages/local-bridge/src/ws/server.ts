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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

export type BridgeServerEventMap = {
  listening: [port: number];
  connection: [clientId: string];
  disconnection: [clientId: string];
  error: [err: Error];
};

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: unknown;
}

interface TypedMessage {
  type: "CHAT" | "BASH" | "FILE_EDIT" | "A2A_REQUEST" | "MODULE_INSTALL" | "INSTALL_MODULE" | "CHANGE_SKIN";
  id: string;
  [key: string]: unknown;
}

interface SessionState {
  clientId: string;
  githubLogin: string | undefined;
  githubToken: string | undefined;
  connectedAt: Date;
}

const GITHUB_API = "https://api.github.com";
let clientCounter = 0;

// ---------------------------------------------------------------------------
// BridgeServer
// ---------------------------------------------------------------------------

export class BridgeServer extends EventEmitter<BridgeServerEventMap> {
  private wss:     WebSocketServer | null = null;
  private httpSrv: ReturnType<typeof createHttpServer> | null = null;
  private options: BridgeServerOptions;
  private sessions = new Map<string, SessionState>();
  private audit: AuditLogger;
  private chatRouter: ChatRouter;

  constructor(options: BridgeServerOptions) {
    super();
    this.options = options;
    this.audit   = new AuditLogger(options.repoRoot);
    this.chatRouter = new ChatRouter();
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
        await this.handleChat(ws, clientId, msg);
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
   * CHAT — sends a prompt to a running agent and streams the response.
   * Expects: { type: "CHAT", id, agentId, content, sessionId? }
   * Emits:   { type: "CHAT_STREAM", id, chunk, done }
   */
  private async handleChat(
    ws: WebSocket,
    clientId: string,
    msg: TypedMessage
  ): Promise<void> {
    const agentId = msg["agentId"] as string | undefined;
    const content = msg["content"] as string | undefined;

    if (!content) {
      this.sendTyped(ws, { type: "CHAT_STREAM", id: msg.id, chunk: "", done: true, error: "Missing content" });
      return;
    }

    // ── Chat-based module installation intent ─────────────────────────────────
    const installIntent = parseModuleInstallIntent(content);
    if (installIntent) {
      await this.handleChatModuleInstall(ws, msg.id, installIntent);
      return;
    }

    // ── A2A cross-domain intent ("ask activelog", "from studylog") ───────────
    const peerIntent = parsePeerQueryIntent(content);
    if (peerIntent) {
      await this.handlePeerQuery(ws, msg.id, peerIntent);
      return;
    }

    // ── Skin change intent ("change skin to dark", "use theme cyberpunk") ────
    const skinIntent = parseSkinIntent(content);
    if (skinIntent) {
      await this.handleChangeSkin(ws, {
        type: "CHANGE_SKIN",
        id: msg.id,
        skin: skinIntent.skin,
        preview: skinIntent.preview,
      } as TypedMessage);
      return;
    }

    // ── ChatRouter: parse explicit commands (/claude, /pi, /copilot) ─────────
    const parsed = this.chatRouter.parse(content);
    const effectiveContent  = parsed.content;
    const effectiveAgentId  = parsed.agentId ?? agentId;
    const agentBadge        = parsed.badge;

    // Inject brain context if available — spawn with COCAPN_CONTEXT + COCAPN_SOUL
    if (this.options.brain) {
      const soul    = this.options.brain.getSoul();
      const context = this.options.brain.buildContext();
      // Pre-spawn with context so agents have memory access from first message
      const preSpawnTarget = effectiveAgentId ?? effectiveContent;
      const resolved = this.options.router.resolve(preSpawnTarget);
      if (resolved?.source === "local" && !this.options.spawner.get(resolved.definition.id)) {
        await this.options.spawner.spawn(resolved.definition, { soul, context });
      }
    }

    // Resolve agent — spawn if needed
    const routeResult = effectiveAgentId
      ? this.options.router.resolve(effectiveContent)
      : await this.options.router.resolveAndEnsureRunning(effectiveContent);

    if (!routeResult) {
      this.sendTyped(ws, { type: "CHAT_STREAM", id: msg.id, chunk: "", done: true, error: "No agent available" });
      return;
    }

    const { definition, source } = routeResult;

    // ── Cloud path ────────────────────────────────────────────────────────────
    if (source === "cloud") {
      const adapter = this.options.cloudAdapters?.get(definition.id);
      if (!adapter) {
        this.sendTyped(ws, { type: "CHAT_STREAM", id: msg.id, chunk: "", done: true, error: "Cloud adapter not configured" });
        return;
      }

      const outputCb = (chunk: string) =>
        this.sendTyped(ws, { type: "CHAT_STREAM", id: msg.id, chunk, stream: "stdout", done: false, agentId: definition.id, agentBadge });

      const cloudResult = await adapter.sendTask(effectiveContent, outputCb, clientId);

      if (!cloudResult.reached) {
        this.sendTyped(ws, {
          type: "CHAT_STREAM", id: msg.id, chunk: "", done: true,
          error: `Cloud unreachable: ${cloudResult.error ?? "unknown"}`,
        });
        return;
      }

      const finalText = cloudResult.task?.status.message?.parts
        .filter((p) => p.type === "text")
        .map((p) => (p.type === "text" ? p.text : ""))
        .join("") ?? "";
      this.sendTyped(ws, { type: "CHAT_STREAM", id: msg.id, chunk: finalText, done: true, agentId: definition.id, agentBadge });
      return;
    }

    // ── Local path ────────────────────────────────────────────────────────────
    this.options.spawner.attachSession(definition.id, clientId);

    const agent = this.options.spawner.get(definition.id);
    if (!agent) {
      this.sendTyped(ws, { type: "CHAT_STREAM", id: msg.id, chunk: "", done: true, error: "Agent not running" });
      return;
    }

    // Forward stderr (agent's streaming output) to the WebSocket
    const unsubscribe = (() => {
      const handler = (id: string, chunk: string, stream: "stdout" | "stderr") => {
        if (id !== definition.id) return;
        this.sendTyped(ws, { type: "CHAT_STREAM", id: msg.id, chunk, stream, done: false, agentId: definition.id, agentBadge });
      };
      this.options.spawner.on("output", handler);
      return () => this.options.spawner.off("output", handler);
    })();

    try {
      const result = await agent.client.callTool({
        name: "chat",
        arguments: { content: effectiveContent, sessionId: clientId },
      });
      unsubscribe();
      const text = result.content.find((c) => c.type === "text")?.text ?? "";
      this.sendTyped(ws, { type: "CHAT_STREAM", id: msg.id, chunk: text, done: true, agentId: definition.id, agentBadge });
    } catch (err) {
      unsubscribe();
      throw err;
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

    const absPath = resolve(join(this.options.repoRoot, relPath));
    if (!absPath.startsWith(this.options.repoRoot)) {
      this.sendTyped(ws, { type: "FILE_EDIT_RESULT", id: msg.id, ok: false, error: "Path outside repo root" });
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
    if (!this.wss) return;
    const manager = this.getModuleManager();
    const payload = JSON.stringify({
      type: "MODULE_LIST_UPDATE",
      modules: manager.list(),
    });
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
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

  /**
   * Chat-based module installation.
   * Sends a confirmation prompt then installs on "yes" reply.
   * Two-step: sends CHAT_STREAM with confirm question, waits for next message.
   */
  private async handleChatModuleInstall(
    ws: WebSocket,
    msgId: string,
    intent: ModuleInstallIntent
  ): Promise<void> {
    const { gitUrl, moduleName } = intent;
    const confirmMsg =
      `Install module **${moduleName}** from \`${gitUrl}\`?\n` +
      `Reply **yes** to confirm or **no** to cancel.`;

    this.sendTyped(ws, { type: "CHAT_STREAM", id: msgId, chunk: confirmMsg, done: true });

    // Wait for the next message from this client
    const reply = await new Promise<string>((resolve) => {
      const handler = (data: import("ws").RawData) => {
        try {
          const msg = JSON.parse(data.toString()) as Record<string, unknown>;
          const text = (msg["content"] ?? msg["text"] ?? "").toString().toLowerCase().trim();
          ws.off("message", handler);
          resolve(text);
        } catch {
          ws.off("message", handler);
          resolve("no");
        }
      };
      ws.once("message", handler);
      // Timeout after 60s
      setTimeout(() => { ws.off("message", handler); resolve("no"); }, 60_000);
    });

    if (reply !== "yes" && reply !== "y") {
      this.sendTyped(ws, { type: "CHAT_STREAM", id: msgId, chunk: "Installation cancelled.", done: true });
      return;
    }

    this.sendTyped(ws, { type: "CHAT_STREAM", id: msgId, chunk: `Installing ${moduleName}…\n`, done: false });

    const manager = this.getModuleManager();
    try {
      const mod = await manager.add(gitUrl, (line, stream) => {
        this.sendTyped(ws, { type: "CHAT_STREAM", id: msgId, chunk: `${line}\n`, stream, done: false });
      });
      const status = mod.error ? `installed with warnings: ${mod.error}` : "installed successfully";
      this.sendTyped(ws, {
        type: "CHAT_STREAM", id: msgId,
        chunk: `\n✓ **${mod.name}@${mod.version}** ${status}.`,
        done: true,
      });
      this.broadcastModuleList();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.sendTyped(ws, {
        type: "CHAT_STREAM", id: msgId,
        chunk: `\nInstallation failed: ${message}`,
        done: true,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // CHANGE_SKIN handler (2.4)
  // ---------------------------------------------------------------------------

  /**
   * CHANGE_SKIN — switch the active UI skin/theme.
   * Expects: { type: "CHANGE_SKIN", id, skin, preview? }
   * Emits:   { type: "SKIN_UPDATE", id, skin, previewBranch?, cssVars?, done }
   *
   * Skin name "dark" / "light" / "<module-slug>" are supported.
   * If preview === true, changes go to a preview branch only.
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
      // Enable the skin module — disable other skin modules first
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
        this.broadcastSkinUpdate(skin);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.sendTyped(ws, { type: "SKIN_UPDATE", id: msg.id, done: true, error: message });
      }
      return;
    }

    // Built-in CSS variable skins (dark / light / auto)
    const BUILTIN_VARS: Record<string, Record<string, string>> = {
      dark: {
        "--color-bg":      "#0d0d0d",
        "--color-surface": "#1a1a1a",
        "--color-text":    "#e8e8e8",
        "--color-primary": "#7c8aff",
      },
      light: {
        "--color-bg":      "#ffffff",
        "--color-surface": "#f4f4f5",
        "--color-text":    "#18181b",
        "--color-primary": "#3b5bdb",
      },
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
      this.broadcastSkinUpdate(skin, cssVars);
      return;
    }

    this.sendTyped(ws, {
      type: "SKIN_UPDATE", id: msg.id, done: true,
      error: `Unknown skin: ${skin}. Available: dark, light, or an installed skin module.`,
    });
  }

  private broadcastSkinUpdate(skin: string, cssVars?: Record<string, string>): void {
    if (!this.wss) return;
    const payload = JSON.stringify({ type: "SKIN_UPDATE_BROADCAST", skin, cssVars });
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  }

  // ---------------------------------------------------------------------------
  // A2A Peer query handler (2.5)
  // ---------------------------------------------------------------------------

  /**
   * Handle a cross-domain peer query intent.
   * Sends HTTP GET /api/peer/fact?key=<k> to the peer bridge.
   * Uses the fleet JWT for auth.
   */
  private async handlePeerQuery(
    ws: WebSocket,
    msgId: string,
    intent: PeerQueryIntent
  ): Promise<void> {
    const { domain, factKey, originalContent } = intent;

    if (!this.options.fleetKey) {
      this.sendTyped(ws, {
        type: "CHAT_STREAM", id: msgId,
        chunk: `Cannot query peer: fleet key not configured. Run \`cocapn-bridge secret init\` first.`,
        done: true,
      });
      return;
    }

    // Build peer URL — try http first, then https
    const peerBase = domain.includes("://") ? domain : `http://${domain}`;
    const peerPort = this.options.config.config.port + 1; // HTTP API is WS port + 1
    const peerHost = peerBase.includes(":") ? peerBase : `${peerBase}:${peerPort}`;

    this.sendTyped(ws, {
      type: "CHAT_STREAM", id: msgId,
      chunk: `Querying **${domain}** for \`${factKey}\`…\n`,
      done: false,
    });

    try {
      const { signJwt } = await import("../security/jwt.js");
      const token = signJwt({ sub: "bridge" }, this.options.fleetKey, { ttlSeconds: 60 });
      const url   = `${peerHost}/api/peer/fact?key=${encodeURIComponent(factKey)}`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent":  "cocapn-bridge/0.1.0",
        },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        this.sendTyped(ws, {
          type: "CHAT_STREAM", id: msgId,
          chunk: `Peer **${domain}** returned ${res.status}: ${body}`,
          done: true,
        });
        return;
      }

      const data = (await res.json()) as { key: string; value: string };
      const answer = `**[${domain}]** ${data.key}: ${data.value}`;

      // Provide context about the original question
      const contextNote = originalContent
        ? `\n\n_Re: "${originalContent.slice(0, 80)}"_`
        : "";

      this.sendTyped(ws, {
        type: "CHAT_STREAM", id: msgId,
        chunk: answer + contextNote,
        done: true,
        agentBadge: domain,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.sendTyped(ws, {
        type: "CHAT_STREAM", id: msgId,
        chunk: `Failed to reach **${domain}**: ${message}`,
        done: true,
      });
    }
  }
}

// ─── Module install intent parser ─────────────────────────────────────────────

interface ModuleInstallIntent {
  gitUrl:     string;
  moduleName: string;
}

/**
 * Detect phrases like:
 *   "install habit tracker"
 *   "add the perplexity-search module"
 *   "install module from github.com/cocapn/habit-tracker"
 */
function parseModuleInstallIntent(content: string): ModuleInstallIntent | undefined {
  const lower = content.toLowerCase().trim();

  // Explicit git URL
  const urlMatch = lower.match(
    /(?:install|add)\s+(?:module\s+)?(?:from\s+)?((https?:\/\/|git@)[^\s]+)/
  );
  if (urlMatch?.[1]) {
    const gitUrl = urlMatch[1].trim();
    const name   = gitUrl.replace(/\.git$/, "").split("/").pop() ?? "module";
    return { gitUrl, moduleName: name };
  }

  // Known cocapn module registry shorthand: "install habit-tracker"
  const knownMatch = lower.match(
    /^(?:install|add)\s+(?:the\s+)?(?:module\s+)?([a-z][a-z0-9-]+)(?:\s+module)?$/
  );
  if (knownMatch?.[1]) {
    const slug   = knownMatch[1].trim().replace(/\s+/g, "-");
    const gitUrl = `https://github.com/cocapn/${slug}`;
    return { gitUrl, moduleName: slug };
  }

  return undefined;
}

// ─── A2A peer query intent parser (2.5) ───────────────────────────────────────

interface PeerQueryIntent {
  domain:          string;
  factKey:         string;
  /** The full original message, used for context in the response */
  originalContent: string;
}

/**
 * Detect phrases that request cross-domain fact lookup:
 *   "Am I too tired to solder? ask activelog"
 *   "from studylog: what's my reading streak?"
 *   "ask makerlog for my project count"
 */
function parsePeerQueryIntent(content: string): PeerQueryIntent | undefined {
  const lower = content.toLowerCase().trim();

  // "ask <domain> [for] <fact-key>"
  const askMatch = lower.match(
    /ask\s+([a-z][a-z0-9.-]+(?:log|bridge)?(?:\.ai|\.io|:\d+)?)\s+(?:for\s+)?(.+)/
  );
  if (askMatch?.[1] && askMatch?.[2]) {
    return {
      domain:          askMatch[1].trim(),
      factKey:         askMatch[2].trim().replace(/[?"!.]+$/, ""),
      originalContent: content,
    };
  }

  // "<question>? ask <domain>"  (domain at end)
  const trailMatch = lower.match(
    /^(.+?)\??\s+ask\s+([a-z][a-z0-9.-]+(?:log|bridge)?)(?:\s|$)/
  );
  if (trailMatch?.[1] && trailMatch?.[2]) {
    return {
      domain:          trailMatch[2].trim(),
      factKey:         trailMatch[1].trim(),
      originalContent: content,
    };
  }

  // "from <domain>: <question>"
  const fromMatch = lower.match(/^from\s+([a-z][a-z0-9.-]+(?:log|bridge)?):\s*(.+)/);
  if (fromMatch?.[1] && fromMatch?.[2]) {
    return {
      domain:          fromMatch[1].trim(),
      factKey:         fromMatch[2].trim().replace(/[?"!.]+$/, ""),
      originalContent: content,
    };
  }

  return undefined;
}

// ─── Skin intent parser (2.4) ─────────────────────────────────────────────────

interface SkinIntent {
  skin:    string;
  preview: boolean;
}

/**
 * Detect theme/skin change requests:
 *   "change skin to dark"
 *   "use theme cyberpunk"
 *   "switch to the dark theme"
 *   "preview the light skin"
 */
function parseSkinIntent(content: string): SkinIntent | undefined {
  const lower = content.toLowerCase().trim();

  const preview = lower.includes("preview");

  const patterns = [
    /(?:change|switch|use|apply|set)\s+(?:the\s+)?(?:skin|theme)\s+(?:to\s+)?([a-z][a-z0-9-]+)/,
    /(?:use|apply)\s+(?:the\s+)?([a-z][a-z0-9-]+)\s+(?:skin|theme)/,
    /preview\s+(?:the\s+)?([a-z][a-z0-9-]+)\s+(?:skin|theme)/,
    /(?:make\s+it|go)\s+([a-z][a-z0-9-]+)(?:\s+theme)?$/,
  ];

  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match?.[1]) {
      return { skin: match[1].trim(), preview };
    }
  }

  return undefined;
}
