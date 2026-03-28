/**
 * Runtime configuration types for the local bridge.
 * Mirrors the cocapn-private.schema.json structure.
 */

export type BridgeMode = "local" | "hybrid" | "cloud";

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
};
