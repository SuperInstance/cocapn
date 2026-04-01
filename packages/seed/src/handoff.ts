/**
 * Handoff Protocol — universal context transfer between vessels.
 *
 * Packages up log entries, active state, pending tasks, and trust
 * metadata so one vessel can hand off to another. HMAC-signed for
 * integrity. Privacy boundaries control what leaves the sender.
 *
 * Zero dependencies. Uses only Node.js built-ins.
 */

import { createHmac } from 'node:crypto';
import type { LogEntry } from './atomic-log.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  title: string;
  status: 'pending' | 'in-progress' | 'done';
  priority?: number;
}

export interface HandoffPackage {
  vesselId: string;
  senderAgent: string;
  receiverAgent: string;
  trustScore: number;
  contextEntries: LogEntry[];
  activeState: Record<string, unknown>;
  pendingTasks: Task[];
  capabilities: string[];
  privacyBoundaries: string[];
  timestamp: number;
  signature: string;
}

export interface HandoffOptions {
  /** Filter entries by channel, type, etc. If omitted, include last 100. */
  maxEntries?: number;
  /** State snapshot to include. */
  state?: Record<string, unknown>;
  /** Tasks to include. */
  tasks?: Task[];
  /** Privacy prefixes to exclude (e.g. 'private.'). */
  privacyBoundaries?: string[];
  /** Shared secret for HMAC signing. */
  secret?: string;
}

export interface HandoffReceipt {
  accepted: boolean;
  vesselId: string;
  timestamp: number;
  entriesReceived: number;
  error?: string;
}

export interface HandoffAcceptance {
  ok: boolean;
  appliedEntries: number;
  appliedTasks: number;
  warnings: string[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function computeHmac(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function stripPrivate(
  entries: LogEntry[],
  boundaries: string[],
): LogEntry[] {
  if (boundaries.length === 0) return entries;
  return entries.filter(e => {
    for (const prefix of boundaries) {
      if (e.channel.startsWith(prefix) || (e.tags ?? []).some(t => t.startsWith(prefix))) {
        return false;
      }
    }
    return true;
  });
}

function serializePackage(pkg: Omit<HandoffPackage, 'signature'>): string {
  return JSON.stringify({
    vesselId: pkg.vesselId,
    senderAgent: pkg.senderAgent,
    receiverAgent: pkg.receiverAgent,
    trustScore: pkg.trustScore,
    contextEntries: pkg.contextEntries,
    activeState: pkg.activeState,
    pendingTasks: pkg.pendingTasks,
    capabilities: pkg.capabilities,
    privacyBoundaries: pkg.privacyBoundaries,
    timestamp: pkg.timestamp,
  });
}

// ─── HandoffProtocol ───────────────────────────────────────────────────────────

export class HandoffProtocol {
  private vesselId: string;
  private agentName: string;
  private secret: string;
  private capabilities: string[];
  private trustFn: (receiverId: string) => number;

  /**
   * @param vesselId  This vessel's ID
   * @param agentName This agent's name
   * @param secret    Shared secret for HMAC
   * @param capabilities  What this vessel can do
   * @param trustFn  Function returning trust score for a given receiver
   */
  constructor(opts: {
    vesselId: string;
    agentName: string;
    secret?: string;
    capabilities?: string[];
    trustFn?: (receiverId: string) => number;
  }) {
    this.vesselId = opts.vesselId;
    this.agentName = opts.agentName;
    this.secret = opts.secret ?? '';
    this.capabilities = opts.capabilities ?? [];
    this.trustFn = opts.trustFn ?? (() => 0.5);
  }

  /** Build a handoff package for a receiver. */
  prepare(
    receiverId: string,
    entries: LogEntry[],
    options?: HandoffOptions,
  ): HandoffPackage {
    const max = options?.maxEntries ?? 100;
    const boundaries = options?.privacyBoundaries ?? [];

    let filtered = stripPrivate(entries, boundaries);
    if (filtered.length > max) {
      filtered = filtered.slice(-max);
    }

    const trustScore = this.trustFn(receiverId);
    const timestamp = Date.now();

    const unsigned: Omit<HandoffPackage, 'signature'> = {
      vesselId: this.vesselId,
      senderAgent: this.agentName,
      receiverAgent: receiverId,
      trustScore,
      contextEntries: filtered,
      activeState: options?.state ?? {},
      pendingTasks: options?.tasks ?? [],
      capabilities: [...this.capabilities],
      privacyBoundaries: boundaries,
      timestamp,
    };

    const signature = this.secret
      ? computeHmac(serializePackage(unsigned), this.secret)
      : '';

    return { ...unsigned, signature };
  }

  /** Verify the HMAC signature of a received package. */
  verify(pkg: HandoffPackage): boolean {
    if (!this.secret && !pkg.signature) return true;
    if (!this.secret) return false;

    const pkgSignature = pkg.signature;
    const { signature: _, ...unsigned } = pkg;
    const expected = computeHmac(serializePackage(unsigned), this.secret);
    return pkgSignature === expected;
  }

  /**
   * Simulate sending — in production this would go over A2A/WebSocket.
   * Returns a receipt indicating acceptance.
   */
  async send(pkg: HandoffPackage): Promise<HandoffReceipt> {
    if (!pkg.signature && this.secret) {
      return {
        accepted: false,
        vesselId: pkg.vesselId,
        timestamp: Date.now(),
        entriesReceived: 0,
        error: 'Missing signature',
      };
    }

    return {
      accepted: true,
      vesselId: pkg.vesselId,
      timestamp: Date.now(),
      entriesReceived: pkg.contextEntries.length,
    };
  }

  /**
   * Receive a handoff package: verify, then return acceptance.
   * Does NOT apply — call apply() separately after acceptance.
   */
  async receive(pkg: HandoffPackage): Promise<HandoffAcceptance> {
    const warnings: string[] = [];

    if (!this.verify(pkg)) {
      return { ok: false, appliedEntries: 0, appliedTasks: 0, warnings: ['Signature verification failed'] };
    }

    if (pkg.trustScore < 0.3) {
      warnings.push(`Low trust score: ${pkg.trustScore}`);
    }

    if (pkg.contextEntries.length === 0 && pkg.pendingTasks.length === 0) {
      warnings.push('Empty handoff — no entries or tasks');
    }

    return {
      ok: true,
      appliedEntries: pkg.contextEntries.length,
      appliedTasks: pkg.pendingTasks.length,
      warnings,
    };
  }

  /**
   * Apply a received handoff: integrate context entries and tasks
   * into the local LogStore. Returns the entries actually appended.
   */
  apply(
    pkg: HandoffPackage,
    appendFn: (entry: Omit<LogEntry, 'id' | 'timestamp' | 'vessel'>) => LogEntry,
  ): LogEntry[] {
    const applied: LogEntry[] = [];

    for (const entry of pkg.contextEntries) {
      const appended = appendFn({
        author: 'a2a',
        type: 'handoff',
        channel: entry.channel,
        content: entry.content,
        context: [entry],
        tags: ['handoff', `from:${pkg.senderAgent}`],
        trust: pkg.trustScore,
      });
      applied.push(appended);
    }

    return applied;
  }
}
