/**
 * TenantRegistry — CRUD + usage tracking for multi-tenant brain isolation.
 *
 * Storage layout:
 *   <storagePath>/
 *     tenants.json          — { [tenantId]: Tenant } (source of truth)
 *     <tenantId>/
 *       brain/              — isolated brain directory (facts, wiki, tasks, soul.md)
 *       config.json         — tenant-specific overrides
 *
 * Usage metering:
 *   - Token/message counts are tracked in the Tenant object in tenants.json.
 *   - Daily counters reset when resetDailyUsage() is called (typically via scheduler).
 *   - recordUsage() atomically increments counters and persists.
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  rmSync,
} from "fs";
import { join } from "path";
import crypto from "crypto";
import {
  type Tenant,
  type TenantConfig,
  type TenantUsage,
  type TenantPlan,
  type TenantResolutionRequest,
  PLAN_DEFAULTS,
} from "./types.js";

// ─── Tenant registry file ───────────────────────────────────────────────────

const TENANTS_FILE = "tenants.json";

// ─── TenantRegistry ─────────────────────────────────────────────────────────

export class TenantRegistry {
  private storagePath: string;
  private tenants: Map<string, Tenant> = new Map();

  constructor(storagePath?: string) {
    this.storagePath = storagePath || join(
      process.env["HOME"] || "/tmp",
      ".cocapn",
      "tenants",
    );
    this.ensureStorageDir();
    this.load();
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  /**
   * Create a new tenant with isolated storage.
   * Generates a UUID if no id is provided.
   */
  async createTenant(partial: {
    id?: string;
    name: string;
    plan?: TenantPlan;
    config?: Partial<TenantConfig>;
    allowedOrigins?: string[];
  }): Promise<Tenant> {
    const id = partial.id || crypto.randomUUID();
    if (this.tenants.has(id)) {
      throw new Error(`Tenant already exists: ${id}`);
    }

    const plan = partial.plan || "free";
    const defaults = PLAN_DEFAULTS[plan];
    const config: TenantConfig = {
      maxTokensPerDay: partial.config?.maxTokensPerDay ?? defaults.maxTokensPerDay,
      maxConcurrentSessions: partial.config?.maxConcurrentSessions ?? defaults.maxConcurrentSessions,
      enabledSkills: partial.config?.enabledSkills ?? defaults.enabledSkills,
      ...(partial.config?.customPersonality !== undefined
        ? { customPersonality: partial.config.customPersonality }
        : {}),
      allowedOrigins: partial.config?.allowedOrigins ?? partial.allowedOrigins ?? defaults.allowedOrigins,
    };

    const now = new Date().toISOString();
    const brainPath = join(this.storagePath, id, "brain");
    const personalityPath = join(brainPath, "soul.md");

    // Create isolated brain directory structure
    this.ensureDir(join(brainPath, "cocapn", "memory"));
    this.ensureDir(join(brainPath, "cocapn", "wiki"));
    this.ensureDir(join(brainPath, "cocapn", "tasks"));

    const tenant: Tenant = {
      id,
      name: partial.name,
      plan,
      brainPath,
      personalityPath,
      config,
      createdAt: now,
      lastActive: now,
      usage: {
        tokensToday: 0,
        tokensTotal: 0,
        messagesToday: 0,
        messagesTotal: 0,
        lastReset: now,
      },
      allowedOrigins: config.allowedOrigins,
    };

    this.tenants.set(id, tenant);
    this.persist();
    return tenant;
  }

  /**
   * Get a tenant by ID. Returns null if not found.
   */
  async getTenant(tenantId: string): Promise<Tenant | null> {
    return this.tenants.get(tenantId) ?? null;
  }

  /**
   * Update a tenant's metadata. Partial merge.
   */
  async updateTenant(
    tenantId: string,
    updates: Partial<Pick<Tenant, "name" | "plan" | "config" | "allowedOrigins">>,
  ): Promise<Tenant> {
    const existing = this.tenants.get(tenantId);
    if (!existing) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    if (updates.name !== undefined) existing.name = updates.name;
    if (updates.plan !== undefined) {
      existing.plan = updates.plan;
    }
    if (updates.config !== undefined) {
      existing.config = { ...existing.config, ...updates.config };
    }
    // When plan changes, reset config to new plan defaults, then overlay custom values
    if (updates.plan !== undefined) {
      const planDefaults = PLAN_DEFAULTS[existing.plan];
      const customOverrides = updates.config || {};
      existing.config = { ...planDefaults, ...customOverrides };
    }
    if (updates.allowedOrigins !== undefined) {
      existing.allowedOrigins = updates.allowedOrigins;
    }
    existing.lastActive = new Date().toISOString();

    this.tenants.set(tenantId, existing);
    this.persist();
    return existing;
  }

  /**
   * Delete a tenant and its isolated storage.
   */
  async deleteTenant(tenantId: string): Promise<void> {
    const existing = this.tenants.get(tenantId);
    if (!existing) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    // Remove isolated brain directory
    const tenantDir = join(this.storagePath, tenantId);
    if (existsSync(tenantDir)) {
      rmSync(tenantDir, { recursive: true, force: true });
    }

    this.tenants.delete(tenantId);
    this.persist();
  }

  /**
   * List all tenants.
   */
  async listTenants(): Promise<Tenant[]> {
    return Array.from(this.tenants.values());
  }

  // ---------------------------------------------------------------------------
  // Usage tracking
  // ---------------------------------------------------------------------------

  /**
   * Record token usage for a tenant. Persists atomically.
   * Throws if tenant not found or daily limit exceeded.
   */
  async recordUsage(tenantId: string, tokens: number): Promise<void> {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    // Check daily limit (0 = unlimited)
    if (
      tenant.config.maxTokensPerDay > 0 &&
      tenant.usage.tokensToday + tokens > tenant.config.maxTokensPerDay
    ) {
      throw new Error(
        `Daily token limit exceeded for tenant ${tenantId}: ` +
          `${tenant.usage.tokensToday + tokens} > ${tenant.config.maxTokensPerDay}`,
      );
    }

    tenant.usage.tokensToday += tokens;
    tenant.usage.tokensTotal += tokens;
    tenant.usage.messagesToday += 1;
    tenant.usage.messagesTotal += 1;
    tenant.lastActive = new Date().toISOString();

    this.tenants.set(tenantId, tenant);
    this.persist();
  }

  /**
   * Get current usage for a tenant.
   */
  async getUsage(tenantId: string): Promise<TenantUsage> {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }
    return { ...tenant.usage };
  }

  /**
   * Reset daily usage counters for all tenants.
   * Should be called once per day (e.g. via scheduler at midnight).
   */
  async resetDailyUsage(): Promise<void> {
    const now = new Date().toISOString();
    for (const tenant of this.tenants.values()) {
      tenant.usage.tokensToday = 0;
      tenant.usage.messagesToday = 0;
      tenant.usage.lastReset = now;
    }
    this.persist();
  }

  // ---------------------------------------------------------------------------
  // Tenant resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolve a tenant from request context.
   *
   * Resolution order:
   *   1. Explicit X-Tenant-ID header
   *   2. API key match
   *   3. Origin match
   */
  async resolveTenant(request: TenantResolutionRequest): Promise<Tenant | null> {
    // 1. Explicit tenant ID
    if (request.tenantId) {
      return this.tenants.get(request.tenantId) ?? null;
    }

    // 2. API key match
    if (request.apiKey) {
      for (const tenant of this.tenants.values()) {
        if (tenant.apiKey === request.apiKey) {
          return tenant;
        }
      }
    }

    // 3. Origin match
    if (request.origin) {
      for (const tenant of this.tenants.values()) {
        if (tenant.allowedOrigins.includes(request.origin)) {
          return tenant;
        }
      }
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private load(): void {
    const filePath = join(this.storagePath, TENANTS_FILE);
    if (!existsSync(filePath)) return;

    try {
      const raw = readFileSync(filePath, "utf8");
      const parsed: unknown = JSON.parse(raw || "{}");
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [id, tenant] of Object.entries(parsed as Record<string, unknown>)) {
          this.tenants.set(id, tenant as Tenant);
        }
      }
    } catch {
      console.warn("[multi-tenant] Failed to load tenants.json, starting fresh");
    }
  }

  private persist(): void {
    const filePath = join(this.storagePath, TENANTS_FILE);
    const data: Record<string, Tenant> = {};
    for (const [id, tenant] of this.tenants) {
      data[id] = tenant;
    }
    writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
  }

  private ensureStorageDir(): void {
    this.ensureDir(this.storagePath);
  }

  private ensureDir(dir: string): void {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}
