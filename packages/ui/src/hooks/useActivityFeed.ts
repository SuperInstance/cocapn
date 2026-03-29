/**
 * useActivityFeed — manages followed cocapn users and aggregates their
 * public activity feeds.
 *
 * - Followed users are stored in localStorage
 * - Public repos are polled every 60s for updates
 * - Stale-while-revalidate caching: serve cached data immediately, refresh in background
 * - Activity from all followed users is aggregated and sorted by timestamp
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  FollowedUser,
  ActivityItem,
  ActivityFeedResult,
  FollowedUsersStorage,
  UpdatesCache,
  UpdateContent,
} from "@/types/activity.js";
import type { UpdatesIndex, UpdateEntry } from "@/types/updates.js";

// ─── Storage keys ───────────────────────────────────────────────────────────────

const FOLLOWED_USERS_KEY = "cocapn_followed_users";
const UPDATES_CACHE_PREFIX = "cocapn_updates_cache_";

// ─── Cache configuration ─────────────────────────────────────────────────────────

const CACHE_TTL = 55 * 1000; // 55 seconds — slightly less than poll interval
const POLL_INTERVAL = 60 * 1000; // 60 seconds
const MAX_ACTIVITIES = 100; // Keep only the most recent activities

// ─── Storage helpers ─────────────────────────────────────────────────────────────

function loadFollowedUsers(): FollowedUser[] {
  try {
    const raw = localStorage.getItem(FOLLOWED_USERS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as FollowedUsersStorage;
    return data.users ?? [];
  } catch {
    return [];
  }
}

function saveFollowedUsers(users: FollowedUser[]): void {
  const data: FollowedUsersStorage = {
    users,
    lastUpdated: new Date().toISOString(),
  };
  try {
    localStorage.setItem(FOLLOWED_USERS_KEY, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable
  }
}

function getCacheKey(username: string, domain: string): string {
  return `${UPDATES_CACHE_PREFIX}${username}@${domain}`;
}

function loadUpdatesCache(username: string, domain: string): ActivityItem[] | null {
  try {
    const key = getCacheKey(username, domain);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const cache = JSON.parse(raw) as UpdatesCache;
    // Check if cache is still valid
    if (new Date(cache.expiresAt) > new Date()) {
      return cache.entries;
    }
    // Cache expired, remove it
    localStorage.removeItem(key);
    return null;
  } catch {
    return null;
  }
}

function saveUpdatesCache(username: string, domain: string, entries: ActivityItem[]): void {
  const now = new Date();
  const cache: UpdatesCache = {
    entries,
    fetchedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + CACHE_TTL).toISOString(),
  };
  try {
    localStorage.setItem(getCacheKey(username, domain), JSON.stringify(cache));
  } catch {
    // localStorage full — clean old caches
    try {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.startsWith(UPDATES_CACHE_PREFIX)) {
          localStorage.removeItem(key);
          break;
        }
      }
      localStorage.setItem(getCacheKey(username, domain), JSON.stringify(cache));
    } catch {
      // Still can't save — give up
    }
  }
}

// ─── URL construction ────────────────────────────────────────────────────────────

function buildUserUrls(username: string, domain: string): { profileUrl: string; updatesUrl: string } {
  const baseUrl = `https://${domain}/${username}`;
  return {
    profileUrl: baseUrl,
    updatesUrl: `${baseUrl}/updates/index.json`,
  };
}

// ─── Fetch updates for a single user ─────────────────────────────────────────────

async function fetchUserUpdates(user: FollowedUser): Promise<ActivityItem[]> {
  try {
    const response = await fetch(user.updatesUrl);
    if (!response.ok) {
      // 404 is normal for users without updates yet
      if (response.status === 404) return [];
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json() as UpdatesIndex;
    const entries = data.entries ?? [];

    // Convert UpdateEntry to ActivityItem
    return entries.map((entry): ActivityItem => {
      const id = `${entry.date}-${user.username}@${user.domain}-update`;
      const content: UpdateContent = {
        type: "update",
        summary: entry.summary,
        accomplishments: entry.accomplishments,
        tags: entry.tags,
      };
      return {
        id,
        type: "update",
        user,
        timestamp: entry.date,
        content,
      };
    });
  } catch {
    // Network error or invalid JSON — return empty and let cache serve stale data
    return [];
  }
}

// ─── Hook ───────────────────────────────────────────────────────────────────────

export function useActivityFeed(): ActivityFeedResult {
  const [followedUsers, setFollowedUsers] = useState<FollowedUser[]>(loadFollowedUsers);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // Track initial load to serve stale data immediately
  const initialLoadRef = useRef(true);

  // ── Refresh all feeds ──────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    const allActivities: ActivityItem[] = [];
    const errors: string[] = [];

    // Fetch updates for each followed user
    const fetchPromises = followedUsers.map(async (user) => {
      // Serve cached data immediately (stale-while-revalidate)
      const cached = loadUpdatesCache(user.username, user.domain);
      if (cached && initialLoadRef.current) {
        return cached;
      }

      // Fetch fresh data
      const fresh = await fetchUserUpdates(user);
      if (fresh.length > 0 || cached?.length !== 0) {
        saveUpdatesCache(user.username, user.domain, fresh);
      }
      return fresh;
    });

    try {
      const results = await Promise.all(fetchPromises);
      for (const items of results) {
        allActivities.push(...items);
      }

      // Sort by timestamp (newest first) and limit
      allActivities.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      const limited = allActivities.slice(0, MAX_ACTIVITIES);

      setActivities(limited);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      setError(errors.join(", "));
    } finally {
      setLoading(false);
      initialLoadRef.current = false;
    }
  }, [followedUsers]);

  // ── Auto-refresh on mount and interval ────────────────────────────────────────

  useEffect(() => {
    // Initial refresh
    refresh();

    // Set up polling interval
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [refresh, tick]);

  // ── Follow a user ──────────────────────────────────────────────────────────────

  const follow = useCallback((username: string, domain: string) => {
    // Check if already following
    const exists = followedUsers.some(
      (u) => u.username === username && u.domain === domain
    );
    if (exists) return;

    const { profileUrl, updatesUrl } = buildUserUrls(username, domain);
    const newUser: FollowedUser = {
      username,
      domain,
      profileUrl,
      updatesUrl,
      lastSeen: null,
    };

    const updated = [...followedUsers, newUser];
    setFollowedUsers(updated);
    saveFollowedUsers(updated);

    // Trigger immediate refresh for the new user
    refresh();
  }, [followedUsers, refresh]);

  // ── Unfollow a user ────────────────────────────────────────────────────────────

  const unfollow = useCallback((username: string, domain: string) => {
    const updated = followedUsers.filter(
      (u) => !(u.username === username && u.domain === domain)
    );
    setFollowedUsers(updated);
    saveFollowedUsers(updated);

    // Clear cache for this user
    try {
      localStorage.removeItem(getCacheKey(username, domain));
    } catch {
      // Ignore
    }

    // Remove their activities from the feed
    setActivities((prev) =>
      prev.filter((a) => !(a.user.username === username && a.user.domain === domain))
    );
  }, [followedUsers]);

  return {
    followedUsers,
    activities,
    loading,
    error,
    follow,
    unfollow,
    refresh,
  };
}
