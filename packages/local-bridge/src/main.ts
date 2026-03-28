#!/usr/bin/env node
/**
 * cocapn-bridge CLI
 *
 * Usage:
 *   npx cocapn-bridge --repo ./my-log
 *   npx cocapn-bridge --repo ./my-log --port 9000 --tunnel
 *   npx cocapn-bridge --repo ./my-log --no-auth   (disable GitHub PAT auth for local dev)
 */

import { Command } from "commander";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";
import { Bridge } from "./bridge.js";
import { buildModuleCommand } from "./cli/module.js";

const program = new Command();

program
  .name("cocapn-bridge")
  .description("Local WebSocket bridge for the Cocapn hybrid agent OS")
  .version("0.1.0")
  .option(
    "--repo <path>",
    "Path to the private repo root (default: current directory)",
    process.cwd()
  )
  .option(
    "--repo-path <path>",
    "Alias for --repo"
  )
  .option(
    "--public <path>",
    "Path to the public repo root (default: same as --repo)"
  )
  .option(
    "--port <number>",
    "WebSocket server port (default: 8787)",
    (v) => parseInt(v, 10)
  )
  .option(
    "--tunnel",
    "Start a Cloudflare tunnel via cloudflared (requires cloudflared in PATH)"
  )
  .option(
    "--no-auth",
    "Disable GitHub PAT authentication (for local development only)"
  )
  .action(async (opts: {
    repo: string;
    repoPath?: string;
    public?: string;
    port?: number;
    tunnel?: boolean;
    auth: boolean; // commander inverts --no-auth to auth=false
  }) => {
    const privateRepoRoot = resolve(opts.repoPath ?? opts.repo);
    const publicRepoRoot = resolve(opts.public ?? privateRepoRoot);

    if (!existsSync(privateRepoRoot)) {
      console.error(`[bridge] Repo path does not exist: ${privateRepoRoot}`);
      process.exit(1);
    }

    const bridge = new Bridge({
      privateRepoRoot,
      publicRepoRoot,
      port: opts.port ?? undefined,
      skipAuth: !opts.auth,
    });

    // Graceful shutdown
    let stopping = false;
    const shutdown = async () => {
      if (stopping) return;
      stopping = true;
      await bridge.stop();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    try {
      await bridge.start();
    } catch (err) {
      console.error("[bridge] Failed to start:", err);
      process.exit(1);
    }

    // Start Cloudflare tunnel after bridge is running
    if (opts.tunnel) {
      startTunnel(bridge.getConfig().config.port);
    }
  });

program.addCommand(buildModuleCommand());

program.parse();

// ---------------------------------------------------------------------------
// Cloudflare tunnel
// ---------------------------------------------------------------------------

function startTunnel(port: number): void {
  const cloudflared = findCloudflared();
  if (!cloudflared) {
    console.error(
      "[tunnel] cloudflared not found in PATH. Install it from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/"
    );
    return;
  }

  console.info(`[tunnel] Starting Cloudflare tunnel for port ${port}…`);

  const child = spawn(cloudflared, ["tunnel", "--url", `ws://localhost:${port}`], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().split("\n");
    for (const line of lines) {
      if (line.includes("trycloudflare.com") || line.includes(".cfargotunnel.com")) {
        // Extract the public URL from cloudflared output
        const match = line.match(/https?:\/\/[a-z0-9-]+\.(trycloudflare|cfargotunnel)\.com/);
        if (match) {
          console.info(`[tunnel] Public URL: ${match[0].replace("https://", "wss://")}`);
        }
      }
    }
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) console.info(`[tunnel] ${text}`);
  });

  child.on("exit", (code) => {
    if (code !== 0) {
      console.warn(`[tunnel] cloudflared exited with code ${code}`);
    }
  });

  child.on("error", (err) => {
    console.error("[tunnel] Failed to start cloudflared:", err.message);
  });
}

function findCloudflared(): string | null {
  // Check common install locations in addition to PATH
  const candidates = [
    "cloudflared",
    "/usr/local/bin/cloudflared",
    "/usr/bin/cloudflared",
  ];
  for (const candidate of candidates) {
    try {
      // A simple existence check for absolute paths
      if (candidate.startsWith("/") && existsSync(candidate)) return candidate;
      if (!candidate.startsWith("/")) return candidate; // Assume PATH resolution works
    } catch {
      // ignore
    }
  }
  return null;
}
