/**
 * Tests for useActivityFeed hook
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { useActivityFeed } from "./useActivityFeed.js";
import type { UpdatesIndex } from "@/types/updates.js";

// ─── Mock server setup ───────────────────────────────────────────────────────────

const mockServer = setupServer(
  http.get("https://example.com/alice/updates/index.json", () => {
    return HttpResponse.json<UpdatesIndex>({
      entries: [
        {
          date: "2026-03-28",
          streak: 5,
          tags: ["coding", "testing"],
          summary: "Built activity feed hook",
          accomplishments: ["Implemented useActivityFeed", "Added tests"],
        },
        {
          date: "2026-03-27",
          streak: 4,
          tags: ["planning"],
          summary: "Planned social layer",
          accomplishments: ["Reviewed roadmap", "Created tickets"],
        },
      ],
      updatedAt: "2026-03-28T12:00:00Z",
    });
  }),

  http.get("https://personallog.ai/bob/updates/index.json", () => {
    return HttpResponse.json<UpdatesIndex>({
      entries: [
        {
          date: "2026-03-28",
          streak: 3,
          tags: ["writing"],
          summary: "Wrote blog post",
          accomplishments: ["Drafted article", "Published"],
        },
      ],
      updatedAt: "2026-03-28T10:00:00Z",
    });
  }),

  // 404 for users without updates yet
  http.get("https://example.com/charlie/updates/index.json", () => {
    return new HttpResponse(null, { status: 404 });
  }),

  // Network error for another user
  http.get("https://example.com/dave/updates/index.json", () => {
    return HttpResponse.error();
  })
);

beforeAll(() => mockServer.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  mockServer.resetHandlers();
  localStorage.clear();
});
afterAll(() => mockServer.close());

// ─── Tests ───────────────────────────────────────────────────────────────────────

describe("useActivityFeed", () => {
  describe("initial state", () => {
    it("should start with empty state when no users are followed", async () => {
      const { result } = renderHook(() => useActivityFeed());

      expect(result.current.followedUsers).toEqual([]);
      expect(result.current.activities).toEqual([]);

      // Should finish loading after initial fetch
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it("should load followed users from localStorage", async () => {
      // Pre-populate localStorage
      const storedUsers = [
        {
          username: "alice",
          domain: "example.com",
          profileUrl: "https://example.com/alice",
          updatesUrl: "https://example.com/alice/updates/index.json",
          lastSeen: "2026-03-28T12:00:00Z",
        },
      ];
      localStorage.setItem(
        "cocapn_followed_users",
        JSON.stringify({ users: storedUsers, lastUpdated: new Date().toISOString() })
      );

      const { result } = renderHook(() => useActivityFeed());

      await waitFor(() => {
        expect(result.current.followedUsers).toEqual(storedUsers);
      });
    });
  });

  describe("follow / unfollow", () => {
    it("should follow a new user", async () => {
      const { result } = renderHook(() => useActivityFeed());

      act(() => {
        result.current.follow("alice", "example.com");
      });

      await waitFor(() => {
        expect(result.current.followedUsers).toHaveLength(1);
        expect(result.current.followedUsers[0]).toMatchObject({
          username: "alice",
          domain: "example.com",
        });
      });

      // Should be persisted to localStorage
      const stored = localStorage.getItem("cocapn_followed_users");
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.users).toHaveLength(1);
    });

    it("should not follow the same user twice", async () => {
      const { result } = renderHook(() => useActivityFeed());

      act(() => {
        result.current.follow("alice", "example.com");
      });
      act(() => {
        result.current.follow("alice", "example.com");
      });

      await waitFor(() => {
        expect(result.current.followedUsers).toHaveLength(1);
      });
    });

    it("should unfollow a user", async () => {
      const { result } = renderHook(() => useActivityFeed());

      // First follow a user
      act(() => {
        result.current.follow("alice", "example.com");
      });

      await waitFor(() => {
        expect(result.current.followedUsers).toHaveLength(1);
      });

      // Then unfollow them
      act(() => {
        result.current.unfollow("alice", "example.com");
      });

      await waitFor(() => {
        expect(result.current.followedUsers).toHaveLength(0);
      });

      // Should be removed from localStorage
      const stored = localStorage.getItem("cocapn_followed_users");
      const parsed = JSON.parse(stored!);
      expect(parsed.users).toHaveLength(0);
    });

    it("should remove user's activities when unfollowing", async () => {
      const { result } = renderHook(() => useActivityFeed());

      // Follow a user and wait for activities to load
      act(() => {
        result.current.follow("alice", "example.com");
      });

      await waitFor(() => {
        expect(result.current.activities.length).toBeGreaterThan(0);
      });

      const aliceActivities = result.current.activities.filter(
        (a) => a.user.username === "alice"
      );
      expect(aliceActivities.length).toBeGreaterThan(0);

      // Unfollow
      act(() => {
        result.current.unfollow("alice", "example.com");
      });

      await waitFor(() => {
        expect(result.current.activities).toHaveLength(0);
      });
    });
  });

  describe("activity aggregation", () => {
    it("should fetch and aggregate activities from multiple users", async () => {
      const { result } = renderHook(() => useActivityFeed());

      // Follow users one at a time to ensure each refresh sees the updated state
      act(() => {
        result.current.follow("alice", "example.com");
      });

      act(() => {
        result.current.follow("bob", "personallog.ai");
      });

      // Wait for activities to load from both users
      await waitFor(() => {
        expect(result.current.activities.length).toBeGreaterThan(0);
      });

      // Wait for loading to complete
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should have 3 activities total (2 from alice, 1 from bob)
      expect(result.current.activities).toHaveLength(3);

      // Activities should be sorted by timestamp (newest first)
      const timestamps = result.current.activities.map((a) => a.timestamp);
      expect(timestamps).toEqual(["2026-03-28", "2026-03-28", "2026-03-27"]);
    });

    it("should handle 404 responses gracefully", async () => {
      const { result } = renderHook(() => useActivityFeed());

      act(() => {
        result.current.follow("charlie", "example.com");
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should have no activities but no error
      expect(result.current.activities).toHaveLength(0);
      expect(result.current.error).toBeNull();
    });

    it("should handle network errors gracefully", async () => {
      const { result } = renderHook(() => useActivityFeed());

      act(() => {
        result.current.follow("dave", "example.com");
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should have no activities but might have an error
      expect(result.current.activities).toHaveLength(0);
    });
  });

  describe("caching", () => {
    it("should cache activities per user", async () => {
      const { result } = renderHook(() => useActivityFeed());

      act(() => {
        result.current.follow("alice", "example.com");
      });

      await waitFor(() => {
        expect(result.current.activities.length).toBeGreaterThan(0);
      });

      // Check that cache was created
      const cacheKey = "cocapn_updates_cache_alice@example.com";
      const cached = localStorage.getItem(cacheKey);
      expect(cached).toBeTruthy();

      const parsed = JSON.parse(cached!);
      expect(parsed.entries).toHaveLength(2); // Alice's 2 updates
    });

    it("should serve cached data on subsequent renders", async () => {
      const { result, rerender } = renderHook(() => useActivityFeed());

      // First render - fetch from network
      act(() => {
        result.current.follow("alice", "example.com");
      });

      await waitFor(() => {
        expect(result.current.activities.length).toBeGreaterThan(0);
      });

      const firstActivities = result.current.activities;

      // Rerender - should use cache
      rerender();

      await waitFor(() => {
        expect(result.current.activities).toEqual(firstActivities);
      });
    });
  });

  describe("refresh", () => {
    it("should manually refresh activities", async () => {
      const { result } = renderHook(() => useActivityFeed());

      act(() => {
        result.current.follow("alice", "example.com");
      });

      await waitFor(() => {
        expect(result.current.activities.length).toBeGreaterThan(0);
      });

      const refreshSpy = vi.fn();
      const originalFetch = global.fetch;
      global.fetch = refreshSpy as unknown as typeof fetch;

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      global.fetch = originalFetch;
    });
  });

  describe("activity content", () => {
    it("should correctly map UpdateEntry to ActivityItem", async () => {
      const { result } = renderHook(() => useActivityFeed());

      act(() => {
        result.current.follow("alice", "example.com");
      });

      await waitFor(() => {
        expect(result.current.activities.length).toBeGreaterThan(0);
      });

      const firstActivity = result.current.activities[0];
      expect(firstActivity).toMatchObject({
        type: "update",
        user: expect.objectContaining({
          username: "alice",
          domain: "example.com",
        }),
        timestamp: "2026-03-28",
        content: {
          type: "update",
          summary: "Built activity feed hook",
          accomplishments: ["Implemented useActivityFeed", "Added tests"],
          tags: ["coding", "testing"],
        },
      });
    });
  });
});
