/**
 * Cocapn CLI — Unified CLI tool for cocapn management
 *
 * Usage:
 *   cocapn setup [dir]         — Interactive onboarding wizard
 *   cocapn init [dir]          — Alias for setup
 *   cocapn start               — Start the bridge
 *   cocapn chat                — Interactive terminal chat
 *   cocapn status              — Show bridge status
 *   cocapn deploy              — Deploy to Cloudflare Workers
 *   cocapn rollback            — Rollback deployment
 *   cocapn skill list          — List available skills
 *   cocapn template search <q> — Search template registry
 *   cocapn tokens              — Show token usage stats
 *   cocapn health              — Health check
 *   cocapn memory list         — List all memory entries
 *   cocapn memory get <key>    — Get a specific entry
 *   cocapn memory set <k> <v>  — Set a fact
 *   cocapn memory delete <key> — Delete a fact
 *   cocapn memory search <q>   — Search memory
 *   cocapn export brain        — Export entire brain
 *   cocapn export chat <id>    — Export chat history
 *   cocapn export wiki         — Export wiki as markdown
 *   cocapn export knowledge    — Export knowledge entries
 *   cocapn sync                — Sync repos (private + public)
 *   cocapn sync status         — Show sync status
 *   cocapn sync pull           — Pull from remotes
 *   cocapn wiki list           — List wiki pages
 *   cocapn wiki get <slug>     — Show wiki page
 *   cocapn wiki new <slug>     — Create wiki page
 *   cocapn wiki edit <slug>    — Edit wiki page
 *   cocapn wiki search <query> — Search wiki
 *   cocapn wiki delete <slug>  — Delete wiki page
 *   cocapn config show         — Show current config
 *   cocapn config get <key>    — Get a config value
 *   cocapn config set <k> <v>  — Set a config value
 *   cocapn config reset        — Reset to defaults
 *   cocapn config validate     — Validate config
 *   cocapn logs                — Show recent agent logs
 *   cocapn logs search <query> — Search logs
 *   cocapn version             — Show version
 */

import { Command } from "commander";
import { existsSync } from "fs";
import { join } from "path";
import { createInitCommand } from "./commands/init.js";
import { createSetupCommand } from "./commands/setup.js";
import { createStartCommand } from "./commands/start.js";
import { createStatusCommand } from "./commands/status.js";
import { createDeployCommand } from "./commands/deploy.js";
import { createRollbackCommand } from "./commands/rollback.js";
import { createSkillsCommand } from "./commands/skills.js";
import { createTemplateCommand } from "./commands/templates.js";
import { createTokensCommand } from "./commands/tokens.js";
import { createHealthCommand } from "./commands/health.js";
import { createPluginCommand } from "./commands/plugin.js";
import { createPersonalityCommand } from "./commands/personality.js";
import { createRunCommand } from "./commands/run.js";
import { createTelemetryCommand } from "./commands/telemetry.js";
import { createChatCommand } from "./commands/chat.js";
import { createMemoryCommand } from "./commands/memory.js";
import { createExportCommand } from "./commands/export.js";
import { createSyncCommand } from "./commands/sync.js";
import { createWikiCommand } from "./commands/wiki.js";
import { createFleetCommand } from "./commands/fleet.js";
import { createConfigCommand } from "./commands/config.js";
import { createLogsCommand } from "./commands/logs.js";
import { createDoctorCommand } from "./commands/doctor.js";
import { createUpgradeCommand } from "./commands/upgrade.js";
import { createResetCommand } from "./commands/reset.js";

const VERSION = "0.1.0";

export function createCLI(): Command {
  const program = new Command();

  program
    .name("cocapn")
    .description("Unified CLI tool for cocapn agent runtime and fleet protocol")
    .version(VERSION);

  // Core commands
  program.addCommand(createSetupCommand());
  program.addCommand(createInitCommand()); // init delegates to setup
  program.addCommand(createStartCommand());
  program.addCommand(createStatusCommand());
  program.addCommand(createChatCommand());

  // Memory commands
  program.addCommand(createMemoryCommand());

  // Export commands
  program.addCommand(createExportCommand());

  // Sync commands
  program.addCommand(createSyncCommand());

  // Wiki commands
  program.addCommand(createWikiCommand());

  // Deploy commands
  program.addCommand(createDeployCommand());
  program.addCommand(createRollbackCommand());

  // Skill commands
  program.addCommand(createSkillsCommand());

  // Template commands
  program.addCommand(createTemplateCommand());

  // Plugin commands
  program.addCommand(createPluginCommand());

  // Personality commands
  program.addCommand(createPersonalityCommand());

  // CI commands
  program.addCommand(createRunCommand());

  // Telemetry commands
  program.addCommand(createTelemetryCommand());

  // Fleet commands
  program.addCommand(createFleetCommand());

  // Config commands
  program.addCommand(createConfigCommand());

  // Utility commands
  program.addCommand(createTokensCommand());
  program.addCommand(createHealthCommand());

  // Logs commands
  program.addCommand(createLogsCommand());

  // Doctor command
  program.addCommand(createDoctorCommand());

  // Upgrade command
  program.addCommand(createUpgradeCommand());

  // Reset command
  program.addCommand(createResetCommand());

  return program;
}

// Run CLI if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  const cli = createCLI();

  // Suggest setup if no command given and no cocapn/ dir exists
  const hasExplicitCommand = process.argv.length > 2 && !process.argv[2].startsWith("-");
  if (!hasExplicitCommand) {
    const cocapnDir = join(process.cwd(), "cocapn");
    if (!existsSync(cocapnDir)) {
      console.log("No cocapn/ directory found. Run cocapn setup to get started.\n");
    }
  }

  cli.parse();
}
