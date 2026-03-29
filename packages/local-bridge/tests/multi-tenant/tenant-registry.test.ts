/**
 * TenantRegistry tests — CRUD, usage tracking, tenant resolution.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { existsSync, rmSync } from "fs";
import { TenantRegistry } from "../../src/multi-tenant/tenant-registry.js";

describe("TenantRegistry", () => {
  let storagePath: string;
  let registry: TenantRegistry;

  beforeEach(() => {
    storagePath = join("/tmp", `cocapn-test-tenants-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    registry = new TenantRegistry(storagePath);
  });

  afterEach(() => {
    if (existsSync(storagePath)) {
      rmSync(storagePath, { recursive: true, force: true });
    }
  });

  // ── CRUD ──────────────────────────────────────────────────────────────────

  describe("createTenant", () => {
    it("creates a tenant with default plan (free)", async () => {
      const tenant = await registry.createTenant({ name: "Test User" });

      expect(tenant.id).toBeDefined();
      expect(tenant.name).toBe("Test User");
      expect(tenant.plan).toBe("free");
      expect(tenant.createdAt).toBeDefined();
      expect(tenant.usage).toEqual({
        tokensToday: 0,
        tokensTotal: 0,
        messagesToday: 0,
        messagesTotal: 0,
        lastReset: expect.any(String),
      });
    });

    it("creates a tenant with a specific plan", async () => {
      const tenant = await registry.createTenant({ name: "Pro User", plan: "pro" });

      expect(tenant.plan).toBe("pro");
      expect(tenant.config.maxTokensPerDay).toBe(500_000);
      expect(tenant.config.maxConcurrentSessions).toBe(5);
    });

    it("creates a tenant with a custom ID", async () => {
      const tenant = await registry.createTenant({ name: "Custom", id: "my-tenant" });

      expect(tenant.id).toBe("my-tenant");
    });

    it("creates isolated brain directories", async () => {
      const tenant = await registry.createTenant({ name: "Isolated" });

      expect(existsSync(join(tenant.brainPath, "cocapn", "memory"))).toBe(true);
      expect(existsSync(join(tenant.brainPath, "cocapn", "wiki"))).toBe(true);
      expect(existsSync(join(tenant.brainPath, "cocapn", "tasks"))).toBe(true);
    });

    it("throws on duplicate tenant ID", async () => {
      await registry.createTenant({ name: "First", id: "dup" });
      await expect(registry.createTenant({ name: "Second", id: "dup" }))
        .rejects.toThrow("Tenant already exists: dup");
    });

    it("applies custom config overrides", async () => {
      const tenant = await registry.createTenant({
        name: "Custom",
        plan: "enterprise",
        config: {
          maxConcurrentSessions: 100,
          enabledSkills: ["search", "code"],
        },
      });

      expect(tenant.config.maxConcurrentSessions).toBe(100);
      expect(tenant.config.enabledSkills).toEqual(["search", "code"]);
    });
  });

  describe("getTenant", () => {
    it("returns a tenant by ID", async () => {
      const created = await registry.createTenant({ name: "Get Me", id: "get-test" });
      const fetched = await registry.getTenant("get-test");

      expect(fetched).not.toBeNull();
      expect(fetched!.name).toBe(created.name);
    });

    it("returns null for unknown tenant", async () => {
      const result = await registry.getTenant("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("updateTenant", () => {
    it("updates tenant name and plan", async () => {
      await registry.createTenant({ name: "Original", id: "upd-test" });
      const updated = await registry.updateTenant("upd-test", {
        name: "Updated",
        plan: "pro",
      });

      expect(updated.name).toBe("Updated");
      expect(updated.plan).toBe("pro");
      expect(updated.config.maxTokensPerDay).toBe(500_000);
    });

    it("merges config overrides", async () => {
      await registry.createTenant({ name: "Merge", id: "merge-test" });
      const updated = await registry.updateTenant("merge-test", {
        config: { maxTokensPerDay: 123 },
      });

      expect(updated.config.maxTokensPerDay).toBe(123);
    });

    it("throws for unknown tenant", async () => {
      await expect(registry.updateTenant("nope", { name: "X" }))
        .rejects.toThrow("Tenant not found: nope");
    });
  });

  describe("deleteTenant", () => {
    it("deletes a tenant and its storage", async () => {
      const tenant = await registry.createTenant({ name: "Delete Me", id: "del-test" });
      expect(existsSync(tenant.brainPath)).toBe(true);

      await registry.deleteTenant("del-test");

      const fetched = await registry.getTenant("del-test");
      expect(fetched).toBeNull();
      expect(existsSync(tenant.brainPath)).toBe(false);
    });

    it("throws for unknown tenant", async () => {
      await expect(registry.deleteTenant("nope"))
        .rejects.toThrow("Tenant not found: nope");
    });
  });

  describe("listTenants", () => {
    it("lists all tenants", async () => {
      await registry.createTenant({ name: "A", id: "a" });
      await registry.createTenant({ name: "B", id: "b" });
      await registry.createTenant({ name: "C", id: "c" });

      const tenants = await registry.listTenants();
      expect(tenants).toHaveLength(3);
      expect(tenants.map((t) => t.id).sort()).toEqual(["a", "b", "c"]);
    });

    it("returns empty array when no tenants", async () => {
      const tenants = await registry.listTenants();
      expect(tenants).toEqual([]);
    });
  });

  // ── Usage tracking ────────────────────────────────────────────────────────

  describe("recordUsage", () => {
    it("increments token and message counts", async () => {
      await registry.createTenant({ name: "Usage", id: "usage-test" });

      await registry.recordUsage("usage-test", 100);
      await registry.recordUsage("usage-test", 50);

      const usage = await registry.getUsage("usage-test");
      expect(usage.tokensToday).toBe(150);
      expect(usage.tokensTotal).toBe(150);
      expect(usage.messagesToday).toBe(2);
      expect(usage.messagesTotal).toBe(2);
    });

    it("throws when daily token limit exceeded", async () => {
      await registry.createTenant({
        name: "Limited",
        id: "limited-test",
        plan: "free", // 50,000 tokens/day
      });

      // Fill up to just under the limit
      await registry.recordUsage("limited-test", 49_999);

      // This should exceed the limit
      await expect(registry.recordUsage("limited-test", 100))
        .rejects.toThrow("Daily token limit exceeded");
    });

    it("allows unlimited tokens for enterprise plan", async () => {
      await registry.createTenant({
        name: "Enterprise",
        id: "ent-test",
        plan: "enterprise", // maxTokensPerDay = 0 (unlimited)
      });

      // Should not throw even with a huge amount
      await registry.recordUsage("ent-test", 10_000_000);
      const usage = await registry.getUsage("ent-test");
      expect(usage.tokensToday).toBe(10_000_000);
    });

    it("throws for unknown tenant", async () => {
      await expect(registry.recordUsage("nope", 100))
        .rejects.toThrow("Tenant not found: nope");
    });
  });

  describe("getUsage", () => {
    it("returns a copy of usage data", async () => {
      await registry.createTenant({ name: "Usage", id: "get-usage" });
      await registry.recordUsage("get-usage", 42);

      const usage = await registry.getUsage("get-usage");
      expect(usage.tokensToday).toBe(42);

      // Mutating the returned object should not affect internal state
      usage.tokensToday = 999;
      const usage2 = await registry.getUsage("get-usage");
      expect(usage2.tokensToday).toBe(42);
    });
  });

  describe("resetDailyUsage", () => {
    it("resets daily counters for all tenants", async () => {
      await registry.createTenant({ name: "A", id: "ra" });
      await registry.createTenant({ name: "B", id: "rb" });

      await registry.recordUsage("ra", 1000);
      await registry.recordUsage("rb", 2000);

      await registry.resetDailyUsage();

      const usageA = await registry.getUsage("ra");
      const usageB = await registry.getUsage("rb");
      expect(usageA.tokensToday).toBe(0);
      expect(usageA.messagesToday).toBe(0);
      expect(usageA.tokensTotal).toBe(1000); // total preserved
      expect(usageA.messagesTotal).toBe(1); // total preserved
      expect(usageB.tokensToday).toBe(0);
      expect(usageB.tokensTotal).toBe(2000);
    });
  });

  // ── Tenant resolution ─────────────────────────────────────────────────────

  describe("resolveTenant", () => {
    it("resolves by explicit tenant ID", async () => {
      await registry.createTenant({ name: "Direct", id: "direct-test" });
      const tenant = await registry.resolveTenant({ tenantId: "direct-test" });

      expect(tenant).not.toBeNull();
      expect(tenant!.id).toBe("direct-test");
    });

    it("resolves by API key", async () => {
      const created = await registry.createTenant({ name: "API", id: "api-test" });
      // Manually set API key (normally done via updateTenant)
      created.apiKey = "secret-key-123";
      // Re-persist
      await registry.updateTenant("api-test", { name: "API" });
      // Re-set apiKey after update (updateTenant doesn't handle apiKey)
      const updated = await registry.getTenant("api-test");
      if (updated) updated.apiKey = "secret-key-123";

      const resolved = await registry.resolveTenant({ apiKey: "secret-key-123" });
      expect(resolved).not.toBeNull();
      expect(resolved!.id).toBe("api-test");
    });

    it("resolves by origin", async () => {
      await registry.createTenant({
        name: "Origin",
        id: "origin-test",
        allowedOrigins: ["https://example.com"],
      });

      const tenant = await registry.resolveTenant({ origin: "https://example.com" });
      expect(tenant).not.toBeNull();
      expect(tenant!.id).toBe("origin-test");
    });

    it("returns null when no match", async () => {
      const tenant = await registry.resolveTenant({
        tenantId: "nope",
        apiKey: "nope",
        origin: "https://nope.com",
      });
      expect(tenant).toBeNull();
    });

    it("prefers tenant ID over API key and origin", async () => {
      await registry.createTenant({ name: "ID", id: "priority-id" });
      await registry.createTenant({
        name: "Origin",
        id: "priority-origin",
        allowedOrigins: ["https://test.com"],
      });

      const tenant = await registry.resolveTenant({
        tenantId: "priority-id",
        origin: "https://test.com",
      });
      expect(tenant!.id).toBe("priority-id");
    });
  });

  // ── Persistence ───────────────────────────────────────────────────────────

  describe("persistence", () => {
    it("persists tenants to disk", async () => {
      await registry.createTenant({ name: "Persist", id: "persist-test" });

      // Create a new registry pointing to the same storage
      const registry2 = new TenantRegistry(storagePath);
      const tenant = await registry2.getTenant("persist-test");

      expect(tenant).not.toBeNull();
      expect(tenant!.name).toBe("Persist");
    });

    it("persists usage data across restarts", async () => {
      await registry.createTenant({ name: "Usage", id: "persist-usage" });
      await registry.recordUsage("persist-usage", 500);

      const registry2 = new TenantRegistry(storagePath);
      const usage = await registry2.getUsage("persist-usage");

      expect(usage.tokensToday).toBe(500);
      expect(usage.tokensTotal).toBe(500);
    });
  });
});
