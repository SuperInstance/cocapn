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
import { IncomingMessage } from "http";
import { EventEmitter } from "events";
import { exec } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import type { AgentRouter } from "../agents/router.js";
import type { AgentSpawner } from "../agents/spawner.js";
import type { GitSync } from "../git/sync.js";
import type { BridgeConfig } from "../config/types.js";
import type { CloudAdapterRegistry } from "../CloudAdapter.js";
import { ModuleManager } from "../modules/manager.js";

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
  type: "CHAT" | "BASH" | "FILE_EDIT" | "A2A_REQUEST" | "MODULE_INSTALL";
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
  private wss: WebSocketServer | null = null;
  private options: BridgeServerOptions;
  private sessions = new Map<string, SessionState>();

  constructor(options: BridgeServerOptions) {
    super();
    this.options = options;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  start(): void {
    const port = this.options.config.config.port;

    this.wss = new WebSocketServer({ port });

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
    this.sessions.clear();
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
        ws.close(4001, "Missing token — provide ?token=<github-pat>");
        return;
      }

      githubLogin = await this.validateGithubPat(rawToken);
      if (!githubLogin) {
        ws.close(4001, "Invalid or expired GitHub PAT");
        return;
      }

      githubToken = rawToken;
      console.info(`[bridge] Authenticated: ${githubLogin} → ${clientId}`);

      // Forward the token to cloud adapters so they can call GitHub API
      this.options.cloudAdapters?.setGitHubToken(rawToken);
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
        await this.handleModuleInstall(ws, msg);
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

    // Resolve agent — spawn if needed
    const routeResult = agentId
      ? this.options.router.resolve(content)
      : await this.options.router.resolveAndEnsureRunning(content);

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
        this.sendTyped(ws, { type: "CHAT_STREAM", id: msg.id, chunk, stream: "stdout", done: false });

      const cloudResult = await adapter.sendTask(content, outputCb, clientId);

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
      this.sendTyped(ws, { type: "CHAT_STREAM", id: msg.id, chunk: finalText, done: true });
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
        this.sendTyped(ws, { type: "CHAT_STREAM", id: msg.id, chunk, stream, done: false });
      };
      this.options.spawner.on("output", handler);
      return () => this.options.spawner.off("output", handler);
    })();

    try {
      const result = await agent.client.callTool({
        name: "chat",
        arguments: { content, sessionId: clientId },
      });
      unsubscribe();
      const text = result.content.find((c) => c.type === "text")?.text ?? "";
      this.sendTyped(ws, { type: "CHAT_STREAM", id: msg.id, chunk: text, done: true });
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
      this.sendTyped(ws, { type: "BASH_OUTPUT", id: msg.id, done: true, error: "cwd outside repo root" });
      return;
    }

    await new Promise<void>((resolveFn) => {
      const child = exec(command, { cwd });

      child.stdout?.on("data", (chunk: string) => {
        this.sendTyped(ws, { type: "BASH_OUTPUT", id: msg.id, stdout: chunk, done: false });
      });

      child.stderr?.on("data", (chunk: string) => {
        this.sendTyped(ws, { type: "BASH_OUTPUT", id: msg.id, stderr: chunk, done: false });
      });

      child.on("close", (exitCode) => {
        this.sendTyped(ws, { type: "BASH_OUTPUT", id: msg.id, done: true, exitCode });
        resolveFn();
      });

      child.on("error", (err) => {
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

    try {
      writeFileSync(absPath, content, "utf8");
      const filename = relPath.split("/").pop() ?? relPath;
      await this.options.sync.commitFile(filename);
      this.sendTyped(ws, { type: "FILE_EDIT_RESULT", id: msg.id, ok: true, path: relPath });
    } catch (err) {
      this.sendTyped(ws, {
        type: "FILE_EDIT_RESULT",
        id: msg.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
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
