/**
 * BridgeEvents — typed event bus for internal communication.
 *
 * Zero npm dependencies. Wraps Node's EventEmitter with full TypeScript
 * strict-mode typing so every emit / on / once / off call is checked at
 * compile time.
 *
 * Usage:
 *   const bus = new BridgeEvents();
 *   bus.on("brain:fact-set", (payload) => { ... });
 *   bus.emit("brain:fact-set", { key: "x", value: "y" });
 */

import { EventEmitter } from "events";

// ---------------------------------------------------------------------------
// Event map — every internal event and its payload shape
// ---------------------------------------------------------------------------

export type BridgeEventMap = {
  // Brain events
  "brain:updated":      [{ store: string; key?: string }];
  "brain:fact-set":     [{ key: string; value: string }];
  "brain:memory-added": [{ id: string; type: string; key: string }];

  // Mode events
  "mode:changed":       [{ from: string; to: string }];

  // LLM events
  "llm:request":        [{ model: string; provider: string; messageId?: string }];
  "llm:response":       [{ model: string; provider: string; tokens: number; latencyMs: number }];

  // Fleet events
  "fleet:peer-connected":    [{ peerId: string; url: string }];
  "fleet:peer-disconnected": [{ peerId: string; reason?: string }];

  // Sync events
  "sync:complete":      [{ pulled: number; pushed: number; conflicts: number }];

  // Lifecycle events
  "shutdown":           [{ reason: string; graceful: boolean }];
};

// ---------------------------------------------------------------------------
// Typed EventEmitter subclass
// ---------------------------------------------------------------------------

/**
 * BridgeEvents — a strictly-typed event bus for the local bridge.
 *
 * Extends Node's EventEmitter with a generic event map so that:
 *   - `emit` requires the correct payload shape for each event name
 *   - `on` / `once` / `off` listeners receive correctly-typed arguments
 *   - `removeAllListeners` only accepts declared event names
 *
 * Follows the same pattern as GitSync (git/sync.ts) and ModuleManager
 * (modules/manager.ts) — the generic parameter alone provides compile-time
 * safety through Node's built-in EventEmitter type definitions.
 */
export class BridgeEvents extends EventEmitter<BridgeEventMap> {}
