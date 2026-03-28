/**
 * MCPTransport interface — abstracts the wire transport for MCP messages.
 *
 * Implementations:
 *   - StdioTransport: for local bridge, communicates via process stdin/stdout
 *   - WorkerTransport: for Cloudflare Workers, communicates via fetch/WebSocket
 */

import type { JsonRpcMessage } from "./types.js";

export type MessageHandler = (message: JsonRpcMessage) => void | Promise<void>;
export type ErrorHandler = (error: Error) => void;
export type CloseHandler = () => void;

export interface MCPTransport {
  /**
   * Start the transport and begin accepting messages.
   * Must be called before send().
   */
  start(): Promise<void>;

  /**
   * Send a JSON-RPC message to the remote end.
   */
  send(message: JsonRpcMessage): Promise<void>;

  /**
   * Close the transport and release resources.
   */
  close(): Promise<void>;

  /**
   * Register a handler for incoming messages.
   */
  onMessage(handler: MessageHandler): void;

  /**
   * Register a handler for transport errors.
   */
  onError(handler: ErrorHandler): void;

  /**
   * Register a handler called when the transport is closed.
   */
  onClose(handler: CloseHandler): void;
}

/**
 * Base class providing handler registration boilerplate.
 * Concrete transports extend this and call the protected notify* methods.
 */
export abstract class BaseTransport implements MCPTransport {
  protected messageHandlers: MessageHandler[] = [];
  protected errorHandlers: ErrorHandler[] = [];
  protected closeHandlers: CloseHandler[] = [];

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  onError(handler: ErrorHandler): void {
    this.errorHandlers.push(handler);
  }

  onClose(handler: CloseHandler): void {
    this.closeHandlers.push(handler);
  }

  protected async notifyMessage(message: JsonRpcMessage): Promise<void> {
    for (const handler of this.messageHandlers) {
      await handler(message);
    }
  }

  protected notifyError(error: Error): void {
    for (const handler of this.errorHandlers) {
      handler(error);
    }
  }

  protected notifyClose(): void {
    for (const handler of this.closeHandlers) {
      handler();
    }
  }

  abstract start(): Promise<void>;
  abstract send(message: JsonRpcMessage): Promise<void>;
  abstract close(): Promise<void>;
}
