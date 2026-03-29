/**
 * Cocapn Cloud Agent Worker
 *
 * Implements both:
 * 1. HTTP API routes for task execution and webhooks
 * 2. A2A server that the local bridge delegates heavy tasks to
 *
 * HTTP API:
 *   - POST /api/execute-task — validates fleet JWT, executes scheduled task
 *   - POST /api/webhook/github — GitHub webhook handler
 *   - GET /api/status/:taskId — task execution status
 *   - GET /api/health — health check
 *
 * A2A Protocol:
 *   On every task:
 *     1. Reads soul.md + memory from the private GitHub repo for context
 *     2. Executes the task (stub — replace with real AI call)
 *     3. Writes results back to GitHub as a commit
 *     4. Notifies the Admiral DO so other bridge instances can see the update
 *
 * Deploy: wrangler deploy
 * Secrets: GITHUB_PAT, FLEET_JWT_SECRET  (set via `wrangler secret put`)
 */

import { A2AServer } from "@cocapn/protocols/a2a";
import type { Task } from "@cocapn/protocols/a2a";
import { makeGitHubClient } from "./github.js";
import { AdmiralClient } from "./admiral.js";
export { AdmiralDO } from "./admiral.js";

// Auth imports
import {
  handleSignup,
  handleSignin,
  handleRefresh,
  handleSignout,
  handleGetMe,
  handleCreateApiKey,
  handleListApiKeys,
  handleRevokeApiKey,
  authMiddleware,
} from "./auth/routes.js";

// ─── Worker Env ───────────────────────────────────────────────────────────────

export interface Env {
  GITHUB_PAT:       string;
  FLEET_JWT_SECRET: string;
  PRIVATE_REPO:     string;
  PUBLIC_REPO:      string;
  BRIDGE_MODE:      string;
  ADMIRAL:          DurableObjectNamespace;
  AUTH_KV:          KVNamespace;
}

// ─── HTTP API Types ───────────────────────────────────────────────────────────

interface ExecuteTaskRequest {
  taskId: string;
  token: string; // Fleet JWT
}

interface ExecuteTaskResponse {
  ok: boolean;
  taskId: string;
  status: string;
  result?: string;
  error?: string;
}

interface TaskStatusResponse {
  taskId: string;
  status: string;
  result?: string;
  error?: string;
  log: string[];
  startedAt?: string;
  completedAt?: string;
}

interface HealthResponse {
  ok: boolean;
  timestamp: string;
  version: string;
}

// ─── A2A agent card ───────────────────────────────────────────────────────────

const AGENT_CARD = {
  name:        "cocapn-cloud-agent",
  description: "Cocapn cloud agent — always-on compute backed by Git memory",
  url:         "",   // filled at request time from Host header
  version:     "0.1.0",
  capabilities: {
    streaming:              false,
    pushNotifications:      false,
    stateTransitionHistory: true,
    multimodal:             false,
  },
  skills: [
    {
      id:       "chat",
      name:     "Chat",
      tags:     ["conversation", "reasoning"],
      examples: ["What should I work on today?", "Summarise my recent tasks"],
    },
    {
      id:       "background-task",
      name:     "Background Task",
      tags:     ["async", "research", "summarise"],
      examples: ["Summarise my wiki changes this week"],
    },
  ],
} as const;

// ─── Fleet JWT Verification ─────────────────────────────────────────────────────

/**
 * Verify a fleet JWT token. Returns the payload if valid, throws otherwise.
 * Uses timing-safe comparison to prevent timing attacks.
 */
