/**
 * Tests for retry.ts — Retry with Exponential Backoff
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  withRetry,
  createRetryable,
  isNetworkError,
  isRetryableHttpCode,
  type RetryError,
} from '../src/utils/retry.js';

describe('retry', () => {
  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await withRetry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure with default options', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('temporary error'))
        .mockResolvedValue('success');

      const result = await withRetry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should respect maxAttempts', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('persistent error'));

      await expect(withRetry(fn, { maxAttempts: 3 })).rejects.toThrow();
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should calculate exponential backoff delays', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('error 1'))
        .mockRejectedValueOnce(new Error('error 2'))
        .mockResolvedValue('success');

      const delays: number[] = [];
      const startTime = Date.now();

      await withRetry(fn, {
        maxAttempts: 4,
        baseDelay: 100,
        backoffFactor: 2,
        jitter: false,
      });

      const elapsed = Date.now() - startTime;
      // Expected: 100ms (attempt 2) + 200ms (attempt 3) = 300ms minimum
      expect(elapsed).toBeGreaterThanOrEqual(290);
    });

    it('should add jitter when enabled', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('error'))
        .mockResolvedValue('success');

      const delays: number[] = [];
      const onRetry = vi.fn((attempt, error) => {
        delays.push(Date.now());
      });

      await withRetry(
        fn,
        { baseDelay: 100, jitter: true },
        onRetry
      );

      expect(onRetry).toHaveBeenCalledOnce();
    });

    it('should call onRetry callback', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('error'))
        .mockResolvedValue('success');

      const onRetry = vi.fn();

      await withRetry(fn, {}, onRetry);

      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
    });

    it('should throw RetryError with all attempts', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('persistent error'));

      try {
        await withRetry(fn, { maxAttempts: 3 });
        expect.fail('Should have thrown');
      } catch (error) {
        const retryError = error as RetryError;
        expect(retryError).toBeInstanceOf(Error);
        expect(retryError.attempt).toBe(3);
        expect(retryError.totalAttempts).toBe(3);
        expect(retryError.errors).toHaveLength(3);
      }
    });

    it('should respect isRetryable predicate', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('non-retryable error'));

      await expect(
        withRetry(fn, { isRetryable: () => false })
      ).rejects.toThrow('non-retryable error');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should cap delay at maxDelay', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('error 1'))
        .mockRejectedValueOnce(new Error('error 2'))
        .mockResolvedValue('success');

      const startTime = Date.now();

      await withRetry(fn, {
        maxAttempts: 4,
        baseDelay: 10000,
        maxDelay: 100,
        backoffFactor: 10,
        jitter: false,
      });

      const elapsed = Date.now() - startTime;
      // With maxDelay=100, both retries should take ~100ms each = 200ms minimum
      expect(elapsed).toBeGreaterThanOrEqual(190);
    });

    it('should handle non-Error errors', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce('string error')
        .mockResolvedValue('success');

      const result = await withRetry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('createRetryable', () => {
    it('should create a retryable function', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('error'))
        .mockResolvedValue('success');

      const retryableFn = createRetryable(fn, { maxAttempts: 3 });
      const result = await retryableFn();

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should support withRetry method', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('error'))
        .mockResolvedValue('success');

      const retryableFn = createRetryable(fn, { maxAttempts: 2 });

      // Use default options
      const result1 = await retryableFn();
      expect(result1).toBe('success');

      // Override with custom options
      fn.mockReset().mockRejectedValue(new Error('persistent'));
      await expect(retryableFn.withRetry({ maxAttempts: 1 })).rejects.toThrow();
    });
  });

  describe('isNetworkError', () => {
    it('should identify fetch errors', () => {
      const error = new Error('fetch failed');
      expect(isNetworkError(error)).toBe(true);
    });

    it('should identify network errors', () => {
      const error = new Error('network error');
      expect(isNetworkError(error)).toBe(true);
    });

    it('should identify ECONNREFUSED errors', () => {
      const error = new Error('ECONNREFUSED');
      expect(isNetworkError(error)).toBe(true);
    });

    it('should identify ENOTFOUND errors', () => {
      const error = new Error('ENOTFOUND');
      expect(isNetworkError(error)).toBe(true);
    });

    it('should identify ETIMEDOUT errors', () => {
      const error = new Error('ETIMEDOUT');
      expect(isNetworkError(error)).toBe(true);
    });

    it('should return false for non-network errors', () => {
      const error = new Error('validation failed');
      expect(isNetworkError(error)).toBe(false);
    });

    it('should return false for non-Error values', () => {
      expect(isNetworkError('string')).toBe(false);
      expect(isNetworkError(null)).toBe(false);
      expect(isNetworkError(undefined)).toBe(false);
    });
  });

  describe('isRetryableHttpCode', () => {
    it('should identify 408 as retryable', () => {
      expect(isRetryableHttpCode(408)).toBe(true);
    });

    it('should identify 429 as retryable', () => {
      expect(isRetryableHttpCode(429)).toBe(true);
    });

    it('should identify 500+ codes as retryable', () => {
      expect(isRetryableHttpCode(500)).toBe(true);
      expect(isRetryableHttpCode(502)).toBe(true);
      expect(isRetryableHttpCode(503)).toBe(true);
      expect(isRetryableHttpCode(504)).toBe(true);
      expect(isRetryableHttpCode(599)).toBe(true);
    });

    it('should not retry 4xx codes (except 408/429)', () => {
      expect(isRetryableHttpCode(400)).toBe(false);
      expect(isRetryableHttpCode(401)).toBe(false);
      expect(isRetryableHttpCode(403)).toBe(false);
      expect(isRetryableHttpCode(404)).toBe(false);
      expect(isRetryableHttpCode(422)).toBe(false);
    });

    it('should not retry 2xx/3xx codes', () => {
      expect(isRetryableHttpCode(200)).toBe(false);
      expect(isRetryableHttpCode(301)).toBe(false);
      expect(isRetryableHttpCode(304)).toBe(false);
    });
  });
});
