import type { VesselManifest } from './types.js';

/**
 * Vessel — identity and registration for a repo-agent in the Cocapn fleet.
 *
 * Each repo that joins the fleet instantiates a Vessel with its metadata.
 * The vessel can register itself on the fleet, discover peers, and send heartbeats.
 */
export class Vessel {
  name: string;
  domain: string;
  description: string;
  version: string;
  capabilities: string[];
  connections: string[];

  constructor(manifest: Partial<VesselManifest> & { name: string; domain: string }) {
    this.name = manifest.name;
    this.domain = manifest.domain;
    this.description = manifest.description || '';
    this.version = manifest.version || '0.1.0';
    this.capabilities = manifest.capabilities || [];
    this.connections = manifest.connections || [];
  }

  /** Load vessel config from KV or env defaults. */
  static async load(env: any): Promise<Vessel> {
    const defaults: Partial<VesselManifest> = { name: 'unnamed', domain: 'local', capabilities: [], connections: [] };

    if (env?.COCAPN_KV) {
      try {
        const raw = await env.COCAPN_KV.get('vessel:manifest');
        if (raw) Object.assign(defaults, JSON.parse(raw));
      } catch { /* use defaults */ }
    }

    return new Vessel(defaults as any);
  }

  /** Serialize this vessel to a manifest. */
  toManifest(): VesselManifest {
    return {
      name: this.name,
      domain: this.domain,
      description: this.description,
      version: this.version,
      capabilities: this.capabilities,
      connections: this.connections,
      registeredAt: Date.now(),
    };
  }

  /** Register this vessel in the fleet KV store. */
  async register(env: any): Promise<void> {
    if (!env?.COCAPN_KV) return;
    const manifest = this.toManifest();
    await env.COCAPN_KV.put(
      `fleet:vessel:${this.domain}`,
      JSON.stringify(manifest),
      { metadata: { name: this.name, version: this.version } }
    );
    // Also add to the fleet index
    const indexRaw = await env.COCAPN_KV.get('fleet:index');
    const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
    if (!index.includes(this.domain)) {
      index.push(this.domain);
      await env.COCAPN_KV.put('fleet:index', JSON.stringify(index));
    }
  }

  /** Discover other vessels in the fleet. */
  async discover(env: any): Promise<Vessel[]> {
    if (!env?.COCAPN_KV) return [];
    const indexRaw = await env.COCAPN_KV.get('fleet:index');
    const domains: string[] = indexRaw ? JSON.parse(indexRaw) : [];

    const vessels: Vessel[] = [];
    for (const domain of domains) {
      if (domain === this.domain) continue; // skip self
      const raw = await env.COCAPN_KV.get(`fleet:vessel:${domain}`);
      if (raw) vessels.push(new Vessel(JSON.parse(raw)));
    }
    return vessels;
  }

  /** Send a heartbeat — update lastHeartbeat timestamp. */
  async heartbeat(env: any): Promise<void> {
    if (!env?.COCAPN_KV) return;
    const key = `fleet:vessel:${this.domain}`;
    const raw = await env.COCAPN_KV.get(key);
    const manifest = raw ? JSON.parse(raw) : this.toManifest();
    manifest.lastHeartbeat = Date.now();
    await env.COCAPN_KV.put(key, JSON.stringify(manifest));
  }
}
