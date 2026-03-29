/**
 * Multi-tenant type definitions for brain isolation.
 *
 * Each tenant (customer/user) gets:
 *   - Isolated brain storage (namespaced by tenant ID)
 *   - Separate personality config
 *   - Separate skill set
 *   - Separate memory facts
 *   - Usage metering
 */

import type { Brain } from "../brain/index.js";
import type { SkillLoader } from "../skills/loader.js";
import type { PersonalityManager } from "../personality/index.js";

// ─── Plan types ─────────────────────────────────────────────────────────────

export type TenantPlan = "free" | "pro" | "enterprise";

// ─── Tenant ─────────────────────────────────────────────────────────────────

export interface Tenant {
  /** Unique tenant identifier (e.g. UUID or slug) */
  id: string;
  /** Human-readable tenant name */
  name: string;
  /** Subscription plan — determines limits */
  plan: TenantPlan;
  /** Absolute path to isolated brain storage */
  brainPath: string;
  /** Path to tenant-specific soul.md (or shared if not set) */
  personalityPath: string;
  /** Tenant-specific configuration */
  config: TenantConfig;
  /** ISO timestamp when tenant was created */
  createdAt: string;
  /** ISO timestamp of last activity */
  lastActive: string;
  /** Cumulative usage statistics */
  usage: TenantUsage;
  /** Optional API key for programmatic access */
  apiKey?: string;
  /** Allowed CORS origins for this tenant */
  allowedOrigins: string[];
}

// ─── TenantConfig ───────────────────────────────────────────────────────────

export interface TenantConfig {
  /** Maximum tokens per day (0 = unlimited) */
  maxTokensPerDay: number;
  /** Maximum concurrent sessions */
  maxConcurrentSessions: number;
  /** List of enabled skill names (empty = all enabled) */
  enabledSkills: string[];
  /** Custom personality override (markdown) */
  customPersonality?: string;
  /** Allowed CORS origins */
  allowedOrigins: string[];
}

// ─── TenantUsage ────────────────────────────────────────────────────────────

export interface TenantUsage {
  /** Tokens consumed today */
  tokensToday: number;
  /** Tokens consumed all-time */
  tokensTotal: number;
  /** Messages sent today */
  messagesToday: number;
  /** Messages sent all-time */
  messagesTotal: number;
  /** ISO timestamp when daily counters were last reset */
  lastReset: string;
}

// ─── TenantContext ──────────────────────────────────────────────────────────

export interface TenantContext {
  /** The tenant this context belongs to */
  tenant: Tenant;
  /** Tenant-scoped brain instance */
  brain: Brain;
  /** Tenant-scoped personality manager */
  personality: PersonalityManager;
  /** Tenant-scoped skill loader (or shared with filter) */
  skillSystem: SkillLoader;
}

// ─── TenantStatus ───────────────────────────────────────────────────────────

export interface TenantStatus {
  tenant: Tenant;
  initialized: boolean;
  brainSize: number;
  factCount: number;
  wikiPages: number;
  activeTasks: number;
}

// ─── Tenant resolution request ──────────────────────────────────────────────

export interface TenantResolutionRequest {
  /** Origin header from the HTTP request */
  origin?: string;
  /** API key from Authorization header */
  apiKey?: string;
  /** Explicit X-Tenant-ID header */
  tenantId?: string;
  /** JWT subject claim (if authenticated) */
  subject?: string;
}

// ─── Plan defaults ──────────────────────────────────────────────────────────

export const PLAN_DEFAULTS: Record<TenantPlan, TenantConfig> = {
  free: {
    maxTokensPerDay: 50_000,
    maxConcurrentSessions: 1,
    enabledSkills: [],
    allowedOrigins: [],
  },
  pro: {
    maxTokensPerDay: 500_000,
    maxConcurrentSessions: 5,
    enabledSkills: [],
    allowedOrigins: [],
  },
  enterprise: {
    maxTokensPerDay: 0, // unlimited
    maxConcurrentSessions: 50,
    enabledSkills: [],
    allowedOrigins: [],
  },
};
