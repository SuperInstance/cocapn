/**
 * Unit tests for src/security/auth-handler.ts
 *
 * Covers:
 *   1. extractToken — pure URL parsing
 *   2. validateGithubPat — GitHub PAT validation (mocked fetch)
 *   3. authenticateConnection — skipAuth, missing token (4001 close), valid fleet JWT
 *   4. verifyPeerAuth — HTTP Authorization header verification
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WebSocket } from "ws";
import type { IncomingMessage } from "http";
import {
  extractToken,
  validateGithubPat,
  authenticateConnection,
  verifyPeerAuth,
} from "../src/security/auth-handler.js";
import { signJwt, generateJwtSecret, verifyJwt } from "../src/security/jwt.js";
import { AuditLogger } from "../src/security/audit.js";

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

// ─── extractToken ─────────────────────────────────────────────────────────────

describe("extractToken", () => {
  it("returns token from query string", () => {
    expect(extractToken("/?token=ghp_abc123")).toBe("ghp_abc123");
    expect(extractToken("/ws?token=eyJmoo&other=1")).toBe("eyJmoo");
  });

  it("returns undefined when no token param", () => {
    expect(extractToken("/")).toBeUndefined();
    expect(extractToken("/?other=value")).toBeUndefined();
    expect(extractToken("")).toBeUndefined();
  });
});

// ─── validateGithubPat ────────────────────────────────────────────────────────

describe("validateGithubPat", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns login on successful GitHub API response", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ login: "testuser" }),
      } as Response)
    );

    const login = await validateGithubPat("ghp_testtoken");
    expect(login).toBe("testuser");
  });

  it("returns undefined on failed GitHub API response", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
      } as Response)
    );

    const login = await validateGithubPat("ghp_badtoken");
    expect(login).toBeUndefined();
  });

  it("returns undefined on network error", async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error("Network error")));

    const login = await validateGithubPat("ghp_testtoken");
    expect(login).toBeUndefined();
  });
});

// ─── verifyPeerAuth ────────────────────────────────────────────────────────────

describe("verifyPeerAuth", () => {
  it("returns true when skipAuth is true", () => {
    const req = { headers: {} } as unknown as IncomingMessage;
    expect(verifyPeerAuth(req, true, undefined)).toBe(true);
  });

  it("returns false when fleetKey is undefined", () => {
    const req = { headers: { authorization: "Bearer token" } } as unknown as IncomingMessage;
    expect(verifyPeerAuth(req, false, undefined)).toBe(false);
  });

  it("returns true for valid fleet JWT", () => {
    const fleetKey = generateJwtSecret();
    const token = signJwt({ sub: "peer-bridge" }, fleetKey);
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as unknown as IncomingMessage;

    expect(verifyPeerAuth(req, false, fleetKey)).toBe(true);
  });

  it("returns false for invalid fleet JWT", () => {
    const fleetKey = generateJwtSecret();
    const badToken = signJwt({ sub: "attacker" }, generateJwtSecret());
    const req = {
      headers: { authorization: `Bearer ${badToken}` },
    } as unknown as IncomingMessage;

    expect(verifyPeerAuth(req, false, fleetKey)).toBe(false);
  });

  it("returns false when Authorization header is missing", () => {
    const fleetKey = generateJwtSecret();
    const req = { headers: {} } as unknown as IncomingMessage;

    expect(verifyPeerAuth(req, false, fleetKey)).toBe(false);
  });
});

// ─── authenticateConnection ────────────────────────────────────────────────────

describe("authenticateConnection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("skipAuth: true returns AuthResult without closing the socket", async () => {
    const { ws, closeSpy } = makeWs();
    const audit = makeAuditLog();

    const result = await authenticateConnection(ws, makeReq("/"), {
      skipAuth: true,
      fleetKey: undefined,
      audit,
    });

    expect(result).toEqual({ githubLogin: undefined, githubToken: undefined });
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it("closes with 4001 when token is missing and auth is required", async () => {
    const { ws, closeSpy } = makeWs();
    const audit = makeAuditLog();

    const result = await authenticateConnection(ws, makeReq("/ws"), {
      skipAuth: false,
      fleetKey: undefined,
      audit,
    });

    expect(result).toBeUndefined();
    expect(closeSpy).toHaveBeenCalledOnce();
    expect(closeSpy).toHaveBeenCalledWith(4001, expect.stringContaining("Missing token"));
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.reject", result: "denied" })
    );
  });

  it("authenticates with a valid fleet JWT", async () => {
    const fleetKey = generateJwtSecret();
    const token = signJwt({ sub: "peer-bridge" }, fleetKey, { ttlSeconds: 60 });
    const { ws, closeSpy } = makeWs();
    const audit = makeAuditLog();

    const result = await authenticateConnection(ws, makeReq(`/?token=${token}`), {
      skipAuth: false,
      fleetKey,
      audit,
    });

    expect(result).toMatchObject({ githubLogin: "peer-bridge", githubToken: undefined });
    expect(closeSpy).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.connect", result: "ok", detail: "fleet-jwt" })
    );
  });

  it("closes with 4001 on invalid fleet JWT signature", async () => {
    const fleetKey = generateJwtSecret();
    const badToken = signJwt({ sub: "attacker" }, generateJwtSecret());
    const { ws, closeSpy } = makeWs();
    const audit = makeAuditLog();

    const result = await authenticateConnection(ws, makeReq(`/?token=${badToken}`), {
      skipAuth: false,
      fleetKey,
      audit,
    });

    expect(result).toBeUndefined();
    expect(closeSpy).toHaveBeenCalledWith(4001, expect.stringContaining("Invalid fleet JWT"));
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.reject", result: "denied" })
    );
  });

  it("authenticates with a valid GitHub PAT", async () => {
    const { ws, closeSpy } = makeWs();
    const audit = makeAuditLog();

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ login: "testuser" }),
      } as Response)
    );

    const onGithubToken = vi.fn();
    const result = await authenticateConnection(ws, makeReq(`/?token=ghp_testtoken`), {
      skipAuth: false,
      fleetKey: undefined,
      audit,
      onGithubToken,
    });

    expect(result).toMatchObject({ githubLogin: "testuser", githubToken: "ghp_testtoken" });
    expect(closeSpy).not.toHaveBeenCalled();
    expect(onGithubToken).toHaveBeenCalledWith("ghp_testtoken");
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.connect", result: "ok", detail: "github-pat" })
    );
  });

  it("closes with 4001 on invalid GitHub PAT", async () => {
    const { ws, closeSpy } = makeWs();
    const audit = makeAuditLog();

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
      } as Response)
    );

    const result = await authenticateConnection(ws, makeReq(`/?token=ghp_badtoken`), {
      skipAuth: false,
      fleetKey: undefined,
      audit,
    });

    expect(result).toBeUndefined();
    expect(closeSpy).toHaveBeenCalledWith(4001, expect.stringContaining("Invalid or expired GitHub PAT"));
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.reject", result: "denied" })
    );
  });
});
