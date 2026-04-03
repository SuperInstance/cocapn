import { Vessel } from './vessel.js';
import type { FleetMessage } from './types.js';

/**
 * Fleet — coordination layer for discovering and communicating with other vessels.
 *
 * Uses the shared KV store as the message bus. In production, this could be
 * upgraded to Durable Objects or a proper pub/sub channel.
 */
export class Fleet {
  vessels: Map<string, Vessel> = new Map();

  constructor(privateVessels?: Vessel[]) {
    if (privateVessels) {
      for (const v of privateVessels) this.vessels.set(v.domain, v);
    }
  }

  /** Discover all registered vessels and update local cache. */
  async discover(env: any): Promise<Vessel[]> {
    const self = this.vessels.values().next().value;
    if (!self) return [...this.vessels.values()];

    const peers = await self.discover(env);
    for (const v of peers) this.vessels.set(v.domain, v);
    return [...this.vessels.values()];
  }

  /** Broadcast a message to all known vessels via KV. */
  async broadcast(env: any, message: Omit<FleetMessage, 'from' | 'timestamp'>): Promise<void> {
    if (!env?.COCAPN_KV) return;
    const sender = this.vessels.values().next().value;
    const full: FleetMessage = {
      ...message,
      from: sender?.domain || 'unknown',
      timestamp: Date.now(),
    };

    // Post to a shared broadcast channel
    const chKey = `fleet:broadcast:${full.timestamp.toString(36)}`;
    await env.COCAPN_KV.put(chKey, JSON.stringify(full), {
      expirationTtl: 300, // 5 min TTL for broadcasts
    });
  }

  /** Send a directed query to a specific vessel. */
  async query(env: any, target: string, query: string): Promise<any> {
    if (!env?.COCAPN_KV) return null;

    // Post query to target's inbox
    const sender = this.vessels.values().next().value;
    const msg: FleetMessage = {
      from: sender?.domain || 'unknown',
      to: target,
      type: 'query',
      payload: { query },
      timestamp: Date.now(),
    };
    await env.COCAPN_KV.put(`fleet:inbox:${target}:${Date.now()}`, JSON.stringify(msg), {
      expirationTtl: 3600,
    });

    // Try to read target's public API directly
    const targetVessel = this.vessels.get(target);
    if (targetVessel?.connections?.[0]) {
      try {
        const res = await fetch(`${targetVessel.connections[0]}/api/fleet/query?q=${encodeURIComponent(query)}`);
        return res.ok ? await res.json() : null;
      } catch { /* fallback to inbox */ }
    }

    return { status: 'queued', target, queryId: msg.timestamp };
  }

  /** Sync knowledge patterns across the fleet. */
  async syncKnowledge(env: any): Promise<{ synced: number }> {
    if (!env?.COCAPN_KV) return { synced: 0 };
    const list = await env.COCAPN_KV.list({ prefix: 'pattern:' });
    let synced = 0;

    for (const key of list.keys) {
      const val = await env.COCAPN_KV.get(key.name);
      if (!val) continue;
      const pattern = JSON.parse(val);
      // Mark as fleet-shared
      pattern._fleetShared = true;
      await env.COCAPN_KV.put(`fleet:shared:${key.name.slice('pattern:'.length)}`, JSON.stringify(pattern));
      synced++;
    }

    return { synced };
  }

  /** Health check — report status of all known vessels. */
  async healthCheck(): Promise<Record<string, string>> {
    const status: Record<string, string> = {};
    const now = Date.now();

    for (const [domain, vessel] of this.vessels) {
      const manifest = (vessel as any).toManifest?.();
      const lastBeat = manifest?.lastHeartbeat || 0;
      const age = now - lastBeat;

      if (lastBeat === 0) status[domain] = 'unknown';
      else if (age < 120_000) status[domain] = 'healthy';
      else if (age < 600_000) status[domain] = 'stale';
      else status[domain] = 'offline';
    }

    return status;
  }
}
