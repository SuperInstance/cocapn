/**
 * Tests for BackpressureManager — health checks, acceptance logic, provider penalties.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BackpressureManager } from '../../src/queue/backpressure.js';
import type { QueueConfig } from '../../src/queue/types.js';

const baseConfig: QueueConfig = {
  maxConcurrency: 5,
  maxQueueSize: 100,
  perTenantConcurrency: 2,
  timeout: 30_000,
  retryDelay: 1_000,
  maxRetries: 2,
};

describe('BackpressureManager', () => {
  let bp: BackpressureManager;

  beforeEach(() => {
    vi.useFakeTimers();
    bp = new BackpressureManager(baseConfig);
  });

  afterEach(() => {
    vi.useRealTimers();
    bp.reset();
  });

  describe('getQueueHealth', () => {
    it('should return healthy when queue is nearly empty', () => {
      expect(bp.getQueueHealth(10, 2)).toBe('healthy');
    });

    it('should return degraded when queue is >= 80% full', () => {
      const capacity = 5 + 100; // maxConcurrency + maxQueueSize
      const degradedThreshold = Math.ceil(capacity * 0.8);
      expect(bp.getQueueHealth(degradedThreshold, 5)).toBe('degraded');
    });

    it('should return critical when queue is >= 95% full', () => {
      const capacity = 5 + 100;
      const criticalThreshold = Math.ceil(capacity * 0.95);
      expect(bp.getQueueHealth(criticalThreshold, 5)).toBe('critical');
    });
  });

  describe('shouldAccept', () => {
    it('should accept all priorities when healthy', () => {
      expect(bp.shouldAccept(-10, 10)).toBe(true);
      expect(bp.shouldAccept(0, 10)).toBe(true);
      expect(bp.shouldAccept(10, 10)).toBe(true);
    });

    it('should reject low priority when degraded', () => {
      const capacity = 5 + 100;
      const degradedThreshold = Math.ceil(capacity * 0.8);

      expect(bp.shouldAccept(-10, degradedThreshold)).toBe(false);
      expect(bp.shouldAccept(0, degradedThreshold)).toBe(true);
      expect(bp.shouldAccept(5, degradedThreshold)).toBe(true);
    });

    it('should only accept high priority when critical', () => {
      const capacity = 5 + 100;
      const criticalThreshold = Math.ceil(capacity * 0.95);

      expect(bp.shouldAccept(0, criticalThreshold)).toBe(false);
      expect(bp.shouldAccept(3, criticalThreshold)).toBe(false);
      expect(bp.shouldAccept(5, criticalThreshold)).toBe(true);
      expect(bp.shouldAccept(10, criticalThreshold)).toBe(true);
    });
  });

  describe('onRateLimit', () => {
    it('should reduce effective concurrency', () => {
      bp.onRateLimit('deepseek');
      const concurrency = bp.getEffectiveConcurrency('deepseek');

      // 5 / 2^1 = 2
      expect(concurrency).toBe(2);
    });

    it('should compound penalties', () => {
      bp.onRateLimit('deepseek');
      bp.onRateLimit('deepseek');

      // 5 / 2^2 = 1
      expect(bp.getEffectiveConcurrency('deepseek')).toBe(1);
    });

    it('should set a cooldown period', () => {
      bp.onRateLimit('deepseek');

      const status = bp.getProviderStatus();
      expect(status.deepseek.inCooldown).toBe(true);
    });
  });

  describe('onRateLimitRecovery', () => {
    it('should restore concurrency', () => {
      bp.onRateLimit('deepseek');
      expect(bp.getEffectiveConcurrency('deepseek')).toBe(2);

      bp.onRateLimitRecovery('deepseek');
      expect(bp.getEffectiveConcurrency('deepseek')).toBe(5);
    });

    it('should clear cooldown', () => {
      bp.onRateLimit('deepseek');
      bp.onRateLimitRecovery('deepseek');

      const status = bp.getProviderStatus();
      expect(status.deepseek.inCooldown).toBe(false);
    });
  });

  describe('auto-recovery', () => {
    it('should auto-recover after cooldown expires', () => {
      bp.onRateLimit('deepseek');
      expect(bp.getEffectiveConcurrency('deepseek')).toBe(2);

      // Advance past cooldown (60s)
      vi.advanceTimersByTime(61_000);

      // Should auto-recover
      expect(bp.getEffectiveConcurrency('deepseek')).toBe(5);
    });
  });

  describe('getPenaltyLevel', () => {
    it('should return 0 for providers with no penalty', () => {
      expect(bp.getPenaltyLevel('unknown')).toBe(0);
    });
  });

  describe('getProviderStatus', () => {
    it('should return status for penalized providers', () => {
      bp.onRateLimit('openai');

      const status = bp.getProviderStatus();
      expect(status.openai).toBeDefined();
      expect(status.openai.penalty).toBe(1);
      expect(status.openai.effectiveConcurrency).toBe(2);
      expect(status.openai.inCooldown).toBe(true);
    });

    it('should return empty object when no penalties', () => {
      expect(bp.getProviderStatus()).toEqual({});
    });
  });

  describe('reset', () => {
    it('should clear all penalties', () => {
      bp.onRateLimit('deepseek');
      bp.onRateLimit('openai');

      bp.reset();

      expect(bp.getEffectiveConcurrency('deepseek')).toBe(5);
      expect(bp.getEffectiveConcurrency('openai')).toBe(5);
      expect(bp.getProviderStatus()).toEqual({});
    });
  });
});
