/**
 * Tests for BridgeServer WebSocket protocol.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import WebSocket from "ws";
import { BridgeServer } from "../src/ws/server.js";
import { AgentSpawner } from "../src/agents/spawner.js";
import { AgentRegistry } from "../src/agents/registry.js";
import { AgentRouter } from "../src/agents/router.js";
import { GitSync } from "../src/git/sync.js";
import { DEFAULT_CONFIG, type BridgeConfig } from "../src/config/types.js";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { simpleGit } from "simple-git";

async function makeTempGitRepo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "cocapn-ws-test-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test");
  await git.addConfig("user.email", "test@test.com");
  writeFileSync(join(dir, "README.md"), "test\n");
  await git.add(".");
  await git.commit("init");
  return dir;
}

// Each test file gets its own port range to avoid cross-suite conflicts
const BASE_PORT = 20000;
let portOffset = 0;

function nextPort(): number {
  return BASE_PORT + portOffset++;
}

function makeTestConfig(port: number): BridgeConfig {
  return {
    ...DEFAULT_CONFIG,
    config: { ...DEFAULT_CONFIG.config, port, tunnel: undefined },
  };
}

function makeServer(port: number, repoDir: string): {
  server: BridgeServer;
  sync: GitSync;
  spawner: AgentSpawner;
} {
  const config = makeTestConfig(port);
  const sync = new GitSync(repoDir, config);
  const spawner = new AgentSpawner();
  const registry = new AgentRegistry();
  const router = new AgentRouter(
    {
      rules: [],
      strategy: "first-match",
      defaultAgent: undefined,
      fallbackAgent: undefined,
    },
    registry,
    spawner
  );
  const server = new BridgeServer({ config, router, spawner, sync, repoRoot: repoDir, skipAuth: true, cloudAdapters: undefined, moduleManager: undefined });
  return { server, sync, spawner };
}

/**
 * Open a WebSocket and consume the welcome status message.
 * Both handlers are registered before yielding so neither event is missed.
 */
async function openClient(port: number): Promise<WebSocket> {
  const ws = new WebSocket(`ws://localhost:${port}`);
  // Register open + first-message handlers synchronously before any I/O ticks
  await Promise.all([
    new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    }),
    new Promise<void>((resolve) => ws.once("message", () => resolve())),
  ]);
  return ws;
}

function rpc(
  ws: WebSocket,
  id: number,
  method: string,
  params: unknown = {}
): Promise<{ result?: unknown; error?: { code: number; message: string } }> {
  return new Promise((resolve, reject) => {
    ws.once("message", (data) => {
      try {
        resolve(
          JSON.parse((data as Buffer).toString()) as {
            result?: unknown;
            error?: { code: number; message: string };
          }
        );
      } catch (e) {
        reject(e);
      }
    });
    ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
  });
}

async function closeClient(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.OPEN) {
    ws.close();
    await new Promise<void>((resolve) => ws.once("close", resolve));
  }
}

// ---------------------------------------------------------------------------

