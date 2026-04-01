/**
 * FleetManager — discover, query, and coordinate vessels.
 *
 * Maintains a registry of known vessels, supports capability-based
 * discovery, topology mapping, and fleet-wide broadcast.
 *
 * Zero dependencies. Uses only Node.js built-ins.
 */

import type { VesselManifest, VesselManifestJSON } from './vessel.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface VesselInfo {
  vesselId: string;
  manifest: VesselManifestJSON;
  lastSeen: number;
  status: 'online' | 'offline' | 'busy';
  connections: string[]; // IDs of vessels this one is connected to
}

export interface VesselManifestInput {
  name: string;
  type: string;
  capabilities: string[];
  captain: string;
  cocapn: string;
  trustScores: Record<string, number>;
}

export interface FleetQuery {
  capability?: string;
  type?: string;
  status?: VesselInfo['status'];
  nameContains?: string;
}

export interface FleetFilter {
  capability?: string;
  type?: string;
  minTrust?: number;
  exclude?: string[];
}

export interface FleetReceipt {
  vesselId: string;
  delivered: boolean;
  error?: string;
}

export interface FleetStatusReport {
  totalVessels: number;
  onlineVessels: number;
  offlineVessels: number;
  busyVessels: number;
  capabilityIndex: Record<string, number>;
  typeDistribution: Record<string, number>;
}

export interface GraphDescription {
  nodes: string[];
  edges: Array<{ from: string; to: string }>;
  adjacency: Record<string, string[]>;
}

// ─── FleetManager ──────────────────────────────────────────────────────────────

export class FleetManager {
  private vessels: Map<string, VesselInfo> = new Map();
  private selfId: string;

  constructor(selfId?: string) {
    this.selfId = selfId ?? 'local';
  }

  /** Register a vessel with its manifest. */
  register(vesselId: string, manifest: VesselManifestInput): void {
    const existing = this.vessels.get(vesselId);
    this.vessels.set(vesselId, {
      vesselId,
      manifest,
      lastSeen: Date.now(),
      status: 'online',
      connections: existing?.connections ?? [],
    });
  }

  /** Unregister a vessel. */
  unregister(vesselId: string): boolean {
    // Remove from all connections
    for (const info of this.vessels.values()) {
      info.connections = info.connections.filter(id => id !== vesselId);
    }
    return this.vessels.delete(vesselId);
  }

  /** Get info about a specific vessel. */
  get(vesselId: string): VesselInfo | undefined {
    return this.vessels.get(vesselId);
  }

  /** Update a vessel's status. */
  setStatus(vesselId: string, status: VesselInfo['status']): void {
    const info = this.vessels.get(vesselId);
    if (info) {
      info.status = status;
      info.lastSeen = Date.now();
    }
  }

  /** Connect two vessels (bidirectional). */
  connect(vesselA: string, vesselB: string): void {
    const a = this.vessels.get(vesselA);
    const b = this.vessels.get(vesselB);
    if (a && !a.connections.includes(vesselB)) a.connections.push(vesselB);
    if (b && !b.connections.includes(vesselA)) b.connections.push(vesselA);
  }

  /** Disconnect two vessels (bidirectional). */
  disconnect(vesselA: string, vesselB: string): void {
    const a = this.vessels.get(vesselA);
    const b = this.vessels.get(vesselB);
    if (a) a.connections = a.connections.filter(id => id !== vesselB);
    if (b) b.connections = b.connections.filter(id => id !== vesselA);
  }

  /** Find vessels matching a query. */
  discover(query: FleetQuery = {}): VesselInfo[] {
    let results = [...this.vessels.values()];

    if (query.capability) {
      results = results.filter(v =>
        v.manifest.capabilities.includes(query.capability!),
      );
    }
    if (query.type) {
      results = results.filter(v => v.manifest.type === query.type);
    }
    if (query.status) {
      results = results.filter(v => v.status === query.status);
    }
    if (query.nameContains) {
      const lower = query.nameContains.toLowerCase();
      results = results.filter(v =>
        v.manifest.name.toLowerCase().includes(lower),
      );
    }

    return results;
  }

  /**
   * Broadcast a message to vessels matching a filter.
   * In production this would go over A2A/WebSocket — here it returns receipts.
   */
  broadcast(message: string, filter?: FleetFilter): FleetReceipt[] {
    let targets = [...this.vessels.values()];

    if (filter?.capability) {
      targets = targets.filter(v =>
        v.manifest.capabilities.includes(filter.capability!),
      );
    }
    if (filter?.type) {
      targets = targets.filter(v => v.manifest.type === filter.type);
    }
    if (filter?.exclude) {
      targets = targets.filter(v => !filter.exclude!.includes(v.vesselId));
    }
    if (filter?.minTrust !== undefined) {
      targets = targets.filter(v => {
        const trust = v.manifest.trustScores[this.selfId] ?? 0.5;
        return trust >= filter.minTrust!;
      });
    }

    // Mark self as having sent
    return targets.map(v => ({
      vesselId: v.vesselId,
      delivered: v.status !== 'offline',
    }));
  }

  /** Fleet-wide status summary. */
  status(): FleetStatusReport {
    const all = [...this.vessels.values()];
    const capabilityIndex: Record<string, number> = {};
    const typeDistribution: Record<string, number> = {};

    for (const v of all) {
      typeDistribution[v.manifest.type] = (typeDistribution[v.manifest.type] ?? 0) + 1;
      for (const cap of v.manifest.capabilities) {
        capabilityIndex[cap] = (capabilityIndex[cap] ?? 0) + 1;
      }
    }

    return {
      totalVessels: all.length,
      onlineVessels: all.filter(v => v.status === 'online').length,
      offlineVessels: all.filter(v => v.status === 'offline').length,
      busyVessels: all.filter(v => v.status === 'busy').length,
      capabilityIndex,
      typeDistribution,
    };
  }

  /** Return adjacency list of fleet connections. */
  topology(): GraphDescription {
    const nodes = [...this.vessels.keys()];
    const edges: Array<{ from: string; to: string }> = [];
    const adjacency: Record<string, string[]> = {};

    for (const [id, info] of this.vessels) {
      adjacency[id] = [...info.connections];
      for (const target of info.connections) {
        // Avoid duplicate edges (only add if from < to)
        if (id < target) {
          edges.push({ from: id, to: target });
        }
      }
    }

    return { nodes, edges, adjacency };
  }

  /** Get all registered vessels. */
  getAll(): VesselInfo[] {
    return [...this.vessels.values()];
  }
}
