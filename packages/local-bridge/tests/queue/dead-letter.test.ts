/**
 * Tests for RequestQueue dead-letter queue (DLQ).
 *
 * Verifies that:
 *   - Items that exhaust retries are moved to the DLQ
 *   - getDeadLetterItems() returns DLQ items
 *   - retryDeadLetterItem() re-enqueues a DLQ item
 *   - Dead-letter events are logged
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RequestQueue } from '../../src/queue/request-queue.js';

/** Helper: deferred promise for controlled execution */
function deferred<T = void>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: Error) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** Flush microtasks and let process() run */
async function flush(): Promise<void> {
  await new Promise((r) => queueMicrotask(r));
}

describe('RequestQueue Dead-Letter Queue', () => {
  let queue: RequestQueue;

  beforeEach(() => {
    queue = new RequestQueue({
      maxConcurrency: 2,
      maxQueueSize: 100,
      perTenantConcurrency: 2,
      timeout: 200,
      retryDelay: 10,
      maxRetries: 1, // Only 1 retry before DLQ
    });
  });

  afterEach(async () => {
    await queue.shutdown();
  });

  it('should move item to DLQ after max retries exhausted', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('permanent failure'));
    const id = await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute });

    // Wait for initial execution + retry
    await flush();
    await new Promise((r) => setTimeout(r, 300));
    await flush();

    // Item should be in DLQ
    const dlqItems = queue.getDeadLetterItems();
    expect(dlqItems.length).toBe(1);
    expect(dlqItems[0]!.id).toBe(id);
    expect(dlqItems[0]!.status).toBe('failed');
    expect(dlqItems[0]!.error).toBe('permanent failure');
  });

  it('should not move successful items to DLQ', async () => {
    const execute = vi.fn().mockResolvedValue('ok');
    const id = await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute });

    await flush();
    const result = await queue.waitForResult(id, 1000);

    expect(result.status).toBe('completed');
    expect(queue.getDeadLetterItems()).toHaveLength(0);
  });

  it('should not move retried-and-succeeded items to DLQ', async () => {
    let attempt = 0;
    const execute = vi.fn().mockImplementation(() => {
      attempt++;
      if (attempt === 1) return Promise.reject(new Error('transient'));
      return Promise.resolve('recovered');
    });

    const id = await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute });

    await flush();
    await new Promise((r) => setTimeout(r, 200));
    await flush();

    const result = await queue.waitForResult(id, 1000);
    expect(result.status).toBe('completed');
    expect(queue.getDeadLetterItems()).toHaveLength(0);
  });

  it('should return empty array when DLQ is empty', () => {
    expect(queue.getDeadLetterItems()).toEqual([]);
  });

  it('should re-enqueue DLQ item via retryDeadLetterItem()', async () => {
    // First: push an item to DLQ
    const execute = vi.fn().mockRejectedValue(new Error('dead'));
    const id = await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute });

    await flush();
    await new Promise((r) => setTimeout(r, 300));
    await flush();

    expect(queue.getDeadLetterItems()).toHaveLength(1);

    // Now retry the DLQ item with a successful executor
    const newId = await queue.retryDeadLetterItem(id);
    expect(newId).toBe(id);

    // DLQ should be empty now
    expect(queue.getDeadLetterItems()).toHaveLength(0);
  });

  it('should throw when retrying non-existent DLQ item', async () => {
    await expect(queue.retryDeadLetterItem('non-existent-id'))
      .rejects.toThrow('not found in dead-letter queue');
  });

  it('should handle multiple DLQ items', async () => {
    const makeFailing = () => vi.fn().mockRejectedValue(new Error('fail'));

    const id1 = await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: makeFailing() });
    const id2 = await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: makeFailing() });

    await flush();
    await new Promise((r) => setTimeout(r, 300));
    await flush();

    const dlqItems = queue.getDeadLetterItems();
    expect(dlqItems.length).toBe(2);
    expect(dlqItems.map((i) => i.id).sort()).toEqual([id1, id2].sort());
  });

  it('should log dead-letter events', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const execute = vi.fn().mockRejectedValue(new Error('dlq-test'));
    await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute });

    await flush();
    await new Promise((r) => setTimeout(r, 300));
    await flush();

    // Should have logged a DLQ warning
    const dlqLogs = consoleSpy.mock.calls.filter(
      (call) => call[0]?.includes?.('DLQ')
    );
    expect(dlqLogs.length).toBeGreaterThanOrEqual(1);

    consoleSpy.mockRestore();
  });
});
