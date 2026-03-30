/**
 * Cocapn CLI — Unified CLI tool for cocapn management
 *
 * Usage:
 *   cocapn setup [dir]         — Interactive onboarding wizard
 *   cocapn init [dir]          — Alias for setup
 *   cocapn start               — Start the bridge
 *   cocapn status              — Show bridge status
 *   cocapn deploy              — Deploy to Cloudflare Workers
 *   cocapn rollback            — Rollback deployment
 *   cocapn skill list          — List available skills
 *   cocapn template search <q> — Search template registry
 *   cocapn tree <task>         — Start tree search
 *   cocapn graph               — Show knowledge graph stats
 *   cocapn tokens              — Show token usage stats
 *   cocapn health              — Health check
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
import { createTreeCommand } from "./commands/tree.js";
import { createGraphCommand } from "./commands/graph.js";
import { createTokensCommand } from "./commands/tokens.js";
import { createHealthCommand } from "./commands/health.js";
import { createPluginCommand } from "./commands/plugin.js";
import { createPersonalityCommand } from "./commands/personality.js";
import { createRunCommand } from "./commands/run.js";
import { createTelemetryCommand } from "./commands/telemetry.js";

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

  // Analysis commands
  program.addCommand(createTreeCommand());
  program.addCommand(createGraphCommand());
  program.addCommand(createTokensCommand());
  program.addCommand(createHealthCommand());

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
