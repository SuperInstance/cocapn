import { useState, useRef, useCallback, useEffect } from "react";

type BridgeStatus = "connected" | "connecting" | "disconnected";

interface Message {
  type: string;
  id?: string;
  [key: string]: unknown;
}

interface BridgeHandle {
  status: BridgeStatus;
  connect: () => void;
  send: (msg: Message) => void;
  disconnect: () => void;
}

const BRIDGE_URL = (() => {
  // In development, Vite proxies /ws → ws://localhost:8787
  // In production (GitHub Pages), fall back to a configured tunnel URL
  const meta = document.querySelector<HTMLMetaElement>('meta[name="bridge-url"]');
  if (meta?.content) return meta.content;
  return typeof window !== "undefined"
    ? `ws://${window.location.hostname}:8787`
    : "ws://localhost:8787";
})();

/**
 * useBridge — manages the WebSocket connection to the local bridge.
 *
 * Reconnects automatically with exponential backoff (1s → 30s cap).
 * The token is read from sessionStorage so it survives React re-renders
 * without being stored in component state.
 */
export function useBridge(): BridgeHandle {
  const [status, setStatus] = useState<BridgeStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1000);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const token = sessionStorage.getItem("cocapn_token");
    const url = token ? `${BRIDGE_URL}?token=${encodeURIComponent(token)}` : BRIDGE_URL;

    setStatus("connecting");
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      setStatus("connected");
      backoffRef.current = 1000;
    });

    ws.addEventListener("close", () => {
      wsRef.current = null;
      setStatus("disconnected");
      // Reconnect with exponential backoff
      reconnectTimer.current = setTimeout(() => {
        backoffRef.current = Math.min(backoffRef.current * 2, 30_000);
        connect();
      }, backoffRef.current);
    });

    ws.addEventListener("error", () => {
      ws.close();
    });
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("disconnected");
  }, []);

  const send = useCallback((msg: Message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // Auto-connect on mount if a token is already stored
  useEffect(() => {
    if (sessionStorage.getItem("cocapn_token")) {
      connect();
    }
    return disconnect;
  }, [connect, disconnect]);

  return { status, connect, send, disconnect };
}
