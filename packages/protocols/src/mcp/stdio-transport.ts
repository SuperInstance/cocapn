/**
 * StdioTransport — MCP transport for Node.js local bridge.
 *
 * Communicates with a CLI agent process via its stdin/stdout using
 * newline-delimited JSON (NDJSON). Each message is a single JSON line.
 *
 * Only imported in Node.js environments; not compatible with Cloudflare Workers.
 */

import { BaseTransport } from "./transport.js";
import type { JsonRpcMessage } from "./types.js";

export interface StdioTransportOptions {
  /** Readable stream to receive messages from (default: process.stdin) */
  readable?: NodeJS.ReadableStream;
  /** Writable stream to send messages to (default: process.stdout) */
  writable?: NodeJS.WritableStream;
}

export class StdioTransport extends BaseTransport {
  private readable: NodeJS.ReadableStream;
  private writable: NodeJS.WritableStream;
  private buffer = "";
  private started = false;

  constructor(options: StdioTransportOptions = {}) {
    super();
    this.readable = options.readable ?? process.stdin;
    this.writable = options.writable ?? process.stdout;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    this.readable.setEncoding("utf8");

    this.readable.on("data", (chunk: string) => {
      this.buffer += chunk;
      this.processBuffer();
    });

    this.readable.on("error", (err: Error) => {
      this.notifyError(err);
    });

    this.readable.on("end", () => {
      // Process any remaining buffered data
      if (this.buffer.trim()) {
        this.processBuffer();
      }
      this.notifyClose();
    });
  }

  async send(message: JsonRpcMessage): Promise<void> {
    if (!this.started) {
      throw new Error("StdioTransport: call start() before send()");
    }
    const line = JSON.stringify(message) + "\n";
    await new Promise<void>((resolve, reject) => {
      this.writable.write(line, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async close(): Promise<void> {
    this.started = false;
    this.notifyClose();
  }

  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    // Last element is either empty (complete line) or a partial line
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const parsed = JSON.parse(trimmed) as JsonRpcMessage;
        this.notifyMessage(parsed).catch((err: unknown) => {
          this.notifyError(err instanceof Error ? err : new Error(String(err)));
        });
      } catch {
        this.notifyError(new Error(`StdioTransport: failed to parse line: ${trimmed}`));
      }
    }
  }
}