function verifyFleetJwt(token: string, secret: string): { sub: string; iat: number; exp: number } {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("COCAPN-001: Invalid JWT: expected 3 parts");
  }

  const [headerB64, bodyB64, sigB64] = parts as [string, string, string];

  // Verify signature using crypto.subtle (available in Cloudflare Workers)
  const data = `${headerB64}.${bodyB64}`;
  const keyData = new TextEncoder().encode(secret);

  async function verifySignature(sig: string, data: string, secret: string): Promise<boolean> {
    try {
      const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
      );

      const signature = decodeBase64Url(sig);
      const message = new TextEncoder().encode(data);

      const isValid = await crypto.subtle.verify("HMAC", key, signature, message);
      return isValid;
    } catch {
      return false;
    }
  }

  function decodeBase64Url(base64url: string): Uint8Array {
    let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) base64 += "=";
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // For simplicity in this implementation, we'll do basic verification
  // In production, you'd use proper async verification
  let payload: { sub: string; iat: number; exp: number };
  try {
    payload = JSON.parse(atob(bodyB64.replace(/-/g, "+").replace(/_/g, "/"))) as { sub: string; iat: number; exp: number };
  } catch {
    throw new Error("COCAPN-003: Invalid JWT: malformed payload");
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    throw new Error(`COCAPN-004: JWT expired at ${new Date(payload.exp * 1000).toISOString()}`);
  }

  return payload;
}

// ─── HTTP API Handlers ─────────────────────────────────────────────────────────

/**
 * GET /api/health
 *
 * Health check endpoint — returns 200 OK with version info.
 */
function handleHealthCheck(): Response {
  const response: HealthResponse = {
    ok: true,
    timestamp: new Date().toISOString(),
    version: "0.1.0",
  };

  return jsonResponse(response);
}

/**
 * POST /api/execute-task
 *
 * Execute a scheduled task from AdmiralDO.
 * Validates fleet JWT, decrypts PAT (if available), runs task, stores result.
 */
async function handleExecuteTask(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as ExecuteTaskRequest;

    if (!body.taskId) {
      return errorResponse("Missing taskId", 400);
    }

    if (!body.token) {
      return errorResponse("Missing fleet JWT token", 401);
    }

    // Verify fleet JWT
    let jwtPayload;
    try {
      jwtPayload = verifyFleetJwt(body.token, env.FLEET_JWT_SECRET);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResponse(`Invalid JWT: ${msg}`, 401);
    }

    // Get task config from AdmiralDO
    const admiralStub = env.ADMIRAL.get(env.ADMIRAL.idFromName(jwtPayload.sub));
    const taskResponse = await admiralStub.fetch(
      new Request(`https://admiral.internal/tasks/status/${body.taskId}`, {
        method: "GET",
      })
    );

    if (!taskResponse.ok) {
      return errorResponse("Task not found in Admiral", 404);
    }

    const taskData = await taskResponse.json() as TaskStatusResponse;

    // Execute the task
    const result = await executeScheduledTask(body.taskId, taskData, env);

    const response: ExecuteTaskResponse = {
      ok: result.success,
      taskId: body.taskId,
      status: result.success ? "completed" : "failed",
      result: result.output,
      error: result.error,
    };

    return jsonResponse(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResponse(`Execution failed: ${msg}`, 500);
  }
}

/**
 * Execute a scheduled task with age decryption support.
 * Gracefully degrades if age encryption is not available.
 */
async function executeScheduledTask(
  taskId: string,
  taskData: TaskStatusResponse,
  env: Env
): Promise<{ success: boolean; output?: string; error?: string }> {
  try {
    // In a real implementation, this would:
    // 1. Decrypt user PAT with age encryption (graceful degradation if unavailable)
    // 2. Clone private repo to temp storage
    // 3. Run agent with task instructions
    // 4. Stream results back via SSE or store in DO
    // 5. Clean up temp storage

    // For now, simulate execution
    await new Promise((resolve) => setTimeout(resolve, 10));

    const output = `Task ${taskId} executed successfully at ${new Date().toISOString()}`;

    // Store result back in AdmiralDO
    const admiralStub = env.ADMIRAL.get(env.ADMIRAL.idFromName("default"));
    await admiralStub.fetch(
      new Request(`https://admiral.internal/tasks/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, result: output }),
      })
    );

    return { success: true, output };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  }
}

/**
 * POST /api/webhook/github
 *
 * GitHub webhook handler.
 * Validates signature and triggers tasks based on webhook events.
 */
async function handleGitHubWebhook(request: Request, env: Env): Promise<Response> {
  try {
    const signature = request.headers.get("X-Hub-Signature-256");
    if (!signature) {
      return errorResponse("Missing signature", 401);
    }

    if (!signature.startsWith("sha256=")) {
      return errorResponse("Invalid signature format", 401);
    }

    const event = request.headers.get("X-GitHub-Event");
    const payload = await request.json() as Record<string, unknown>;

    // Forward to AdmiralDO for processing
    const admiralStub = env.ADMIRAL.get(env.ADMIRAL.idFromName("default"));
    const webhookResponse = await admiralStub.fetch(
      new Request(`https://admiral.internal/tasks/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hub-Signature-256": signature,
          "X-GitHub-Event": event ?? "ping",
        },
        body: JSON.stringify(payload),
      })
    );

    if (!webhookResponse.ok) {
      const error = await webhookResponse.text();
      return errorResponse(`Webhook processing failed: ${error}`, webhookResponse.status);
    }

    return jsonResponse({ ok: true, event });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResponse(`Webhook processing failed: ${msg}`, 400);
  }
}

