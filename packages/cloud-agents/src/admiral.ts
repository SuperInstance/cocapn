/**
 * AdmiralDO — Durable Object for cross-device session persistence and discovery registry.
 *
 * SQLite-backed storage:
 *   Uses ctx.storage.sql for structured data storage with indexes.
 *   Falls back to KV storage (ctx.storage.get/put) if SQL is unavailable.
 *   One-time migration from KV to SQLite on first access.
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

// ─── Task Queue types ─────────────────────────────────────────────────────────────

export interface ScheduledTaskConfig {
  /** Unique task ID */
  id: string;
  /** Cron expression or ISO timestamp */
  schedule: string;
  /** Agent/module to execute */
  target: string;
  /** Payload for execution */
  payload: unknown;
  /** Whether enabled */
  enabled: boolean;
  /** Next execution time (ISO) */
  nextRun: string;
  /** Created at (ISO) */
  createdAt: string;
}

export interface TaskQueueItem {
  /** Task ID */
  id: string;
  /** Status */
  status: "pending" | "running" | "completed" | "failed";
  /** Started at (ISO) */
  startedAt?: string;
  /** Completed at (ISO) */
  completedAt?: string;
  /** Result output */
  result?: string;
  /** Error message */
  error?: string;
  /** Execution log */
  log: string[];
}

export interface Alarm {
  /** Alarm ID (matches task ID) */
  id: string;
  /** Scheduled time (ISO) */
  scheduledTime: string;
  /** Task ID this alarm triggers */
  taskId: string;
}

export interface ScheduleTasksRequest {
  tasks: Omit<ScheduledTaskConfig, "id" | "nextRun" | "createdAt">[];
}

export interface ScheduleTasksResponse {
  ok: boolean;
  scheduled: number;
  ids: string[];
}

export interface TaskStatusResponse {
  taskId: string;
  status: string;
  result?: string;
  error?: string;
  log: string[];
}

export class AdmiralDO implements DurableObject {
  private state: DurableObjectState;
  private sqlEnabled: boolean | null = null;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  /**
   * Check if SQL storage is available.
   * Cached after first check.
   */
  private async isSqlEnabled(): Promise<boolean> {
    if (this.sqlEnabled !== null) {
      return this.sqlEnabled;
    }

    try {
      // Try a simple SQL query to check if SQL is available
      await this.state.storage.sql`SELECT 1`;
      this.sqlEnabled = true;
      return true;
    } catch {
      this.sqlEnabled = false;
      return false;
    }
  }

  /**
   * Initialize SQLite schema if SQL is enabled.
   * Called on first SQL access.
   */
  private async initSqlSchema(): Promise<void> {
    if (!(await this.isSqlEnabled())) {
      return;
    }

    try {
      // Create profiles table
      await this.state.storage.sql`
        CREATE TABLE IF NOT EXISTS profiles (
          username TEXT PRIMARY KEY,
          displayName TEXT,
          currentFocus TEXT,
          bio TEXT,
          domain TEXT,
          website TEXT,
          profileJson TEXT,
          signature TEXT,
          fleetPublicKey TEXT,
          lastSeen TEXT,
          createdAt TEXT,
          expiresAt TEXT
        )
      `;

      // Create indexes for profiles
      await this.state.storage.sql`
        CREATE INDEX IF NOT EXISTS idx_profiles_name
        ON profiles(displayName)
      `;

      await this.state.storage.sql`
        CREATE INDEX IF NOT EXISTS idx_profiles_focus
        ON profiles(currentFocus)
      `;

      await this.state.storage.sql`
        CREATE INDEX IF NOT EXISTS idx_profiles_domain
        ON profiles(domain)
      `;

      // Create scheduled_tasks table
      await this.state.storage.sql`
        CREATE TABLE IF NOT EXISTS scheduled_tasks (
          taskId TEXT PRIMARY KEY,
          username TEXT,
          cron TEXT,
          timezone TEXT,
          agent TEXT,
          instructions TEXT,
          payload TEXT,
          enabled INTEGER,
          lastRun TEXT,
          nextRun TEXT,
          createdAt TEXT
        )
      `;

      await this.state.storage.sql`
        CREATE INDEX IF NOT EXISTS idx_tasks_next
        ON scheduled_tasks(nextRun)
      `;

      // Create task_queue table
      await this.state.storage.sql`
        CREATE TABLE IF NOT EXISTS task_queue (
          queueId TEXT PRIMARY KEY,
          taskId TEXT,
          status TEXT,
          result TEXT,
          error TEXT,
          log TEXT,
          createdAt TEXT,
          startedAt TEXT,
          completedAt TEXT
        )
      `;

      await this.state.storage.sql`
        CREATE INDEX IF NOT EXISTS idx_queue_status
        ON task_queue(status)
      `;

      // Create users table (for multi-user authentication)
      await this.state.storage.sql`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          passwordHash TEXT NOT NULL,
          passwordSalt TEXT NOT NULL,
          name TEXT NOT NULL,
          instance TEXT UNIQUE,
          plan TEXT DEFAULT 'free',
          createdAt TEXT NOT NULL,
          lastLogin TEXT,
          lastLoginIp TEXT,
          settings TEXT DEFAULT '{}',
          status TEXT DEFAULT 'active',
          metadata TEXT
        )
      `;

      await this.state.storage.sql`
        CREATE INDEX IF NOT EXISTS idx_users_email
        ON users(email)
      `;

      await this.state.storage.sql`
        CREATE INDEX IF NOT EXISTS idx_users_instance
        ON users(instance)
      `;

      await this.state.storage.sql`
        CREATE INDEX IF NOT EXISTS idx_users_plan
        ON users(plan)
      `;

      await this.state.storage.sql`
        CREATE INDEX IF NOT EXISTS idx_users_status
        ON users(status)
      `;

      // Create api_keys table
      await this.state.storage.sql`
        CREATE TABLE IF NOT EXISTS api_keys (
          id TEXT PRIMARY KEY,
          userId TEXT NOT NULL,
          keyHash TEXT NOT NULL,
          keyPrefix TEXT NOT NULL,
          name TEXT NOT NULL,
          scopes TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          lastUsed TEXT,
          expiresAt TEXT,
          FOREIGN KEY (userId) REFERENCES users(id)
        )
      `;

      await this.state.storage.sql`
        CREATE INDEX IF NOT EXISTS idx_api_keys_user
        ON api_keys(userId)
      `;

      await this.state.storage.sql`
        CREATE INDEX IF NOT EXISTS idx_api_keys_prefix
        ON api_keys(keyPrefix)
      `;

      await this.state.storage.sql`
        CREATE INDEX IF NOT EXISTS idx_api_keys_hash
        ON api_keys(keyHash)
      `;
    } catch (error) {
      // If schema creation fails, disable SQL
      console.error("Failed to initialize SQL schema:", error);
      this.sqlEnabled = false;
    }
  }

