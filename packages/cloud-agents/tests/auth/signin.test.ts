/**
 * Sign-in flow tests.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { authenticate } from "../src/auth/service.js";
import { ERRORS } from "../src/auth/service.js";

// Helper to create a hashed password
async function createTestPassword() {
  // In a real test, you'd use the actual hashPassword function
  // For now, we'll just return a mock hash/salt
  const encoder = new TextEncoder();
  const passwordData = encoder.encode("SecurePass123");

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

  const hashBytes = new Uint8Array(hashBuffer);

  // Encode as base64-url
  const toBase64Url = (bytes: Uint8Array) => {
    const bin = Array.from(bytes, (b) => String.fromCharCode(b));
    const b64 = btoa(bin.join(""));
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  };

  return {
    hash: toBase64Url(hashBytes),
    salt: toBase64Url(salt),
  };
}

// Mock environment
function createMockEnv() {
  const users = new Map<string, any>();

  return {
    ADMIRAL: {
      get: vi.fn(() => ({
        fetch: vi.fn(async (req: Request) => {
          const url = new URL(req.url);
          const pathname = url.pathname;

          // Get user by email
          if (pathname.includes("/auth/users/by-email/")) {
            const email = decodeURIComponent(pathname.split("/").pop()!);
            const user = Array.from(users.values()).find((u) => u.email === email);

            if (!user) {
              return new Response("User not found", { status: 404 });
            }

            return new Response(JSON.stringify(user), { status: 200 });
          }

          // Update user
          if (req.method === "PATCH") {
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
          }

          return new Response("Not found", { status: 404 });
        }),
      })),
    },
    AUTH_KV: {
      put: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    },
    FLEET_JWT_SECRET: "test-secret",
  };
}

describe("user signin", () => {
  let mockEnv: any;
  let testPassword: { hash: string; salt: string };
  let testUserId: string;

  beforeEach(async () => {
    mockEnv = createMockEnv();
    testPassword = await createTestPassword();
    testUserId = crypto.randomUUID();

    // Create a test user
    const testUser = {
      id: testUserId,
      email: "test@example.com",
      passwordHash: testPassword.hash,
      passwordSalt: testPassword.salt,
      name: "Test User",
      plan: "free" as const,
      createdAt: new Date().toISOString(),
      status: "active" as const,
    };

    // Get the internal users Map from the mock
    const admiralStub = mockEnv.ADMIRAL.get();
    const fetchFn = admiralStub.fetch;
    const originalCall = fetchFn.getMockImplementation();

    // Override to store the user
    fetchFn.mockImplementation(async (req: Request) => {
      const url = new URL(req.url);
      if (url.pathname.includes("/auth/users/by-email/")) {
        const email = decodeURIComponent(url.pathname.split("/").pop()!);
        if (email === "test@example.com") {
          return new Response(JSON.stringify(testUser), { status: 200 });
        }
      }
      return originalCall ? originalCall(req) : new Response("Not found", { status: 404 });
    });
  });

  it("should authenticate with correct credentials", async () => {
    const result = await authenticate(
      mockEnv,
      "test@example.com",
      "SecurePass123"
    );

    expect(result.user.email).toBe("test@example.com");
    expect(result.user.name).toBe("Test User");
    expect(result.tokens.accessToken).toBeTruthy();
    expect(result.tokens.refreshToken).toBeTruthy();
  });

  it("should reject incorrect password", async () => {
    await expect(
      authenticate(mockEnv, "test@example.com", "WrongPassword")
    ).rejects.toThrow(ERRORS.INVALID_CREDENTIALS);
  });

  it("should reject non-existent user", async () => {
    await expect(
      authenticate(mockEnv, "nonexistent@example.com", "password")
    ).rejects.toThrow(ERRORS.INVALID_CREDENTIALS);
  });

  it("should normalize email to lowercase", async () => {
    const result = await authenticate(
      mockEnv,
      "TEST@EXAMPLE.COM",
      "SecurePass123"
    );

    expect(result.user.email).toBe("test@example.com");
  });

  it("should not return password hash in response", async () => {
    const result = await authenticate(
      mockEnv,
      "test@example.com",
      "SecurePass123"
    );

    expect(result.user).not.toHaveProperty("passwordHash");
    expect(result.user).not.toHaveProperty("passwordSalt");
  });
});
