/**
 * LLM Request Queue — priority-based queue with backpressure and tenant isolation.
 *
 * Features:
 *   - Priority queue (higher priority items run first)
 *   - Per-tenant concurrency limits
 *   - Backpressure: rejects low-priority requests when queue is full
 *   - Rate limiting integration per provider
 *   - Retry with exponential backoff
 *   - Per-item timeout
 *   - Graceful shutdown with drain
 */

import type {
  QueueItem,
  QueueConfig,
  QueueStatus,
  TenantStatus,
  QueueHealth,
} from './types.js';
import { DEFAULT_QUEUE_CONFIG } from './types.js';
import { LLMRateLimiter } from './rate-limiter.js';
import { BackpressureManager } from './backpressure.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let idCounter = 0;

function generateId(): string {
  return `q-${Date.now()}-${++idCounter}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── RequestQueue ────────────────────────────────────────────────────────────

export class RequestQueue {
  private config: QueueConfig;
  private queue: QueueItem[] = [];
  private running = new Set<string>();      // item IDs currently executing
  private items = new Map<string, QueueItem>(); // all known items
  private deadLetterQueue: QueueItem[] = [];
  private waiters = new Map<string, Array<{ resolve: (item: QueueItem) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }>>();
  private rateLimiter: LLMRateLimiter;
  private backpressure: BackpressureManager;
  private tenantRunning = new Map<string, number>();
  private processing = false;
  private shutdownRequested = false;

  constructor(config?: Partial<QueueConfig>) {
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config };
    this.rateLimiter = new LLMRateLimiter();
    this.backpressure = new BackpressureManager(this.config);
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Enqueue a new request. Returns the item ID.
   * Throws if the queue is full or backpressure rejects the request.
   */
  async enqueue(
    item: Omit<QueueItem, 'id' | 'createdAt' | 'status' | 'retries'>,
  ): Promise<string> {
    const totalItems = this.getTotalActive();

    // Check backpressure
    if (!this.backpressure.shouldAccept(item.priority, totalItems)) {
      throw new Error(
        `Queue rejecting request: backpressure active ` +
        `(health=${this.backpressure.getQueueHealth(totalItems, this.running.size)}, ` +
        `priority=${item.priority})`
      );
    }

    // Check hard limit
    if (totalItems >= this.config.maxQueueSize + this.config.maxConcurrency) {
      throw new Error(`Queue full: ${totalItems} items (max ${this.config.maxQueueSize + this.config.maxConcurrency})`);
    }

    const queueItem: QueueItem = {
      ...item,
      id: generateId(),
      createdAt: Date.now(),
      status: 'queued',
      retries: 0,
    };

    this.items.set(queueItem.id, queueItem);
    this.insertByPriority(queueItem);

    // Start processing if not already running
    this.scheduleProcess();

    return queueItem.id;
  }

  /**
   * Wait for a specific item to complete and return it.
   * Throws on timeout.
   */
  async waitForResult(itemId: string, timeout?: number): Promise<QueueItem> {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error(`Unknown item: ${itemId}`);
    }

    // Already done?
    if (item.status === 'completed') return item;
    if (item.status === 'failed') return item;
    if (item.status === 'cancelled') return item;

    return new Promise<QueueItem>((resolve, reject) => {
      const timer = setTimeout(() => {
        const waiters = this.waiters.get(itemId);
        if (waiters) {
          const idx = waiters.findIndex((w) => w.reject === reject);
          if (idx >= 0) waiters.splice(idx, 1);
          if (waiters.length === 0) this.waiters.delete(itemId);
        }
        reject(new Error(`Timeout waiting for item ${itemId}`));
      }, timeout ?? this.config.timeout * 2);

      let waiters = this.waiters.get(itemId);
      if (!waiters) {
        waiters = [];
        this.waiters.set(itemId, waiters);
      }
      waiters.push({ resolve, reject, timer });
    });
  }

  /**
   * Cancel a queued or running item. Returns true if cancellation succeeded.
   */
  async cancel(itemId: string): Promise<boolean> {
    const item = this.items.get(itemId);
    if (!item) return false;

    if (item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled') {
      return false;
    }

    item.status = 'cancelled';
    item.completedAt = Date.now();
    this.running.delete(itemId);
    this.removeFromQueue(itemId);

    // Notify waiters
    this.notifyWaiters(itemId, item);

    return true;
  }

  /**
   * Get aggregate queue status counts.
   */
  getStatus(): QueueStatus {
    let queued = 0, running = 0, completed = 0, failed = 0, cancelled = 0;
    for (const item of this.items.values()) {
      switch (item.status) {
        case 'queued': queued++; break;
        case 'running': running++; break;
        case 'completed': completed++; break;
        case 'failed': failed++; break;
        case 'cancelled': cancelled++; break;
      }
    }
    return { queued, running, completed, failed, cancelled };
  }

  /**
   * Get per-tenant status (queued + running counts).
   */
  getTenantStatus(tenantId: string): TenantStatus {
    let queued = 0, running = 0;
    for (const item of this.items.values()) {
      if (item.tenantId !== tenantId) continue;
      if (item.status === 'queued') queued++;
      if (item.status === 'running') running++;
    }
    return { queued, running };
  }

  /**
   * Get overall queue health.
   */
  getHealth(): QueueHealth {
    return this.backpressure.getQueueHealth(this.getTotalActive(), this.running.size);
  }

  /**
   * Get the rate limiter instance for direct integration.
   */
  getRateLimiter(): LLMRateLimiter {
    return this.rateLimiter;
  }

  /**
   * Get the backpressure manager instance.
   */
  getBackpressure(): BackpressureManager {
    return this.backpressure;
  }

  // ─── Dead-Letter Queue ─────────────────────────────────────────────────────

  /**
   * Get all items that exhausted their retries and were moved to the DLQ.
   */
  getDeadLetterItems(): QueueItem[] {
    return [...this.deadLetterQueue];
  }

  /**
   * Retry a dead-letter item by re-enqueuing it with reset retries.
   * Returns the new item ID. Throws if the item is not in the DLQ.
   */
  async retryDeadLetterItem(itemId: string): Promise<string> {
    const idx = this.deadLetterQueue.findIndex((i) => i.id === itemId);
    if (idx === -1) {
      throw new Error(`Item ${itemId} not found in dead-letter queue`);
    }

    const [dlItem] = this.deadLetterQueue.splice(idx, 1);

    // Reset for retry
    dlItem.status = 'queued';
    dlItem.retries = 0;
    dlItem.startedAt = undefined;
    dlItem.completedAt = undefined;
    dlItem.error = undefined;
    dlItem.createdAt = Date.now();

    this.items.set(dlItem.id, dlItem);
    this.insertByPriority(dlItem);
    this.scheduleProcess();

    console.info(`[queue] DLQ retry: ${itemId} re-enqueued`);
    return dlItem.id;
  }

  /**
   * Process the queue: pull items, run them, handle retries.
   * Call this in a loop or use scheduleProcess() for automatic scheduling.
   */
  async process(): Promise<void> {
    if (this.shutdownRequested) return;

    this.processing = true;

    while (!this.shutdownRequested) {
      // Check global concurrency limit
      if (this.running.size >= this.config.maxConcurrency) break;

      const next = this.pickNext();
      if (!next) break;

      // Check tenant concurrency
      if (next.tenantId) {
        const tenantRunning = this.tenantRunning.get(next.tenantId) ?? 0;
        if (tenantRunning >= this.config.perTenantConcurrency) {
          break; // Tenant at limit, stop pulling for now
        }
      }

      // Dequeue and run
      this.removeFromQueue(next.id);
      next.status = 'running';
      next.startedAt = Date.now();
      this.running.add(next.id);

      if (next.tenantId) {
        this.tenantRunning.set(next.tenantId, (this.tenantRunning.get(next.tenantId) ?? 0) + 1);
      }

      // Fire and forget — process() continues pulling
      this.executeItem(next).catch(() => { /* errors handled inside */ });
    }

    this.processing = false;
  }

  /**
   * Graceful shutdown: wait for running items to complete, reject queued items.
   */
  async shutdown(): Promise<void> {
    this.shutdownRequested = true;

    // Cancel all queued items
    for (const item of this.queue) {
      item.status = 'cancelled';
      item.completedAt = Date.now();
      this.notifyWaiters(item.id, item);
    }
    this.queue = [];

    // Wait for running items to finish (up to 30s)
    const deadline = Date.now() + 30_000;
    while (this.running.size > 0 && Date.now() < deadline) {
      await sleep(100);
    }

    // Force-cancel anything still running
    for (const id of this.running) {
      const item = this.items.get(id);
      if (item) {
        item.status = 'cancelled';
        item.completedAt = Date.now();
        this.notifyWaiters(id, item);
      }
    }
    this.running.clear();
    this.tenantRunning.clear();
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private getTotalActive(): number {
    return this.queue.length + this.running.size;
  }

  private insertByPriority(item: QueueItem): void {
    // Insert sorted by priority descending (highest first), then by createdAt ascending (FIFO within same priority)
    const idx = this.queue.findIndex(
      (existing) => existing.priority < item.priority ||
        (existing.priority === item.priority && existing.createdAt > item.createdAt)
    );
    if (idx >= 0) {
      this.queue.splice(idx, 0, item);
    } else {
      this.queue.push(item);
    }
  }

  private removeFromQueue(itemId: string): void {
    const idx = this.queue.findIndex((i) => i.id === itemId);
    if (idx >= 0) this.queue.splice(idx, 1);
  }

  private pickNext(): QueueItem | undefined {
    // Find the first queued item whose tenant isn't at concurrency limit
    for (const item of this.queue) {
      if (item.tenantId) {
        const tenantRunning = this.tenantRunning.get(item.tenantId) ?? 0;
        if (tenantRunning >= this.config.perTenantConcurrency) continue;
      }
      return item;
    }
    return undefined;
  }

  private scheduleProcess(): void {
    if (this.processing || this.shutdownRequested) return;
    // Use microtask to avoid stack overflow on rapid enqueue
    // queueMicrotask works reliably with vi.useFakeTimers() in tests
    queueMicrotask(() => {
      if (!this.shutdownRequested) {
        this.process().catch(() => { /* handled internally */ });
      }
    });
  }

  private async executeItem(item: QueueItem): Promise<void> {
    if (!item.execute) {
      this.completeItem(item, undefined, 'No execute function');
      return;
    }

    try {
      // Apply per-item timeout
      const result = await Promise.race([
        item.execute(),
        sleep(this.config.timeout).then(() => {
          throw new Error(`Item ${item.id} timed out after ${this.config.timeout}ms`);
        }),
      ]);

      this.completeItem(item, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // Check if this is a rate limit error (429)
      if (message.includes('429') || message.includes('rate limit')) {
        const provider = (item.payload as Record<string, unknown>)?.['provider'] as string | undefined;
        if (provider) {
          this.rateLimiter.onRateLimit(provider);
          this.backpressure.onRateLimit(provider);
        }
      }

      // Retry if allowed
      if (item.retries < this.config.maxRetries) {
        item.retries++;
        item.status = 'queued';
        item.startedAt = undefined;
        this.running.delete(item.id);

        if (item.tenantId) {
          this.tenantRunning.set(item.tenantId, Math.max(0, (this.tenantRunning.get(item.tenantId) ?? 1) - 1));
        }

        // Exponential backoff
        const delay = this.config.retryDelay * Math.pow(2, item.retries - 1);
        await sleep(delay);

        this.insertByPriority(item);
        this.scheduleProcess();
      } else {
        // Max retries exhausted — move to dead-letter queue
        console.warn(`[queue] DLQ: item ${item.id} exhausted ${this.config.maxRetries} retries: ${message}`);
        this.deadLetterQueue.push(item);
        this.completeItem(item, undefined, message);
      }
    }
  }

  private completeItem(item: QueueItem, result?: unknown, error?: string): void {
    item.status = error ? 'failed' : 'completed';
    item.result = result;
    item.error = error;
    item.completedAt = Date.now();
    this.running.delete(item.id);

    if (item.tenantId) {
      this.tenantRunning.set(item.tenantId, Math.max(0, (this.tenantRunning.get(item.tenantId) ?? 1) - 1));
    }

    this.notifyWaiters(item.id, item);
    this.scheduleProcess();
  }

  private notifyWaiters(itemId: string, item: QueueItem): void {
    const waiters = this.waiters.get(itemId);
    if (!waiters) return;

    for (const w of waiters) {
      clearTimeout(w.timer);
      w.resolve(item);
    }
    this.waiters.delete(itemId);
  }
}
