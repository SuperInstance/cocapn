/**
 * `cocapn-brain` CLI — direct access to the private repo memory layer.
 *
 * Usage:
 *   cocapn-brain fact get <key>          [--repo <path>]
 *   cocapn-brain fact set <key> <value>  [--repo <path>]
 *   cocapn-brain fact list               [--repo <path>]
 *   cocapn-brain wiki add <file>         [--repo <path>]
 *   cocapn-brain task add "<title>"      [--repo <path>] [--desc <text>]
 *   cocapn-brain task list               [--repo <path>]
 *   cocapn-brain profile export          [--repo <path>] [--public <path>]
 */

import { Command } from "commander";
import { resolve } from "path";
import { Brain } from "../brain/index.js";
import { loadConfig } from "../config/loader.js";
import { GitSync } from "../git/sync.js";
import { createProfileManager } from "../publishing/profile.js";
import type { BridgeConfig } from "../config/types.js";

// ---------------------------------------------------------------------------
// Root command builder (exported so main.ts can also add as sub-command)
// ---------------------------------------------------------------------------

export function buildBrainCommand(): Command {
  const cmd = new Command("brain").description(
    "Read and write the agent memory in the private repo"
  );

  // ── fact sub-commands ────────────────────────────────────────────────────

  const fact = new Command("fact").description("Manage key-value facts");

  fact
    .command("get <key>")
    .description("Read a fact value by key")
    .option("--repo <path>", "Private repo root", process.cwd())
    .action((key: string, opts: { repo: string }) => {
      const brain = makeBrain(opts.repo);
      const value = brain.getFact(key);
      if (value === undefined) {
        console.log(`(no fact found for key: ${key})`);
      } else {
        console.log(value);
      }
    });

  fact
    .command("set <key> <value>")
    .description("Store a fact (overwrites existing)")
    .option("--repo <path>", "Private repo root", process.cwd())
    .action(async (key: string, value: string, opts: { repo: string }) => {
      const brain = makeBrain(opts.repo);
      await brain.setFact(key, value);
      console.log(`✓ Stored: ${key} = ${value}`);
    });

  fact
    .command("list")
    .description("Print all stored facts")
    .option("--repo <path>", "Private repo root", process.cwd())
    .action((opts: { repo: string }) => {
      const brain = makeBrain(opts.repo);
      const facts = brain.getAllFacts();
      const keys = Object.keys(facts);
      if (keys.length === 0) {
        console.log("(no facts stored)");
        return;
      }
      for (const [k, v] of Object.entries(facts)) {
        console.log(`${k}: ${v}`);
      }
    });

  cmd.addCommand(fact);

  // ── wiki sub-commands ────────────────────────────────────────────────────

  const wiki = new Command("wiki").description("Manage the wiki knowledge base");

  wiki
    .command("add <file>")
    .description("Copy a local markdown file into cocapn/wiki/")
    .option("--repo <path>", "Private repo root", process.cwd())
    .option("--name <name>", "Destination filename (default: source filename)")
    .action(async (file: string, opts: { repo: string; name?: string }) => {
      const brain = makeBrain(opts.repo);
      const source = resolve(file);
      await brain.addWikiPage(source, opts.name);
      console.log(`✓ Added wiki page: ${opts.name ?? file}`);
    });

  wiki
    .command("search <query>")
    .description("Search wiki pages for a query string")
    .option("--repo <path>", "Private repo root", process.cwd())
    .action((query: string, opts: { repo: string }) => {
      const brain = makeBrain(opts.repo);
      const results = brain.searchWiki(query);
      if (results.length === 0) {
        console.log("(no pages matched)");
        return;
      }
      for (const page of results) {
        console.log(`\n${page.title} (${page.file})`);
        console.log(`  ${page.excerpt}`);
      }
    });

  cmd.addCommand(wiki);

  // ── task sub-commands ────────────────────────────────────────────────────

  const task = new Command("task").description("Manage tasks");

  task
    .command("add <title>")
    .description("Create a new task in cocapn/tasks/")
    .option("--repo <path>", "Private repo root", process.cwd())
    .option("--desc <text>", "Task description", "")
    .action(async (title: string, opts: { repo: string; desc: string }) => {
      const brain = makeBrain(opts.repo);
      const id = await brain.createTask(title, opts.desc);
      console.log(`✓ Task created: ${id}`);
    });

  task
    .command("list")
    .description("List active tasks")
    .option("--repo <path>", "Private repo root", process.cwd())
    .action((opts: { repo: string }) => {
      const brain = makeBrain(opts.repo);
      const tasks = brain.listTasks();
      const active = tasks.filter((t) => t.status === "active");
      if (active.length === 0) {
        console.log("(no active tasks)");
        return;
      }
      for (const t of active) {
        console.log(`• [${t.id}] ${t.title}`);
        if (t.description) console.log(`    ${t.description.slice(0, 80)}`);
      }
    });

  cmd.addCommand(task);

  // ── profile sub-commands ──────────────────────────────────────────────────

  const profile = new Command("profile").description("Manage user profile");

  profile
    .command("generate")
    .description("Generate profile from private repo (prints JSON)")
    .option("--repo <path>", "Private repo root", process.cwd())
    .action((opts: { repo: string }) => {
      const { brain, config, sync } = makeBrainWithDeps(opts.repo);
      const manager = createProfileManager(
        resolve(opts.repo),
        resolve(opts.repo, "..", "public"),
        brain,
        config,
        sync
      );
      const profile = manager.generateProfile();
      console.log(JSON.stringify(profile, null, 2));
    });

  profile
    .command("export")
    .description("Export signed profile to public repo")
    .option("--repo <path>", "Private repo root", process.cwd())
    .option("--public <path>", "Public repo root (default: ../public)")
    .action(async (opts: { repo: string; public?: string }) => {
      const { brain, config, sync } = makeBrainWithDeps(opts.repo);
      const publicRepo = opts.public ?? resolve(opts.repo, "..", "public");
      const manager = createProfileManager(
        resolve(opts.repo),
        publicRepo,
        brain,
        config,
        sync
      );
      await manager.exportProfile();
      const profile = manager.generateProfile();
      console.log(`✓ Profile exported: ${profile.displayName || "user"}`);
    });

  cmd.addCommand(profile);

  return cmd;
}

// ---------------------------------------------------------------------------
// Entry point for standalone `cocapn-brain` binary
// ---------------------------------------------------------------------------

export function runBrainCli(): void {
  const program = new Command();
  program
    .name("cocapn-brain")
    .description("Cocapn brain — direct access to agent memory")
    .version("0.1.0");

  // Re-register sub-commands at root level for the standalone binary
  // e.g. `cocapn-brain fact set` instead of `cocapn-brain brain fact set`
  const brain = buildBrainCommand();
  for (const sub of brain.commands) {
    program.addCommand(sub.copyInheritedSettings(program));
  }

  program.parse();
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeBrain(repoPath: string): Brain {
  const { brain } = makeBrainWithDeps(repoPath);
  return brain;
}

function makeBrainWithDeps(repoPath: string): {
  brain: Brain;
  config: BridgeConfig;
  sync: GitSync;
} {
  const repoRoot = resolve(repoPath);
  const config = loadConfig(repoRoot);
  // For CLI usage, auto-push is disabled — we only commit locally
  const sync = new GitSync(repoRoot, {
    ...config,
    sync: { ...config.sync, autoPush: false },
  });
  const brain = new Brain(repoRoot, config, sync);
  return { brain, config, sync };
}
