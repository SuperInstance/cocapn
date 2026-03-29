/**
 * LLM Request Queue — type definitions.
 *
 * Provides QueueItem, QueueConfig, and related types for the
 * backpressure-aware request queue used by LLM providers.
 */

// ─── Queue item ──────────────────────────────────────────────────────────────

export type QueueItemType = 'chat' | 'embedding' | 'tree-search';

export type QueueItemStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface QueueItem {
  /** Unique identifier (UUID-like) */
  id: string;
  /** Tenant / user identifier for per-tenant concurrency */
  tenantId?: string;
  /** What kind of LLM request this is */
  type: QueueItemType;
  /** Higher = more urgent. 0 = default, 10 = high, -10 = low */
  priority: number;
  /** Opaque payload passed to the executor function */
  payload: unknown;
  /** Monotonic timestamp when item was enqueued */
  createdAt: number;
  /** Timestamp when execution started */
  startedAt?: number;
  /** Timestamp when execution finished (success or failure) */
  completedAt?: number;
  /** Current lifecycle status */
  status: QueueItemStatus;
  /** Executor function that does the actual LLM call */
  execute?: () => Promise<unknown>;
  /** Result set on successful completion */
  result?: unknown;
  /** Error message set on failure */
  error?: string;
  /** Number of retry attempts so far */
  retries: number;
}

// ─── Queue configuration ─────────────────────────────────────────────────────

export interface QueueConfig {
  /** Maximum number of parallel LLM calls (default: 5) */
  maxConcurrency: number;
  /** Maximum number of items that can sit in the queue (default: 1000) */
  maxQueueSize: number;
  /** Maximum concurrent requests per tenant (default: 2) */
  perTenantConcurrency: number;
  /** Per-item timeout in milliseconds (default: 30000) */
  timeout: number;
  /** Base delay between retries in milliseconds (default: 1000) */
  retryDelay: number;
  /** Maximum number of retries before marking as failed (default: 2) */
  maxRetries: number;
}

export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxConcurrency: 5,
  maxQueueSize: 1000,
  perTenantConcurrency: 2,
  timeout: 30_000,
  retryDelay: 1_000,
  maxRetries: 2,
};

// ─── Queue status ────────────────────────────────────────────────────────────

export interface QueueStatus {
  queued: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
}

export interface TenantStatus {
  queued: number;
  running: number;
}

// ─── Backpressure health ─────────────────────────────────────────────────────

export type QueueHealth = 'healthy' | 'degraded' | 'critical';

// ─── Rate limiter ────────────────────────────────────────────────────────────

export interface RateLimiterConfig {
  /** Max requests per minute for a given provider (default: varies by provider) */
  requestsPerMinute: number;
  /** Max tokens per minute (optional, not enforced when 0) */
  tokensPerMinute: number;
}

/** Known provider defaults (requests per minute) */
export const PROVIDER_RATE_LIMITS: Record<string, number> = {
  deepseek: 60,
  openai: 500,
  anthropic: 1000,
  ollama: 30,
};
