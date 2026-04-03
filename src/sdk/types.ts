/** Core Cocapn types shared across SDK modules. */

export interface Tile {
  id: string;
  type: 'knowledge' | 'action' | 'query' | 'response' | 'pattern';
  content: string;
  confidence: number;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface Pattern {
  id: string;
  nodes: string[];
  edges: Array<{ from: string; to: string; weight: number }>;
  confidence: number;
  observedAt: number;
  domain: string;
}

export interface VesselManifest {
  name: string;
  domain: string;
  description: string;
  version: string;
  capabilities: string[];
  connections: string[];
  registeredAt?: number;
  lastHeartbeat?: number;
}

export interface FleetMessage {
  from: string;
  to?: string;
  type: 'discover' | 'query' | 'sync' | 'broadcast' | 'heartbeat';
  payload: unknown;
  timestamp: number;
}

export interface RunMetrics {
  thinkMs: number;
  actMs: number;
  observeMs: number;
  learnMs: number;
  totalMs: number;
  tilesGenerated: number;
  patternsLearned: number;
  tokensUsed: number;
}

export const SDK_VERSION = '0.1.0';
export const PROTOCOL_VERSION = 'fleet-v1';
