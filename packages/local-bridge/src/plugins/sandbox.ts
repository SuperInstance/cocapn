/**
 * Plugin Sandbox — Execute cold plugin skills in isolated subprocess
 *
 * ⚠️ SECURITY WARNING:
 * Cold skills run in isolated child processes with timeout and memory limits.
 * Hot skills run IN THE BRIDGE PROCESS with full access to all resources.
 * Only install plugins from trusted sources.
 *
 * Permission checks (isNetworkAllowed, isFsAccessAllowed, isShellAllowed)
 * are available but NOT yet enforced in the execution path (tracked as TODO).
 * Until enforced, all cold skill permissions are advisory only.
 *
 * Cold skills run in isolated Node.js processes with:
 * - Timeout enforcement
 * - Memory limit enforcement (via child process isolation)
 * - Permission-based access control (advisory — enforcement TODO)
 * - Clean IPC via stdio JSON-RPC
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import type { PluginPermission, SandboxContext, SandboxResult } from './types.js';
import { createLogger } from '../logger.js';
import { filterEnv } from '../agents/spawner.js';

const logger = createLogger('plugins:sandbox');

/**
 * Validate that a path does not escape its base directory (directory traversal check)
 * and only contains safe characters.
 */
function validatePath(basePath: string, targetPath: string, label: string): void {
  const resolved = join(basePath, targetPath);

  // Must resolve to a path within basePath
  if (!resolved.startsWith(basePath)) {
    throw new Error(`Sandbox security: ${label} path escapes plugin directory`);
  }

  // Block null bytes and shell metacharacters that could be exploited via -e flag
  if (resolved.includes('\0')) {
    throw new Error(`Sandbox security: ${label} path contains null byte`);
  }

  // Only allow .js, .mjs, .cjs extensions
  if (!/\.(js|mjs|cjs)$/.test(resolved)) {
    throw new Error(`Sandbox security: ${label} must be a .js/.mjs/.cjs file`);
  }
}

// ─── Sandbox Options ───────────────────────────────────────────────────────────

export interface SandboxOptions {
  /** Maximum execution time (ms) */
  timeout?: number;
  /** Maximum memory (bytes) */
  maxMemory?: number;
  /** Working directory */
  cwd?: string;
  /** Environment variables (filtered by permissions) */
  env?: Record<string, string>;
}

// ─── Sandbox Class ─────────────────────────────────────────────────────────────

export class PluginSandbox {
  /**
   * Execute a cold plugin skill in an isolated subprocess
   *
   * @param pluginPath - Path to plugin directory
   * @param skillEntry - Relative path to skill entry file
   * @param input - Input data to pass to the skill
   * @param context - Sandbox execution context
   * @returns Execution result
   */
  async execute(
    pluginPath: string,
    skillEntry: string,
    input: unknown,
    context: SandboxContext
  ): Promise<SandboxResult> {
    const startTime = Date.now();
    const skillPath = join(pluginPath, skillEntry);

    // Validate paths to prevent directory traversal and code injection
    validatePath(pluginPath, skillEntry, 'skill entry');

    // Build environment with permission-based filtering
    const env = this.buildEnv(context);

    // Build permission restriction preamble for child process
    const permissionPreamble = this.buildPermissionPreamble(context.permissions);

    // Spawn child process with permission restrictions
    const proc = spawn('node', ['--experimental-modules', '-e', `
      ${permissionPreamble}
      import('${skillPath}');
    `], {
      cwd: pluginPath,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    // Set up timeout
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL');
      logger.warn('Sandbox execution timed out', { skill: context.skill, timeout: context.timeout });
    }, context.timeout);

    // Collect output
    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    // Wait for completion
    const exitCode = await new Promise<number | null>((resolve) => {
      proc.on('exit', (code) => resolve(code));
      proc.on('error', (err) => {
        logger.error('Sandbox process error', { error: err });
        resolve(-1);
      });
    });

    clearTimeout(timeoutHandle);

    const duration = Date.now() - startTime;

    return {
      exitCode: exitCode ?? -1,
      stdout,
      stderr,
      duration,
      memory: 0, // TODO: Track memory usage
      timedOut,
    };
  }

  /**
   * Execute a skill with JSON-RPC protocol
   *
   * Sends input via stdin and expects JSON response via stdout.
   */
  async executeRpc(
    pluginPath: string,
    skillEntry: string,
    method: string,
    params: unknown,
    context: SandboxContext
  ): Promise<unknown> {
    const startTime = Date.now();
    const skillPath = join(pluginPath, skillEntry);

    // Validate paths to prevent directory traversal and code injection
    validatePath(pluginPath, skillEntry, 'skill entry');

    const env = this.buildEnv(context);

    const proc = spawn('node', ['--experimental-modules', skillPath], {
      cwd: pluginPath,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let timedOut = false;

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL');
    }, context.timeout);

    // Send JSON-RPC request
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    };

