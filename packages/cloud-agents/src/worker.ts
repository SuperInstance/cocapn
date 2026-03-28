/**
 * Cocapn Cloud Agent Worker
 *
 * Implements an A2A server that the local bridge delegates heavy tasks to.
 * On every task:
 *   1. Reads soul.md + memory from the private GitHub repo for context
 *   2. Executes the task (stub — replace with real AI call)
 *   3. Writes results back to GitHub as a commit
 *   4. Notifies the Admiral DO so other bridge instances can see the update
 *
 * Deploy: wrangler deploy
 * Secrets: GITHUB_PAT, CF_API_TOKEN  (set via `wrangler secret put`)
 */

import { A2AServer } from "@cocapn/protocols/a2a";
import type { Task } from "@cocapn/protocols/a2a";
import { makeGitHubClient } from "./github.js";
import { AdmiralClient } from "./admiral.js";
export { AdmiralDO } from "./admiral.js";

// ─── Worker Env ───────────────────────────────────────────────────────────────

export interface Env {
  GITHUB_PAT:   string;
  PRIVATE_REPO: string;
  PUBLIC_REPO:  string;
  BRIDGE_MODE:  string;
  ADMIRAL:      DurableObjectNamespace;
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

// ─── Handler ──────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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
