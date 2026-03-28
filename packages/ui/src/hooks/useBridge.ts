import { useState, useRef, useCallback, useEffect } from "react";
import type {
  BridgeStatus,
  IncomingTyped,
  OutgoingTyped,
  RpcRequest,
  RpcResponse,
} from "@/types/bridge.js";

// ─── Queue persistence ────────────────────────────────────────────────────────

const QUEUE_KEY = "cocapn_msg_queue";
const MAX_QUEUE = 50;

function loadQueue(): OutgoingTyped[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as OutgoingTyped[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(q: OutgoingTyped[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUE)));
  } catch {
    // localStorage full — drop oldest
  }
}

// ─── Bridge URL resolution ────────────────────────────────────────────────────

function resolveBridgeUrl(tokenOverride?: string): string {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="bridge-url"]');
  const stored = sessionStorage.getItem("cocapn_bridge_url");
  let base =
    meta?.content ||
    stored ||
    (typeof window !== "undefined"
      ? `ws://${window.location.hostname}:8787`
      : "ws://localhost:8787");

  // Normalise: dev Vite proxy rewrites /ws to the bridge
  if (window.location.hostname === "localhost" && !stored && !meta?.content) {
    base = `ws://localhost:8787`;
  }

  const token = tokenOverride ?? sessionStorage.getItem("cocapn_token");
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type TypedHandler<T extends IncomingTyped["type"] = IncomingTyped["type"]> = (
  msg: Extract<IncomingTyped, { type: T }>
) => void;

type RpcHandler = (response: RpcResponse) => void;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface BridgeHandle {
  status: BridgeStatus;
  connect: (token?: string) => void;
  disconnect: () => void;
  /** Send a typed message. Queued in localStorage when offline. */
  send: (msg: OutgoingTyped) => void;
  /** Send a JSON-RPC request. Resolves with the response (or rejects on timeout). */
  request: (method: string, params?: unknown, timeoutMs?: number) => Promise<unknown>;
  /** Subscribe to incoming typed messages of a given type. Returns unsubscribe fn. */
  subscribe: <T extends IncomingTyped["type"]>(
    type: T,
    handler: TypedHandler<T>
  ) => () => void;
  /** Queue length — non-zero means messages are pending while offline. */
  queueLength: number;
}

export function useBridge(): BridgeHandle {
  const [status, setStatus] = useState<BridgeStatus>("disconnected");
  const [queueLength, setQueueLength] = useState(() => loadQueue().length);

  const wsRef    = useRef<WebSocket | null>(null);
  const backoff  = useRef(1000);
  const timer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue    = useRef<OutgoingTyped[]>(loadQueue());
  const rpcMap   = useRef(new Map<string | number, RpcHandler>());
  const handlers = useRef(new Map<string, Set<TypedHandler>>());
  let   rpcSeq   = 0;

  // ── subscribe ──────────────────────────────────────────────────────────────

  const subscribe = useCallback(
    <T extends IncomingTyped["type"]>(type: T, handler: TypedHandler<T>) => {
      if (!handlers.current.has(type)) handlers.current.set(type, new Set());
      (handlers.current.get(type) as unknown as Set<TypedHandler<T>>).add(handler);
      return () => {
        (handlers.current.get(type) as unknown as Set<TypedHandler<T>>)?.delete(handler);
      };
    },
    []
  );

  // ── dispatch incoming ──────────────────────────────────────────────────────

  const dispatch = useCallback((raw: string) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    // JSON-RPC response
    if ("jsonrpc" in msg && ("result" in msg || "error" in msg)) {
      const rpc = msg as unknown as RpcResponse;
      const handler = rpcMap.current.get(rpc.id);
      if (handler) {
        rpcMap.current.delete(rpc.id);
        handler(rpc);
      }
      return;
    }

    // Typed message
    if (typeof msg["type"] === "string") {
      const typed = msg as unknown as IncomingTyped;
      const set = handlers.current.get(typed.type);
      if (set) {
        for (const h of set) h(typed as never);
      }
    }
  }, []);

  // ── drain queue after reconnect ────────────────────────────────────────────

  const drain = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const pending = [...queue.current];
    queue.current = [];
    saveQueue([]);
    setQueueLength(0);
    for (const msg of pending) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  // ── connect ────────────────────────────────────────────────────────────────

  const connect = useCallback(
    (tokenOverride?: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }

      setStatus("connecting");
      const url = resolveBridgeUrl(tokenOverride);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        setStatus("connected");
        backoff.current = 1000;
        drain();
      });

      ws.addEventListener("message", (evt) => {
        if (typeof evt.data === "string") dispatch(evt.data);
      });

      ws.addEventListener("close", (evt) => {
        wsRef.current = null;
        setStatus("disconnected");

        // 4001 = auth rejected — don't reconnect automatically
        if (evt.code === 4001) return;

        timer.current = setTimeout(() => {
          backoff.current = Math.min(backoff.current * 2, 30_000);
          connect(tokenOverride);
        }, backoff.current);
      });

      ws.addEventListener("error", () => ws.close());
    },
    [dispatch, drain]
  );

  // ── disconnect ─────────────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("disconnected");
  }, []);

  // ── send ───────────────────────────────────────────────────────────────────

  const send = useCallback(
    (msg: OutgoingTyped) => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      } else {
        // Buffer CHAT messages; discard real-time-only messages
        if (msg.type === "CHAT") {
          queue.current = [...queue.current, msg].slice(-MAX_QUEUE);
          saveQueue(queue.current);
          setQueueLength(queue.current.length);
        }
      }
    },
    []
  );

  // ── request (JSON-RPC) ─────────────────────────────────────────────────────

  const request = useCallback(
    (method: string, params?: unknown, timeoutMs = 10_000): Promise<unknown> => {
      return new Promise((resolve, reject) => {
        const id = ++rpcSeq;
        const rpc: RpcRequest = { jsonrpc: "2.0", id, method, params };

        const timeout = setTimeout(() => {
          rpcMap.current.delete(id);
          reject(new Error(`RPC timeout: ${method}`));
        }, timeoutMs);

        rpcMap.current.set(id, (res) => {
          clearTimeout(timeout);
          if (res.error) {
            reject(new Error(res.error.message));
          } else {
            resolve(res.result);
          }
        });

        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(rpc));
        } else {
          clearTimeout(timeout);
          rpcMap.current.delete(id);
          reject(new Error("Bridge not connected"));
        }
      });
    },
    []
  );

  // ── auto-connect on mount ──────────────────────────────────────────────────

  useEffect(() => {
    if (sessionStorage.getItem("cocapn_token")) connect();
    return disconnect;
  }, [connect, disconnect]);

  return { status, connect, disconnect, send, request, subscribe, queueLength };
}
