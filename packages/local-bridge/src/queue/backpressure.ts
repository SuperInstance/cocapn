/**
 * Backpressure Manager — protects the LLM request queue from overload.
 *
 * Health levels:
 *   - healthy:   queue < 80% capacity, all requests accepted
 *   - degraded:  queue >= 80% capacity, low-priority (priority < 0) rejected
 *   - critical:  queue >= 95% capacity, only priority >= 5 accepted
 *
 * When a provider returns 429, the manager reduces concurrency until recovery.
 */

import type { QueueHealth, QueueConfig } from './types.js';

export class BackpressureManager {
  private config: QueueConfig;
  private degradedThreshold: number;
  private criticalThreshold: number;
  private providerPenalty = new Map<string, number>();
  private providerCooldowns = new Map<string, number>();

  constructor(config: QueueConfig) {
    this.config = config;
    this.degradedThreshold = 0.8;
    this.criticalThreshold = 0.95;
  }

  /**
   * Determine the current queue health based on total items.
   */
  getQueueHealth(totalItems: number, runningItems: number): QueueHealth {
    const capacity = this.config.maxConcurrency + this.config.maxQueueSize;
    const utilization = totalItems / capacity;

    // Also factor in provider penalties
    const hasPenalizedProvider = Array.from(this.providerPenalty.values()).some((p) => p > 0);

    if (utilization >= this.criticalThreshold || (hasPenalizedProvider && utilization >= 0.7)) {
      return 'critical';
    }
    if (utilization >= this.degradedThreshold) {
      return 'degraded';
    }
    return 'healthy';
  }

  /**
   * Decide whether to accept a new request based on its priority.
   */
  shouldAccept(priority: number, totalItems: number): boolean {
    const health = this.getQueueHealth(totalItems, 0);

    switch (health) {
      case 'healthy':
        return true;
      case 'degraded':
        // Reject low-priority requests (priority < 0)
        return priority >= 0;
      case 'critical':
        // Only accept high-priority requests (priority >= 5)
        return priority >= 5;
      default:
        return true;
    }
  }

  /**
   * Called when a provider returns 429 (rate limited).
   * Reduces effective concurrency for that provider.
   */
  onRateLimit(provider: string): void {
    const current = this.providerPenalty.get(provider) ?? 0;
    // Increase penalty: halve concurrency (min 1)
    const maxConcurrent = Math.max(1, Math.floor(
      this.config.maxConcurrency / Math.pow(2, current + 1)
    ));
    this.providerPenalty.set(provider, current + 1);
    this.providerCooldowns.set(provider, Date.now() + 60_000); // 1 min cooldown

    console.warn(
      `[queue] Backpressure: ${provider} rate-limited, ` +
      `reducing concurrency to ${maxConcurrent} (penalty level ${current + 1})`
    );
  }

  /**
   * Called when a provider recovers from rate limiting.
   * Restores concurrency to normal.
   */
  onRateLimitRecovery(provider: string): void {
    const penalty = this.providerPenalty.get(provider) ?? 0;
    if (penalty > 0) {
      this.providerPenalty.set(provider, Math.max(0, penalty - 1));
      console.info(
        `[queue] Backpressure: ${provider} recovering, ` +
        `penalty level ${Math.max(0, penalty - 1)}`
      );
    }
    this.providerCooldowns.delete(provider);
  }

  /**
   * Get the effective max concurrency for a specific provider,
   * accounting for any backpressure penalties.
   */
  getEffectiveConcurrency(provider: string): number {
    const penalty = this.providerPenalty.get(provider) ?? 0;
    if (penalty === 0) return this.config.maxConcurrency;

    // Check if cooldown has expired — auto-recover
    const cooldown = this.providerCooldowns.get(provider) ?? 0;
    if (Date.now() > cooldown) {
      this.onRateLimitRecovery(provider);
      return this.config.maxConcurrency;
    }

    return Math.max(1, Math.floor(this.config.maxConcurrency / Math.pow(2, penalty)));
  }

  /**
   * Get the penalty level for a provider (0 = no penalty).
   */
  getPenaltyLevel(provider: string): number {
    // Auto-recover if cooldown expired
    const cooldown = this.providerCooldowns.get(provider) ?? 0;
    if (cooldown > 0 && Date.now() > cooldown) {
      this.onRateLimitRecovery(provider);
    }
    return this.providerPenalty.get(provider) ?? 0;
  }

  /**
   * Get a summary of all provider penalties.
   */
  getProviderStatus(): Record<string, { penalty: number; effectiveConcurrency: number; inCooldown: boolean }> {
    const result: Record<string, { penalty: number; effectiveConcurrency: number; inCooldown: boolean }> = {};
    for (const [provider] of this.providerPenalty) {
      result[provider] = {
        penalty: this.getPenaltyLevel(provider),
        effectiveConcurrency: this.getEffectiveConcurrency(provider),
        inCooldown: (this.providerCooldowns.get(provider) ?? 0) > Date.now(),
      };
    }
    return result;
  }

  /**
   * Reset all penalties and cooldowns.
   */
  reset(): void {
    this.providerPenalty.clear();
    this.providerCooldowns.clear();
  }
}