describe("BridgeServer", () => {
  let repoDir: string;
  let port: number;
  let server: BridgeServer;
  let sync: GitSync;
  let spawner: AgentSpawner;

  beforeEach(async () => {
    repoDir = await makeTempGitRepo();
    port = nextPort();
    ({ server, sync, spawner } = makeServer(port, repoDir));
    server.start();
    await new Promise<void>((resolve) => server.once("listening", resolve));
  });

  afterEach(async () => {
    sync.stopTimers();
    await server.stop();
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("sends initial status on connect", async () => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    const message = await new Promise<{
      result?: { version: string };
    }>((resolve, reject) => {
      ws.once("message", (data) => {
        try {
          resolve(JSON.parse((data as Buffer).toString()) as { result: { version: string } });
        } catch (e) {
          reject(e);
        }
      });
      ws.once("error", reject);
    });
    await closeClient(ws);

    expect(message.result?.version).toBe("0.1.0");
  });

  it("responds to bridge/status", async () => {
    const ws = await openClient(port);
    const res = await rpc(ws, 1, "bridge/status") as {
      result: { port: number; agentCount: number };
    };
    await closeClient(ws);
    expect(res.result.port).toBe(port);
    expect(res.result.agentCount).toBe(0);
  });

  it("responds to bridge/agents with empty array when none running", async () => {
    const ws = await openClient(port);
    const res = await rpc(ws, 2, "bridge/agents") as { result: unknown[] };
    await closeClient(ws);
    expect(Array.isArray(res.result)).toBe(true);
    expect(res.result).toHaveLength(0);
  });

  it("returns method not found for unknown bridge methods", async () => {
    const ws = await openClient(port);
    const res = await rpc(ws, 3, "bridge/nonexistent") as {
      error: { code: number };
    };
    await closeClient(ws);
    expect(res.error.code).toBe(-32601);
  });

  it("returns parse error for invalid JSON", async () => {
    const ws = await openClient(port);
    const response = await new Promise<{ error: { code: number } }>(
      (resolve) => {
        ws.once("message", (data) =>
          resolve(
            JSON.parse((data as Buffer).toString()) as {
              error: { code: number };
            }
          )
        );
        ws.send("not json {{");
      }
    );
    await closeClient(ws);
    expect(response.error.code).toBe(-32700);
  });

  it("returns error for mcp call to non-running agent", async () => {
    const ws = await openClient(port);
    const res = await rpc(ws, 4, "mcp/ghost-agent/tools/list") as {
      error: { code: number; message: string };
    };
    await closeClient(ws);
    expect(res.error).toBeDefined();
    expect(res.error.message).toContain("ghost-agent");
  });

  it("handles BASH typed message and streams output", async () => {
    const ws = await openClient(port);

    const chunks: Array<{ stdout?: string; stderr?: string; done: boolean }> = [];
    const done = new Promise<void>((resolve) => {
      ws.on("message", (data) => {
        const msg = JSON.parse((data as Buffer).toString()) as {
          type: string;
          stdout?: string;
          done: boolean;
        };
        if (msg.type === "BASH_OUTPUT") {
          chunks.push(msg as { stdout?: string; done: boolean });
          if (msg.done) resolve();
        }
      });
    });

    ws.send(JSON.stringify({ type: "BASH", id: "bash-1", command: "echo hello" }));
    await done;
    await closeClient(ws);

    const text = chunks.map((c) => c.stdout ?? "").join("");
    expect(text).toContain("hello");
    expect(chunks.at(-1)?.done).toBe(true);
  });

  it("BASH rejects cwd outside repo root", async () => {
    const ws = await openClient(port);

    const response = await new Promise<{ type: string; error?: string; done: boolean }>((resolve) => {
      ws.once("message", (_) => undefined); // skip welcome
      ws.on("message", (data) => {
        const msg = JSON.parse((data as Buffer).toString()) as {
          type: string;
          error?: string;
          done: boolean;
        };
        if (msg.type === "BASH_OUTPUT" && msg.done) resolve(msg);
      });
      ws.send(JSON.stringify({ type: "BASH", id: "bash-2", command: "ls", cwd: "/etc" }));
    });

    await closeClient(ws);
    expect(response.error).toMatch(/outside repo root/);
  });

  it("FILE_EDIT rejects path outside repo root", async () => {
    const ws = await openClient(port);

    const response = await new Promise<{ type: string; ok: boolean; error?: string }>((resolve) => {
      ws.on("message", (data) => {
        const msg = JSON.parse((data as Buffer).toString()) as {
          type: string;
          ok: boolean;
          error?: string;
        };
        if (msg.type === "FILE_EDIT_RESULT") resolve(msg);
      });
      ws.send(JSON.stringify({ type: "FILE_EDIT", id: "edit-1", path: "../../etc/passwd", content: "bad" }));
    });

    await closeClient(ws);
    expect(response.ok).toBe(false);
    expect(response.error).toMatch(/outside repo root/);
  });

  it("A2A_REQUEST returns routed=false when no agent available", async () => {
    const ws = await openClient(port);

    const response = await new Promise<{ type: string; routed: boolean }>((resolve) => {
      ws.on("message", (data) => {
        const msg = JSON.parse((data as Buffer).toString()) as {
          type: string;
          routed: boolean;
        };
        if (msg.type === "A2A_RESPONSE") resolve(msg);
      });
      ws.send(JSON.stringify({ type: "A2A_REQUEST", id: "a2a-1", task: { description: "do something" } }));
    });

    await closeClient(ws);
    expect(response.routed).toBe(false);
  });

  it("bridge/sessions returns connected session list", async () => {
    const ws = await openClient(port);
    const res = await rpc(ws, 10, "bridge/sessions") as { result: unknown[] };
    await closeClient(ws);
    expect(Array.isArray(res.result)).toBe(true);
  });

  it("rejects connection without token when auth is enabled", async () => {
    // Spin up a server WITH auth enabled
    const authPort = nextPort();
    const authDir = await makeTempGitRepo();
    const authConfig = makeTestConfig(authPort);
    const authSync = new GitSync(authDir, authConfig);
    const authSpawner = new AgentSpawner();
    const authRegistry = new AgentRegistry();
    const authRouter = new AgentRouter(
      { rules: [], strategy: "first-match", defaultAgent: undefined, fallbackAgent: undefined },
      authRegistry,
      authSpawner
    );
    // skipAuth is undefined (falsy) → auth IS required
    const authServer = new BridgeServer({
      config: authConfig,
      router: authRouter,
      spawner: authSpawner,
      sync: authSync,
      repoRoot: authDir,
      skipAuth: undefined,
      cloudAdapters: undefined,
      moduleManager: undefined,
    });
    authServer.start();
    await new Promise<void>((r) => authServer.once("listening", r));

    const ws = new WebSocket(`ws://localhost:${authPort}`);
    const closeCode = await new Promise<number>((resolve) => {
      ws.once("close", (code) => resolve(code));
      ws.once("error", () => resolve(4001));
    });

    await authServer.stop();
    rmSync(authDir, { recursive: true, force: true });

    // Should be closed with 4001 (missing token) since no ?token= was provided
    expect(closeCode).toBe(4001);
  });
});
