/**
 * TenantBridge tests — context creation, chat per tenant, tenant isolation.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { existsSync, rmSync, readFileSync } from "fs";
import { TenantRegistry } from "../../src/multi-tenant/tenant-registry.js";
import { TenantBridge } from "../../src/multi-tenant/tenant-bridge.js";

describe("TenantBridge", () => {
  let storagePath: string;
  let registry: TenantRegistry;
  let bridge: TenantBridge;

  beforeEach(() => {
    storagePath = join("/tmp", `cocapn-test-tbridge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    registry = new TenantRegistry(storagePath);
    bridge = new TenantBridge(registry);
  });

  afterEach(() => {
    if (existsSync(storagePath)) {
      rmSync(storagePath, { recursive: true, force: true });
    }
  });

  // ── Context creation ──────────────────────────────────────────────────────

  describe("createContext", () => {
    it("creates a context with brain, personality, and skills", async () => {
      await registry.createTenant({ name: "Ctx Test", id: "ctx-test" });
      await bridge.initializeTenant("ctx-test");

      const ctx = await bridge.createContext("ctx-test");

      expect(ctx.tenant.id).toBe("ctx-test");
      expect(ctx.brain).toBeDefined();
      expect(ctx.personality).toBeDefined();
      expect(ctx.skillSystem).toBeDefined();
    });

    it("caches the context for subsequent calls", async () => {
      await registry.createTenant({ name: "Cached", id: "cached-test" });
      await bridge.initializeTenant("cached-test");

      const ctx1 = await bridge.createContext("cached-test");
      const ctx2 = await bridge.createContext("cached-test");

      expect(ctx1).toBe(ctx2); // same reference
    });

    it("throws for unknown tenant", async () => {
      await expect(bridge.createContext("nope"))
        .rejects.toThrow("Tenant not found: nope");
    });
  });

  // ── Chat ──────────────────────────────────────────────────────────────────

  describe("chat", () => {
    it("records usage and returns context", async () => {
      await registry.createTenant({ name: "Chatter", id: "chat-test" });
      await bridge.initializeTenant("chat-test");

      const response = await bridge.chat("chat-test", "Hello, world!");

      const parsed = JSON.parse(response);
      expect(parsed.tenantId).toBe("chat-test");
      expect(parsed.message).toBe("Hello, world!");

      // Verify usage was recorded
      const usage = await registry.getUsage("chat-test");
      expect(usage.messagesToday).toBe(1);
      expect(usage.tokensToday).toBeGreaterThan(0);
    });
  });

  // ── Tenant initialization ─────────────────────────────────────────────────

  describe("initializeTenant", () => {
    it("initializes git repo in tenant brain directory", async () => {
      await registry.createTenant({ name: "Git Init", id: "git-test" });
      const tenant = await registry.getTenant("git-test")!;

      expect(existsSync(join(tenant!.brainPath, ".git"))).toBe(false);

      await bridge.initializeTenant("git-test");

      expect(existsSync(join(tenant!.brainPath, ".git"))).toBe(true);
    });

    it("writes default soul.md if not present", async () => {
      await registry.createTenant({ name: "Soul", id: "soul-test" });
      await bridge.initializeTenant("soul-test");

      const tenant = await registry.getTenant("soul-test")!;
      const soulContent = readFileSync(tenant!.personalityPath, "utf8");

      expect(soulContent).toContain("# Soul");
    });

    it("writes custom personality if configured", async () => {
      await registry.createTenant({
        name: "Custom Soul",
        id: "custom-soul-test",
        config: {
          customPersonality: "# Custom\n\nA custom AI assistant personality.",
        },
      });
      await bridge.initializeTenant("custom-soul-test");

      const tenant = await registry.getTenant("custom-soul-test")!;
      const soulContent = readFileSync(tenant!.personalityPath, "utf8");

      expect(soulContent).toBe("# Custom\n\nA custom AI assistant personality.");
    });

    it("writes empty facts.json", async () => {
      await registry.createTenant({ name: "Facts", id: "facts-test" });
      await bridge.initializeTenant("facts-test");

      const tenant = await registry.getTenant("facts-test")!;
      const factsPath = join(tenant!.brainPath, "cocapn", "memory", "facts.json");
      const content = readFileSync(factsPath, "utf8");

      expect(JSON.parse(content)).toEqual({});
    });
  });

  // ── Tenant status ─────────────────────────────────────────────────────────

  describe("getStatus", () => {
    it("returns status for an initialized tenant", async () => {
      await registry.createTenant({ name: "Status", id: "status-test" });
      await bridge.initializeTenant("status-test");

      const status = await bridge.getStatus("status-test");

      expect(status.initialized).toBe(true);
      expect(status.tenant.id).toBe("status-test");
      expect(status.factCount).toBe(0);
      expect(status.wikiPages).toBe(0);
      expect(status.activeTasks).toBe(0);
    });

    it("initializes and returns status for non-initialized tenant", async () => {
      await registry.createTenant({ name: "Uninit", id: "uninit-test" });

      const status = await bridge.getStatus("uninit-test");

      // getStatus triggers initialization as a side effect
      expect(status.initialized).toBe(true);
    });

    it("throws for unknown tenant", async () => {
      await expect(bridge.getStatus("nope"))
        .rejects.toThrow("Tenant not found: nope");
    });
  });

  // ── Context disposal ──────────────────────────────────────────────────────

  describe("disposeContext", () => {
    it("removes cached context", async () => {
      await registry.createTenant({ name: "Dispose", id: "dispose-test" });
      await bridge.initializeTenant("dispose-test");

      const ctx1 = await bridge.createContext("dispose-test");
      bridge.disposeContext("dispose-test");
      const ctx2 = await bridge.createContext("dispose-test");

      expect(ctx1).not.toBe(ctx2); // different references
    });

    it("disposes all contexts", async () => {
      await registry.createTenant({ name: "A", id: "disp-a" });
      await registry.createTenant({ name: "B", id: "disp-b" });
      await bridge.initializeTenant("disp-a");
      await bridge.initializeTenant("disp-b");

      await bridge.createContext("disp-a");
      await bridge.createContext("disp-b");
      bridge.disposeAll();

      // Should create new contexts
      const ctx1 = await bridge.createContext("disp-a");
      const ctx2 = await bridge.createContext("disp-b");
      expect(ctx1).toBeDefined();
      expect(ctx2).toBeDefined();
    });
  });

  // ── Tenant isolation ──────────────────────────────────────────────────────

  describe("tenant isolation", () => {
    it("tenants have separate brain directories", async () => {
      const t1 = await registry.createTenant({ name: "Tenant 1", id: "iso-1" });
      const t2 = await registry.createTenant({ name: "Tenant 2", id: "iso-2" });

      expect(t1.brainPath).not.toBe(t2.brainPath);
      expect(existsSync(t1.brainPath)).toBe(true);
      expect(existsSync(t2.brainPath)).toBe(true);
    });

    it("facts written to one tenant are invisible to another", async () => {
      await registry.createTenant({ name: "T1", id: "iso-facts-1" });
      await registry.createTenant({ name: "T2", id: "iso-facts-2" });
      await bridge.initializeTenant("iso-facts-1");
      await bridge.initializeTenant("iso-facts-2");

      const ctx1 = await bridge.createContext("iso-facts-1");
      const ctx2 = await bridge.createContext("iso-facts-2");

      // Set a fact in tenant 1
      await ctx1.brain.setFact("secret", "tenant-1-value");

      // Verify tenant 2 doesn't see it
      const t2Fact = ctx2.brain.getFact("secret");
      expect(t2Fact).toBeUndefined();

      // Verify tenant 1 still sees it
      const t1Fact = ctx1.brain.getFact("secret");
      expect(t1Fact).toBe("tenant-1-value");
    });

    it("usage is tracked independently per tenant", async () => {
      await registry.createTenant({ name: "T1", id: "iso-use-1" });
      await registry.createTenant({ name: "T2", id: "iso-use-2" });
      await bridge.initializeTenant("iso-use-1");
      await bridge.initializeTenant("iso-use-2");

      await bridge.chat("iso-use-1", "Short message from T1");
      await bridge.chat("iso-use-2", "A much longer message from the second tenant that should use more tokens");

      const usage1 = await registry.getUsage("iso-use-1");
      const usage2 = await registry.getUsage("iso-use-2");

      expect(usage1.messagesToday).toBe(1);
      expect(usage2.messagesToday).toBe(1);
      // T2 should have more tokens due to longer message
      expect(usage2.tokensToday).toBeGreaterThan(usage1.tokensToday);
    });
  });
});
