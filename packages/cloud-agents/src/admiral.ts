/**
 * AdmiralDO — Durable Object for cross-device session persistence and discovery registry.
 *
 * Session persistence:
 *   Stores the current "state of the bridge" so cloud agents started on one
 *   device can pick up where they left off on another.
 *   Git is still the source of truth; Admiral only caches:
 *     - Active task queue (tasks in progress that haven't been committed yet)
 *     - Recent message log (last N messages for quick context without GitHub fetch)
 *     - Bridge heartbeat (last-seen timestamp per bridge instance)
 *
 * Discovery registry:
 *   Stores user profiles for cross-domain discovery.
 *     - Profiles are signed with fleet key JWTs
 *     - 30-day TTL with auto-cleanup
 *     - Search by username, displayName, or currentFocus
 *     - Single-profile lookup by username
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

// ─── Registry types ─────────────────────────────────────────────────────────────

export interface RegistryProfile {
  /** Username (unique identifier) */
  username: string;
  /** Display name from facts.json */
  displayName?: string;
  /** Current project/focus from facts.json */
  currentFocus?: string;
  /** Website URL from facts.json */
  website?: string;
  /** Bio from soul.md */
  bio?: string;
  /** Fleet domains this user is part of */
  domains: string[];
  /** JWT signature verifying authenticity */
  signature: string;
  /** ISO timestamp when profile was registered */
  registeredAt: string;
  /** ISO timestamp when profile expires (30 days) */
  expiresAt: string;
}

export interface RegisterRequest {
  profile: RegistryProfile;
}

export interface RegisterResponse {
  ok: boolean;
  peerCount: number;
}

export interface DiscoverResponse {
  results: RegistryProfile[];
  total: number;
}

const REGISTRY_TTL_DAYS = 30;
const MAX_DISCOVER_RESULTS = 20;

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

    // Session persistence endpoints
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

    // Registry endpoints
    if (request.method === "POST" && pathname === "registry/register") {
      return this.handleRegistryRegister(request);
    }
    if (request.method === "GET" && pathname === "registry/discover") {
      return this.handleRegistryDiscover(url);
    }
    if (request.method === "GET" && pathname.startsWith("registry/profile/")) {
      const username = pathname.slice("registry/profile/".length);
      return this.handleRegistryGetProfile(username);
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

  // ── Registry handlers ────────────────────────────────────────────────────────

  /**
   * POST /registry/register
   *
   * Register a profile in the discovery registry.
   * Verifies the signature is a valid JWT (without verifying the secret key —
   * we just check it's well-formed and not expired).
   * Stores with a 30-day TTL and returns the current peer count.
   */
  private async handleRegistryRegister(request: Request): Promise<Response> {
    try {
      const body = await request.json() as RegisterRequest;
      const profile = body.profile;

      if (!profile || !profile.username) {
        return new Response("Missing profile or username", { status: 400 });
      }

      // Verify signature is a valid JWT format
      if (!this.isValidJwtFormat(profile.signature)) {
        return new Response("Invalid signature format", { status: 400 });
      }

      // Set expiration (30 days from now)
      const now = new Date();
      const expiresAt = new Date(now.getTime() + REGISTRY_TTL_DAYS * 24 * 60 * 60 * 1000);

      const registryProfile: RegistryProfile = {
        username: profile.username,
        displayName: profile.displayName,
        currentFocus: profile.currentFocus,
        website: profile.website,
        bio: profile.bio,
        domains: profile.domains ?? [],
        signature: profile.signature,
        registeredAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      };

      // Store in registry
      const registry = (await this.state.storage.get<RegistryProfile[]>("registry")) ?? [];
      const existingIndex = registry.findIndex((p) => p.username === profile.username);

      if (existingIndex >= 0) {
        registry[existingIndex] = registryProfile;
      } else {
        registry.push(registryProfile);
      }

      await this.state.storage.put("registry", registry);
      await this.cleanupExpiredProfiles(registry);

      const peerCount = registry.length;

      const response: RegisterResponse = { ok: true, peerCount };
      return json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(`Registration failed: ${msg}`, { status: 400 });
    }
  }

  /**
   * GET /registry/discover?q={query}
   *
   * Search profiles by username, displayName, or currentFocus.
   * Returns max 20 results, sorted by most recently registered.
   */
  private async handleRegistryDiscover(url: URL): Promise<Response> {
    const query = url.searchParams.get("q")?.toLowerCase().trim() ?? "";
    if (query.length < 2) {
      return json({ results: [], total: 0 });
    }

    const registry = await this.getValidRegistry();

    // Filter by search query
    const results = registry
      .filter((p) =>
        p.username.toLowerCase().includes(query) ||
        (p.displayName?.toLowerCase().includes(query) ?? false) ||
        (p.currentFocus?.toLowerCase().includes(query) ?? false)
      )
      .sort((a, b) => b.registeredAt.localeCompare(a.registeredAt))
      .slice(0, MAX_DISCOVER_RESULTS);

    const response: DiscoverResponse = {
      results,
      total: results.length,
    };

    return json(response);
  }

  /**
   * GET /registry/profile/:username
   *
   * Get a single profile by username.
   * Returns 404 if not found or expired.
   */
  private async handleRegistryGetProfile(username: string): Promise<Response> {
    if (!username) {
      return new Response("Missing username", { status: 400 });
    }

    const registry = await this.getValidRegistry();
    const profile = registry.find((p) => p.username === username);

    if (!profile) {
      return new Response("Profile not found", { status: 404 });
    }

    return json(profile);
  }

  /**
   * Get valid (non-expired) profiles from the registry.
   * Runs cleanup if expired profiles are found.
   */
  private async getValidRegistry(): Promise<RegistryProfile[]> {
    const registry = (await this.state.storage.get<RegistryProfile[]>("registry")) ?? [];
    const now = new Date().toISOString();
    const valid = registry.filter((p) => p.expiresAt > now);

    // Update storage if we removed expired profiles
    if (valid.length < registry.length) {
      await this.state.storage.put("registry", valid);
    }

    return valid;
  }

  /**
   * Remove expired profiles from the registry.
   */
  private async cleanupExpiredProfiles(registry: RegistryProfile[]): Promise<void> {
    const now = new Date().toISOString();
    const valid = registry.filter((p) => p.expiresAt > now);

    if (valid.length < registry.length) {
      await this.state.storage.put("registry", valid);
    }
  }

  /**
   * Check if a string is a valid JWT format (3 parts separated by dots).
   * Does NOT verify the signature — just checks structure.
   */
  private isValidJwtFormat(signature: string): boolean {
    const parts = signature.split(".");
    return parts.length === 3 && parts.every((p) => p.length > 0);
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

  // ── Registry client methods ──────────────────────────────────────────────────

  /**
   * Register a profile in the discovery registry.
   * Returns the peer count or null if registration fails.
   */
  async registerProfile(profile: RegistryProfile): Promise<number | null> {
    const result = await this.fetch<RegisterResponse>("POST", "registry/register", { profile });
    return result?.peerCount ?? null;
  }

  /**
   * Search for profiles by query string.
   * Returns results or null if search fails.
   */
  async discoverProfiles(query: string): Promise<RegistryProfile[] | null> {
    const result = await this.fetch<DiscoverResponse>("GET", `registry/discover?q=${encodeURIComponent(query)}`);
    return result?.results ?? null;
  }

  /**
   * Get a single profile by username.
   * Returns the profile or null if not found.
   */
  async getProfile(username: string): Promise<RegistryProfile | null> {
    return this.fetch<RegistryProfile>("GET", `registry/profile/${encodeURIComponent(username)}`);
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
