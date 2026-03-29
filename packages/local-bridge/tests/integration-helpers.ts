/**
 * Shared helpers for integration tests.
 *
 * Provides utilities for creating test bridges, clients, and
 * cleaning up test artifacts. All tests use temporary directories
 * and isolated servers.
 */

import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Server as HttpServer } from "http";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import { signJwt, generateJwtSecret } from "../src/security/jwt.js";
import { extractToken } from "../src/security/auth-handler.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TestBridge {
  repoDir: string;
  privateKey: string;
  server: HttpServer;
  wsServer: WebSocketServer;
  port: number;
  close: () => void;
}

export interface TestClient {
  ws: WebSocket;
  messages: Array<{ type: string; data: unknown }>;
  send: (data: unknown) => void;
  waitForMessage: (type: string, timeoutMs?: number) => Promise<unknown>;
  close: () => void;
}

// ─── Test bridge creation ─────────────────────────────────────────────────────

/**
 * Create a minimal test bridge with temporary repo.
 */
export function createTestBridge(options: {
  skipAuth?: boolean;
  fleetKey?: string;
}): TestBridge {
  const repoDir = mkdtempSync(join(tmpdir(), "cocapn-integration-"));

  // Create minimal cocapn structure
  mkdirSync(join(repoDir, "cocapn"), { recursive: true });
  mkdirSync(join(repoDir, "secrets"), { recursive: true });

  // Create a simple config
  writeFileSync(
    join(repoDir, "cocapn.yml"),
    `
version: 1
domain: test.cocapn.local
agents:
  - id: test-agent
    name: Test Agent
    capability: chat
`
  );

  // Create minimal brain structure
  writeFileSync(join(repoDir, "cocapn", "soul.md"), "# Test Agent\n\nYou are a test agent.");
  writeFileSync(join(repoDir, "cocapn", "facts.json"), "{}");
  writeFileSync(join(repoDir, "cocapn", "wiki.json"), "{}");

  // Create HTTP + WebSocket server
  const httpServer = new HttpServer();
  const wsServer = new WebSocketServer({ server: httpServer, path: "/" });
  const privateKey = generateJwtSecret();

  wsServer.on("connection", (ws, req) => {
    // Simple auth check
    if (!options.skipAuth) {
      const token = extractToken(req.url ?? "");
      if (!token) {
        ws.close(4001, "Missing token");
        return;
      }

      // Accept fleet JWT
      if (token.startsWith("eyJ") && options.fleetKey) {
        try {
          const payload = JSON.parse(
            Buffer.from(token.split(".")[1]!!, "base64url").toString("utf-8")
          );
          // Verify by checking exp (simplified)
          if (payload.exp < Math.floor(Date.now() / 1000)) {
            ws.close(4001, "Expired JWT");
            return;
          }
        } catch {
          ws.close(4001, "Invalid JWT");
          return;
        }
      }
    }

    // Echo back any message
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        ws.send(JSON.stringify({ type: "echo", data: msg }));
      } catch {
        ws.send(JSON.stringify({ type: "error", data: "Invalid JSON" }));
      }
    });

    ws.send(JSON.stringify({ type: "connected", data: { ready: true } }));
  });

  httpServer.listen(0);

  const port = (httpServer.address() as { port: number }).port;

  return {
    repoDir,
    privateKey,
    server: httpServer,
    wsServer,
    port,
    close: () => {
      wsServer.close();
      httpServer.close();
      rmSync(repoDir, { recursive: true, force: true });
    },
  };
}

// ─── Test client creation ─────────────────────────────────────────────────────

/**
 * Create a WebSocket client for testing.
 */
export function createTestClient(port: number, token?: string): TestClient {
  const messages: Array<{ type: string; data: unknown }> = [];
  const url = `ws://localhost:${port}${token ? `?token=${token}` : ""}`;
  const ws = new WebSocket(url);

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      messages.push(msg);
    } catch {
      // Ignore invalid JSON
    }
  });

  return {
    ws,
    messages,
    send: (data: unknown) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(data));
      }
    },
    waitForMessage: (type: string, timeoutMs = 5000): Promise<unknown> => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Timeout waiting for message type: ${type}`));
        }, timeoutMs);

        const check = () => {
          const msg = messages.find((m) => m.type === type);
          if (msg) {
            clearTimeout(timeout);
            resolve(msg.data);
          } else {
            setTimeout(check, 10);
          }
        };

        check();
      });
    },
    close: () => {
      ws.close();
    },
  };
}

// ─── Test cleanup ─────────────────────────────────────────────────────────────

/**
 * Cleanup a test bridge and its temporary directory.
 */
export function cleanupTestBridge(bridge: TestBridge): void {
  try {
    bridge.close();
  } catch {
    // Ignore cleanup errors
  }
}

// ─── Mock GitHub API ─────────────────────────────────────────────────────────

/**
 * Mock the GitHub API for PAT validation.
 */
export function mockGithubApi(login: string, shouldFail = false): void {
  global.fetch = (() => {
    if (shouldFail) {
      return Promise.resolve({
        ok: false,
        status: 401,
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({ login }),
    } as Response);
  }) as typeof fetch;
}

/**
 * Restore the real fetch implementation.
 */
export function restoreGithubApi(): void {
  // @ts-expect-error - restore global fetch
  delete global.fetch;
}

// ─── Path traversal test vectors ───────────────────────────────────────────────

/**
 * Common path traversal attack vectors.
 */
export const PATH_TRAVERSAL_VECTORS = [
  // Basic traversal
  "../../../etc/passwd",
  "..\\..\\..\\windows\\system32",
  "../../../../../etc/shadow",

  // Null byte injection
  "file.txt\x00.txt",
  "\x00etc/passwd",
  "normal.png\x00.php",

  // Absolute path injection
  "/etc/passwd",
  "C:\\Windows\\System32\\config",
  "\\\\network\\share\\malicious",

  // Double-dot non-traversal (should pass)
  "file..txt",
  "normal...file.txt",

  // Encoded traversal
  "..%2F..%2F..%2Fetc%2Fpasswd",
  "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",

  // Mixed separators
  "..\\..\\../etc/passwd",
  "../..\\windows/system32",

  // Unicode attacks
  "..\\u002f..\\u002fetc/passwd",
  "..%c0%af..%c0%afetc/passwd",
];

// ─── JWT test utilities ────────────────────────────────────────────────────────

/**
 * Create a test fleet JWT.
 */
export function createTestJwt(sub: string, fleetKey: string, ttlSeconds = 3600): string {
  return signJwt({ sub }, fleetKey, { ttlSeconds });
}

/**
 * Create an expired JWT for testing.
 */
export function createExpiredJwt(fleetKey: string): string {
  return signJwt({ sub: "expired-user" }, fleetKey, { ttlSeconds: -1 });
}

// ─── Assertion helpers ────────────────────────────────────────────────────────

/**
 * Assert that a WebSocket was closed with a specific code.
 */
export function assertClosedWithCode(ws: WebSocket, code: number): boolean {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 1000);
    ws.once("close", (closeCode) => {
      clearTimeout(timeout);
      resolve(closeCode === code);
    });
  }).then((result) => result);
}

/**
 * Wait for a WebSocket to open.
 */
export function waitForOpen(ws: WebSocket): Promise<boolean> {
  return new Promise((resolve) => {
    if (ws.readyState === ws.OPEN) {
      resolve(true);
      return;
    }
    const timeout = setTimeout(() => resolve(false), 1000);
    ws.once("open", () => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
}
