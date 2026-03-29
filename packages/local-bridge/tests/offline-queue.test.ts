/**
 * Tests for cloud-bridge/offline-queue.ts — Offline Queue
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync, existsSync, readFileSync } from 'fs';
import {
  OfflineQueue,
  createOfflineQueue,
  queueChatMessage,
  queueFactSet,
  queueWikiUpdate,
  type QueuedOperation,
  type QueuedOperationType,
} from '../src/cloud-bridge/offline-queue.js';

describe('OfflineQueue', () => {
  let queue: OfflineQueue;
  let tempDir: string;

  beforeEach(() => {
    tempDir = tmpdir();
    queue = new OfflineQueue(tempDir, {
      queueFilePath: join(tempDir, '.offline-queue-test.json'),
    });
  });

  afterEach(async () => {
    // Clean up test queue file
    const queuePath = join(tempDir, '.offline-queue-test.json');
    if (existsSync(queuePath)) {
      rmSync(queuePath);
    }
  });

  describe('add', () => {
    it('should add an operation to the queue', () => {
      const id = queue.add({
        type: 'chat',
        payload: { messages: [] },
      });

      expect(id).toMatch(/^op_\d+_[a-z0-9]+$/);
      expect(queue.size()).toBe(1);
    });

    it('should initialize operation metadata', () => {
      const id = queue.add({
        type: 'fact_set',
        payload: { key: 'test', value: 'value' },
        priority: 5,
        maxAttempts: 3,
      });

      const operation = queue.getById(id);
      expect(operation).toMatchObject({
        type: 'fact_set',
        payload: { key: 'test', value: 'value' },
        attempts: 0,
        maxAttempts: 3,
        priority: 5,
      });
      expect(operation?.createdAt).toBeDefined();
      expect(operation?.nextRetryAt).toBeDefined();
    });

    it('should enforce max queue size', () => {
      const smallQueue = new OfflineQueue(tempDir, {
        maxSize: 3,
        queueFilePath: join(tempDir, '.offline-queue-small.json'),
      });

      smallQueue.add({ type: 'chat', payload: {} });
      smallQueue.add({ type: 'chat', payload: {} });
      smallQueue.add({ type: 'chat', payload: {} });
      smallQueue.add({ type: 'chat', payload: {}, priority: 10 }); // High priority

      expect(smallQueue.size()).toBe(3);
    });

    it('should prioritize higher priority operations', () => {
      queue.add({ type: 'chat', payload: {}, priority: 1 });
      queue.add({ type: 'chat', payload: {}, priority: 10 });
      queue.add({ type: 'chat', payload: {}, priority: 5 });

      const operations = queue.getAll();
      expect(operations[2].priority).toBe(10); // Highest priority at end (will be dequeued first)
    });
  });

  describe('processNext', () => {
    it('should process the next ready operation', async () => {
      const executor = vi.fn().mockResolvedValue(undefined);

      queue.add({
        type: 'fact_set',
        payload: { key: 'test', value: 'value' },
      });

      const processed = await queue.processNext(executor);

      expect(processed).toBe(true);
      expect(executor).toHaveBeenCalledTimes(1);
      expect(queue.size()).toBe(0);
    });

    it('should return false when no operations ready', async () => {
      const executor = vi.fn();
      const processed = await queue.processNext(executor);

      expect(processed).toBe(false);
      expect(executor).not.toHaveBeenCalled();
    });

    it('should increment attempt counter on failure', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('Failed'));

      queue.add({
        type: 'chat',
        payload: {},
      });

      await expect(queue.processNext(executor)).rejects.toThrow();

      const operation = queue.getById(queue.getAll()[0].id);
      expect(operation?.attempts).toBe(1);
    });

    it('should remove operation after max attempts', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('Failed'));

      const id = queue.add({
        type: 'chat',
        payload: {},
        maxAttempts: 2,
      });

      // First attempt
      await expect(queue.processNext(executor)).rejects.toThrow();
      expect(queue.getById(id)).toBeDefined();

      // Second attempt (max reached)
      await expect(queue.processNext(executor)).rejects.toThrow();
      expect(queue.getById(id)).toBeUndefined();
    });

    it('should update nextRetryAt on failure', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('Failed'));

      queue.add({
        type: 'chat',
        payload: {},
      });

      const beforeRetry = Date.now();
      await expect(queue.processNext(executor)).rejects.toThrow();
      const afterRetry = Date.now();

      const operation = queue.getById(queue.getAll()[0].id);
      const nextRetryTime = new Date(operation!.nextRetryAt).getTime();

      expect(nextRetryTime).toBeGreaterThanOrEqual(beforeRetry + 1000);
      expect(nextRetryTime).toBeLessThanOrEqual(afterRetry + 2000);
    });
  });

  describe('retryAll', () => {
    it('should process all ready operations', async () => {
      const executor = vi.fn().mockResolvedValue(undefined);

      queue.add({ type: 'chat', payload: {} });
      queue.add({ type: 'chat', payload: {} });
      queue.add({ type: 'chat', payload: {} });

      const result = await queue.retryAll(executor);

      expect(result).toMatchObject({
        succeeded: 3,
        failed: 0,
        remaining: 0,
      });
      expect(executor).toHaveBeenCalledTimes(3);
    });

    it('should continue on failures', async () => {
      const executor = vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(undefined);

      queue.add({ type: 'chat', payload: {} });
      queue.add({ type: 'chat', payload: {} });
      queue.add({ type: 'chat', payload: {} });

      const result = await queue.retryAll(executor);

      expect(result.succeeded).toBeGreaterThanOrEqual(1);
      expect(result.failed).toBeGreaterThanOrEqual(1);
    });

    it('should prevent concurrent processing', async () => {
      const executor = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      queue.add({ type: 'chat', payload: {} });

      const promise1 = queue.retryAll(executor);
      await expect(queue.retryAll(executor)).rejects.toThrow('already in progress');

      await promise1;
    });

    it('should skip operations not ready for retry', async () => {
      const executor = vi.fn().mockResolvedValue(undefined);

      queue.add({
        type: 'chat',
        payload: {},
      });

      // Manually set nextRetryAt to future
      const operation = queue.getAll()[0];
      operation.nextRetryAt = new Date(Date.now() + 10000).toISOString();

      const result = await queue.retryAll(executor);

      expect(result.succeeded).toBe(0);
      expect(result.remaining).toBe(1);
    });
  });

  describe('getByType', () => {
    it('should filter operations by type', () => {
      queue.add({ type: 'chat', payload: {} });
      queue.add({ type: 'fact_set', payload: {} });
      queue.add({ type: 'chat', payload: {} });
      queue.add({ type: 'wiki_update', payload: {} });

      const chatOps = queue.getByType('chat');
      expect(chatOps).toHaveLength(2);

      const factOps = queue.getByType('fact_set');
      expect(factOps).toHaveLength(1);
    });
  });

  describe('remove', () => {
    it('should remove an operation by ID', () => {
      const id = queue.add({ type: 'chat', payload: {} });

      const removed = queue.remove(id);
      expect(removed).toBe(true);
      expect(queue.size()).toBe(0);
    });

    it('should return false for non-existent ID', () => {
      const removed = queue.remove('nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all operations', () => {
      queue.add({ type: 'chat', payload: {} });
      queue.add({ type: 'chat', payload: {} });
      queue.add({ type: 'chat', payload: {} });

      queue.clear();

      expect(queue.size()).toBe(0);
    });
  });

  describe('size', () => {
    it('should return the number of operations', () => {
      expect(queue.size()).toBe(0);

      queue.add({ type: 'chat', payload: {} });
      expect(queue.size()).toBe(1);

      queue.add({ type: 'chat', payload: {} });
      expect(queue.size()).toBe(2);

      queue.clear();
      expect(queue.size()).toBe(0);
    });
  });

  describe('isReady', () => {
    it('should return true for operations ready to retry', () => {
      const id = queue.add({
        type: 'chat',
        payload: {},
      });

      expect(queue.isReady(id)).toBe(true);
    });

    it('should return false for operations in backoff', () => {
      const id = queue.add({
        type: 'chat',
        payload: {},
      });

      // Manually set to future
      const operation = queue.getById(id)!;
      operation.nextRetryAt = new Date(Date.now() + 10000).toISOString();

      expect(queue.isReady(id)).toBe(false);
    });

    it('should return false for maxed out operations', () => {
      const id = queue.add({
        type: 'chat',
        payload: {},
        maxAttempts: 0,
      });

      expect(queue.isReady(id)).toBe(false);
    });

    it('should return false for non-existent operations', () => {
      expect(queue.isReady('nonexistent')).toBe(false);
    });
  });

  describe('readyCount', () => {
    it('should count operations ready for retry', () => {
      queue.add({ type: 'chat', payload: {} });
      queue.add({ type: 'chat', payload: {} });

      expect(queue.readyCount()).toBe(2);

      // Set one to future
      const op1 = queue.getAll()[0];
      op1.nextRetryAt = new Date(Date.now() + 10000).toISOString();

      expect(queue.readyCount()).toBe(1);
    });
  });

  describe('save / load', () => {
    it('should persist queue to disk', async () => {
      queue.add({ type: 'chat', payload: { test: 'data' } });
      queue.add({ type: 'fact_set', payload: { key: 'test' } });

      await queue.save();

      const queuePath = join(tempDir, '.offline-queue-test.json');
      expect(existsSync(queuePath)).toBe(true);

      const content = readFileSync(queuePath, 'utf8');
      const data = JSON.parse(content);

      expect(data.version).toBe(1);
      expect(data.queue).toHaveLength(2);
      expect(data.queue[0]).toMatchObject({
        type: 'chat',
        payload: { test: 'data' },
      });
    });

    it('should load queue from disk', async () => {
      const id1 = queue.add({ type: 'chat', payload: { test: 'data' } });
      const id2 = queue.add({ type: 'fact_set', payload: { key: 'test' } });

      await queue.save();

      // Create new queue and load
      const newQueue = new OfflineQueue(tempDir, {
        queueFilePath: join(tempDir, '.offline-queue-test.json'),
      });
      await newQueue.load();

      expect(newQueue.size()).toBe(2);
      expect(newQueue.getById(id1)).toBeDefined();
      expect(newQueue.getById(id2)).toBeDefined();
    });

    it('should filter invalid operations on load', async () => {
      const queuePath = join(tempDir, '.offline-queue-test.json');

      // Write invalid queue data
      const { writeFileSync } = await import('fs');
      writeFileSync(queuePath, JSON.stringify({
        version: 1,
        queue: [
          { id: 'valid', type: 'chat', payload: {}, createdAt: '2024-01-01', nextRetryAt: '2024-01-01', attempts: 0, maxAttempts: 3 },
          { id: 'invalid', type: 'chat' }, // Missing required fields
        ],
      }));

      await queue.load();

      expect(queue.size()).toBe(1);
      expect(queue.getById('valid')).toBeDefined();
      expect(queue.getById('invalid')).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('should return queue statistics', () => {
      queue.add({ type: 'chat', payload: {} });
      queue.add({ type: 'chat', payload: {} });
      queue.add({ type: 'fact_set', payload: {} });
      queue.add({ type: 'wiki_update', payload: {} });

      const stats = queue.getStats();

      expect(stats.total).toBe(4);
      expect(stats.byType).toEqual({
        chat: 2,
        fact_set: 1,
        wiki_update: 1,
      });
      expect(stats.ready).toBe(4);
      expect(stats.failed).toBe(0);
      expect(stats.oldest).toBeDefined();
    });

    it('should count failed operations', () => {
      queue.add({
        type: 'chat',
        payload: {},
        maxAttempts: 1,
      });

      // Max out attempts
      const operation = queue.getAll()[0];
      operation.attempts = 1;

      const stats = queue.getStats();
      expect(stats.failed).toBe(1);
    });
  });
});

describe('Helper Functions', () => {
  let queue: OfflineQueue;
  let tempDir: string;

  beforeEach(() => {
    tempDir = tmpdir();
    queue = new OfflineQueue(tempDir, {
      queueFilePath: join(tempDir, '.offline-queue-helper.json'),
    });
  });

  describe('queueChatMessage', () => {
    it('should queue chat with high priority', () => {
      const id = queueChatMessage(queue, [{ role: 'user', content: 'test' }]);

      const operation = queue.getById(id);
      expect(operation?.type).toBe('chat');
      expect(operation?.priority).toBe(10);
    });

    it('should support custom priority and maxAttempts', () => {
      const id = queueChatMessage(queue, [], { priority: 5, maxAttempts: 2 });

      const operation = queue.getById(id);
      expect(operation?.priority).toBe(5);
      expect(operation?.maxAttempts).toBe(2);
    });
  });

  describe('queueFactSet', () => {
    it('should queue fact operation', () => {
      const id = queueFactSet(queue, 'test-key', 'test-value');

      const operation = queue.getById(id);
      expect(operation?.type).toBe('fact_set');
      expect(operation?.payload).toEqual({ key: 'test-key', value: 'test-value' });
      expect(operation?.priority).toBe(5);
    });
  });

  describe('queueWikiUpdate', () => {
    it('should queue wiki update operation', () => {
      const id = queueWikiUpdate(queue, 'test-page', '# Content');

      const operation = queue.getById(id);
      expect(operation?.type).toBe('wiki_update');
      expect(operation?.payload).toEqual({ page: 'test-page', content: '# Content' });
      expect(operation?.priority).toBe(3);
    });
  });

  describe('createOfflineQueue', () => {
    it('should create and load queue', async () => {
      const testQueue = await createOfflineQueue(tempDir, {
        queueFilePath: join(tempDir, '.offline-queue-create.json'),
      });

      expect(testQueue).toBeInstanceOf(OfflineQueue);
    });
  });
});
