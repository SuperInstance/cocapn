/**
 * Sender — encapsulates WebSocket frame serialization.
 *
 * Extracted from server.ts so handlers don't need to call ws.send(JSON.stringify(...))
 * directly. Also makes testing easier — inject a mock Sender.
 */

import type { WebSocket, WebSocketServer } from "ws";
import type { JsonRpcRequest } from "./types.js";

export interface Sender {
  /** Send a typed message frame (used by all handlers). */
  typed(ws: WebSocket, payload: Record<string, unknown>): void;

  /** Send a JSON-RPC success response. */
  result(ws: WebSocket, id: JsonRpcRequest["id"], result: unknown): void;

  /** Send a JSON-RPC error response. */
  error(ws: WebSocket, id: JsonRpcRequest["id"], code: number, message: string): void;

  /** Send a JSON payload to every open WebSocket client. */
  broadcast(wss: WebSocketServer, payload: Record<string, unknown>): void;
}

export function createSender(): Sender {
  return {
    typed(ws, payload) {
      ws.send(JSON.stringify(payload));
    },
    result(ws, id, result) {
      ws.send(JSON.stringify({ jsonrpc: "2.0", id, result }));
    },
    error(ws, id, code, message) {
      ws.send(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }));
    },
    broadcast(wss, payload) {
      const raw = JSON.stringify(payload);
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(raw);
      }
    },
  };
}
