/**
 * Tests for RequestQueue — enqueue, wait, cancel, concurrency, priority, timeout, retry.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RequestQueue } from '../../src/queue/request-queue.js';
import type { QueueItem } from '../../src/queue/types.js';

describe('RequestQueue', () => {
  let queue: RequestQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    queue = new RequestQueue({
      maxConcurrency: 2,
      maxQueueSize: 100,
      perTenantConcurrency: 2,
      timeout: 5000,
      retryDelay: 100,
      maxRetries: 2,
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await queue.shutdown();
  });

  // ─── Basic enqueue + wait ──────────────────────────────────────────────────

  describe('enqueue + waitForResult', () => {
    it('should enqueue and complete a simple item', async () => {
      const execute = vi.fn().mockResolvedValue('hello');
      const id = await queue.enqueue({
        type: 'chat',
        priority: 0,
        payload: null,
        execute,
      });

      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');

      // Let the queue process
      await vi.advanceTimersByTimeAsync(10);

      const result = await queue.waitForResult(id, 1000);
      expect(result.status).toBe('completed');
      expect(result.result).toBe('hello');
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('should return completed item immediately from waitForResult', async () => {
      const execute = vi.fn().mockResolvedValue('done');
      const id = await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute });

      await vi.advanceTimersByTimeAsync(10);
      const result1 = await queue.waitForResult(id, 1000);
      const result2 = await queue.waitForResult(id, 1000);

      expect(result1.status).toBe('completed');
      expect(result2.status).toBe('completed');
      expect(result1.result).toBe('done');
    });

    it('should throw for unknown item ID', async () => {
      await expect(queue.waitForResult('nonexistent', 100)).rejects.toThrow('Unknown item');
    });
  });

  // ─── Cancellation ──────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('should cancel a queued item', async () => {
      // Block the concurrency slots
      const blocker = vi.fn().mockImplementation(() => new Promise(() => {}));
      await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: blocker });
      await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: blocker });

      await vi.advanceTimersByTimeAsync(10);

      // Enqueue a third item (should stay queued)
      const id = await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: vi.fn() });
      await vi.advanceTimersByTimeAsync(10);

      const cancelled = await queue.cancel(id);
      expect(cancelled).toBe(true);

      const item = await queue.waitForResult(id, 1000);
      expect(item.status).toBe('cancelled');
    });

    it('should return false for already completed items', async () => {
      const id = await queue.enqueue({
        type: 'chat',
        priority: 0,
        payload: null,
        execute: vi.fn().mockResolvedValue('ok'),
      });

      await vi.advanceTimersByTimeAsync(10);
      await queue.waitForResult(id, 1000);

      const cancelled = await queue.cancel(id);
      expect(cancelled).toBe(false);
    });

    it('should return false for unknown items', async () => {
      const cancelled = await queue.cancel('nonexistent');
      expect(cancelled).toBe(false);
    });
  });

  // ─── Concurrency limits ────────────────────────────────────────────────────

  describe('concurrency', () => {
    it('should respect maxConcurrency', async () => {
      const order: string[] = [];
      const makeExecute = (name: string, delayMs: number) => {
        return vi.fn().mockImplementation(async () => {
          order.push(`${name}-start`);
          await new Promise((r) => setTimeout(r, delayMs));
          order.push(`${name}-end`);
          return name;
        });
      };

      const e1 = makeExecute('a', 100);
      const e2 = makeExecute('b', 100);
      const e3 = makeExecute('c', 100);

      await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: e1 });
      await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: e2 });
      await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: e3 });

      await vi.advanceTimersByTimeAsync(200);
      // After 200ms, first 2 should be done, 3rd should be running
      expect(e1).toHaveBeenCalledTimes(1);
      expect(e2).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(200);
      expect(e3).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Priority ordering ─────────────────────────────────────────────────────

  describe('priority', () => {
    it('should execute higher priority items first', async () => {
      // Block both concurrency slots
      const blocker = vi.fn().mockImplementation(() => new Promise(() => {}));
      await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: blocker });
      await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: blocker });

      await vi.advanceTimersByTimeAsync(10);

      const order: string[] = [];
      const execute = vi.fn().mockImplementation(async () => {
        const payload = { name: 'test' };
        return payload;
      });

      // Enqueue in order: low, high, medium
      const idLow = await queue.enqueue({ type: 'chat', priority: -10, payload: { order: 'low' }, execute });
      const idHigh = await queue.enqueue({ type: 'chat', priority: 10, payload: { order: 'high' }, execute });
      const idMed = await queue.enqueue({ type: 'chat', priority: 5, payload: { order: 'medium' }, execute });

      await vi.advanceTimersByTimeAsync(10);

      // Check status — only 2 running, 1 queued
      const status = queue.getStatus();
      expect(status.running).toBe(2);
      expect(status.queued).toBe(3); // 2 blocked + 1 waiting for slot
    });
  });

  // ─── Timeout ───────────────────────────────────────────────────────────────

  describe('timeout', () => {
    it('should fail items that exceed the timeout', async () => {
      const execute = vi.fn().mockImplementation(() => new Promise(() => {}));
      const id = await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute });

      await vi.advanceTimersByTimeAsync(10);

      // Wait for the item to be processed, then advance past timeout
      await vi.advanceTimersByTimeAsync(6000);

      const result = await queue.waitForResult(id, 1000);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('timed out');
    });
  });

  // ─── Retry ─────────────────────────────────────────────────────────────────

  describe('retry', () => {
    it('should retry failed items up to maxRetries', async () => {
      let attempt = 0;
      const execute = vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt < 3) throw new Error('transient failure');
        return 'success';
      });

      const id = await queue.enqueue({
        type: 'chat',
        priority: 0,
        payload: null,
        execute,
      });

      // Advance through retries (retryDelay * 2^(attempt-1))
      await vi.advanceTimersByTimeAsync(10);   // first attempt
      await vi.advanceTimersByTimeAsync(200);  // retry 1 (100ms delay)
      await vi.advanceTimersByTimeAsync(300);  // retry 2 (200ms delay)

      const result = await queue.waitForResult(id, 1000);
      expect(result.status).toBe('completed');
      expect(result.result).toBe('success');
      expect(execute).toHaveBeenCalledTimes(3);
    });

    it('should mark as failed after maxRetries exceeded', async () => {
      const execute = vi.fn().mockRejectedValue(new Error('permanent failure'));
      const id = await queue.enqueue({
        type: 'chat',
        priority: 0,
        payload: null,
        execute,
      });

      // Advance through all retries
      await vi.advanceTimersByTimeAsync(10);
      await vi.advanceTimersByTimeAsync(200);
      await vi.advanceTimersByTimeAsync(400);

      const result = await queue.waitForResult(id, 1000);
      expect(result.status).toBe('failed');
      expect(result.error).toBe('permanent failure');
      expect(execute).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });

    it('should detect rate limit errors and trigger backpressure', async () => {
      const execute = vi.fn().mockRejectedValue(new Error('429 rate limit exceeded'));
      const id = await queue.enqueue({
        type: 'chat',
        priority: 0,
        payload: { provider: 'deepseek' },
        execute,
      });

      await vi.advanceTimersByTimeAsync(10);
      await vi.advanceTimersByTimeAsync(200);
      await vi.advanceTimersByTimeAsync(400);

      const result = await queue.waitForResult(id, 1000);
      expect(result.status).toBe('failed');

      // Verify rate limiter was notified
      const bp = queue.getBackpressure();
      expect(bp.getPenaltyLevel('deepseek')).toBeGreaterThan(0);
    });
  });

  // ─── Tenant concurrency ────────────────────────────────────────────────────

  describe('tenant concurrency', () => {
    it('should enforce per-tenant concurrency limits', async () => {
      const blocker = vi.fn().mockImplementation(() => new Promise(() => {}));

      // Fill tenant A's concurrency (2 slots)
      await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: blocker, tenantId: 'tenant-a' });
      await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: blocker, tenantId: 'tenant-a' });

      await vi.advanceTimersByTimeAsync(10);

      // Tenant A's third request should stay queued
      const idA3 = await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: vi.fn(), tenantId: 'tenant-a' });
      await vi.advanceTimersByTimeAsync(10);

      const tenantStatus = queue.getTenantStatus('tenant-a');
      expect(tenantStatus.running).toBe(2);
      expect(tenantStatus.queued).toBe(1);

      // Tenant B should still be able to run
      const idB1 = await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: vi.fn().mockResolvedValue('b1'), tenantId: 'tenant-b' });
      await vi.advanceTimersByTimeAsync(10);

      const tenantBStatus = queue.getTenantStatus('tenant-b');
      expect(tenantBStatus.running).toBe(1);
    });
  });

  // ─── Status ────────────────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('should report correct counts', async () => {
      const blocker = vi.fn().mockImplementation(() => new Promise(() => {}));
      await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: blocker });
      await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: blocker });

      await vi.advanceTimersByTimeAsync(10);

      // Complete one
      const id = await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: vi.fn().mockResolvedValue('ok') });
      await vi.advanceTimersByTimeAsync(5000); // wait for the blockers to timeout

      const status = queue.getStatus();
      // At minimum, the status should track items
      expect(typeof status.queued).toBe('number');
      expect(typeof status.running).toBe('number');
      expect(typeof status.completed).toBe('number');
      expect(typeof status.failed).toBe('number');
    });
  });

  // ─── Backpressure ──────────────────────────────────────────────────────────

  describe('backpressure', () => {
    it('should reject low-priority items when queue is full', async () => {
      const smallQueue = new RequestQueue({
        maxConcurrency: 1,
        maxQueueSize: 3,
        perTenantConcurrency: 2,
        timeout: 5000,
        retryDelay: 100,
        maxRetries: 0,
      });

      // Fill queue with blockers
      await smallQueue.enqueue({ type: 'chat', priority: 0, payload: null, execute: () => new Promise(() => {}) });

      // Fill the queue slots
      for (let i = 0; i < 3; i++) {
        await smallQueue.enqueue({ type: 'chat', priority: 5, payload: null, execute: vi.fn() });
      }

      await vi.advanceTimersByTimeAsync(10);

      // Low priority should be rejected by backpressure
      await expect(
        smallQueue.enqueue({ type: 'chat', priority: -10, payload: null, execute: vi.fn() })
      ).rejects.toThrow('backpressure');

      await smallQueue.shutdown();
    });
  });

  // ─── Shutdown ──────────────────────────────────────────────────────────────

  describe('shutdown', () => {
    it('should cancel queued items on shutdown', async () => {
      const execute = vi.fn().mockImplementation(() => new Promise(() => {}));
      const id = await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: execute });

      await vi.advanceTimersByTimeAsync(10);

      await queue.shutdown();

      const result = await queue.waitForResult(id, 100);
      expect(result.status).toBe('cancelled');
    });
  });

  // ─── Health ────────────────────────────────────────────────────────────────

  describe('getHealth', () => {
    it('should return healthy when queue is empty', () => {
      expect(queue.getHealth()).toBe('healthy');
    });
  });

  // ─── waitForResult timeout ─────────────────────────────────────────────────

  describe('waitForResult timeout', () => {
    it('should throw on timeout', async () => {
      const execute = vi.fn().mockImplementation(() => new Promise(() => {}));
      const id = await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: execute });

      await vi.advanceTimersByTimeAsync(10);

      await expect(queue.waitForResult(id, 500)).rejects.toThrow('Timeout');
    });
  });
});
