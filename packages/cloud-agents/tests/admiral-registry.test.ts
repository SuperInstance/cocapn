/**
 * Tests for AdmiralDO discovery registry functionality.
 *
 * Tests the new registry endpoints:
 *   - POST /registry/register
 *   - GET /registry/discover?q={query}
 *   - GET /registry/profile/:username
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  AdmiralDO,
  type RegistryProfile,
  type RegisterRequest,
  type RegisterResponse,
} from "../src/admiral.js";

// ─── Mock DurableObjectState ─────────────────────────────────────────────────────

class MockStorage {
  private store = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  // Helper for tests
  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

class MockDurableObjectState implements DurableObjectState {
  storage: MockStorage;

  constructor(storage: MockStorage) {
    this.storage = storage;
  }
}

// ─── Test utilities ─────────────────────────────────────────────────────────────

function createMockRequest(
  method: string,
  pathname: string,
  body?: unknown,
  query = ""
): Request {
  const url = `https://admiral.test/${pathname}${query}`;
  const init: RequestInit = {
    method,
    body: body ? JSON.stringify(body) : undefined,
  };

  // Add Content-Type for POST requests with body
  if (body && method === "POST") {
    (init.headers as Record<string, string>) = {
      "Content-Type": "application/json",
    };
  }

  return new Request(url, init);
}

function createMockProfile(username: string, overrides?: Partial<RegistryProfile>): RegistryProfile {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  return {
    username,
    displayName: overrides?.displayName ?? `Test ${username}`,
    currentFocus: overrides?.currentFocus ?? "Building cool stuff",
    website: overrides?.website ?? `https://${username}.example.com`,
    bio: overrides?.bio ?? "A developer building amazing things with cocapn.",
    domains: overrides?.domains ?? ["personallog.ai"],
    signature: overrides?.signature ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
    registeredAt: now,
    expiresAt,
  };
}

async function jsonResponse<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

// ─── Test suite ────────────────────────────────────────────────────────────────

describe("AdmiralDO Registry", () => {
  let mockStorage: MockStorage;
  let mockState: DurableObjectState;
  let admiral: AdmiralDO;

  beforeEach(() => {
    mockStorage = new MockStorage();
    mockState = new MockDurableObjectState(mockStorage) as unknown as DurableObjectState;
    admiral = new AdmiralDO(mockState);
  });

  describe("POST /registry/register", () => {
    it("should register a new profile and return peer count", async () => {
      const profile = createMockProfile("alice");
      const request = createMockRequest("POST", "registry/register", { profile });

      const response = await admiral.fetch(request);

      expect(response.status).toBe(200);
      const result = await jsonResponse<RegisterResponse>(response);
      expect(result.ok).toBe(true);
      expect(result.peerCount).toBe(1);

      // Verify profile was stored
      const stored = await mockStorage.get<RegistryProfile[]>("registry");
      expect(stored).toHaveLength(1);
      expect(stored?.[0]?.username).toBe("alice");
    });

    it("should update existing profile instead of creating duplicate", async () => {
      const profile1 = createMockProfile("bob", { displayName: "Bob Original" });
      const request1 = createMockRequest("POST", "registry/register", { profile: profile1 });
      await admiral.fetch(request1);

      const profile2 = createMockProfile("bob", { displayName: "Bob Updated" });
      const request2 = createMockRequest("POST", "registry/register", { profile: profile2 });
      const response = await admiral.fetch(request2);

      expect(response.status).toBe(200);
      const result = await jsonResponse<RegisterResponse>(response);
      expect(result.peerCount).toBe(1); // Still 1, not 2

      const stored = await mockStorage.get<RegistryProfile[]>("registry");
      expect(stored).toHaveLength(1);
      expect(stored?.[0]?.displayName).toBe("Bob Updated");
    });

    it("should reject profile with missing username", async () => {
      const profile = createMockProfile("valid");
      delete (profile as Partial<RegistryProfile>).username;
      const request = createMockRequest("POST", "registry/register", { profile });

      const response = await admiral.fetch(request);

      expect(response.status).toBe(400);
      expect(await response.text()).toContain("Missing profile or username");
    });

    it("should reject profile with invalid signature format", async () => {
      const profile = createMockProfile("charlie", { signature: "invalid" });
      const request = createMockRequest("POST", "registry/register", { profile });

      const response = await admiral.fetch(request);

      expect(response.status).toBe(400);
      expect(await response.text()).toContain("Invalid signature format");
    });
  });

  describe("GET /registry/discover", () => {
    beforeEach(async () => {
      // Seed the registry with test data
      const profiles = [
        createMockProfile("alice", { displayName: "Alice Developer", currentFocus: "Building AI agents" }),
        createMockProfile("bob", { displayName: "Bob Designer", currentFocus: "Creating beautiful UIs" }),
        createMockProfile("charlie", { displayName: "Charlie Engineer", currentFocus: "Scaling distributed systems" }),
        createMockProfile("diana", { displayName: "Diana Product", currentFocus: "Building AI agents" }),
      ];

      for (const profile of profiles) {
        const request = createMockRequest("POST", "registry/register", { profile });
        await admiral.fetch(request);
      }
    });

    it("should search profiles by username", async () => {
      const request = createMockRequest("GET", "registry/discover", undefined, "?q=alice");
      const response = await admiral.fetch(request);

      expect(response.status).toBe(200);
      const result = await jsonResponse<{ results: RegistryProfile[]; total: number }>(response);
      expect(result.total).toBe(1);
      expect(result.results[0]?.username).toBe("alice");
    });

    it("should search profiles by displayName", async () => {
      const request = createMockRequest("GET", "registry/discover", undefined, "?q=designer");
      const response = await admiral.fetch(request);

      expect(response.status).toBe(200);
      const result = await jsonResponse<{ results: RegistryProfile[]; total: number }>(response);
      expect(result.total).toBe(1);
      expect(result.results[0]?.username).toBe("bob");
    });

    it("should search profiles by currentFocus", async () => {
      const request = createMockRequest("GET", "registry/discover", undefined, "?q=AI%20agents");
      const response = await admiral.fetch(request);

      expect(response.status).toBe(200);
      const result = await jsonResponse<{ results: RegistryProfile[]; total: number }>(response);
      expect(result.total).toBe(2);
      const usernames = result.results.map((p) => p.username);
      expect(usernames).toContain("alice");
      expect(usernames).toContain("diana");
    });

    it("should return empty results for short queries", async () => {
      const request = createMockRequest("GET", "registry/discover", undefined, "?q=a");
      const response = await admiral.fetch(request);

      expect(response.status).toBe(200);
      const result = await jsonResponse<{ results: RegistryProfile[]; total: number }>(response);
      expect(result.total).toBe(0);
      expect(result.results).toHaveLength(0);
    });
  });

  describe("GET /registry/profile/:username", () => {
    beforeEach(async () => {
      const profile = createMockProfile("alice");
      const request = createMockRequest("POST", "registry/register", { profile });
      await admiral.fetch(request);
    });

    it("should return profile by username", async () => {
      const request = createMockRequest("GET", "registry/profile/alice");
      const response = await admiral.fetch(request);

      expect(response.status).toBe(200);
      const result = await jsonResponse<RegistryProfile>(response);
      expect(result.username).toBe("alice");
      expect(result.displayName).toBe("Test alice");
    });

    it("should return 404 for non-existent username", async () => {
      const request = createMockRequest("GET", "registry/profile/nonexistent");
      const response = await admiral.fetch(request);

      expect(response.status).toBe(404);
      expect(await response.text()).toContain("Profile not found");
    });

    it("should return 404 for missing username", async () => {
      const request = createMockRequest("GET", "registry/profile/");
      const response = await admiral.fetch(request);

      expect(response.status).toBe(400);
    });
  });

  describe("AdmiralClient registry methods", () => {
    it("should be exported and have the correct interface", async () => {
      // This is a compile-time test that the client methods exist
      // We can't fully test them without a real server, but we can verify the types
      const { AdmiralClient } = await import("../src/admiral.js");

      expect(AdmiralClient).toBeDefined();

      // Verify the client has the registry methods
      const client = new AdmiralClient("https://test.example.com", "test-token");
      expect(client).toHaveProperty("registerProfile");
      expect(client).toHaveProperty("discoverProfiles");
      expect(client).toHaveProperty("getProfile");
    });
  });
});
