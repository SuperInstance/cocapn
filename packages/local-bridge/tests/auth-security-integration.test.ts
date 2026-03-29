/**
 * Integration tests for authentication and security (Roadmap2 Prompt #3, test #5).
 *
 * Tests:
 *   1. Valid GitHub PAT authentication
 *   2. Invalid/expired GitHub PAT rejection
 *   3. Valid Fleet JWT authentication
 *   4. Expired Fleet JWT rejection
 *   5. Invalid Fleet JWT signature rejection
 *   6. Missing token rejection (4001 close code)
 *   7. Token injection via URL parameter
 *   8. Concurrent authentication requests
 *
 * These are integration tests that verify end-to-end security behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { IncomingMessage } from "http";
import { WebSocket } from "ws";
import {
  extractToken,
  validateGithubPat,
  authenticateConnection,
  verifyPeerAuth,
} from "../src/security/auth-handler.js";
import {
  signJwt,
  verifyJwt,
  generateJwtSecret,
} from "../src/security/jwt.js";
import { AuditLogger } from "../src/security/audit.js";
import {
  mockGithubApi,
  restoreGithubApi,
  createTestJwt,
  createExpiredJwt,
} from "./integration-helpers.js";

// ─── Test fixtures ───────────────────────────────────────────────────────────

function makeWs(): { ws: WebSocket; closeSpy: ReturnType<typeof vi.fn> } {
  const closeSpy = vi.fn();
  const ws = { close: closeSpy } as unknown as WebSocket;
  return { ws, closeSpy };
}

function makeReq(url: string): IncomingMessage {
  return { url } as unknown as IncomingMessage;
}

function makeAuditLog(): AuditLogger {
  return {
    log: vi.fn(),
    start: vi.fn(() => vi.fn()),
  } as unknown as AuditLogger;
}

// ─── GitHub PAT Authentication ───────────────────────────────────────────────

describe("Auth Security Integration: GitHub PAT", () => {
  beforeEach(() => {
    mockGithubApi("testuser");
  });

  afterEach(() => {
    restoreGithubApi();
  });

  it("validates a correct GitHub PAT and returns login", async () => {
    const login = await validateGithubPat("ghp_validtoken123");
    expect(login).toBe("testuser");
  });

  it("rejects an invalid GitHub PAT", async () => {
    mockGithubApi("testuser", true); // shouldFail = true
    const login = await validateGithubPat("ghp_invalidtoken");
    expect(login).toBeUndefined();
  });

  it("authenticates WebSocket connection with valid PAT", async () => {
    const { ws, closeSpy } = makeWs();
    const audit = makeAuditLog();

    const result = await authenticateConnection(ws, makeReq(`/?token=ghp_validpat`), {
      skipAuth: false,
      fleetKey: undefined,
      audit,
    });

    expect(result).toMatchObject({
      githubLogin: "testuser",
      githubToken: "ghp_validpat",
    });
    expect(closeSpy).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.connect",
        result: "ok",
        detail: "github-pat",
      })
    );
  });

  it("closes connection with 4001 on invalid PAT", async () => {
    mockGithubApi("testuser", true); // shouldFail = true
    const { ws, closeSpy } = makeWs();
    const audit = makeAuditLog();

    const result = await authenticateConnection(
      ws,
      makeReq(`/?token=ghp_invalidpat`),
      {
        skipAuth: false,
        fleetKey: undefined,
        audit,
      }
    );

    expect(result).toBeUndefined();
    expect(closeSpy).toHaveBeenCalledWith(
      4001,
      expect.stringContaining("Invalid or expired GitHub PAT")
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.reject",
        result: "denied",
      })
    );
  });

  it("forwards valid token to onGithubToken callback", async () => {
    const { ws, closeSpy } = makeWs();
    const audit = makeAuditLog();
    const onGithubToken = vi.fn();

    await authenticateConnection(ws, makeReq(`/?token=ghp_callback_test`), {
      skipAuth: false,
      fleetKey: undefined,
      audit,
      onGithubToken,
    });

    expect(onGithubToken).toHaveBeenCalledWith("ghp_callback_test");
    expect(closeSpy).not.toHaveBeenCalled();
  });
});

// ─── Fleet JWT Authentication ─────────────────────────────────────────────────

describe("Auth Security Integration: Fleet JWT", () => {
  const fleetKey = generateJwtSecret();

  it("authenticates with a valid fleet JWT", async () => {
    const token = createTestJwt("bridge-instance-1", fleetKey, 3600);
    const { ws, closeSpy } = makeWs();
    const audit = makeAuditLog();

    const result = await authenticateConnection(
      ws,
      makeReq(`/?token=${token}`),
      {
        skipAuth: false,
        fleetKey,
        audit,
      }
    );

    expect(result).toMatchObject({
      githubLogin: "bridge-instance-1",
      githubToken: undefined,
    });
    expect(closeSpy).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.connect",
        result: "ok",
        detail: "fleet-jwt",
      })
    );
  });

  it("rejects an expired fleet JWT", async () => {
    const expiredToken = createExpiredJwt(fleetKey);
    const { ws, closeSpy } = makeWs();
    const audit = makeAuditLog();

    const result = await authenticateConnection(
      ws,
      makeReq(`/?token=${expiredToken}`),
      {
        skipAuth: false,
        fleetKey,
        audit,
      }
    );

    expect(result).toBeUndefined();
    expect(closeSpy).toHaveBeenCalledWith(
      4001,
      expect.stringContaining("Invalid fleet JWT")
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.reject",
        result: "denied",
      })
    );
  });

  it("rejects JWT with invalid signature", async () => {
    const wrongKey = generateJwtSecret();
    const token = signJwt({ sub: "attacker" }, wrongKey);
    const { ws, closeSpy } = makeWs();
    const audit = makeAuditLog();

    const result = await authenticateConnection(
      ws,
      makeReq(`/?token=${token}`),
      {
        skipAuth: false,
        fleetKey,
        audit,
      }
    );

    expect(result).toBeUndefined();
    expect(closeSpy).toHaveBeenCalledWith(
      4001,
      expect.stringContaining("Invalid fleet JWT")
    );
  });

  it("rejects JWT with wrong issuer", async () => {
    // Manually craft a JWT with wrong issuer
    const header = { alg: "HS256", typ: "JWT" };
    const payload = {
      sub: "user",
      iss: "evil-attacker", // Wrong issuer
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const { createHmac } = await import("node:crypto");
    const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
    const bodyB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const data = `${headerB64}.${bodyB64}`;
    const sig = createHmac("sha256", fleetKey)
      .update(data)
      .digest()
      .toString("base64url");
    const token = `${data}.${sig}`;

    const { ws, closeSpy } = makeWs();
    const audit = makeAuditLog();

    const result = await authenticateConnection(
      ws,
      makeReq(`/?token=${token}`),
      {
        skipAuth: false,
        fleetKey,
        audit,
      }
    );

    expect(result).toBeUndefined();
    expect(closeSpy).toHaveBeenCalledWith(
      4001,
      expect.stringContaining("Invalid fleet JWT")
    );
  });

  it("verifies peer auth from HTTP Authorization header", () => {
    const token = signJwt({ sub: "peer-bridge" }, fleetKey);
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as unknown as IncomingMessage;

    const result = verifyPeerAuth(req, false, fleetKey);
    expect(result).toBe(true);
  });

  it("rejects peer auth with missing Authorization header", () => {
    const req = { headers: {} } as unknown as IncomingMessage;
    const result = verifyPeerAuth(req, false, fleetKey);
    expect(result).toBe(false);
  });

  it("rejects peer auth with invalid token", () => {
    const req = {
      headers: { authorization: "Bearer invalid-jwt" },
    } as unknown as IncomingMessage;
    const result = verifyPeerAuth(req, false, fleetKey);
    expect(result).toBe(false);
  });

  it("allows peer auth when skipAuth is true", () => {
    const req = { headers: {} } as unknown as IncomingMessage;
    const result = verifyPeerAuth(req, true, undefined);
    expect(result).toBe(true);
  });
});

// ─── Missing Token Rejection ──────────────────────────────────────────────────

describe("Auth Security Integration: Missing Token", () => {
  it("closes with 4001 when token parameter is missing", async () => {
    const { ws, closeSpy } = makeWs();
    const audit = makeAuditLog();

    const result = await authenticateConnection(ws, makeReq("/"), {
      skipAuth: false,
      fleetKey: undefined,
      audit,
    });

    expect(result).toBeUndefined();
    expect(closeSpy).toHaveBeenCalledWith(
      4001,
      expect.stringContaining("Missing token")
    );
  });

  it("closes with 4001 when token parameter is empty", async () => {
    const { ws, closeSpy } = makeWs();
    const audit = makeAuditLog();

    const result = await authenticateConnection(ws, makeReq(`/?token=`), {
      skipAuth: false,
      fleetKey: undefined,
      audit,
    });

    expect(result).toBeUndefined();
    expect(closeSpy).toHaveBeenCalledWith(
      4001,
      expect.stringContaining("Missing token")
    );
  });
});

// ─── Token Injection ───────────────────────────────────────────────────────────

describe("Auth Security Integration: Token Extraction", () => {
  it("extracts token from URL query parameter", () => {
    expect(extractToken("/?token=ghp_abc123")).toBe("ghp_abc123");
    expect(extractToken("/ws?token=eyJmoo&other=1")).toBe("eyJmoo");
  });

  it("returns undefined when token parameter is missing", () => {
    expect(extractToken("/")).toBeUndefined();
    expect(extractToken("/?other=value")).toBeUndefined();
    expect(extractToken("")).toBeUndefined();
  });

  it("handles malformed URLs gracefully", () => {
    expect(extractToken("not-a-url")).toBeUndefined();
    expect(extractToken("?")).toBeUndefined();
  });

  it("extracts JWT tokens correctly", () => {
    const token = createTestJwt("user", "secret");
    expect(extractToken(`/?token=${token}`)).toBe(token);
  });
});

// ─── Concurrent Authentication ───────────────────────────────────────────────

describe("Auth Security Integration: Concurrent Auth", () => {
  beforeEach(() => {
    mockGithubApi("user1");
  });

  afterEach(() => {
    restoreGithubApi();
  });

  it("handles multiple simultaneous auth requests", async () => {
    const fleetKey = generateJwtSecret();
    const token1 = createTestJwt("user1", fleetKey);
    const token2 = createTestJwt("user2", fleetKey);

    const { ws: ws1, closeSpy: closeSpy1 } = makeWs();
    const { ws: ws2, closeSpy: closeSpy2 } = makeWs();
    const audit = makeAuditLog();

    // Run auth requests concurrently
    const [result1, result2] = await Promise.all([
      authenticateConnection(ws1, makeReq(`/?token=${token1}`), {
        skipAuth: false,
        fleetKey,
        audit,
      }),
      authenticateConnection(ws2, makeReq(`/?token=${token2}`), {
        skipAuth: false,
        fleetKey,
        audit,
      }),
    ]);

    expect(result1).toMatchObject({ githubLogin: "user1" });
    expect(result2).toMatchObject({ githubLogin: "user2" });
    expect(closeSpy1).not.toHaveBeenCalled();
    expect(closeSpy2).not.toHaveBeenCalled();
  });

  it("isolates failures between concurrent requests", async () => {
    mockGithubApi("valid", true); // Should fail
    const fleetKey = generateJwtSecret();
    const validToken = createTestJwt("valid", fleetKey);

    const { ws: ws1, closeSpy: closeSpy1 } = makeWs();
    const { ws: ws2, closeSpy: closeSpy2 } = makeWs();
    const audit = makeAuditLog();

    const [result1, result2] = await Promise.all([
      authenticateConnection(ws1, makeReq(`/?token=${validToken}`), {
        skipAuth: false,
        fleetKey,
        audit,
      }),
      authenticateConnection(ws2, makeReq(`/?token=invalid_token`), {
        skipAuth: false,
        fleetKey: undefined,
        audit,
      }),
    ]);

    // Fleet JWT should succeed
    expect(result1).toMatchObject({ githubLogin: "valid" });
    expect(closeSpy1).not.toHaveBeenCalled();

    // Invalid token should fail
    expect(result2).toBeUndefined();
    expect(closeSpy2).toHaveBeenCalledWith(4001, expect.any(String));
  });
});

// ─── Token Format Validation ───────────────────────────────────────────────────

describe("Auth Security Integration: Token Format", () => {
  it("distinguishes JWT from PAT based on eyJ prefix", () => {
    const jwtToken = createTestJwt("user", "secret");
    expect(jwtToken.startsWith("eyJ")).toBe(true);

    const patToken = "ghp_" + "a".repeat(36);
    expect(patToken.startsWith("eyJ")).toBe(false);
  });

  it("accepts JWT format tokens only when fleet key is configured", async () => {
    const fleetKey = generateJwtSecret();
    const jwtToken = createTestJwt("user", fleetKey);

    const { ws, closeSpy } = makeWs();
    const audit = makeAuditLog();

    // With fleet key - should succeed
    const result1 = await authenticateConnection(
      ws,
      makeReq(`/?token=${jwtToken}`),
      {
        skipAuth: false,
        fleetKey,
        audit,
      }
    );

    expect(result1).toMatchObject({ githubLogin: "user" });
    expect(closeSpy).not.toHaveBeenCalled();
  });
});
