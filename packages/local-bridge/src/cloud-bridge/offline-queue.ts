/**
 * Offline Queue — Error Recovery for Cloud Operations
 *
 * When cloud is unavailable, operations are queued for later retry.
 * The queue persists to disk for durability across restarts.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { withRetry } from '../utils/retry.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type QueuedOperationType = 'chat' | 'complete' | 'fact_set' | 'wiki_update' | 'a2a_send';

export interface QueuedOperation {
  /** Unique operation ID */
  id: string;
  /** Operation type */
  type: QueuedOperationType;
  /** Operation payload */
  payload: unknown;
  /** Number of retry attempts */
  attempts: number;
  /** Maximum retry attempts */
  maxAttempts: number;
  /** ISO timestamp when operation was created */
  createdAt: string;
  /** ISO timestamp when next retry should occur */
  nextRetryAt: string;
  /** Priority (higher = processed first) */
  priority: number;
  /** Error from last attempt */
  lastError?: string;
}

export interface OfflineQueueOptions {
  /** Maximum queue size (default: 1000) */
  maxSize?: number;
  /** Default maximum retry attempts (default: 5) */
  defaultMaxAttempts?: number;
  /** Base retry delay in milliseconds (default: 1000ms) */
  baseRetryDelay?: number;
  /** Queue file path (default: cocapn/.offline-queue.json) */
  queueFilePath?: string;
}

export interface QueueProcessResult {
  succeeded: number;
  failed: number;
  remaining: number;
}

export type OperationExecutor = (op: QueuedOperation) => Promise<void>;

// ─── OfflineQueue ─────────────────────────────────────────────────────────────

export class OfflineQueue {
  private queue: QueuedOperation[] = [];
  private repoRoot: string;
  private options: Required<Omit<OfflineQueueOptions, 'queueFilePath'>> & { queueFilePath: string };
  private processing = false;
  private saveScheduled = false;
  private saveTimer?: ReturnType<typeof setTimeout>;

  constructor(repoRoot: string, options: OfflineQueueOptions = {}) {
    this.repoRoot = repoRoot;
    this.options = {
      maxSize: options.maxSize ?? 1000,
      defaultMaxAttempts: options.defaultMaxAttempts ?? 5,
      baseRetryDelay: options.baseRetryDelay ?? 1000,
      queueFilePath: options.queueFilePath ?? join(repoRoot, 'cocapn', '.offline-queue.json'),
    };
  }