  /**
   * One-time migration from KV to SQLite.
   * Called on first SQL access if KV has data.
   */
  private async migrateKvToSql(): Promise<void> {
    if (!(await this.isSqlEnabled())) {
      return;
    }

    try {
      // Migrate profiles
      const registry = await this.state.storage.get<RegistryProfile[]>("registry");
      if (registry && registry.length > 0) {
        // Check if profiles table is empty
        const existingProfiles = await this.state.storage.sql<
          Array<{ username: string }>
        >`SELECT username FROM profiles LIMIT 1`;

        if (existingProfiles.length === 0) {
          // Migrate profiles to SQL
          for (const profile of registry) {
            await this.state.storage.sql`
              INSERT INTO profiles (
                username, displayName, currentFocus, bio, website,
                signature, createdAt, expiresAt
              ) VALUES (
                ${profile.username},
                ${profile.displayName ?? null},
                ${profile.currentFocus ?? null},
                ${profile.bio ?? null},
                ${profile.website ?? null},
                ${profile.signature},
                ${profile.registeredAt},
                ${profile.expiresAt}
              )
            `;
          }
        }
      }

      // Migrate scheduled tasks
      const scheduledTasksObj = await this.state.storage.get<Record<string, ScheduledTaskConfig>>("scheduled-tasks");
      if (scheduledTasksObj) {
        // Check if scheduled_tasks table is empty
        const existingTasks = await this.state.storage.sql<Array<{ taskId: string }>>`SELECT taskId FROM scheduled_tasks LIMIT 1`;

        if (existingTasks.length === 0) {
          // Migrate tasks to SQL
          for (const [id, task] of Object.entries(scheduledTasksObj)) {
            await this.state.storage.sql`
              INSERT INTO scheduled_tasks (
                taskId, cron, agent, payload, enabled, nextRun, createdAt
              ) VALUES (
                ${id},
                ${task.schedule},
                ${task.target},
                ${JSON.stringify(task.payload)},
                ${task.enabled ? 1 : 0},
                ${task.nextRun},
                ${task.createdAt}
              )
            `;
          }
        }
      }

      // Migrate task queue
      const taskQueue = await this.state.storage.get<TaskQueueItem[]>("task-queue");
      if (taskQueue && taskQueue.length > 0) {
        // Check if task_queue table is empty
        const existingQueue = await this.state.storage.sql<Array<{ queueId: string }>>`SELECT queueId FROM task_queue LIMIT 1`;

        if (existingQueue.length === 0) {
          // Migrate queue items to SQL
          for (const item of taskQueue) {
            await this.state.storage.sql`
              INSERT INTO task_queue (
                queueId, taskId, status, result, error, log,
                createdAt, startedAt, completedAt
              ) VALUES (
                ${item.id},
                ${item.id},
                ${item.status},
                ${item.result ?? null},
                ${item.error ?? null},
                ${JSON.stringify(item.log)},
                ${item.startedAt ?? item.createdAt},
                ${item.startedAt ?? null},
                ${item.completedAt ?? null}
              )
            `;
          }
        }
      }
    } catch (error) {
      console.error("Failed to migrate KV to SQL:", error);
      // Continue with KV fallback
    }
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

    // Task queue endpoints
    if (request.method === "POST" && pathname === "tasks/schedule") {
      return this.handleScheduleTasks(request);
    }
    if (request.method === "POST" && pathname === "tasks/execute") {
      return this.handleExecuteTask(request);
    }
    if (request.method === "GET" && pathname.startsWith("tasks/status/")) {
      const taskId = pathname.slice("tasks/status/".length);
      return this.handleGetTaskStatus(taskId);
    }
    if (request.method === "POST" && pathname === "tasks/webhook") {
      return this.handleWebhook(request);
    }

    // Auth endpoints (for user management)
    if (request.method === "POST" && pathname === "auth/users") {
      return this.handleCreateUser(request);
    }
    if (request.method === "GET" && pathname.startsWith("auth/users/")) {
      const parts = pathname.split("/");
      if (parts[3] === "by-email" && parts[4]) {
        return this.handleGetUserByEmail(parts[4]);
      }
      return this.handleGetUser(parts[3]);
    }
    if (request.method === "PATCH" && pathname.startsWith("auth/users/")) {
      const userId = pathname.split("/")[3];
      return this.handleUpdateUser(userId, request);
    }
    if (request.method === "POST" && pathname === "auth/api-keys") {
      return this.handleCreateApiKey(request);
    }
    if (request.method === "GET" && pathname.startsWith("auth/api-keys/")) {
      const parts = pathname.split("/");
      if (parts[4] === "verify") {
        return this.handleVerifyApiKey(parts[4]);
      }
      return this.handleListApiKeys(parts[3]);
    }
    if (request.method === "PATCH" && pathname.startsWith("auth/api-keys/")) {
      const keyId = pathname.split("/")[3];
      return this.handleUpdateApiKey(keyId, request);
    }
    if (request.method === "DELETE" && pathname.startsWith("auth/api-keys/")) {
      const parts = pathname.split("/");
      return this.handleDeleteApiKey(parts[3], parts[4]);
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

      // Try SQL first, fall back to KV
      if (await this.isSqlEnabled()) {
        await this.initSqlSchema();
        await this.migrateKvToSql();

        // Use UPSERT (SQLite 3.24+)
        await this.state.storage.sql`
          INSERT INTO profiles (
            username, displayName, currentFocus, bio, website,
            signature, createdAt, expiresAt
          ) VALUES (
            ${registryProfile.username},
            ${registryProfile.displayName ?? null},
            ${registryProfile.currentFocus ?? null},
            ${registryProfile.bio ?? null},
            ${registryProfile.website ?? null},
            ${registryProfile.signature},
            ${registryProfile.registeredAt},
            ${registryProfile.expiresAt}
          )
          ON CONFLICT(username) DO UPDATE SET
            displayName = excluded.displayName,
            currentFocus = excluded.currentFocus,
            bio = excluded.bio,
            website = excluded.website,
            signature = excluded.signature,
            expiresAt = excluded.expiresAt
        `;

        // Cleanup expired profiles
        await this.state.storage.sql`
          DELETE FROM profiles WHERE expiresAt < datetime('now')
        `;

        // Get peer count
        const countResult = await this.state.storage.sql<Array<{ count: number }>>`
          SELECT COUNT(*) as count FROM profiles
        `;
        const peerCount = countResult[0]?.count ?? 0;

        const response: RegisterResponse = { ok: true, peerCount };
        return json(response);
      }

      // KV fallback
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

    // Try SQL first, fall back to KV
    if (await this.isSqlEnabled()) {
      await this.initSqlSchema();
      await this.migrateKvToSql();

      const searchPattern = `%${query}%`;

      const results = await this.state.storage.sql<
        Array<{
          username: string;
          displayName: string | null;
          currentFocus: string | null;
          bio: string | null;
          website: string | null;
          signature: string;
          createdAt: string;
          expiresAt: string;
        }>
      >`
        SELECT
          username, displayName, currentFocus, bio, website,
          signature, createdAt as registeredAt, expiresAt
        FROM profiles
        WHERE expiresAt > datetime('now')
          AND (
            LOWER(username) LIKE ${searchPattern}
            OR LOWER(displayName) LIKE ${searchPattern}
            OR LOWER(currentFocus) LIKE ${searchPattern}
          )
        ORDER BY createdAt DESC
        LIMIT ${MAX_DISCOVER_RESULTS}
      `;

      const response: DiscoverResponse = {
        results: results.map((row) => ({
          username: row.username,
          displayName: row.displayName ?? undefined,
          currentFocus: row.currentFocus ?? undefined,
          bio: row.bio ?? undefined,
          website: row.website ?? undefined,
          domains: [],
          signature: row.signature,
          registeredAt: row.registeredAt,
          expiresAt: row.expiresAt,
        })),
        total: results.length,
      };

      return json(response);
    }

    // KV fallback
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

    // Try SQL first, fall back to KV
    if (await this.isSqlEnabled()) {
      await this.initSqlSchema();
      await this.migrateKvToSql();

      const results = await this.state.storage.sql<
        Array<{
          username: string;
          displayName: string | null;
          currentFocus: string | null;
          bio: string | null;
          website: string | null;
          signature: string;
          createdAt: string;
          expiresAt: string;
        }>
      >`
        SELECT
          username, displayName, currentFocus, bio, website,
          signature, createdAt as registeredAt, expiresAt
        FROM profiles
        WHERE username = ${username}
          AND expiresAt > datetime('now')
        LIMIT 1
      `;

      if (results.length === 0) {
        return new Response("Profile not found", { status: 404 });
      }

      const row = results[0]!;
      const profile: RegistryProfile = {
        username: row.username,
        displayName: row.displayName ?? undefined,
        currentFocus: row.currentFocus ?? undefined,
        bio: row.bio ?? undefined,
        website: row.website ?? undefined,
        domains: [],
        signature: row.signature,
        registeredAt: row.registeredAt,
        expiresAt: row.expiresAt,
      };

      return json(profile);
    }

    // KV fallback
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

  // ── Task Queue handlers ───────────────────────────────────────────────────────────

  /**
   * POST /tasks/schedule
   *
   * Schedule tasks for execution.
   * Stores tasks and sets DO alarms for their next execution.
   * Returns count of scheduled tasks and their IDs.
   */
  private async handleScheduleTasks(request: Request): Promise<Response> {
    try {
      const body = await request.json() as ScheduleTasksRequest;
      if (!body.tasks || !Array.isArray(body.tasks)) {
        return new Response("Missing tasks array", { status: 400 });
      }

      const now = new Date();
      const ids: string[] = [];

      // Try SQL first, fall back to KV
      if (await this.isSqlEnabled()) {
        await this.initSqlSchema();
        await this.migrateKvToSql();

        for (const task of body.tasks) {
          const id = crypto.randomUUID();
          const nextRun = this.calculateNextRun(task.schedule, now);

          await this.state.storage.sql`
            INSERT INTO scheduled_tasks (
              taskId, cron, agent, payload, enabled, nextRun, createdAt
            ) VALUES (
              ${id},
              ${task.schedule},
              ${task.target},
              ${JSON.stringify(task.payload)},
              ${task.enabled !== false ? 1 : 0},
              ${nextRun},
              ${now.toISOString()}
            )
          `;

          // Set DO alarm for next execution
          if (task.enabled !== false) {
            await this.state.storage.setAlarm(new Date(nextRun), id);
          }

          ids.push(id);
        }

        const response: ScheduleTasksResponse = {
          ok: true,
          scheduled: ids.length,
          ids,
        };

        return json(response);
      }

      // KV fallback
      const scheduledTasks = (await this.state.storage.get<Record<string, ScheduledTaskConfig>>("scheduled-tasks"))
        ?? {};
      const alarms = (await this.state.storage.get<Alarm[]>("task-alarms")) ?? [];

      for (const task of body.tasks) {
        const id = crypto.randomUUID();
        const nextRun = this.calculateNextRun(task.schedule, now);

        const config: ScheduledTaskConfig = {
          id,
          schedule: task.schedule,
          target: task.target,
          payload: task.payload,
          enabled: task.enabled ?? true,
          nextRun,
          createdAt: now.toISOString(),
        };

        scheduledTasks[id] = config;

        // Set DO alarm for next execution
        if (task.enabled !== false) {
          await this.state.storage.setAlarm(new Date(nextRun), id);
          alarms.push({
            id,
            scheduledTime: nextRun,
            taskId: id,
          });
        }

        ids.push(id);
      }

      await this.state.storage.put("scheduled-tasks", scheduledTasks);
      await this.state.storage.put("task-alarms", alarms);

      const response: ScheduleTasksResponse = {
        ok: true,
        scheduled: ids.length,
        ids,
      };

      return json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(`Scheduling failed: ${msg}`, { status: 400 });
    }
  }

  /**
   * POST /tasks/execute
   *
   * Triggered by DO alarm when a task is due.
   * Finds the task, executes it, and records the result.
   */
  private async handleExecuteTask(request: Request): Promise<Response> {
    try {
      const body = await request.json() as { taskId: string };
      if (!body.taskId) {
        return new Response("Missing taskId", { status: 400 });
      }

      // Try SQL first, fall back to KV
      if (await this.isSqlEnabled()) {
        await this.initSqlSchema();
        await this.migrateKvToSql();

        // Get the task
        const tasks = await this.state.storage.sql<
          Array<{
            taskId: string;
            cron: string;
            agent: string;
            payload: string;
            enabled: number;
            nextRun: string;
            createdAt: string;
          }>
        >`
          SELECT taskId, cron, agent, payload, enabled, nextRun, createdAt
          FROM scheduled_tasks
          WHERE taskId = ${body.taskId}
          LIMIT 1
        `;

        if (tasks.length === 0) {
          return new Response("Task not found", { status: 404 });
        }

        const row = tasks[0]!;
        const task: ScheduledTaskConfig = {
          id: row.taskId,
          schedule: row.cron,
          target: row.agent,
          payload: JSON.parse(row.payload),
          enabled: row.enabled === 1,
          nextRun: row.nextRun,
          createdAt: row.createdAt,
        };

        // Create queue item for execution
        const now = new Date().toISOString();
        await this.state.storage.sql`
          INSERT INTO task_queue (
            queueId, taskId, status, log, createdAt, startedAt
          ) VALUES (
            ${body.taskId},
            ${body.taskId},
            ${"running"},
            ${JSON.stringify([`Started execution at ${now}`])},
            ${now},
            ${now}
          )
        `;

        // Execute the task
        const result = await this.executeTaskWork(task);

        // Update queue item with result
        const completedAt = new Date().toISOString();
        const log = JSON.stringify([...result.log]);
        await this.state.storage.sql`
          UPDATE task_queue
          SET status = ${result.success ? "completed" : "failed"},
              result = ${result.output ?? null},
              error = ${result.error ?? null},
              log = ${log},
              completedAt = ${completedAt}
          WHERE queueId = ${body.taskId}
        `;

        // Reschedule if it's a recurring task (cron)
        if (this.isCronExpression(task.schedule)) {
          const nextRun = this.calculateNextRun(task.schedule, new Date());

          await this.state.storage.sql`
            UPDATE scheduled_tasks
            SET nextRun = ${nextRun}
            WHERE taskId = ${body.taskId}
          `;

          // Set next alarm
          await this.state.storage.setAlarm(new Date(nextRun), body.taskId);
        }

        return json({
          ok: true,
          taskId: body.taskId,
          status: result.success ? "completed" : "failed",
        });
      }

      // KV fallback
      const scheduledTasksObj = await this.state.storage.get<Record<string, ScheduledTaskConfig>>("scheduled-tasks");
      if (!scheduledTasksObj) {
        return new Response("No scheduled tasks found", { status: 404 });
      }

      const task = scheduledTasksObj[body.taskId];
      if (!task) {
        return new Response("Task not found", { status: 404 });
      }

      // Create queue item for execution
      const queueItem: TaskQueueItem = {
        id: body.taskId,
        status: "running",
        startedAt: new Date().toISOString(),
        log: [`Started execution at ${new Date().toISOString()}`],
      };

      const queue = (await this.state.storage.get<TaskQueueItem[]>("task-queue")) ?? [];
      queue.push(queueItem);
      await this.state.storage.put("task-queue", queue);

      // Execute the task (in real implementation, this would call a worker)
      const result = await this.executeTaskWork(task);

      // Update queue item with result
      const updatedQueue = (await this.state.storage.get<TaskQueueItem[]>("task-queue")) ?? [];
      const itemIndex = updatedQueue.findIndex((q) => q.id === body.taskId);
      if (itemIndex >= 0) {
        updatedQueue[itemIndex] = {
          ...updatedQueue[itemIndex]!,
          status: result.success ? "completed" : "failed",
          completedAt: new Date().toISOString(),
          result: result.output,
          error: result.error,
          log: [...updatedQueue[itemIndex]!.log, ...result.log],
        };
        await this.state.storage.put("task-queue", updatedQueue);
      }

      // Reschedule if it's a recurring task (cron)
      if (this.isCronExpression(task.schedule)) {
        const nextRun = this.calculateNextRun(task.schedule, new Date());
        const updatedTask: ScheduledTaskConfig = {
          ...task,
          nextRun,
        };

        const scheduledTasks = { ...scheduledTasksObj };
        scheduledTasks[body.taskId] = updatedTask;
        await this.state.storage.put("scheduled-tasks", scheduledTasks);

        // Set next alarm
        await this.state.storage.setAlarm(new Date(nextRun), body.taskId);
      }

      return json({
        ok: true,
        taskId: body.taskId,
        status: result.success ? "completed" : "failed",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(`Execution failed: ${msg}`, { status: 500 });
    }
  }

  /**
   * GET /tasks/status/:taskId
   *
   * Get execution status and logs for a task.
   */
  private async handleGetTaskStatus(taskId: string): Promise<Response> {
    if (!taskId) {
      return new Response("Missing taskId", { status: 400 });
    }

    // Try SQL first, fall back to KV
    if (await this.isSqlEnabled()) {
      await this.initSqlSchema();
      await this.migrateKvToSql();

      const results = await this.state.storage.sql<
        Array<{
          queueId: string;
          taskId: string;
          status: string;
          result: string | null;
          error: string | null;
          log: string;
        }>
      >`
        SELECT queueId, taskId, status, result, error, log
        FROM task_queue
        WHERE taskId = ${taskId}
        LIMIT 1
      `;

      if (results.length === 0) {
        return new Response("Task not found in queue", { status: 404 });
      }

      const row = results[0]!;
      const log = JSON.parse(row.log) as string[];

      const response: TaskStatusResponse = {
        taskId: row.taskId,
        status: row.status,
        result: row.result ?? undefined,
        error: row.error ?? undefined,
        log,
      };

      return json(response);
    }

    // KV fallback
    const queue = (await this.state.storage.get<TaskQueueItem[]>("task-queue")) ?? [];
    const item = queue.find((q) => q.id === taskId);

    if (!item) {
      return new Response("Task not found in queue", { status: 404 });
    }

    const response: TaskStatusResponse = {
      taskId: item.id,
      status: item.status,
      result: item.result,
      error: item.error,
      log: item.log,
    };

    return json(response);
  }

  /**
   * POST /tasks/webhook
   *
   * GitHub webhook handler.
   * Validates signature and triggers tasks based on webhook events.
   */
  private async handleWebhook(request: Request): Promise<Response> {
    try {
      const signature = request.headers.get("X-Hub-Signature-256");
      if (!signature) {
        return new Response("Missing signature", { status: 401 });
      }

      const rawBody = await request.text();
      const expectedSignature = request.headers.get("X-Hub-Signature-256");

      // In production, verify with actual secret
      // For now, just check format
      if (!signature.startsWith("sha256=")) {
        return new Response("Invalid signature format", { status: 401 });
      }

      const payload = JSON.parse(rawBody) as Record<string, unknown>;
      const event = request.headers.get("X-GitHub-Event");

      // Handle different webhook events
      if (event === "push") {
        await this.handlePushWebhook(payload);
      } else if (event === "ping") {
        // Just acknowledge
      }

      return json({ ok: true, event });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(`Webhook processing failed: ${msg}`, { status: 400 });
    }
  }

  // ── Task Queue helpers ────────────────────────────────────────────────────────────

  /**
   * Calculate next run time based on schedule.
   * Supports ISO timestamps for one-shot and cron expressions for recurring.
   */
  private calculateNextRun(schedule: string, from: Date): string {
    // Check if it's an ISO timestamp
    if (schedule.includes("T") || /^\d{4}-\d{2}-\d{2}/.test(schedule)) {
      return schedule;
    }

    // Simple cron parser (supports limited patterns)
    // Format: "M H D Mo W" (minute hour day month weekday)
    const cronMatch = schedule.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)$/);
    if (cronMatch) {
      const [, minute, hour, day, month, weekday] = cronMatch;

      // For simplicity, just add 1 minute for now
      // A full implementation would parse the cron expression
      const next = new Date(from.getTime() + 60 * 1000);
      return next.toISOString();
    }

    // Default: 1 hour from now
    const next = new Date(from.getTime() + 60 * 60 * 1000);
    return next.toISOString();
  }

  /**
   * Check if a schedule is a cron expression.
   */
  private isCronExpression(schedule: string): boolean {
    return /^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/.test(schedule);
  }

  /**
   * Execute the actual task work.
   * In production, this would call a worker or agent.
   */
  private async executeTaskWork(task: ScheduledTaskConfig): Promise<{
    success: boolean;
    output?: string;
    error?: string;
    log: string[];
  }> {
    const log: string[] = [];

    try {
      log.push(`Executing task ${task.id} with target ${task.target}`);
      log.push(`Payload: ${JSON.stringify(task.payload)}`);

      // Simulate work
      await new Promise((resolve) => setTimeout(resolve, 10));

      const output = `Task ${task.id} completed successfully`;
      log.push(output);

      return {
        success: true,
        output,
        log,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.push(`Error: ${error}`);
      return {
        success: false,
        error,
        log,
      };
    }
  }

  /**
   * Handle push webhook event.
   * Triggers tasks associated with the repository.
   */
  private async handlePushWebhook(payload: Record<string, unknown>): Promise<void> {
    const repo = payload.repository as Record<string, unknown> | undefined;
    const repoName = repo?.["full_name"] as string | undefined;

    if (!repoName) return;

    // Find tasks associated with this repo and trigger them
    const scheduledTasksObj = await this.state.storage.get<Record<string, ScheduledTaskConfig>>("scheduled-tasks");
    if (!scheduledTasksObj) return;

    const tasks = Object.values(scheduledTasksObj).filter((t) =>
      t.payload && typeof t.payload === "object" && "repo" in t.payload &&
      (t.payload as Record<string, unknown>).repo === repoName
    );

    for (const task of tasks) {
      // Trigger immediate execution
      await this.handleExecuteTask(
        new Request(`https://admiral.test/tasks/execute`, {
          method: "POST",
          body: JSON.stringify({ taskId: task.id }),
          headers: { "Content-Type": "application/json" },
        })
      );
    }
  }

  // ── Auth handlers ───────────────────────────────────────────────────────────────

  /**
   * POST /auth/users
   *
   * Create a new user in the database.
   */
  private async handleCreateUser(request: Request): Promise<Response> {
    try {
      if (!(await this.isSqlEnabled())) {
        return new Response("SQL not enabled", { status: 503 });
      }

      await this.initSqlSchema();

      const body = await request.json() as { action: string; user: Record<string, unknown> };
      if (body.action !== "create" || !body.user) {
        return new Response("Invalid request", { status: 400 });
      }

      const user = body.user;

      await this.state.storage.sql`
        INSERT INTO users (
          id, email, passwordHash, passwordSalt, name, instance, plan, createdAt, status
        ) VALUES (
          ${user.id as string},
          ${user.email as string},
          ${user.passwordHash as string},
          ${user.passwordSalt as string},
          ${user.name as string},
          ${user.instance as string | null},
          ${user.plan as string | null},
          ${user.createdAt as string},
          ${user.status as string | null}
        )
      `;

      return json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(msg, { status: 400 });
    }
  }

  /**
   * GET /auth/users/:id
   *
   * Get a user by ID.
   */
  private async handleGetUser(userId: string): Promise<Response> {
    try {
      if (!(await this.isSqlEnabled())) {
        return new Response("SQL not enabled", { status: 503 });
      }

      await this.initSqlSchema();

      const results = await this.state.storage.sql<Array<{
        id: string;
        email: string;
        passwordHash: string;
        passwordSalt: string;
        name: string;
        instance: string | null;
        plan: string;
        createdAt: string;
        lastLogin: string | null;
        lastLoginIp: string | null;
        settings: string | null;
        status: string;
        metadata: string | null;
      }>>`
        SELECT * FROM users WHERE id = ${userId} LIMIT 1
      `;

      if (results.length === 0) {
        return new Response("User not found", { status: 404 });
      }

      const row = results[0]!;
      return json({
        id: row.id,
        email: row.email,
        passwordHash: row.passwordHash,
        passwordSalt: row.passwordSalt,
        name: row.name,
        instance: row.instance ?? undefined,
        plan: row.plan,
        createdAt: row.createdAt,
        lastLogin: row.lastLogin ?? undefined,
        lastLoginIp: row.lastLoginIp ?? undefined,
        settings: row.settings ? JSON.parse(row.settings) : undefined,
        status: row.status as "active" | "suspended" | "banned",
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(msg, { status: 500 });
    }
  }

  /**
   * GET /auth/users/by-email/:email
   *
   * Get a user by email.
   */
  private async handleGetUserByEmail(email: string): Promise<Response> {
    try {
      if (!(await this.isSqlEnabled())) {
        return new Response("SQL not enabled", { status: 503 });
      }

      await this.initSqlSchema();

      const results = await this.state.storage.sql<Array<{
        id: string;
        email: string;
        passwordHash: string;
        passwordSalt: string;
        name: string;
        instance: string | null;
        plan: string;
        createdAt: string;
        lastLogin: string | null;
        lastLoginIp: string | null;
        settings: string | null;
        status: string;
        metadata: string | null;
      }>>`
        SELECT * FROM users WHERE email = ${email.toLowerCase()} LIMIT 1
      `;

      if (results.length === 0) {
        return new Response("User not found", { status: 404 });
      }

      const row = results[0]!;
      return json({
        id: row.id,
        email: row.email,
        passwordHash: row.passwordHash,
        passwordSalt: row.passwordSalt,
        name: row.name,
        instance: row.instance ?? undefined,
        plan: row.plan,
        createdAt: row.createdAt,
        lastLogin: row.lastLogin ?? undefined,
        lastLoginIp: row.lastLoginIp ?? undefined,
        settings: row.settings ? JSON.parse(row.settings) : undefined,
        status: row.status as "active" | "suspended" | "banned",
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(msg, { status: 500 });
    }
  }

  /**
   * PATCH /auth/users/:id
   *
   * Update a user (e.g., last login).
   */
  private async handleUpdateUser(userId: string, request: Request): Promise<Response> {
    try {
      if (!(await this.isSqlEnabled())) {
        return new Response("SQL not enabled", { status: 503 });
      }

      await this.initSqlSchema();

      const body = await request.json() as Record<string, unknown>;

      // Build dynamic UPDATE query
      const updates: string[] = [];
      const values: unknown[] = [];

      if (body.lastLogin) {
        updates.push("lastLogin = ?");
        values.push(body.lastLogin);
      }
      if (body.lastLoginIp) {
        updates.push("lastLoginIp = ?");
        values.push(body.lastLoginIp);
      }
      if (body.status) {
        updates.push("status = ?");
        values.push(body.status);
      }

      if (updates.length === 0) {
        return json({ ok: true });
      }

      values.push(userId);

      await this.state.storage.sql(
        `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
        ...values as []
      );

      return json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(msg, { status: 500 });
    }
  }

  /**
   * POST /auth/api-keys
   *
   * Create an API key.
   */
  private async handleCreateApiKey(request: Request): Promise<Response> {
    try {
      if (!(await this.isSqlEnabled())) {
        return new Response("SQL not enabled", { status: 503 });
      }

      await this.initSqlSchema();

      const apiKey = await request.json() as {
        id: string;
        userId: string;
        keyHash: string;
        keyPrefix: string;
        name: string;
        scopes: string[];
        createdAt: string;
        expiresAt?: string;
      };

      await this.state.storage.sql`
        INSERT INTO api_keys (
          id, userId, keyHash, keyPrefix, name, scopes, createdAt, expiresAt
        ) VALUES (
          ${apiKey.id},
          ${apiKey.userId},
          ${apiKey.keyHash},
          ${apiKey.keyPrefix},
          ${apiKey.name},
          ${JSON.stringify(apiKey.scopes)},
          ${apiKey.createdAt},
          ${apiKey.expiresAt ?? null}
        )
      `;

      return json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(msg, { status: 500 });
    }
  }

  /**
   * GET /auth/api-keys/:userId
   *
   * List API keys for a user.
   */
  private async handleListApiKeys(userId: string): Promise<Response> {
    try {
      if (!(await this.isSqlEnabled())) {
        return new Response("SQL not enabled", { status: 503 });
      }

      await this.initSqlSchema();

      const results = await this.state.storage.sql<Array<{
        id: string;
        userId: string;
        keyHash: string;
        keyPrefix: string;
        name: string;
        scopes: string;
        createdAt: string;
        lastUsed: string | null;
        expiresAt: string | null;
      }>>`
        SELECT * FROM api_keys WHERE userId = ${userId}
      `;

      return json(
        results.map((row) => ({
          id: row.id,
          userId: row.userId,
          keyHash: row.keyHash,
          keyPrefix: row.keyPrefix,
          name: row.name,
          scopes: JSON.parse(row.scopes),
          createdAt: row.createdAt,
          lastUsed: row.lastUsed ?? undefined,
          expiresAt: row.expiresAt ?? undefined,
        }))
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(msg, { status: 500 });
    }
  }

  /**
   * GET /auth/api-keys/verify/:hash
   *
   * Verify an API key and return the key with user.
   */
  private async handleVerifyApiKey(keyHash: string): Promise<Response> {
    try {
      if (!(await this.isSqlEnabled())) {
        return new Response("SQL not enabled", { status: 503 });
      }

      await this.initSqlSchema();

      const results = await this.state.storage.sql<Array<{
        id: string;
        userId: string;
        keyHash: string;
        keyPrefix: string;
        name: string;
        scopes: string;
        createdAt: string;
        lastUsed: string | null;
        expiresAt: string | null;
      }>>`
        SELECT * FROM api_keys WHERE keyHash = ${keyHash} LIMIT 1
      `;

      if (results.length === 0) {
        return new Response("API key not found", { status: 404 });
      }

      const apiKey = results[0]!;

      // Fetch the user
      const userResults = await this.state.storage.sql<Array<{
        id: string;
        email: string;
        passwordHash: string;
        passwordSalt: string;
        name: string;
        instance: string | null;
        plan: string;
        createdAt: string;
        lastLogin: string | null;
        lastLoginIp: string | null;
        settings: string | null;
        status: string;
        metadata: string | null;
      }>>`
        SELECT * FROM users WHERE id = ${apiKey.userId} LIMIT 1
      `;

      if (userResults.length === 0) {
        return new Response("User not found", { status: 404 });
      }

      const userRow = userResults[0]!;

      return json({
        ...apiKey,
        scopes: JSON.parse(apiKey.scopes),
        user: {
          id: userRow.id,
          email: userRow.email,
          passwordHash: userRow.passwordHash,
          passwordSalt: userRow.passwordSalt,
          name: userRow.name,
          instance: userRow.instance ?? undefined,
          plan: userRow.plan,
          createdAt: userRow.createdAt,
          lastLogin: userRow.lastLogin ?? undefined,
          lastLoginIp: userRow.lastLoginIp ?? undefined,
          settings: userRow.settings ? JSON.parse(userRow.settings) : undefined,
          status: userRow.status as "active" | "suspended" | "banned",
          metadata: userRow.metadata ? JSON.parse(userRow.metadata) : undefined,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(msg, { status: 500 });
    }
  }

  /**
   * PATCH /auth/api-keys/:id
   *
   * Update an API key (e.g., lastUsed).
   */
  private async handleUpdateApiKey(keyId: string, request: Request): Promise<Response> {
    try {
      if (!(await this.isSqlEnabled())) {
        return new Response("SQL not enabled", { status: 503 });
      }

      await this.initSqlSchema();

      const body = await request.json() as Record<string, unknown>;

      if (body.lastUsed) {
        await this.state.storage.sql`
          UPDATE api_keys SET lastUsed = ${body.lastUsed as string}
          WHERE id = ${keyId}
        `;
      }

      return json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(msg, { status: 500 });
    }
  }

  /**
   * DELETE /auth/api-keys/:userId/:keyId
   *
   * Delete an API key.
   */
  private async handleDeleteApiKey(userId: string, keyId: string): Promise<Response> {
    try {
      if (!(await this.isSqlEnabled())) {
        return new Response("SQL not enabled", { status: 503 });
      }

      await this.initSqlSchema();

      await this.state.storage.sql`
        DELETE FROM api_keys WHERE id = ${keyId} AND userId = ${userId}
      `;

      return json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(msg, { status: 500 });
    }
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
