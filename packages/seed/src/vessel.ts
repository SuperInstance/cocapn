/**
 * VesselManifest — identity card for a cocapn vessel.
 *
 * Describes who a vessel is, what it can do, and how much it trusts others.
 * Read from cocapn.json in the repo root, or constructed programmatically.
 *
 * Zero dependencies. Uses only Node.js built-ins.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface VesselManifestJSON {
  name: string;
  type: string;
  capabilities: string[];
  captain: string;
  cocapn: string;
  trustScores: Record<string, number>;
}

// ─── VesselManifest ────────────────────────────────────────────────────────────

export class VesselManifest {
  name: string;
  type: string; // fishing, dm, business, maker, personal, etc.
  capabilities: string[];
  captain: string;
  cocapn: string;
  trustScores: Map<string, number>;

  constructor(init: {
    name: string;
    type: string;
    capabilities?: string[];
    captain?: string;
    cocapn?: string;
    trustScores?: Map<string, number>;
  }) {
    this.name = init.name;
    this.type = init.type;
    this.capabilities = init.capabilities ?? [];
    this.captain = init.captain ?? 'unknown';
    this.cocapn = init.cocapn ?? '0.1.0';
    this.trustScores = init.trustScores ?? new Map();
  }

  /** Set trust score for another vessel (0–1). */
  setTrust(vesselId: string, score: number): void {
    this.trustScores.set(vesselId, Math.max(0, Math.min(1, score)));
  }

  /** Get trust score for another vessel. Defaults to 0.5 (neutral). */
  getTrust(vesselId: string): number {
    return this.trustScores.get(vesselId) ?? 0.5;
  }

  /** Check if this vessel has a specific capability. */
  can(capability: string): boolean {
    return this.capabilities.includes(capability);
  }

  /** Add a capability. No-op if already present. */
  addCapability(capability: string): void {
    if (!this.capabilities.includes(capability)) {
      this.capabilities.push(capability);
    }
  }

  /** Remove a capability. */
  removeCapability(capability: string): void {
    this.capabilities = this.capabilities.filter(c => c !== capability);
  }

  /** Serialize to plain JSON object. */
  export(): VesselManifestJSON {
    return {
      name: this.name,
      type: this.type,
      capabilities: [...this.capabilities],
      captain: this.captain,
      cocapn: this.cocapn,
      trustScores: Object.fromEntries(this.trustScores),
    };
  }

  /** Reconstruct from JSON. */
  static fromJSON(json: VesselManifestJSON): VesselManifest {
    return new VesselManifest({
      name: json.name,
      type: json.type,
      capabilities: json.capabilities,
      captain: json.captain,
      cocapn: json.cocapn,
      trustScores: new Map(Object.entries(json.trustScores)),
    });
  }

  /** Read manifest from a cocapn.json in the given repo directory. */
  static fromRepo(repoDir: string): VesselManifest {
    const configPath = join(repoDir, 'cocapn.json');
    if (!existsSync(configPath)) {
      return new VesselManifest({
        name: repoDir.split('/').pop() ?? 'unknown',
        type: 'unknown',
      });
    }
    try {
      const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as {
        vessel?: Partial<VesselManifestJSON>;
      };
      const v = raw.vessel ?? {};
      return new VesselManifest({
        name: v.name ?? repoDir.split('/').pop() ?? 'unknown',
        type: v.type ?? 'unknown',
        capabilities: v.capabilities ?? [],
        captain: v.captain ?? 'unknown',
        cocapn: v.cocapn ?? '0.1.0',
        trustScores: v.trustScores
          ? new Map(Object.entries(v.trustScores))
          : new Map(),
      });
    } catch {
      return new VesselManifest({
        name: repoDir.split('/').pop() ?? 'unknown',
        type: 'unknown',
      });
    }
  }
}
