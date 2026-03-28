/**
 * AdmiralDO — Durable Object for cross-device session persistence.
 *
 * Stores the current "state of the bridge" so cloud agents started on one
 * device can pick up where they left off on another.
 *
 * Git is still the source of truth; Admiral only caches:
 *   - Active task queue (tasks in progress that haven't been committed yet)
 *   - Recent message log (last N messages for quick context without GitHub fetch)
 *   - Bridge heartbeat (last-seen timestamp per bridge instance)
 *
 * When the local bridge commits to Git, it POSTs to /notify to let Admiral
 * know the repo has been updated so the cache can be refreshed.
 */

export interface AdmiralState {
  tasks:    ActiveTask[];
  messages: RecentMessage[];
  bridges:  BridgeHeartbeat[];
  lastGitCommit: string | undefined;
}

export interface ActiveTask {
  id:          string;
  agentId:     string;
  description: string;
  status:      "pending" | "running" | "done" | "failed";
  createdAt:   string;
  updatedAt:   string;
  result:      string | undefined;
}

export interface RecentMessage {
  role:      "user" | "agent";
  agentId:   string | undefined;
  content:   string;
  timestamp: string;
}

export interface BridgeHeartbeat {
  instanceId: string;
  hostname:   string;
  lastSeen:   string;
  repoRoot:   string | undefined;
}

const MAX_MESSAGES = 100;
const MAX_TASKS    = 50;

export class AdmiralDO implements DurableObject {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url      = new URL(request.url);
    const pathname = url.pathname.replace(/^\/+/, "");

    if (request.method === "GET" && pathname === "state") {
      return this.handleGetState();
    }
    if (request.method === "POST" && pathname === "task") {
      return this.handleUpsertTask(request);
    }
    if (request.method === "POST" && pathname === "message") {
      return this.handleAddMessage(request);
    }
    if (request.method === "POST" && pathname === "heartbeat") {
      return this.handleHeartbeat(request);
    }
    if (request.method === "POST" && pathname === "notify") {
      return this.handleGitNotify(request);
    }
    if (request.method === "DELETE" && pathname === "task") {
      return this.handleDeleteTask(request);
    }

    return new Response("Not Found", { status: 404 });
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  private async handleGetState(): Promise<Response> {
    const [tasks, messages, bridges, lastGitCommit] = await Promise.all([
      this.state.storage.get<ActiveTask[]>("tasks"),
      this.state.storage.get<RecentMessage[]>("messages"),
      this.state.storage.get<BridgeHeartbeat[]>("bridges"),
      this.state.storage.get<string>("lastGitCommit"),
    ]);

    const body: AdmiralState = {
      tasks:         tasks    ?? [],
      messages:      messages ?? [],
      bridges:       bridges  ?? [],
      lastGitCommit,
    };

    return json(body);
  }

  private async handleUpsertTask(request: Request): Promise<Response> {
    const task = await request.json() as Partial<ActiveTask>;
    if (!task.id || !task.agentId) return new Response("Missing id or agentId", { status: 400 });

    const tasks = (await this.state.storage.get<ActiveTask[]>("tasks")) ?? [];
    const idx   = tasks.findIndex((t) => t.id === task.id);
    const now   = new Date().toISOString();

    if (idx >= 0) {
      tasks[idx] = { ...tasks[idx]!, ...task, updatedAt: now };
    } else {
      tasks.push({
        id:          task.id,
        agentId:     task.agentId,
        description: task.description ?? "",
        status:      task.status      ?? "pending",
        createdAt:   task.createdAt   ?? now,
        updatedAt:   now,
        result:      task.result,
      });
    }

    // Keep only the most recent MAX_TASKS
    const trimmed = tasks.slice(-MAX_TASKS);
    await this.state.storage.put("tasks", trimmed);
    return json({ ok: true });
  }

  private async handleAddMessage(request: Request): Promise<Response> {
    const msg = await request.json() as Partial<RecentMessage>;
    if (!msg.content || !msg.role) return new Response("Missing content or role", { status: 400 });

    const messages = (await this.state.storage.get<RecentMessage[]>("messages")) ?? [];
    messages.push({
      role:      msg.role,
      agentId:   msg.agentId,
      content:   msg.content,
      timestamp: new Date().toISOString(),
    });

    const trimmed = messages.slice(-MAX_MESSAGES);
    await this.state.storage.put("messages", trimmed);
    return json({ ok: true });
  }

  private async handleHeartbeat(request: Request): Promise<Response> {
    const hb = await request.json() as Partial<BridgeHeartbeat>;
    if (!hb.instanceId) return new Response("Missing instanceId", { status: 400 });

    const bridges = (await this.state.storage.get<BridgeHeartbeat[]>("bridges")) ?? [];
    const idx     = bridges.findIndex((b) => b.instanceId === hb.instanceId);
    const updated: BridgeHeartbeat = {
      instanceId: hb.instanceId,
      hostname:   hb.hostname   ?? "unknown",
      lastSeen:   new Date().toISOString(),
      repoRoot:   hb.repoRoot,
    };

    if (idx >= 0) {
      bridges[idx] = updated;
    } else {
      bridges.push(updated);
    }

    // Prune bridges not seen for 5 minutes
    const cutoff = Date.now() - 5 * 60 * 1000;
    const live   = bridges.filter((b) => new Date(b.lastSeen).getTime() > cutoff);
    await this.state.storage.put("bridges", live);
    return json({ ok: true });
  }

  private async handleGitNotify(request: Request): Promise<Response> {
    const body = await request.json() as { sha?: string };
    if (body.sha) {
      await this.state.storage.put("lastGitCommit", body.sha);
    }
    return json({ ok: true, sha: body.sha });
  }

  private async handleDeleteTask(request: Request): Promise<Response> {
    const url  = new URL(request.url);
    const id   = url.searchParams.get("id");
    if (!id) return new Response("Missing id", { status: 400 });

    const tasks   = (await this.state.storage.get<ActiveTask[]>("tasks")) ?? [];
    const trimmed = tasks.filter((t) => t.id !== id);
    await this.state.storage.put("tasks", trimmed);
    return json({ ok: true });
  }
}

// ─── AdmiralClient ────────────────────────────────────────────────────────────
//
// Called from the local bridge to push heartbeats and git-notify events.

export class AdmiralClient {
  private baseUrl: string;
  private token:   string | undefined;

  constructor(baseUrl: string, token?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token   = token;
  }

  async getState(): Promise<AdmiralState | null> {
    return this.fetch<AdmiralState>("GET", "state");
  }

  async upsertTask(task: Partial<ActiveTask>): Promise<void> {
    await this.fetch("POST", "task", task);
  }

  async addMessage(msg: Partial<RecentMessage>): Promise<void> {
    await this.fetch("POST", "message", msg);
  }

  async heartbeat(hb: Omit<BridgeHeartbeat, "lastSeen">): Promise<void> {
    await this.fetch("POST", "heartbeat", hb);
  }

  async notifyGitCommit(sha: string): Promise<void> {
    await this.fetch("POST", "notify", { sha });
  }

  private async fetch<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    const headers: Record<string, string> = {};
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
    if (body)       headers["Content-Type"]  = "application/json";

    try {
      const res = await globalThis.fetch(`${this.baseUrl}/${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) return null;
      return res.json() as Promise<T>;
    } catch {
      return null;
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}
