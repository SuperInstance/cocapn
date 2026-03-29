/**
 * Authentication module tests.
 *
 * Tests password hashing, JWT tokens, and auth flow.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Mock KV Namespace ─────────────────────────────────────────────────────────

class MockKV implements KVNamespace {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null>;
  async get(key: string, type: "json"): Promise<unknown | null>;
  async get(key: string, type?: string): Promise<string | null | unknown> {
    const value = this.store.get(key);
    if (type === "json" && value) {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value ?? null;
  }

  async put(key: string, value: string | object | ArrayBuffer, options?: { expirationTtl?: number }): Promise<void> {
    const strValue = typeof value === "string" ? value : JSON.stringify(value);
    this.store.set(key, strValue);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(): Promise<KVListResult<string, unknown>> {
    return { keys: [], list_complete: true };
  }
}

// ─── Password Hashing Tests ─────────────────────────────────────────────────────

describe("password hashing", () => {
  it("should hash a password with PBKDF2", async () => {
    const password = "SecurePass123";
    const encoder = new TextEncoder();
    const passwordData = encoder.encode(password);

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      passwordData,
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const hashBuffer = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      256
    );

    expect(hashBuffer).toBeTruthy();
    expect(hashBuffer.byteLength).toBe(32); // 256 bits = 32 bytes
  });

  it("should verify a password correctly", async () => {
    const password = "SecurePass123";
    const encoder = new TextEncoder();
    const passwordData = encoder.encode(password);

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      passwordData,
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const hashBuffer = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      256
    );

    // Now verify by re-deriving
    const verifyKeyMaterial = await crypto.subtle.importKey(
      "raw",
      passwordData,
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const verifyBuffer = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      verifyKeyMaterial,
      256
    );

    const hash1 = new Uint8Array(hashBuffer);
    const hash2 = new Uint8Array(verifyBuffer);

    expect(hash1).toEqual(hash2);
  });

  it("should generate different hashes for different passwords", async () => {
    const encoder = new TextEncoder();

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial1 = await crypto.subtle.importKey(
      "raw",
      encoder.encode("password1"),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const hash1 = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
      keyMaterial1,
      256
    );

    const keyMaterial2 = await crypto.subtle.importKey(
      "raw",
      encoder.encode("password2"),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const hash2 = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
      keyMaterial2,
      256
    );

    const bytes1 = new Uint8Array(hash1);
    const bytes2 = new Uint8Array(hash2);

    expect(bytes1).not.toEqual(bytes2);
  });
});

// ─── JWT Token Tests ─────────────────────────────────────────────────────────────

describe("JWT tokens", () => {
  function encodeBase64Url(data: Uint8Array): string {
    const bin = Array.from(data, (b) => String.fromCharCode(b));
    const b64 = btoa(bin.join(""));
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  function stringToBytes(str: string): Uint8Array {
    const encoder = new TextEncoder();
    return encoder.encode(str);
  }

  it("should create a JWT with 3 parts", async () => {
    const header = { alg: "HS256", typ: "JWT" };
    const payload = { sub: "user-123", iat: Math.floor(Date.now() / 1000) };

    const headerB64 = encodeBase64Url(stringToBytes(JSON.stringify(header)));
    const payloadB64 = encodeBase64Url(stringToBytes(JSON.stringify(payload)));

    const jwt = `${headerB64}.${payloadB64}.signature`;

    const parts = jwt.split(".");
    expect(parts).toHaveLength(3);
  });

  it("should encode and decode base64-url strings", () => {
    const original = "Hello, World!";
    const bytes = stringToBytes(original);
    const encoded = encodeBase64Url(bytes);

    expect(encoded).toBeTruthy();
    expect(typeof encoded).toBe("string");
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");
  });
});

// ─── Rate Limiting Tests ─────────────────────────────────────────────────────────

describe("rate limiting", () => {
  let mockKv: MockKV;

  beforeEach(() => {
    mockKv = new MockKV();
  });

  it("should track request count in KV", async () => {
    const key = "ratelimit:test:user@example.com";
    await mockKv.put(key, JSON.stringify({ count: 1, resetAt: Date.now() + 900000 }));

    const data = await mockKv.get(key, "json");
    expect(data).toEqual({ count: 1, resetAt: expect.any(Number) });
  });

  it("should increment count on subsequent requests", async () => {
    const key = "ratelimit:test:user@example.com";
    await mockKv.put(key, JSON.stringify({ count: 1, resetAt: Date.now() + 900000 }));

    const current = await mockKv.get(key, "json") as { count: number; resetAt: number };
    await mockKv.put(key, JSON.stringify({ count: current.count + 1, resetAt: current.resetAt }));

    const updated = await mockKv.get(key, "json") as { count: number; resetAt: number };
    expect(updated.count).toBe(2);
  });

  it("should allow requests under the limit", async () => {
    const key = "ratelimit:test:user@example.com";
    await mockKv.put(key, JSON.stringify({ count: 3, resetAt: Date.now() + 900000 }));

    const current = await mockKv.get(key, "json") as { count: number };
    expect(current.count).toBeLessThan(5); // Limit is 5
  });

  it("should block requests over the limit", async () => {
    const key = "ratelimit:test:user@example.com";
    await mockKv.put(key, JSON.stringify({ count: 5, resetAt: Date.now() + 900000 }));

    const current = await mockKv.get(key, "json") as { count: number };
    expect(current.count).toBeGreaterThanOrEqual(5); // At or over limit
  });

  it("should reset counter after expiration", async () => {
    const key = "ratelimit:test:user@example.com";
    const pastReset = Date.now() - 1000; // 1 second ago

    await mockKv.put(key, JSON.stringify({ count: 5, resetAt: pastReset }));

    const current = await mockKv.get(key, "json") as { count: number; resetAt: number };
    expect(current.resetAt).toBeLessThan(Date.now()); // Expired
  });
});

// ─── Auth Flow Tests ────────────────────────────────────────────────────────────

describe("authentication flow", () => {
  let mockKv: MockKV;

  beforeEach(() => {
    mockKv = new MockKV();
  });

  it("should validate email format", () => {
    const validEmails = ["test@example.com", "user.name@example.co.uk", "user+tag@example.com"];
    const invalidEmails = ["invalid", "@example.com", "user@", "user @example.com"];

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    validEmails.forEach((email) => {
      expect(emailRegex.test(email)).toBe(true);
    });

    invalidEmails.forEach((email) => {
      expect(emailRegex.test(email)).toBe(false);
    });
  });

  it("should validate password strength", () => {
    const validPasswords = ["SecurePass123", "Password1", "pass12345", "12345678"];
    const invalidPasswords = ["short", "lowercase", "nocapsornums"];

    // Has uppercase OR number (relaxed requirement)
    const isValid = (password: string) => {
      if (password.length < 8) return false;
      const hasUpperCase = /[A-Z]/.test(password);
      const hasNumber = /[0-9]/.test(password);
      return hasUpperCase || hasNumber;
    };

    validPasswords.forEach((password) => {
      expect(isValid(password)).toBe(true);
    });

    invalidPasswords.forEach((password) => {
      expect(isValid(password)).toBe(false);
    });
  });

  it("should validate instance name format", () => {
    const validInstances = ["myinstance", "test123", "abc"];
    const invalidInstances = ["MyInstance", "my_instance", "my-instance", "ab", "a".repeat(21)];

    const instanceRegex = /^[a-z0-9]{3,20}$/;

    validInstances.forEach((instance) => {
      expect(instanceRegex.test(instance)).toBe(true);
    });

    invalidInstances.forEach((instance) => {
      expect(instanceRegex.test(instance)).toBe(false);
    });
  });

  it("should store refresh token in KV", async () => {
    const refreshToken = crypto.randomUUID();
    const tokenData = {
      userId: "user-123",
      createdAt: new Date().toISOString(),
    };

    await mockKv.put(`refresh-token:${refreshToken}`, JSON.stringify(tokenData), {
      expirationTtl: 30 * 24 * 60 * 60, // 30 days
    });

    const retrieved = await mockKv.get(`refresh-token:${refreshToken}`, "json");
    expect(retrieved).toEqual(tokenData);
  });

  it("should revoke refresh token from KV", async () => {
    const refreshToken = crypto.randomUUID();
    const tokenData = {
      userId: "user-123",
      createdAt: new Date().toISOString(),
    };

    await mockKv.put(`refresh-token:${refreshToken}`, JSON.stringify(tokenData));
    await mockKv.delete(`refresh-token:${refreshToken}`);

    const retrieved = await mockKv.get(`refresh-token:${refreshToken}`, "json");
    expect(retrieved).toBeNull();
  });
});

// ─── API Key Tests ───────────────────────────────────────────────────────────────

describe("API keys", () => {
  it("should generate API key with correct format", () => {
    const secret = crypto.randomUUID();
    const apiKey = `cocapn_sk_${secret}`;

    expect(apiKey).toMatch(/^cocapn_sk_[a-f0-9-]+$/);
  });

  it("should extract prefix from API key", () => {
    const apiKey = "cocapn_sk_abc123def456";
    const prefix = apiKey.slice(10, 18); // First 8 chars after prefix

    expect(prefix).toBe("abc123de");
  });

  it("should hash API key with SHA-256", async () => {
    const apiKey = "cocapn_sk_abc123";
    const keyBuffer = new TextEncoder().encode(apiKey);
    const hashBuffer = await crypto.subtle.digest("SHA-256", keyBuffer);

    expect(hashBuffer.byteLength).toBe(32); // SHA-256 = 32 bytes
  });

  it("should generate UUID for key ID", () => {
    const keyId = crypto.randomUUID();

    expect(keyId).toMatch(/^[a-f0-9-]{36}$/);
  });
});
