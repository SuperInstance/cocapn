/**
 * Module hook runner.
 *
 * Executes hooks/install.js (Node) or hooks/install.sh (shell) inside
 * the module's sandbox environment. Output is streamed to a callback.
 */

import { spawn } from "child_process";
import { existsSync, statSync } from "fs";
import { join } from "path";
import { buildSandboxEnv } from "./sandbox.js";
import type { ModuleType } from "./schema.js";

export type HookName = "install" | "enable" | "disable" | "update";
export type OutputCb = (line: string, stream: "stdout" | "stderr") => void;

const HOOK_TIMEOUT_MS = 60_000; // 1 minute max per hook

/**
 * Run a named lifecycle hook for a module.
 * Returns true on success (exit code 0 or hook not present).
 */
export async function runHook(opts: {
  repoRoot:   string;
  moduleName: string;
  moduleType: ModuleType;
  hookName:   HookName;
  hookFile:   string | undefined;
  output:     OutputCb | undefined;
}): Promise<boolean> {
  const { repoRoot, moduleName, moduleType, hookName, hookFile, output } = opts;

  // Resolve hook file relative to module dir
  const moduleDir = join(repoRoot, "modules", moduleName);
  const candidates = hookFile
    ? [join(moduleDir, hookFile)]
    : [
        join(moduleDir, "hooks", `${hookName}.js`),
        join(moduleDir, "hooks", `${hookName}.sh`),
      ];

  const hookPath = candidates.find((p) => existsSync(p));
  if (!hookPath) {
    // Hook not present — that's fine
    return true;
  }

  const env = {
    ...process.env,
    ...buildSandboxEnv(repoRoot, moduleName, moduleType),
  };

  const [cmd, args] = resolveRunner(hookPath);

  output?.(`[module:${moduleName}] Running ${hookName} hook…`, "stdout");

  return new Promise<boolean>((resolve) => {
    const child = spawn(cmd, [...args, hookPath], {
      cwd:   moduleDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) {
        if (line.trim()) output?.(line, "stdout");
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) {
        if (line.trim()) output?.(line, "stderr");
      }
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      output?.(`[module:${moduleName}] Hook timed out after ${HOOK_TIMEOUT_MS / 1000}s`, "stderr");
      resolve(false);
    }, HOOK_TIMEOUT_MS);

    child.on("close", (code) => {
      clearTimeout(timer);
      const ok = code === 0;
      if (!ok) {
        output?.(`[module:${moduleName}] Hook exited with code ${code ?? "null"}`, "stderr");
      }
      resolve(ok);
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      output?.(`[module:${moduleName}] Hook error: ${err.message}`, "stderr");
      resolve(false);
    });
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveRunner(hookPath: string): [string, string[]] {
  if (hookPath.endsWith(".sh")) {
    return ["sh", []];
  }
  // .js — use the node that's running this process
  return [process.execPath, []];
}

/** Check if a hook file exists without requiring the manifest to list it */
export function hookExists(
  repoRoot:   string,
  moduleName: string,
  hookName:   HookName
): boolean {
  const moduleDir = join(repoRoot, "modules", moduleName);
  return (
    existsSync(join(moduleDir, "hooks", `${hookName}.js`)) ||
    existsSync(join(moduleDir, "hooks", `${hookName}.sh`))
  );
}
