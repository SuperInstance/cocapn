/**
 * Health Check System
 *
 * Monitors system health and provides status reporting for all bridge components.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export type HealthStatus = 'ok' | 'warn' | 'error';

export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  message?: string;
  latency?: number;
  timestamp?: string;
}

export interface SystemHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: HealthCheckResult[];
  timestamp: string;
  uptime: number;
}

export interface HealthCheckOptions {
  timeout?: number; // Timeout in milliseconds
}

export type HealthCheckFunction = (options?: HealthCheckOptions) => Promise<HealthCheckResult>;

interface RegisteredCheck {
  name: string;
  check: HealthCheckFunction;
  enabled: boolean;
}

// ─── HealthChecker ─────────────────────────────────────────────────────────────

export class HealthChecker {
  private checks: Map<string, RegisteredCheck>;
  private startTime: number;

  constructor() {
    this.checks = new Map();
    this.startTime = Date.now();
  }

  /**
   * Register a health check
   */
  addCheck(name: string, check: HealthCheckFunction): void {
    this.checks.set(name, {
      name,
      check,
      enabled: true,
    });
  }

  /**
   * Remove a health check
   */
  removeCheck(name: string): boolean {
    return this.checks.delete(name);
  }

  /**
   * Enable a health check
   */
  enableCheck(name: string): boolean {
    const registeredCheck = this.checks.get(name);
    if (registeredCheck) {
      registeredCheck.enabled = true;
      return true;
    }
    return false;
  }

  /**
   * Disable a health check
   */
  disableCheck(name: string): boolean {
    const registeredCheck = this.checks.get(name);
    if (registeredCheck) {
      registeredCheck.enabled = false;
      return true;
    }
    return false;
  }

  /**
   * Run a single health check by name
   */
  async runCheck(name: string, options?: HealthCheckOptions): Promise<HealthCheckResult> {
    const registeredCheck = this.checks.get(name);
    if (!registeredCheck) {
      return {
        name,
        status: 'error',
        message: `Check '${name}' not found`,
        timestamp: new Date().toISOString(),
      };
    }

    if (!registeredCheck.enabled) {
      return {
        name,
        status: 'warn',
        message: 'Check disabled',
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const startTime = Date.now();
      const result = await Promise.race([
        registeredCheck.check(options),
        new Promise<HealthCheckResult>((_, reject) =>
          setTimeout(
            () => reject(new Error('Health check timeout')),
            options?.timeout || 5000
          )
        ),
      ]);
      const latency = Date.now() - startTime;

      return {
        ...result,
        latency,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        name,
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Run all enabled health checks
   */
  async runAll(options?: HealthCheckOptions): Promise<SystemHealthStatus> {
    const enabledChecks = Array.from(this.checks.values()).filter((c) => c.enabled);

    if (enabledChecks.length === 0) {
      return {
        status: 'healthy',
        checks: [],
        timestamp: new Date().toISOString(),
        uptime: Date.now() - this.startTime,
      };
    }

    const checkPromises = enabledChecks.map((c) => this.runCheck(c.name, options));
    const results = await Promise.allSettled(checkPromises);

    const checks: HealthCheckResult[] = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return {
        name: enabledChecks[index].name,
        status: 'error',
        message: result.reason instanceof Error ? result.reason.message : String(result.reason),
        timestamp: new Date().toISOString(),
      };
    });

    // Determine overall status
    const hasErrors = checks.some((c) => c.status === 'error');
    const hasWarnings = checks.some((c) => c.status === 'warn');

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (hasErrors) {
      status = 'unhealthy';
    } else if (hasWarnings) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    return {
      status,
      checks,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * Get the current uptime in milliseconds
   */
  getUptime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Export health status as JSON
   */
  async toJSON(options?: HealthCheckOptions): Promise<string> {
    const status = await this.runAll(options);
    return JSON.stringify(status, null, 2);
  }
}

// ─── Built-in Health Checks ────────────────────────────────────────────────────

/**
 * Check if the cloud worker is accessible
 */
export async function checkCloud(options?: {
  workerUrl?: string;
  timeout?: number;
}): HealthCheckFunction {
  const { workerUrl, timeout = 3000 } = options || {};

  return async (opts?: HealthCheckOptions) => {
    if (!workerUrl) {
      return {
        name: 'cloud',
        status: 'warn',
        message: 'Cloud worker not configured',
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), opts?.timeout || timeout);

      const response = await fetch(`${workerUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      }).finally(() => clearTimeout(timeoutId));

      if (response.ok) {
        return {
          name: 'cloud',
          status: 'ok',
          message: 'Cloud worker reachable',
        };
      }

      return {
        name: 'cloud',
        status: 'error',
        message: `Cloud worker returned ${response.status}`,
      };
    } catch (error) {
      return {
        name: 'cloud',
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };
}

/**
 * Check if the git repository is accessible
 */
export function checkGit(repoRoot: string): HealthCheckFunction {
  return async () => {
    const gitDir = join(repoRoot, '.git');

    if (!existsSync(gitDir)) {
      return {
        name: 'git',
        status: 'error',
        message: 'Git directory not found',
      };
    }

    const headFile = join(gitDir, 'HEAD');
    if (!existsSync(headFile)) {
      return {
        name: 'git',
        status: 'error',
        message: 'Git HEAD file not found',
      };
    }

    try {
      readFileSync(headFile, 'utf8');
      return {
        name: 'git',
        status: 'ok',
        message: 'Git repository accessible',
      };
    } catch (error) {
      return {
        name: 'git',
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };
}

/**
 * Check if the brain facts.json file is readable
 */
export function checkBrain(repoRoot: string, factsPath: string): HealthCheckFunction {
  return async () => {
    const factsFile = join(repoRoot, factsPath);

    if (!existsSync(factsFile)) {
      // Try to create the directory and file
      try {
        const dir = join(factsFile, '..');
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(factsFile, JSON.stringify({}, null, 2));
        return {
          name: 'brain',
          status: 'ok',
          message: 'Brain facts file created',
        };
      } catch (error) {
        return {
          name: 'brain',
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }

    try {
      const content = readFileSync(factsFile, 'utf8');
      JSON.parse(content);
      return {
        name: 'brain',
        status: 'ok',
        message: 'Brain facts file readable',
      };
    } catch (error) {
      return {
        name: 'brain',
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };
}

/**
 * Check if the disk is writable
 */
export function checkDisk(repoRoot: string): HealthCheckFunction {
  return async () => {
    const testFile = join(repoRoot, '.cocapn-write-test');

    try {
      writeFileSync(testFile, 'test', { flag: 'wx' });
      // Clean up
      const fs = await import('fs/promises');
      await fs.unlink(testFile);

      return {
        name: 'disk',
        status: 'ok',
        message: 'Disk writable',
      };
    } catch (error) {
      return {
        name: 'disk',
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };
}

/**
 * Check if the WebSocket server is running
 */
export function checkWebSocket(port: number): HealthCheckFunction {
  return async (opts?: HealthCheckOptions) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), opts?.timeout || 2000);

      const response = await fetch(`http://localhost:${port}/health`, {
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (response.ok) {
        return {
          name: 'websocket',
          status: 'ok',
          message: `WebSocket server listening on port ${port}`,
        };
      }

      return {
        name: 'websocket',
        status: 'error',
        message: `WebSocket server returned ${response.status}`,
      };
    } catch (error) {
      return {
        name: 'websocket',
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };
}
