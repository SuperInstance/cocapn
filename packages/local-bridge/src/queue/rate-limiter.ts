/**
 * LLM Rate Limiter — token-bucket rate limiting per provider and tenant.
 *
 * Tracks API rate limits per LLM provider. Each provider gets its own
 * token bucket. Per-tenant limiting is layered on top via a shared
 * counter per provider+tenant pair.
 *
 * Provider defaults (requests per minute):
 *   - DeepSeek:  60 req/min (free tier)
 *   - OpenAI:   500 req/min (tier 1)
 *   - Anthropic: 1000 req/min
 *   - Ollama:     30 req/min
 */

import { PROVIDER_RATE_LIMITS } from './types.js';

interface Bucket {
  tokens: number;
  maxTokens: number;
  refillRate: number;       // tokens per millisecond
  lastRefill: number;
}

export interface LLMRateLimiterConfig {
  /** Per-provider overrides: { provider: requestsPerMinute } */
  requestsPerMinute?: Record<string, number>;
  /** Per-provider token limits per minute (optional) */
  tokensPerMinute?: Record<string, number>;
}

export class LLMRateLimiter {
  private buckets = new Map<string, Bucket>();
  private tenantBuckets = new Map<string, Bucket>();
  private providerDefaults: Record<string, number>;
  private providerTokenLimits: Record<string, number>;

  constructor(config?: LLMRateLimiterConfig) {
    this.providerDefaults = { ...PROVIDER_RATE_LIMITS, ...config?.requestsPerMinute };
    this.providerTokenLimits = config?.tokensPerMinute ?? {};
  }

  /**
   * Acquire a slot for the given provider (and optionally tenant).
   * Resolves when a slot is available, or throws if the wait would
   * exceed `maxWaitMs` (default 30s).
   */
  async acquire(provider: string, tenantId?: string, maxWaitMs: number = 30_000): Promise<void> {
    const bucket = this.getOrCreateBucket(provider);
    const deadline = Date.now() + maxWaitMs;

    // Wait for provider-level bucket
    await this.waitForBucket(bucket, provider, deadline);

    // Wait for tenant-level bucket if tenant is specified
    if (tenantId) {
      const tenantKey = `${provider}:${tenantId}`;
      const tenantBucket = this.getOrCreateTenantBucket(tenantKey, provider);
      await this.waitForBucket(tenantBucket, tenantKey, deadline);
    }
  }

  /**
   * Release a slot back to the bucket (no-op for token-bucket,
   * tokens refill automatically). Kept for API symmetry.
   */
  release(_provider: string, _tenantId?: string): void {
    // Token-bucket: tokens refill over time, no explicit release needed.
    // This is intentionally a no-op but kept for interface symmetry.
  }

  /**
   * Get estimated wait time in ms before a request can proceed for the provider.
   * Returns 0 if a slot is available immediately.
   */
  getWaitTime(provider: string): number {
    const bucket = this.buckets.get(provider);
    if (!bucket || bucket.tokens >= 1) return 0;

    const deficit = 1 - bucket.tokens;
    return Math.ceil(deficit / bucket.refillRate);
  }

  /**
   * Reduce the effective rate limit for a provider (called on 429 responses).
   * Halves the rate limit and resets the bucket.
   */
  onRateLimit(provider: string): void {
    const bucket = this.buckets.get(provider);
    if (bucket) {
      bucket.maxTokens = Math.max(1, Math.floor(bucket.maxTokens / 2));
      bucket.tokens = 0;
      bucket.refillRate = bucket.maxTokens / 60_000;
    }
  }

  /**
   * Restore the rate limit for a provider after recovery from 429.
   * Resets to the configured default.
   */
  onRateLimitRecovery(provider: string): void {
    const rpm = this.providerDefaults[provider] ?? 60;
    const bucket = this.buckets.get(provider);
    if (bucket) {
      bucket.maxTokens = rpm;
      bucket.refillRate = rpm / 60_000;
      bucket.tokens = Math.min(bucket.tokens, bucket.maxTokens);
    }
  }

  /**
   * Get the current effective rate limit (requests per minute) for a provider.
   */
  getEffectiveRateLimit(provider: string): number {
    const bucket = this.buckets.get(provider);
    return bucket?.maxTokens ?? (this.providerDefaults[provider] ?? 60);
  }

  /**
   * Reset all buckets to their configured defaults.
   */
  reset(): void {
    this.buckets.clear();
    this.tenantBuckets.clear();
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private getOrCreateBucket(provider: string): Bucket {
    let bucket = this.buckets.get(provider);
    if (!bucket) {
      const rpm = this.providerDefaults[provider] ?? 60;
      bucket = {
        tokens: rpm,
        maxTokens: rpm,
        refillRate: rpm / 60_000,
        lastRefill: Date.now(),
      };
      this.buckets.set(provider, bucket);
    }
    return bucket;
  }

  private getOrCreateTenantBucket(tenantKey: string, provider: string): Bucket {
    let bucket = this.tenantBuckets.get(tenantKey);
    if (!bucket) {
      // Tenant gets 1/3 of provider rate, minimum 1
      const providerRpm = this.providerDefaults[provider] ?? 60;
      const tenantRpm = Math.max(1, Math.floor(providerRpm / 3));
      bucket = {
        tokens: tenantRpm,
        maxTokens: tenantRpm,
        refillRate: tenantRpm / 60_000,
        lastRefill: Date.now(),
      };
      this.tenantBuckets.set(tenantKey, bucket);
    }
    return bucket;
  }

  private async waitForBucket(bucket: Bucket, label: string, deadline: number): Promise<void> {
    while (Date.now() < deadline) {
      this.refill(bucket);

      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        return;
      }

      const deficit = 1 - bucket.tokens;
      const waitMs = Math.min(Math.ceil(deficit / bucket.refillRate), 500);
      await this.sleep(waitMs);
    }

    throw new Error(`Rate limit timeout for ${label}`);
  }

  private refill(bucket: Bucket): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + elapsed * bucket.refillRate);
    bucket.lastRefill = now;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
