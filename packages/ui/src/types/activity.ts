// ─── Activity Feed types ─────────────────────────────────────────────────────────
// Types for following cocapn users and aggregating their public activity feeds.

/** A cocapn user that can be followed. */
export interface FollowedUser {
  /** Username (without domain) */
  username: string;
  /** Domain where their public repo is hosted */
  domain: string;
  /** Full URL to their profile page */
  profileUrl: string;
  /** URL to their public repo's updates/index.json */
  updatesUrl: string;
  /** ISO timestamp of last activity seen */
  lastSeen: string | null;
}

/** Types of activity items in the feed. */
export type ActivityType =
  | "update"        // Daily update entry
  | "profile"       // Profile change
  | "module";       // Module install/uninstall

/** A single activity item from a followed user. */
export interface ActivityItem {
  /** Unique ID (timestamp + username + type) */
  id: string;
  /** Type of activity */
  type: ActivityType;
  /** User who generated this activity */
  user: FollowedUser;
  /** ISO timestamp when activity occurred */
  timestamp: string;
  /** Activity-specific content */
  content: ActivityContent;
}

/** Content for different activity types. */
export type ActivityContent =
  | UpdateContent
  | ProfileContent
  | ModuleContent;

/** Content for a daily update activity. */
export interface UpdateContent {
  type: "update";
  /** Update summary */
  summary: string;
  /** Accomplishments */
  accomplishments: string[];
  /** Tags */
  tags: string[];
}

/** Content for a profile change activity. */
export interface ProfileContent {
  type: "profile";
  /** What changed */
  change: string;
  /** Previous value (if applicable) */
  previous?: string;
}

/** Content for a module activity. */
export interface ModuleContent {
  type: "module";
  /** Module name */
  module: string;
  /** Action: "install" or "uninstall" */
  action: "install" | "uninstall";
}

/** Result returned by useActivityFeed hook. */
export interface ActivityFeedResult {
  /** All followed users */
  followedUsers: FollowedUser[];
  /** Aggregated activity items, sorted newest-first */
  activities: ActivityItem[];
  /** Whether currently fetching updates */
  loading: boolean;
  /** Any error that occurred */
  error: string | null;
  /** Follow a new user */
  follow: (username: string, domain: string) => void;
  /** Unfollow a user */
  unfollow: (username: string, domain: string) => void;
  /** Manually refresh all feeds */
  refresh: () => void;
}

/** Storage format for followed users in localStorage. */
interface FollowedUsersStorage {
  users: FollowedUser[];
  lastUpdated: string;
}

/** Cache entry for a user's updates. */
interface UpdatesCache {
  entries: ActivityItem[];
  fetchedAt: string;
  expiresAt: string;
}
