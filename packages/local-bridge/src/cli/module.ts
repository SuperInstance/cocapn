/**
 * `cocapn module` sub-commands.
 *
 * Usage (via cocapn-bridge binary):
 *   cocapn-bridge module add <git-url>   [--repo <path>]
 *   cocapn-bridge module remove <name>   [--repo <path>]
 *   cocapn-bridge module update <name>   [--repo <path>]
 *   cocapn-bridge module list            [--repo <path>]
 */

import { Command } from "commander";
import { resolve } from "path";
import { ModuleManager } from "../modules/manager.js";

export function buildModuleCommand(): Command {
  const cmd = new Command("module").description("Manage Cocapn extension modules");

  // ── add ──────────────────────────────────────────────────────────────────

  cmd
    .command("add <git-url>")
    .description("Clone a module as git submodule and run its install hook")
    .option("--repo <path>", "Private repo root", process.cwd())
    .action(async (gitUrl: string, opts: { repo: string }) => {
      const repoRoot = resolve(opts.repo);
      const manager = new ModuleManager(repoRoot);
      try {
        const mod = await manager.add(gitUrl, (line, stream) => {
          (stream === "stderr" ? console.error : console.log)(line);
        });
        console.log(`\n✓ Installed: ${mod.name}@${mod.version} [${mod.type}]`);
        if (mod.error) console.error(`  Warning: ${mod.error}`);
      } catch (err) {
        console.error("Error:", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // ── remove ────────────────────────────────────────────────────────────────

  cmd
    .command("remove <name>")
    .description("Remove an installed module and run its disable hook")
    .option("--repo <path>", "Private repo root", process.cwd())
    .action(async (name: string, opts: { repo: string }) => {
      const repoRoot = resolve(opts.repo);
      const manager = new ModuleManager(repoRoot);
      try {
        await manager.remove(name, (line, stream) => {
          (stream === "stderr" ? console.error : console.log)(line);
        });
        console.log(`\n✓ Removed: ${name}`);
      } catch (err) {
        console.error("Error:", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // ── update ────────────────────────────────────────────────────────────────

  cmd
    .command("update <name>")
    .description("Pull latest commits for a module and run its update hook")
    .option("--repo <path>", "Private repo root", process.cwd())
    .action(async (name: string, opts: { repo: string }) => {
      const repoRoot = resolve(opts.repo);
      const manager = new ModuleManager(repoRoot);
      try {
        const mod = await manager.update(name, (line, stream) => {
          (stream === "stderr" ? console.error : console.log)(line);
        });
        console.log(`\n✓ Updated: ${mod.name}@${mod.version}`);
      } catch (err) {
        console.error("Error:", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // ── list ──────────────────────────────────────────────────────────────────

  cmd
    .command("list")
    .description("Show installed modules and their status")
    .option("--repo <path>", "Private repo root", process.cwd())
    .option("--json", "Output as JSON")
    .action((opts: { repo: string; json?: boolean }) => {
      const repoRoot = resolve(opts.repo);
      const manager = new ModuleManager(repoRoot);
      const mods = manager.list();

      if (opts.json) {
        console.log(JSON.stringify(mods, null, 2));
        return;
      }

      if (mods.length === 0) {
        console.log("No modules installed. Run: cocapn-bridge module add <git-url>");
        return;
      }

      console.log("\nInstalled modules:\n");
      for (const m of mods) {
        const statusIcon = m.status === "enabled" ? "✓" : m.status === "disabled" ? "○" : "✗";
        console.log(`  ${statusIcon} ${m.name}@${m.version}  [${m.type}]  ${m.status}`);
        console.log(`    ${m.description}`);
        if (m.error) console.error(`    ! ${m.error}`);
      }
      console.log();
    });

  return cmd;
}
