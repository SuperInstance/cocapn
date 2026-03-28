/**
 * Module sandbox — enforces write boundaries for hook execution.
 *
 * A module hook may write to:
 *   - modules/<name>/          (its own directory — always allowed)
 *   - wiki/, tasks/            (shared log areas)
 *   - cocapn/memory/           (memory store)
 *   - cocapn/agents/           (agent definitions — agent modules only)
 *   - skin/                    (CSS/layout — skin modules only)
 *
 * Reads are unrestricted (modules need to inspect repo state).
 */

import { resolve, relative } from "path";
import { ALLOWED_WRITE_DIRS } from "./schema.js";
import type { ModuleType } from "./schema.js";

// ─── Sandbox environment for hook processes ───────────────────────────────────

export interface SandboxEnv {
  /** Repo root — exposed so hooks know where they are */
  COCAPN_REPO_ROOT: string;
  /** Module's own directory */
  COCAPN_MODULE_DIR: string;
  /** Colon-separated list of directories the module may write to */
  COCAPN_ALLOWED_WRITE_DIRS: string;
  /** Module name */
  COCAPN_MODULE_NAME: string;
  /** Module type */
  COCAPN_MODULE_TYPE: string;
  /** Current cocapn version */
  COCAPN_VERSION: string;
  /** Node.js to use for sub-hooks */
  PATH: string;
}

export function buildSandboxEnv(
  repoRoot:   string,
  moduleName: string,
  moduleType: ModuleType
): SandboxEnv {
  const moduleDir = resolve(repoRoot, "modules", moduleName);

  // Build the allowed write dir list: own dir + shared dirs
  const allowedDirs = [
    moduleDir,
    ...ALLOWED_WRITE_DIRS.map((d) => resolve(repoRoot, d)),
  ];

  return {
    COCAPN_REPO_ROOT:          repoRoot,
    COCAPN_MODULE_DIR:         moduleDir,
    COCAPN_ALLOWED_WRITE_DIRS: allowedDirs.join(":"),
    COCAPN_MODULE_NAME:        moduleName,
    COCAPN_MODULE_TYPE:        moduleType,
    COCAPN_VERSION:            "0.1.0",
    PATH:                      process.env["PATH"] ?? "/usr/local/bin:/usr/bin:/bin",
  };
}

/**
 * Verify that an absolute path is within the sandbox for a given module.
 * Used by the module manager before writing files on behalf of a module.
 */
export function isPathAllowed(
  absPath:    string,
  repoRoot:   string,
  moduleName: string
): boolean {
  const moduleDir = resolve(repoRoot, "modules", moduleName);
  if (absPath.startsWith(moduleDir + "/") || absPath === moduleDir) return true;

  const rel = relative(repoRoot, absPath);
  // Must not start with ".." (escape) and must be under an allowed dir
  if (rel.startsWith("..")) return false;

  return ALLOWED_WRITE_DIRS.some(
    (d) => rel === d || rel.startsWith(d + "/")
  );
}
