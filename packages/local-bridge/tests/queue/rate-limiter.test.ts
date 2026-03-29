/**
 * Tests for LLMRateLimiter — acquire, release, rate limiting, provider penalties.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LLMRateLimiter } from '../../src/queue/rate-limiter.js';

describe('LLMRateLimiter', () => {
  let limiter: LLMRateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new LLMRateLimiter({
      requestsPerMinute: {
        test: 6, // 6 per minute = 1 per 10s for testing
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    limiter.reset();
  });

  describe('acquire', () => {
    it('should allow requests when under limit', async () => {
      await limiter.acquire('test');
      // Should not throw — under limit
    });

    it('should throttle requests that exceed the rate', async () => {
      // test provider: 6 req/min = 1 per 10 seconds
      // First request should succeed immediately
      await limiter.acquire('test');

      // Second request should need to wait
      const promise = limiter.acquire('test', undefined, 20_000);
      await vi.advanceTimersByTimeAsync(11_000);
      await promise; // Should resolve after ~10s
    });

    it('should support per-tenant limiting', async () => {
      // tenant: 1/3 of provider rate = 2 per minute
      await limiter.acquire('test', 'tenant-a');
      await limiter.acquire('test', 'tenant-a');

      // Third tenant request should need to wait
      const promise = limiter.acquire('test', 'tenant-a', undefined, 20_000);
      await vi.advanceTimersByTimeAsync(31_000); // need to wait ~30s for tenant bucket refill
      await promise;
    });

    it('should allow different tenants independently', async () => {
      // Tenant A uses their own bucket
      await limiter.acquire('test', 'tenant-a');
      // Tenant B has their own bucket
      await limiter.acquire('test', 'tenant-b');
      // Should both succeed immediately (each has their own bucket)
    });

    it('should timeout if wait exceeds maxWaitMs', async () => {
      // Exhaust the bucket
      await limiter.acquire('test');

      // Try again with a very short timeout
      await expect(limiter.acquire('test', undefined, 100)).rejects.toThrow('Rate limit timeout');
    });
  });

  describe('release', () => {
    it('should be a no-op (token-bucket refills automatically)', () => {
      // Should not throw
      limiter.release('test');
      limiter.release('test', 'tenant-a');
    });
  });

  describe('getWaitTime', () => {
    it('should return 0 when tokens are available', () => {
      expect(limiter.getWaitTime('unknown')).toBe(0);
    });

    it('should estimate wait time after exhausting tokens', async () => {
      await limiter.acquire('test');
      const waitTime = limiter.getWaitTime('test');
      expect(waitTime).toBeGreaterThan(0);
    });
  });

  describe('onRateLimit', () => {
    it('should halve the effective rate on 429', async () => {
      const initialRate = limiter.getEffectiveRateLimit('test');
      limiter.onRateLimit('test');
      const reducedRate = limiter.getEffectiveRateLimit('test');

      expect(reducedRate).toBe(Math.floor(initialRate / 2));
    });

    it('should compound penalties on repeated 429s', () => {
      limiter.onRateLimit('test');
      limiter.onRateLimit('test');

      const rate = limiter.getEffectiveRateLimit('test');
      // 6 -> 3 -> 1 (halved twice, min 1)
      expect(rate).toBe(1);
    });
  });

  describe('onRateLimitRecovery', () => {
    it('should restore the rate limit', () => {
      limiter.onRateLimit('test');
      limiter.onRateLimitRecovery('test');

      // Should restore to default (6)
      expect(limiter.getEffectiveRateLimit('test')).toBe(6);
    });
  });

  describe('getEffectiveRateLimit', () => {
    it('should return default for unknown providers', () => {
      expect(limiter.getEffectiveRateLimit('unknown')).toBe(60);
    });
  });

  describe('reset', () => {
    it('should clear all buckets', async () => {
      await limiter.acquire('test');
      limiter.reset();

      // Should be able to acquire immediately again (fresh bucket)
      await limiter.acquire('test');
    });
  });
});