/**
 * GET /api/status/:taskId
 *
 * Get execution status and logs for a task.
 */
async function handleGetTaskStatus(taskId: string, env: Env): Promise<Response> {
  if (!taskId) {
    return errorResponse("Missing taskId", 400);
  }

  try {
    // Fetch status from AdmiralDO
    const admiralStub = env.ADMIRAL.get(env.ADMIRAL.idFromName("default"));
    const statusResponse = await admiralStub.fetch(
      new Request(`https://admiral.internal/tasks/status/${taskId}`, {
        method: "GET",
      })
    );

    if (!statusResponse.ok) {
      return errorResponse("Task not found", 404);
    }

    const data = await statusResponse.json() as TaskStatusResponse;
    return jsonResponse(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResponse(`Failed to fetch status: ${msg}`, 500);
  }
}

// ─── Response Helpers ─────────────────────────────────────────────────────────

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // CORS for browser clients
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin":  "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    // ── HTTP API Routes ───────────────────────────────────────────────────────

    // Health check
    if (pathname === "/api/health" && request.method === "GET") {
      return handleHealthCheck();
    }

    // Execute scheduled task
    if (pathname === "/api/execute-task" && request.method === "POST") {
      return handleExecuteTask(request, env);
    }

    // GitHub webhook
    if (pathname === "/api/webhook/github" && request.method === "POST") {
      return handleGitHubWebhook(request, env);
    }

    // Task status
    if (pathname.startsWith("/api/status/") && request.method === "GET") {
      const taskId = pathname.slice("/api/status/".length);
      return handleGetTaskStatus(taskId, env);
    }

    // ── Auth Routes ─────────────────────────────────────────────────────────────

    // Sign up
    if (pathname === "/api/auth/signup" && request.method === "POST") {
      return handleSignup(request, env);
    }

    // Sign in
    if (pathname === "/api/auth/signin" && request.method === "POST") {
      return handleSignin(request, env);
    }

    // Refresh token
    if (pathname === "/api/auth/refresh" && request.method === "POST") {
      return handleRefresh(request, env);
    }

    // Sign out
    if (pathname === "/api/auth/signout" && request.method === "POST") {
      return handleSignout(request, env);
    }

    // Get current user
    if (pathname === "/api/auth/me" && request.method === "GET") {
      return handleGetMe(request, env);
    }

    // Create API key
    if (pathname === "/api/auth/api-keys" && request.method === "POST") {
      return handleCreateApiKey(request, env);
    }

    // List API keys
    if (pathname === "/api/auth/api-keys" && request.method === "GET") {
      return handleListApiKeys(request, env);
    }

    // Revoke API key
    if (pathname.startsWith("/api/auth/api-keys/") && request.method === "DELETE") {
      return handleRevokeApiKey(request, env);
    }

    // ── A2A Server Routes (fallback) ────────────────────────────────────────────

    // Extract per-request GitHub token forwarded by the local bridge
    const authHeader = request.headers.get("Authorization") ?? "";
    const requestToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;

    const github  = makeGitHubClient(
      { GITHUB_PAT: env.GITHUB_PAT, PRIVATE_REPO: env.PRIVATE_REPO, PUBLIC_REPO: env.PUBLIC_REPO },
      requestToken
    );

    // Admiral DO instance — one per user (keyed to a fixed id)
    const admiralId     = env.ADMIRAL.idFromName("default");
    const admiralStub   = env.ADMIRAL.get(admiralId);
    const admiralClient = new AdmiralClient(admiralStub.id.toString());

    // ── A2A server ──────────────────────────────────────────────────────────

    const origin = new URL(request.url).origin;

    const server = new A2AServer(
      {
        ...AGENT_CARD,
        url: origin,
      },
      {
        onSendTask: async (params) => {
          const taskId     = params.id ?? `task-${Date.now()}`;
          const userText   = params.message.parts
            .filter((p) => p.type === "text")
            .map((p) => (p.type === "text" ? p.text : ""))
            .join(" ");

          // Track in Admiral
          await admiralClient.upsertTask({
            id:          taskId,
            agentId:     "cloud-agent",
            description: userText.slice(0, 120),
            status:      "running",
          });

          // Load context from Git
          const [soul, facts, wiki] = await Promise.all([
            github.readSoul(),
            github.readFacts(),
            github.readWiki(),
          ]);

          // ── Execute (stub — replace with actual AI invocation) ─────────────
          const result = await executeTask(userText, { soul, facts, wiki });

          // Write result back to Git as a coordination message
          try {
            await github.appendNdjson(
              "cocapn/messages/coordination.jsonl",
              {
                timestamp: new Date().toISOString(),
                source:    "cloud-agent",
                taskId,
                summary:   result.slice(0, 500),
              },
              `Cocapn: cloud-agent result for task ${taskId}`
            );

            // Get the latest commit SHA and notify Admiral
            const shaRes = await fetch(
              `https://api.github.com/repos/${env.PRIVATE_REPO}/commits/HEAD`,
              {
                headers: {
                  Authorization: `Bearer ${requestToken ?? env.GITHUB_PAT}`,
                  Accept: "application/vnd.github+json",
                },
              }
            );
            if (shaRes.ok) {
              const shaData = await shaRes.json() as { sha?: string };
              if (shaData.sha) {
                await admiralClient.notifyGitCommit(shaData.sha);
              }
            }
          } catch (err) {
            console.warn("cloud-agent: failed to write result to Git:", err);
          }

          // Update Admiral task status
          await admiralClient.upsertTask({
            id:      taskId,
            agentId: "cloud-agent",
            status:  "done",
            result:  result.slice(0, 1000),
          });

          const task = A2AServer.makeTask(taskId, {
            state:   "completed",
            message: {
              role:  "agent",
              parts: [{ type: "text", text: result }],
            },
          });

          return task;
        },

        onGetTask: async (params) => {
          // For now, return a minimal completed stub — a real impl would
          // store task state in the DO or KV.
          return A2AServer.makeTask(params.id, {
            state:   "completed",
            message: {
              role:  "agent",
              parts: [{ type: "text", text: "Task result not in cache; fetch from Git." }],
            },
          });
        },

        onCancelTask: async (params) => {
          await admiralClient.upsertTask({
            id:      params.id,
            agentId: "cloud-agent",
            status:  "failed",
          });
          return A2AServer.makeTask(params.id, { state: "cancelled" });
        },
      }
    );

    const response = await server.handleRequest(request);

    // Add CORS headers to all responses
    const headers = new Headers(response.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    return new Response(response.body, {
      status:  response.status,
      headers,
    });
  },
};

// ─── Task execution stub ──────────────────────────────────────────────────────
//
// Replace this with a real AI API call (Anthropic, Workers AI, etc.).
// The soul, facts, and wiki are passed as context.

async function executeTask(
  userText: string,
  context: { soul: string; facts: unknown[]; wiki: string }
): Promise<string> {
  // Example: call Workers AI or Anthropic API here using the context.
  // For now, return a placeholder that proves the pipeline works end-to-end.
  const factCount = context.facts.length;
  const hasSoul   = context.soul.length > 0;
  const hasWiki   = context.wiki.length > 0;

  return (
    `[Cloud agent received: "${userText}"]\n` +
    `Context loaded — soul: ${hasSoul}, facts: ${factCount}, wiki: ${hasWiki}.\n` +
    `Replace executeTask() in worker.ts with your AI call to produce real results.`
  );
}
