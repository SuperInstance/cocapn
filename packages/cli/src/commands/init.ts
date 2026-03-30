/**
 * cocapn init — Alias for cocapn setup
 *
 * Runs the interactive onboarding wizard. Kept for backwards compatibility
 * with the original init command.
 */

import { Command } from "commander";
import { runSetup } from "./setup.js";
import type { SetupOptions } from "./setup.js";

export function createInitCommand(): Command {
  return new Command("init")
    .description("Initialize cocapn in a repo (alias for setup)")
    .argument("[dir]", "Directory to initialize", process.cwd())
    .option("-f, --force", "Force initialization even if cocapn already exists")
    .option("--non-interactive", "Run without prompts (use defaults or flags)")
    .option("--template <name>", "Template to use (bare, makerlog, studylog, dmlog, web-app)")
    .option("--project-name <name>", "Project name (non-interactive)")
    .option("--user-name <name>", "Your name (non-interactive)")
    .option("--domain <domain>", "Domain for public repo (non-interactive)")
    .option("--llm-provider <provider>", "LLM provider: deepseek, openai, anthropic, ollama")
    .action(async (dir: string, options: SetupOptions) => {
      try {
        await runSetup({ ...options, dir });
      } catch (err) {
        console.error("Setup failed:", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
