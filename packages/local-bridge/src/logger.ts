/**
 * Structured logger for the local-bridge.
 *
 * Behaviour:
 *   COCAPN_LOG_FORMAT=json  → JSON-lines to stdout
 *   (default)               → human-readable "[module] level: msg  key=val …"
 *
 * Usage:
 *   import { createLogger } from "./logger.js";
 *   const log = createLogger("ws");
 *   log.info("Client connected", { clientId: "abc" });
 */

// ─── Types ────────────────────────────────────────────────────────────────────

type Level = "debug" | "info" | "warn" | "error";

// ─── Logger class ─────────────────────────────────────────────────────────────

export class Logger {
  private readonly module: string;
  private readonly json: boolean;

  constructor(module: string) {
    this.module = module;
    this.json = process.env["COCAPN_LOG_FORMAT"] === "json";
  }

  info(msg: string, data?: Record<string, unknown>): void {
    this.emit("info", msg, undefined, data);
  }

  warn(msg: string, data?: Record<string, unknown>): void {
    this.emit("warn", msg, undefined, data);
  }

  error(msg: string, err?: Error | unknown, data?: Record<string, unknown>): void {
    this.emit("error", msg, err, data);
  }

  debug(msg: string, data?: Record<string, unknown>): void {
    this.emit("debug", msg, undefined, data);
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private emit(
    level: Level,
    msg: string,
    err?: Error | unknown,
    data?: Record<string, unknown>
  ): void {
    if (this.json) {
      this.emitJson(level, msg, err, data);
    } else {
      this.emitHuman(level, msg, err, data);
    }
  }

  private emitJson(
    level: Level,
    msg: string,
    err?: Error | unknown,
    data?: Record<string, unknown>
  ): void {
    const entry: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      module: this.module,
      msg,
      ...data,
    };

    if (err !== undefined) {
      if (err instanceof Error) {
        entry["error"] = err.message;
        if (err.stack) entry["stack"] = err.stack;
      } else {
        entry["error"] = String(err);
      }
    }

    process.stdout.write(JSON.stringify(entry) + "\n");
  }

  private emitHuman(
    level: Level,
    msg: string,
    err?: Error | unknown,
    data?: Record<string, unknown>
  ): void {
    const prefix = `[${this.module}]`;
    let line = `${prefix} ${level}: ${msg}`;

    if (data && Object.keys(data).length > 0) {
      const pairs = Object.entries(data)
        .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
        .join("  ");
      line += `  ${pairs}`;
    }

    if (err !== undefined) {
      const errStr = err instanceof Error ? err.message : String(err);
      line += `  error=${errStr}`;
      if (err instanceof Error && err.stack) {
        line += `\n${err.stack}`;
      }
    }

    if (level === "error" || level === "warn") {
      process.stderr.write(line + "\n");
    } else {
      process.stdout.write(line + "\n");
    }
  }
}

// ─── Factory & singleton ──────────────────────────────────────────────────────

/**
 * Create a named Logger instance.
 */
export function createLogger(module: string): Logger {
  return new Logger(module);
}

/**
 * Default singleton logger tagged as "bridge".
 * Import this for quick ad-hoc logging in the main process.
 */
export const logger = createLogger("bridge");
