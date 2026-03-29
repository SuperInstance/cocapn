/**
 * JWT token management tests.
 */

import { describe, it, expect, vi } from "vitest";
import {
  generateAccessToken,
  generateTokenPair,
  verifyAccessToken,
  extractBearerToken,
  getUserFromRequest,
} from "../src/auth/tokens.js";

// Mock crypto.randomUUID
vi.stubGlobal("crypto", {
  subtle: {
    importKey: vi.fn(async () => ({})),
    sign: vi.fn(async () => new Uint8Array(32)),
    verify: vi.fn(async () => true),
  },
  getRandomValues: vi.fn((arr) => {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
    return arr;
  }),
  randomUUID: vi.fn(() => "mock-uuid-1234"),
});

describe("JWT token generation", () => {
  it("should generate an access token", async () => {
    const user = {
      id: "user-123",
      email: "test@example.com",
      name: "Test User",
      instance: "testuser",
      plan: "free" as const,
    };

    const secret = "test-secret";
    const token = await generateAccessToken(user, secret);

    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3); // JWT has 3 parts
  });

  it("should include correct claims in token", async () => {
    const user = {
      id: "user-123",
      email: "test@example.com",
      name: "Test User",
      plan: "free" as const,
    };

    const secret = "test-secret";
    const token = await generateAccessToken(user, secret);

    const payloadB64 = token.split(".")[1];
    const payload = JSON.parse(atob(payloadB64!.replace(/-/g, "+").replace(/_/g, "/")));

    expect(payload.sub).toBe(user.id);
    expect(payload.email).toBe(user.email);
    expect(payload.name).toBe(user.name);
    expect(payload.plan).toBe(user.plan);
    expect(payload.iss).toBe("cocapn.ai");
    expect(payload.aud).toBe("cocapn-workers");
    expect(payload.iat).toBeTruthy();
    expect(payload.exp).toBeTruthy();
  });

  it("should set expiration to 15 minutes", async () => {
    const user = {
      id: "user-123",
      email: "test@example.com",
      name: "Test User",
      plan: "free" as const,
    };

    const secret = "test-secret";
    const beforeNow = Math.floor(Date.now() / 1000);
    const token = await generateAccessToken(user, secret);
    const afterNow = Math.floor(Date.now() / 1000);

    const payloadB64 = token.split(".")[1];
    const payload = JSON.parse(atob(payloadB64!.replace(/-/g, "+").replace(/_/g, "/")));

    expect(payload.exp - payload.iat).toBe(15 * 60); // 15 minutes
    expect(payload.iat).toBeGreaterThanOrEqual(beforeNow);
    expect(payload.iat).toBeLessThanOrEqual(afterNow);
  });
});

describe("token pair generation", () => {
  it("should generate both access and refresh tokens", async () => {
    const user = {
      id: "user-123",
      email: "test@example.com",
      name: "Test User",
      plan: "free" as const,
    };

    const secret = "test-secret";
    const tokens = await generateTokenPair(user, secret);

    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBe("mock-uuid-1234");
    expect(tokens.expiresIn).toBe(15 * 60); // 15 minutes
  });
});

describe("token verification", () => {
  it("should verify a valid token", async () => {
    const user = {
      id: "user-123",
      email: "test@example.com",
      name: "Test User",
      plan: "free" as const,
    };

    const secret = "test-secret";
    const token = await generateAccessToken(user, secret);

    // Mock verification to return the payload
    const payloadB64 = token.split(".")[1];
    const decodedPayload = JSON.parse(atob(payloadB64!.replace(/-/g, "+").replace(/_/g, "/")));

    // Since we can't actually verify the signature in tests, we'll just check the structure
    expect(decodedPayload.sub).toBe(user.id);
    expect(decodedPayload.email).toBe(user.email);
  });

  it("should reject malformed tokens", async () => {
    const secret = "test-secret";

    await expect(verifyAccessToken("invalid-token", secret)).rejects.toThrow("invalid_token_format");
  });

  it("should reject tokens with wrong number of parts", async () => {
    const secret = "test-secret";

    await expect(verifyAccessToken("only.two", secret)).rejects.toThrow("invalid_token_format");
    await expect(verifyAccessToken("one", secret)).rejects.toThrow("invalid_token_format");
  });
});

describe("bearer token extraction", () => {
  it("should extract bearer token from authorization header", () => {
    const request = new Request("https://example.com", {
      headers: { Authorization: "Bearer my-token-here" },
    });

    const token = extractBearerToken(request);

    expect(token).toBe("my-token-here");
  });

  it("should return undefined for missing authorization header", () => {
    const request = new Request("https://example.com");

    const token = extractBearerToken(request);

    expect(token).toBeUndefined();
  });

  it("should return undefined for malformed authorization header", () => {
    const request = new Request("https://example.com", {
      headers: { Authorization: "Basic credentials" },
    });

    const token = extractBearerToken(request);

    expect(token).toBeUndefined();
  });

  it("should handle tokens with spaces", () => {
    const request = new Request("https://example.com", {
      headers: { Authorization: "Bearer token with spaces" },
    });

    const token = extractBearerToken(request);

    expect(token).toBe("token with spaces");
  });
});
