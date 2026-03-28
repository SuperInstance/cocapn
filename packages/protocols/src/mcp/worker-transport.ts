/**
 * WorkerTransport — MCP transport for Cloudflare Workers.
 *
 * Communicates using the Fetch API and the WebSocket API available in
 * the Workers runtime. Does NOT use Node.js built-ins (no `process`, `stream`, etc.).
 *
 * Connection model: the Worker acts as a WebSocket client connecting to the
 * local bridge's WebSocket server (or another Worker's Durable Object WebSocket).
 */

import { BaseTransport } from "./transport.js";
import type { JsonRpcMessage } from "./types.js";

export interface WorkerTransportOptions {
  /** WebSocket URL of the MCP server to connect to */
  url: string;
  /**
   * Headers to include in the WebSocket upgrade request
   * (e.g., Authorization for authenticated tunnels)
   */
  headers?: Record<string, string>;
}

export class WorkerTransport extends BaseTransport {
  private url: string;
  private headers: Record<string, string>;
  private ws: WebSocket | null = null;

  constructor(options: WorkerTransportOptions) {
    super();
    this.url = options.url;
    this.headers = options.headers ?? {};
  }

  async start(): Promise<void> {
    // Workers WebSocket API: use fetch with Upgrade header
    const response = await fetch(this.url, {
      headers: {
        Upgrade: "websocket",
        ...this.headers,
      },
    });

    // Cloudflare Workers returns the WebSocket from the response
    const ws = (response as unknown as { webSocket: WebSocket | null }).webSocket;
    if (!ws) {
      throw new Error(
        `WorkerTransport: server at ${this.url} did not return a WebSocket upgrade`
      );
    }

    this.ws = ws;

    ws.addEventListener("message", (event: MessageEvent) => {
      const data = typeof event.data === "string" ? event.data : "";
      try {
        const parsed = JSON.parse(data) as JsonRpcMessage;
        this.notifyMessage(parsed).catch((err: unknown) => {
          this.notifyError(err instanceof Error ? err : new Error(String(err)));
        });
      } catch {
        this.notifyError(
          new Error(`WorkerTransport: failed to parse message: ${data}`)
        );
      }
    });

    ws.addEventListener("error", () => {
      this.notifyError(new Error("WorkerTransport: WebSocket error"));
    });

    ws.addEventListener("close", () => {
      this.ws = null;
      this.notifyClose();
    });

    // accept() is a Cloudflare Workers WebSocket extension, not in the standard lib
    (ws as unknown as { accept(): void }).accept();
  }

  async send(message: JsonRpcMessage): Promise<void> {
    if (!this.ws) {
      throw new Error("WorkerTransport: not connected — call start() first");
    }
    this.ws.send(JSON.stringify(message));
  }

  async close(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
