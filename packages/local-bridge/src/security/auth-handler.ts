/**
 * AuthHandler — composable WebSocket authentication.
 *
 * Supports two auth methods (tried in order):
 *   1. Fleet JWT  — token starts with "eyJ", verified via HMAC-SHA256
 *   2. GitHub PAT — validated against GitHub /user endpoint
 *
 * Returns an AuthResult on success, or closes the WebSocket with 4001 on failure.
 */

import type { WebSocket } from "ws";
import type { IncomingMessage } from "http";
import { verifyJwt } from "./jwt.js";
import type { AuditLogger } from "./audit.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const GITHUB_API = "https://api.github.com";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthResult {
  githubLogin: string | undefined;
  githubToken: string | undefined;
}

export interface AuthHandlerOptions {
  skipAuth: boolean | undefined;
  fleetKey: string | undefined;
  audit: AuditLogger;
  /** Called when GitHub PAT is validated — lets cloud adapters store the token */
  onGithubToken?: (token: string) => void;
}

// ─── Authentication ───────────────────────────────────────────────────────────

/**
 * Attempt to authenticate a new WebSocket connection.
 *
 * Returns AuthResult on success. On failure, closes the WebSocket
 * with code 4001 and returns undefined.
 */
export async function authenticateConnection(
  ws: WebSocket,
  req: IncomingMessage,
  options: AuthHandlerOptions,
): Promise<AuthResult | undefined> {
  let githubLogin: string | undefined;
  let githubToken: string | undefined;

  const rawToken = extractToken(req.url ?? "");

  if (!options.skipAuth) {
    if (!rawToken) {
      options.audit.log({
        action: "auth.reject",
        agent: undefined,
        user: undefined,
        command: undefined,
        files: undefined,
        result: "denied",
        detail: "Missing token",
        durationMs: undefined,
      });
      ws.close(4001, "Missing token — provide ?token=<github-pat> or ?token=<fleet-jwt>");
      return undefined;
    }

    // ── Fleet JWT auth (starts with "eyJ") ──────────────────────────────
    if (rawToken.startsWith("eyJ") && options.fleetKey) {
      try {
        const payload = verifyJwt(rawToken, options.fleetKey);
        githubLogin = payload.sub;
        console.info(`[bridge] Fleet JWT authenticated: ${githubLogin}`);
        options.audit.log({
          action: "auth.connect",
          agent: undefined,
          user: githubLogin,
          command: undefined,
          files: undefined,
          result: "ok",
          detail: "fleet-jwt",
          durationMs: undefined,
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        options.audit.log({
          action: "auth.reject",
          agent: undefined,
          user: undefined,
          command: undefined,
          files: undefined,
          result: "denied",
          detail,
          durationMs: undefined,
        });
        ws.close(4001, "Invalid fleet JWT");
        return undefined;
      }
    } else {
      // ── GitHub PAT auth ────────────────────────────────────────────────
      githubLogin = await validateGithubPat(rawToken);
      if (!githubLogin) {
        options.audit.log({
          action: "auth.reject",
          agent: undefined,
          user: undefined,
          command: undefined,
          files: undefined,
          result: "denied",
          detail: "Invalid GitHub PAT",
          durationMs: undefined,
        });
        ws.close(4001, "Invalid or expired GitHub PAT");
        return undefined;
      }
      githubToken = rawToken;
      console.info(`[bridge] Authenticated: ${githubLogin}`);
      options.audit.log({
        action: "auth.connect",
        agent: undefined,
        user: githubLogin,
        command: undefined,
        files: undefined,
        result: "ok",
        detail: "github-pat",
        durationMs: undefined,
      });
      // Forward the token to cloud adapters so they can call GitHub API
      options.onGithubToken?.(rawToken);
    }
  }

  return { githubLogin, githubToken };
}

/**
 * Extract token from WebSocket URL query string.
 * Supports: ws://host/?token=<value>
 */
export function extractToken(url: string): string | undefined {
  try {
    // url may be a path like /?token=ghp_...
    const params = new URLSearchParams(
      url.includes("?") ? url.slice(url.indexOf("?") + 1) : ""
    );
    return params.get("token") ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Validate a GitHub Personal Access Token against the GitHub API.
 * Returns the GitHub login on success, undefined on failure.
 */
export async function validateGithubPat(
  token: string
): Promise<string | undefined> {
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

/**
 * Verify a fleet JWT from an HTTP Authorization header.
 * Used by the peer HTTP API endpoints.
 * Returns true when auth passes or is disabled (skipAuth).
 */
export function verifyPeerAuth(
  req: IncomingMessage,
  skipAuth: boolean | undefined,
  fleetKey: string | undefined,
): boolean {
  if (skipAuth) return true;
  if (!fleetKey) return false;

  const auth = req.headers["authorization"] ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  try {
    verifyJwt(token, fleetKey);
    return true;
  } catch {
    return false;
  }
}