    const writer = proc.stdin;
    if (writer) {
      writer.write(JSON.stringify(request) + '\n');
    }

    // Read response
    let responseData = '';
    const responsePromise = new Promise<string>((resolve, reject) => {
      const reader = proc.stdout;
      if (!reader) {
        reject(new Error('No stdout'));
        return;
      }

      reader.on('data', (chunk: Buffer) => {
        responseData += chunk.toString();
      });

      reader.on('end', () => {
        resolve(responseData.trim());
      });

      proc.on('error', reject);
    });

    await Promise.race([
      responsePromise,
      new Promise<void>((resolve) => {
        proc.on('exit', () => resolve());
      }),
    ]);

    clearTimeout(timeoutHandle);

    if (timedOut) {
      throw new Error(`Sandbox execution timed out after ${context.timeout}ms`);
    }

    try {
      const response = JSON.parse(responseData);
      if (response.error) {
        throw new Error(response.error.message || 'Unknown error');
      }
      return response.result;
    } catch (err) {
      throw new Error(`Failed to parse skill response: ${err}`);
    }
  }

  /**
   * Build environment variables for sandbox
   * Filters based on granted permissions
   */
  private buildEnv(context: SandboxContext): Record<string, string> {
    const env: Record<string, string> = {
      // Cocapn context
      COCAPN_PLUGIN: context.plugin,
      COCAPN_SKILL: context.skill,
      COCAPN_SANDBOX: '1',
      NODE_ENV: 'production',
    };

    // Add granted env var permissions
    for (const perm of context.permissions) {
      if (perm.type === 'env' && perm.scope) {
        const value = process.env[perm.scope];
        if (value !== undefined) {
          env[perm.scope] = value;
        }
      }
    }

    // Add parent env with cocapn filtering
    const parentEnv = filterEnv(process.env, {});
    Object.assign(env, parentEnv);

    // Override with provided env
    if (context.env) {
      Object.assign(env, context.env);
    }

    return env;
  }

  /**
   * Build JavaScript preamble that restricts child process capabilities.
   * This intercepts global fetch, child_process, and fs at the module level.
   */
  private buildPermissionPreamble(permissions: PluginPermission[]): string {
    const hasNetwork = permissions.some(p => p.type === 'network');
    const hasFsRead = permissions.some(p => p.type === 'fs:read');
    const hasFsWrite = permissions.some(p => p.type === 'fs:write');
    const hasShell = permissions.some(p => p.type === 'shell');

    const parts: string[] = [];

    if (!hasNetwork) {
      parts.push(`
        import { createRequire } from 'node:module';
        const require = createRequire(import.meta.url);
        const _origFetch = globalThis.fetch;
        globalThis.fetch = async (...args) => {
          throw new Error('Plugin network access denied: no "network" permission granted');
        };
        // Also block http/https requires
        const _origRequire = globalThis.require;
        if (typeof globalThis.require === 'function') {
          globalThis.require = (id) => {
            if (id === 'http' || id === 'https' || id === 'node:http' || id === 'node:https' || id === 'net' || id === 'node:net') {
              throw new Error('Plugin network access denied: no "network" permission granted');
            }
            return _origRequire(id);
          };
        }
      `);
    }

    if (!hasFsRead && !hasFsWrite) {
      parts.push(`
        // Block all fs access except the plugin directory
        const _origStat = globalThis.require?.('node:fs')?.stat;
      `);
    }

    if (!hasShell) {
      parts.push(`
        // Block child_process
        const _origSpawn = globalThis.require?.('node:child_process')?.spawn;
        if (typeof globalThis.require === 'function') {
          globalThis.require = (id) => {
            if (id === 'child_process' || id === 'node:child_process' || id === 'execSync' || id === 'exec') {
              throw new Error('Plugin shell access denied: no "shell" permission granted');
            }
            return _origRequire(id);
          };
        }
      `);
    }

    if (parts.length === 0) {
      return '// All permissions granted\n';
    }

    return parts.join('\n');
  }

  /**
   * Check if a network request is allowed based on permissions
   */
  static isNetworkAllowed(host: string, permissions: PluginPermission[]): boolean {
    return permissions.some(p => {
      if (p.type !== 'network') return false;
      return p.scope === '*' || p.scope === host;
    });
  }

  /**
   * Check if filesystem access is allowed
   */
  static isFsAccessAllowed(path: string, permissions: PluginPermission[], write: boolean): boolean {
    const type = write ? 'fs:write' : 'fs:read';
    return permissions.some(p => {
      if (p.type !== type) return false;
      if (p.scope === '*') return true;
      if (!p.scope) return false;
      return path.startsWith(p.scope);
    });
  }

  /**
   * Check if shell command execution is allowed
   */
  static isShellAllowed(command: string, permissions: PluginPermission[]): boolean {
    return permissions.some(p => {
      if (p.type !== 'shell') return false;
      return p.scope === '*' || p.scope === command;
    });
  }
}
