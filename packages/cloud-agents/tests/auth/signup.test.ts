/**
 * Sign-up flow tests.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createUser } from "../src/auth/service.js";
import { ERRORS } from "../src/auth/service.js";

// Mock environment
function createMockEnv() {
  const users = new Map<string, any>();

  return {
    ADMIRAL: {
      get: vi.fn(() => ({
        fetch: vi.fn(async (req: Request) => {
          const url = new URL(req.url);
          const pathname = url.pathname;

          if (pathname === "/auth/users" && req.method === "POST") {
            const body = await req.json();
            const user = body.user;

            // Check for duplicate email
            for (const existingUser of users.values()) {
              if (existingUser.email === user.email) {
                return new Response("UNIQUE constraint failed: users.email", { status: 400 });
              }
            }

            users.set(user.id, user);
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
          }

          return new Response("Not found", { status: 404 });
        }),
      })),
    },
    AUTH_KV: {
      put: vi.fn(async () => undefined),
    },
    FLEET_JWT_SECRET: "test-secret",
  };
}

describe("user signup", () => {
  let mockEnv: any;

  beforeEach(() => {
    mockEnv = createMockEnv();
  });

  it("should create a new user with valid data", async () => {
    const result = await createUser(
      mockEnv,
      "test@example.com",
      "SecurePass123",
      "Test User"
    );

    expect(result.user.email).toBe("test@example.com");
    expect(result.user.name).toBe("Test User");
    expect(result.user.plan).toBe("free");
    expect(result.user.id).toBeTruthy();
    expect(result.tokens.accessToken).toBeTruthy();
    expect(result.tokens.refreshToken).toBeTruthy();
  });

  it("should normalize email to lowercase", async () => {
    const result = await createUser(
      mockEnv,
      "TEST@EXAMPLE.COM",
      "SecurePass123",
      "Test User"
    );

    expect(result.user.email).toBe("test@example.com");
  });

  it("should accept custom instance name", async () => {
    const result = await createUser(
      mockEnv,
      "test@example.com",
      "SecurePass123",
      "Test User",
      "myinstance"
    );

    expect(result.user.instance).toBe("myinstance");
  });

  it("should accept pro plan", async () => {
    const result = await createUser(
      mockEnv,
      "test@example.com",
      "SecurePass123",
      "Test User",
      undefined,
      "pro"
    );

    expect(result.user.plan).toBe("pro");
  });

  it("should reject invalid email format", async () => {
    await expect(
      createUser(mockEnv, "invalid-email", "SecurePass123", "Test User")
    ).rejects.toThrow(ERRORS.INVALID_EMAIL);
  });

  it("should reject weak password", async () => {
    await expect(
      createUser(mockEnv, "test@example.com", "weak", "Test User")
    ).rejects.toThrow(ERRORS.WEAK_PASSWORD);
  });

  it("should reject common password", async () => {
    await expect(
      createUser(mockEnv, "test@example.com", "password123", "Test User")
    ).rejects.toThrow(ERRORS.COMMON_PASSWORD);
  });

  it("should reject invalid instance name", async () => {
    await expect(
      createUser(mockEnv, "test@example.com", "SecurePass123", "Test User", "Invalid-Instance!")
    ).rejects.toThrow(ERRORS.INVALID_INSTANCE);
  });

  it("should reject instance name that is too short", async () => {
    await expect(
      createUser(mockEnv, "test@example.com", "SecurePass123", "Test User", "ab")
    ).rejects.toThrow(ERRORS.INVALID_INSTANCE);
  });

  it("should reject instance name that is too long", async () => {
    await expect(
      createUser(mockEnv, "test@example.com", "SecurePass123", "Test User", "a".repeat(21))
    ).rejects.toThrow(ERRORS.INVALID_INSTANCE);
  });

  it("should reject instance name with uppercase", async () => {
    await expect(
      createUser(mockEnv, "test@example.com", "SecurePass123", "Test User", "MyInstance")
    ).rejects.toThrow(ERRORS.INVALID_INSTANCE);
  });

  it("should reject instance name with special characters", async () => {
    await expect(
      createUser(mockEnv, "test@example.com", "SecurePass123", "Test User", "my_instance")
    ).rejects.toThrow(ERRORS.INVALID_INSTANCE);
  });

  it("should reject duplicate email", async () => {
    // First signup should succeed
    await createUser(
      mockEnv,
      "test@example.com",
      "SecurePass123",
      "Test User"
    );

    // Second signup with same email should fail
    await expect(
      createUser(mockEnv, "test@example.com", "SecurePass123", "Another User")
    ).rejects.toThrow(ERRORS.USER_EXISTS);
  });

  it("should trim whitespace from name", async () => {
    const result = await createUser(
      mockEnv,
      "test@example.com",
      "SecurePass123",
      "  Test User  "
    );

    expect(result.user.name).toBe("Test User");
  });

  it("should not return password hash in response", async () => {
    const result = await createUser(
      mockEnv,
      "test@example.com",
      "SecurePass123",
      "Test User"
    );

    expect(result.user).not.toHaveProperty("passwordHash");
    expect(result.user).not.toHaveProperty("passwordSalt");
  });
});
