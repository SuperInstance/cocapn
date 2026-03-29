/**
 * Runtime configuration types for the local bridge.
 * Mirrors the cocapn-private.schema.json structure.
 */

export type BridgeMode = "local" | "hybrid" | "cloud";

export type EmbeddingProvider = "local" | "openai";

export interface VectorSearchConfig {
  /** Enable vector search (defaults to true, falls back to false if unavailable) */
  enabled: boolean;
  /** Embedding provider to use */
  provider: EmbeddingProvider;
  /** OpenAI API key (only used when provider is "openai") */
  apiKey?: string;
  /** Base URL for embeddings API (default: https://api.openai.com) — use for DeepSeek, etc. */
  baseUrl?: string;
  /** Model name for OpenAI embeddings (default: text-embedding-3-small) */
  model?: string;
  /** Embedding dimensions (default: 384 for local, 1536 for OpenAI) */
  dimensions?: number;
  /** Alpha weight for keyword vs semantic search (0-1, default: 0.6) */
  alpha?: number;
}

export interface BridgeConfig {
  /** Path to the soul.md personality file */
  soul: string;

  config: {
    mode: BridgeMode;
    /** WebSocket port — default 8787 */
    port: number;
    /** Optional Cloudflare tunnel URL for remote access */
    tunnel: string | undefined;
  };

  memory: {
    facts: string;
    procedures: string;
    relationships: string;
  };

  encryption: {
    publicKey: string;
    recipients: string[];
    encryptedPaths: string[];
  };

  sync: {
    /** Seconds between general Git syncs */
    interval: number;
    /** Seconds between memory-specific syncs */
    memoryInterval: number;
    autoCommit: boolean;
    autoPush: boolean;
  };

  vectorSearch?: VectorSearchConfig;
}

export const DEFAULT_CONFIG: BridgeConfig = {
  soul: "soul.md",
  config: {
    mode: "local",
    port: 8787,
    tunnel: undefined,
  },
  memory: {
    facts: "memory/facts.json",
    procedures: "memory/procedures",
    relationships: "memory/relationships.json",
  },
  encryption: {
    publicKey: "",
    recipients: [],
    encryptedPaths: ["secrets/**", "*.secret.yml"],
  },
  sync: {
    interval: 300,
    memoryInterval: 60,
    autoCommit: true,
    autoPush: false,
  },
  vectorSearch: {
    enabled: true,
    provider: "local",
    dimensions: 384,
    alpha: 0.6,
  },
};
