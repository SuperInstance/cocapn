/**
 * Cocapn CLI — Unified CLI tool for cocapn management
 *
 * Usage:
 *   cocapn setup [dir]         — Interactive onboarding wizard
 *   cocapn init [dir]          — Alias for setup
 *   cocapn start               — Start the bridge
 *   cocapn serve               — Serve web UI locally
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
 *   cocapn backup create       — Create full backup
 *   cocapn backup list         — List backups
 *   cocapn backup restore <n>  — Restore from backup
 *   cocapn backup clean        — Remove old backups
 *   cocapn invite create       — Create invite link
 *   cocapn invite list         — List active invites
 *   cocapn invite revoke <code> — Revoke invite
 *   cocapn invite accept <code> — Accept invite
 *   cocapn remote list         — List remote instances
 *   cocapn remote add <name> <url> — Add remote instance
 *   cocapn remote remove <name> — Remove remote
 *   cocapn remote deploy <name> — Deploy to remote
 *   cocapn remote status <name> — Check remote health
 *   cocapn auth login           — Authenticate with cocapn.ai
 *   cocapn auth logout          — Clear auth
 *   cocapn auth status          — Show auth status
 *   cocapn auth keys list       — Show configured keys (masked)
 *   cocapn auth keys set <provider> <key> — Set API key
 *   cocapn auth keys remove <provider>   — Remove API key
 *   cocapn learn file <path>   — Learn from a file
 *   cocapn learn url <url>     — Learn from a URL
 *   cocapn learn text <text>   — Learn from direct text
 *   cocapn learn list          — Show what the agent has learned
 *   cocapn learn forget <id>   — Remove a knowledge entry
 *   cocapn webhooks list                       — List registered webhooks
 *   cocapn webhooks add <url> --events <evts>  — Add a webhook
 *   cocapn webhooks remove <url>               — Remove a webhook
 *   cocapn webhooks test <url>                 — Send test payload
 *   cocapn webhooks logs                       — Show recent deliveries
 *   cocapn notify on                          — Enable notifications
 *   cocapn notify off                         — Disable notifications
 *   cocapn notify status                      — Show notification status
 *   cocapn notify rules                       — List notification rules
 *   cocapn notify rules add [opts]            — Add a notification rule
 *   cocapn notify rules remove <id>           — Remove a notification rule
 *   cocapn notify test                        — Send test notification
 *   cocapn settings            — Show all settings (grouped)
 *   cocapn settings get <key>  — Get specific setting
 *   cocapn settings set <k> <v> — Set a setting
 *   cocapn settings reset [key] — Reset to defaults
 *   cocapn settings edit       — Open config in $EDITOR
 *   cocapn themes list         — List available themes
 *   cocapn themes apply <name> — Apply a theme
 *   cocapn themes create       — Create custom theme interactively
 *   cocapn themes preview <n>  — Show theme colors in terminal
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
import { createTemplateCommand } from "./commands/template.js";
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
import { createServeCommand } from "./commands/serve.js";
import { createBackupCommand } from "./commands/backup.js";
import { createInviteCommand } from "./commands/invite.js";
import { createRemoteCommand } from "./commands/remote.js";
import { createAuthCommand } from "./commands/auth.js";
import { createPublishCommand } from "./commands/publish.js";
import { createLearnCommand } from "./commands/learn.js";
import { createWebhooksCommand } from "./commands/webhooks.js";
import { createNotifyCommand } from "./commands/notify.js";
import { createOnboardCommand } from "./commands/onboard.js";
import { createMobileCommand } from "./commands/mobile.js";
import { createAgentsCommand } from "./commands/agents.js";
import { createSettingsCommand } from "./commands/settings.js";
import { createThemesCommand } from "./commands/themes.js";

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

  // Publish command (brain → face)
  program.addCommand(createPublishCommand());

  // Learn command (teach the agent)
  program.addCommand(createLearnCommand());

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

  // Serve command
  program.addCommand(createServeCommand());

  // Backup command
  program.addCommand(createBackupCommand());

  // Invite command
  program.addCommand(createInviteCommand());

  // Remote command
  program.addCommand(createRemoteCommand());

  // Auth command
  program.addCommand(createAuthCommand());

  // Webhooks command
  program.addCommand(createWebhooksCommand());

  // Notify command
  program.addCommand(createNotifyCommand());

  // Onboard command
  program.addCommand(createOnboardCommand());

  // Mobile commands
  program.addCommand(createMobileCommand());

  // Agent management commands
  program.addCommand(createAgentsCommand());

  // Settings command
  program.addCommand(createSettingsCommand());

  // Theme management commands
  program.addCommand(createThemesCommand());

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