  /**
   * Add an operation to the queue
   *
   * @param operation - Operation to queue (without id, attempts, timestamps)
   * @returns The queued operation ID
   */
  add(operation: Omit<QueuedOperation, 'id' | 'attempts' | 'createdAt' | 'nextRetryAt'>): string {
    // Check max size
    if (this.queue.length >= this.options.maxSize) {
      // Remove oldest lowest-priority operation
      this.queue.sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
      this.queue.pop();
    }

    const id = `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    const queuedOp: QueuedOperation = {
      id,
      type: operation.type,
      payload: operation.payload,
      attempts: 0,
      maxAttempts: operation.maxAttempts ?? this.options.defaultMaxAttempts,
      createdAt: now,
      nextRetryAt: now, // Available immediately
      priority: operation.priority ?? 0,
    };

    this.queue.push(queuedOp);
    this.scheduleSave();

    return id;
  }

  /**
   * Process the next pending operation
   *
   * @param executor - Function to execute the operation
   * @returns true if an operation was processed, false if queue was empty
   */
  async processNext(executor: OperationExecutor): Promise<boolean> {
    const now = Date.now();

    // Find next operation that's ready to retry
    const readyIndex = this.queue.findIndex((op) => {
      if (op.attempts >= op.maxAttempts) return false;
      return new Date(op.nextRetryAt).getTime() <= now;
    });

    if (readyIndex === -1) {
      return false;
    }

    const operation = this.queue[readyIndex];
    operation.attempts++;

    try {
      await executor(operation);
      // Success: remove from queue
      this.queue.splice(readyIndex, 1);
      this.scheduleSave();
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      operation.lastError = errorMessage;

      if (operation.attempts >= operation.maxAttempts) {
        // Max attempts reached: remove from queue
        this.queue.splice(readyIndex, 1);
        this.scheduleSave();
      } else {
        // Calculate next retry time with exponential backoff
        const delay = this.options.baseRetryDelay * Math.pow(2, operation.attempts - 1);
        const nextRetry = new Date(now + delay);
        operation.nextRetryAt = nextRetry.toISOString();
        this.scheduleSave();
      }

      throw error;
    }
  }

  /**
   * Retry all pending operations
   *
   * @param executor - Function to execute each operation
   * @returns Result statistics
   */
  async retryAll(executor: OperationExecutor): Promise<QueueProcessResult> {
    if (this.processing) {
      throw new Error('Queue processing already in progress');
    }

    this.processing = true;
    let succeeded = 0;
    let failed = 0;

    try {
      while (true) {
        try {
          const processed = await this.processNext(executor);
          if (!processed) break;
          succeeded++;
        } catch (error) {
          failed++;
          // Continue processing even if one operation fails
        }
      }

      return {
        succeeded,
        failed,
        remaining: this.size(),
      };
    } finally {
      this.processing = false;
    }
  }

  /**
   * Get all operations in the queue
   */
  getAll(): QueuedOperation[] {
    return [...this.queue];
  }

  /**
   * Get operations by type
   */
  getByType(type: QueuedOperationType): QueuedOperation[] {
    return this.queue.filter((op) => op.type === type);
  }

  /**
   * Get a specific operation by ID
   */
  getById(id: string): QueuedOperation | undefined {
    return this.queue.find((op) => op.id === id);
  }

  /**
   * Remove an operation from the queue
   */
  remove(id: string): boolean {
    const index = this.queue.findIndex((op) => op.id === id);
    if (index !== -1) {
      this.queue.splice(index, 1);
      this.scheduleSave();
      return true;
    }
    return false;
  }

  /**
   * Clear all operations from the queue
   */
  clear(): void {
    this.queue = [];
    this.scheduleSave();
  }

  /**
   * Get the current queue size
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Check if an operation is ready to be processed
   */
  isReady(operationId: string): boolean {
    const operation = this.getById(operationId);
    if (!operation) return false;
    if (operation.attempts >= operation.maxAttempts) return false;

    const now = Date.now();
    return new Date(operation.nextRetryAt).getTime() <= now;
  }

  /**
   * Get count of operations ready to be processed
   */
  readyCount(): number {
    const now = Date.now();
    return this.queue.filter((op) => {
      if (op.attempts >= op.maxAttempts) return false;
      return new Date(op.nextRetryAt).getTime() <= now;
    }).length;
  }

  /**
   * Save queue to disk
   */
  async save(): Promise<void> {
    try {
      const dir = join(this.options.queueFilePath, '..');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const data = {
        version: 1,
        queue: this.queue,
        savedAt: new Date().toISOString(),
      };

      writeFileSync(this.options.queueFilePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      console.error('[OfflineQueue] Failed to save queue:', error);
      throw error;
    }
  }

  /**
   * Load queue from disk
   */
  async load(): Promise<void> {
    try {
      if (!existsSync(this.options.queueFilePath)) {
        this.queue = [];
        return;
      }

      const content = readFileSync(this.options.queueFilePath, 'utf8');
      const data = JSON.parse(content) as { version?: number; queue?: QueuedOperation[] };

      if (data.queue && Array.isArray(data.queue)) {
        // Filter out invalid operations
        this.queue = data.queue.filter((op) => {
          return (
            op.id &&
            op.type &&
            op.createdAt &&
            op.nextRetryAt &&
            typeof op.attempts === 'number' &&
            typeof op.maxAttempts === 'number'
          );
        });
      } else {
        this.queue = [];
      }
    } catch (error) {
      console.error('[OfflineQueue] Failed to load queue:', error);
      this.queue = [];
    }
  }

  /**
   * Schedule a debounced save operation
   */
  private scheduleSave(): void {
    if (this.saveScheduled) {
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
      }
    }

    this.saveScheduled = true;
    this.saveTimer = setTimeout(() => {
      this.save().catch((err) => {
        console.error('[OfflineQueue] Scheduled save failed:', err);
      });
      this.saveScheduled = false;
    }, 500); // Debounce saves to 500ms
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    total: number;
    byType: Record<string, number>;
    ready: number;
    failed: number;
    oldest?: string;
  } {
    const byType: Record<string, number> = {};
    let failed = 0;
    let oldest: string | undefined;

    for (const op of this.queue) {
      byType[op.type] = (byType[op.type] || 0) + 1;
      if (op.attempts >= op.maxAttempts) {
        failed++;
      }
      if (!oldest || op.createdAt < oldest) {
        oldest = op.createdAt;
      }
    }

    return {
      total: this.queue.length,
      byType,
      ready: this.readyCount(),
      failed,
      oldest,
    };
  }
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Create an offline queue for a repository
 */
export async function createOfflineQueue(
  repoRoot: string,
  options?: OfflineQueueOptions
): Promise<OfflineQueue> {
  const queue = new OfflineQueue(repoRoot, options);
  await queue.load();
  return queue;
}

/**
 * Helper to add a chat operation to the queue
 */
export function queueChatMessage(
  queue: OfflineQueue,
  messages: unknown[],
  options?: { priority?: number; maxAttempts?: number }
): string {
  return queue.add({
    type: 'chat',
    payload: { messages },
    priority: options?.priority ?? 10, // High priority for chat
    maxAttempts: options?.maxAttempts,
  });
}

/**
 * Helper to add a fact set operation to the queue
 */
export function queueFactSet(
  queue: OfflineQueue,
  key: string,
  value: string,
  options?: { priority?: number; maxAttempts?: number }
): string {
  return queue.add({
    type: 'fact_set',
    payload: { key, value },
    priority: options?.priority ?? 5,
    maxAttempts: options?.maxAttempts,
  });
}

/**
 * Helper to add a wiki update operation to the queue
 */
export function queueWikiUpdate(
  queue: OfflineQueue,
  page: string,
  content: string,
  options?: { priority?: number; maxAttempts?: number }
): string {
  return queue.add({
    type: 'wiki_update',
    payload: { page, content },
    priority: options?.priority ?? 3,
    maxAttempts: options?.maxAttempts,
  });
}
