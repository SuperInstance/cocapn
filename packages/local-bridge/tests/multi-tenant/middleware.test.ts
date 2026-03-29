/**
 * Middleware tests — header resolution, missing tenant, invalid tenant.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { existsSync, rmSync } from "fs";
import { TenantRegistry } from "../../src/multi-tenant/tenant-registry.js";
import {
  createTenantMiddleware,
  sendTenantError,
  extractResolutionRequest,
  TenantError,
} from "../../src/multi-tenant/middleware.js";
import type { IncomingMessage, ServerResponse } from "http";

describe("Tenant Middleware", () => {
  let storagePath: string;
  let registry: TenantRegistry;

  beforeEach(async () => {
    storagePath = join("/tmp", `cocapn-test-mw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    registry = new TenantRegistry(storagePath);
    await registry.createTenant({ name: "Header Tenant", id: "header-test" });
    await registry.createTenant({
      name: "Origin Tenant",
      id: "origin-test",
      allowedOrigins: ["https://myapp.com"],
    });
  });

  afterEach(() => {
    if (existsSync(storagePath)) {
      rmSync(storagePath, { recursive: true, force: true });
    }
  });

  // ── extractResolutionRequest ──────────────────────────────────────────────

  describe("extractResolutionRequest", () => {
    it("extracts X-Tenant-ID header", () => {
      const req = makeRequest({ "x-tenant-id": "my-tenant" });
      const result = extractResolutionRequest(req);

      expect(result.tenantId).toBe("my-tenant");
      expect(result.apiKey).toBeUndefined();
      expect(result.origin).toBeUndefined();
    });

    it("extracts API key from Authorization header", () => {
      const req = makeRequest({ authorization: "Bearer sk-12345" });
      const result = extractResolutionRequest(req);

      expect(result.apiKey).toBe("sk-12345");
      expect(result.tenantId).toBeUndefined();
    });

    it("extracts origin header", () => {
      const req = makeRequest({ origin: "https://myapp.com" });
      const result = extractResolutionRequest(req);

      expect(result.origin).toBe("https://myapp.com");
    });

    it("handles multiple values for headers (takes first)", () => {
      const req = makeRequest({ "x-tenant-id": ["first", "second"] });
      const result = extractResolutionRequest(req);

      expect(result.tenantId).toBe("first");
    });

    it("returns empty object when no headers present", () => {
      const req = makeRequest({});
      const result = extractResolutionRequest(req);

      expect(result).toEqual({
        tenantId: undefined,
        apiKey: undefined,
        origin: undefined,
      });
    });
  });

  // ── createTenantMiddleware ────────────────────────────────────────────────

  describe("createTenantMiddleware", () => {
    it("resolves tenant by X-Tenant-ID header", async () => {
      const middleware = createTenantMiddleware(registry);
      const req = makeRequest({ "x-tenant-id": "header-test" });

      const result = await middleware(req);

      expect(result.tenantId).toBe("header-test");
      expect(result.resolutionMethod).toBe("header");
    });

    it("resolves tenant by origin", async () => {
      const middleware = createTenantMiddleware(registry);
      const req = makeRequest({ origin: "https://myapp.com" });

      const result = await middleware(req);

      expect(result.tenantId).toBe("origin-test");
      expect(result.resolutionMethod).toBe("origin");
    });

    it("throws TenantError(401) when no identification provided", async () => {
      const middleware = createTenantMiddleware(registry);
      const req = makeRequest({});

      await expect(middleware(req)).rejects.toThrow(TenantError);
      try {
        await middleware(req);
      } catch (err) {
        expect(err).toBeInstanceOf(TenantError);
        expect((err as TenantError).statusCode).toBe(401);
        expect((err as TenantError).message).toBe("Tenant identification required");
      }
    });

    it("throws TenantError(404) for invalid tenant ID", async () => {
      const middleware = createTenantMiddleware(registry);
      const req = makeRequest({ "x-tenant-id": "nonexistent" });

      try {
        await middleware(req);
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TenantError);
        expect((err as TenantError).statusCode).toBe(404);
        expect((err as TenantError).message).toContain("Tenant not found: nonexistent");
      }
    });

    it("throws TenantError(401) for invalid API key", async () => {
      const middleware = createTenantMiddleware(registry);
      const req = makeRequest({ authorization: "Bearer invalid-key" });

      try {
        await middleware(req);
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TenantError);
        expect((err as TenantError).statusCode).toBe(401);
        expect((err as TenantError).message).toBe("Invalid API key");
      }
    });

    it("throws TenantError(401) for unmatched origin", async () => {
      const middleware = createTenantMiddleware(registry);
      const req = makeRequest({ origin: "https://unknown.com" });

      try {
        await middleware(req);
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TenantError);
        expect((err as TenantError).statusCode).toBe(401);
        expect((err as TenantError).message).toBe("No tenant found for origin");
      }
    });
  });

  // ── sendTenantError ───────────────────────────────────────────────────────

  describe("sendTenantError", () => {
    it("sends TenantError with correct status code", () => {
      const { res, getResponse } = createMockResponse();
      sendTenantError(res, new TenantError(404, "Not found"));

      const response = getResponse();
      expect(response.statusCode).toBe(404);
      expect(response.body).toBe(JSON.stringify({ error: "Not found" }));
    });

    it("sends generic error as 500", () => {
      const { res, getResponse } = createMockResponse();
      sendTenantError(res, new Error("Internal error"));

      const response = getResponse();
      expect(response.statusCode).toBe(500);
      expect(response.body).toBe(JSON.stringify({ error: "Internal error" }));
    });

    it("sends non-Error as 500 with stringified message", () => {
      const { res, getResponse } = createMockResponse();
      sendTenantError(res, "string error");

      const response = getResponse();
      expect(response.statusCode).toBe(500);
      expect(response.body).toBe(JSON.stringify({ error: "string error" }));
    });
  });
});

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeRequest(headers: Record<string, string | string[]>): IncomingMessage {
  return {
    headers,
    method: "GET",
    url: "/api/test",
  } as unknown as IncomingMessage;
}

function createMockResponse(): {
  res: ServerResponse;
  getResponse: () => { statusCode: number; body: string };
} {
  let statusCode = 200;
  let body = "";

  const res = {
    writeHead(code: number, _headers?: Record<string, string>) {
      statusCode = code;
    },
    end(data: string) {
      body = data;
    },
  } as unknown as ServerResponse;

  return {
    res,
    getResponse: () => ({ statusCode, body }),
  };
}
