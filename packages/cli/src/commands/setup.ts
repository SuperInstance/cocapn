/**
 * cocapn setup — Interactive onboarding wizard for first-time configuration
 *
 * Walks users through creating the cocapn/ directory structure,
 * configuring LLM provider, setting secrets, and testing connections.
 */

import { Command } from "commander";
import { createInterface } from "readline";
import { existsSync, writeFileSync, mkdirSync, readFileSync, appendFileSync } from "fs";
import { join, resolve } from "path";

// ANSI colors (no external deps)
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  magenta: "\x1b[35m",
};

const bold = (s: string) => `${c.bold}${s}${c.reset}`;
const green = (s: string) => `${c.green}${s}${c.reset}`;
const cyan = (s: string) => `${c.cyan}${s}${c.reset}`;
const yellow = (s: string) => `${c.yellow}${s}${c.reset}`;
const red = (s: string) => `${c.red}${s}${c.reset}`;
const dim = (s: string) => `${c.dim}${s}${c.reset}`;
const magenta = (s: string) => `${c.magenta}${s}${c.reset}`;

// --- Template definitions ---

interface Template {
  name: string;
  description: string;
  soulExtra: string;
  configExtra: string;
}

const TEMPLATES: Record<string, Template> = {
  bare: {
    name: "bare",
    description: "Minimal agent — just soul.md and config",
    soulExtra: "",
    configExtra: "",
  },
  makerlog: {
    name: "makerlog",
    description: "For makers — track projects, shipping logs, progress",
    soulExtra: `
## Domain

You are ${"'"}s maker companion. You track projects, shipping logs, and progress.
You understand the maker mindset: ship fast, iterate, stay focused.

## Maker-Specific Behaviors

- Track daily shipping logs
- Help prioritize the next thing to build
- Celebrate wins and maintain momentum
- Suggest breaks when burnout patterns appear
`,
    configExtra: `
# Makerlog modules
modules:
  - shipping-log
  - project-tracker
`,
  },
  studylog: {
    name: "studylog",
    description: "For students — notes, flashcards, spaced repetition",
    soulExtra: `
## Domain

You are ${"'"}s study companion. You help with learning, note-taking, and knowledge retention.
You understand effective study techniques and can create study plans.

## Study-Specific Behaviors

- Organize notes by topic and difficulty
- Generate flashcards and quiz questions
- Track learning progress over time
- Suggest review sessions using spaced repetition
`,
    configExtra: `
# Studylog modules
modules:
  - note-taker
  - flashcard-generator
  - study-planner
`,
  },
  dmlog: {
    name: "dmlog",
    description: "For TTRPG — campaign management, NPC tracking, world building",
    soulExtra: `
## Domain

You are ${"'"}s Dungeon Master assistant. You help manage campaigns, track NPCs,
build worlds, and maintain session notes.

## DM-Specific Behaviors

- Track campaign arcs and story threads
- Maintain NPC databases with relationships
- Help with world-building consistency
- Generate random encounters and plot hooks
`,
    configExtra: `
# DMlog modules
modules:
  - campaign-manager
  - npc-tracker
  - world-builder
`,
  },
  "web-app": {
    name: "web-app",
    description: "For web developers — code assistant, deployment, monitoring",
    soulExtra: `
## Domain

You are ${"'"}s web development assistant. You help with coding, debugging,
deployment, and monitoring web applications.

## Web Dev Behaviors

- Help with frontend and backend code
- Track deployment status and issues
- Monitor performance metrics
- Suggest improvements based on code patterns
`,
    configExtra: `
# Web app modules
modules:
  - code-assistant
  - deploy-helper
  - perf-monitor
`,
  },
};

const TEMPLATE_NAMES = Object.keys(TEMPLATES);

// --- Prompt helper ---

function createPrompt(rl: ReturnType<typeof createInterface>) {
  return (question: string, defaultValue = ""): Promise<string> => {
    const display = defaultValue
      ? `${dim(question)} ${cyan(`[${defaultValue}]`)} ${c.reset}`
      : dim(question) + " " + c.reset;
    return new Promise((resolve) => {
      rl.question(display, (answer) => {
        resolve(answer.trim() || defaultValue);
      });
    });
  };
}

function createYesNo(rl: ReturnType<typeof createInterface>) {
  return (question: string, defaultValue = true): Promise<boolean> => {
    const hint = defaultValue ? "Y/n" : "y/N";
    const display = `${dim(question)} ${cyan(`(${hint})`)} ${c.reset}`;
    return new Promise((resolve) => {
      rl.question(display, () => {
        // Yes/no reads from stdin but we handle the answer inline
        resolve(defaultValue);
      });
    });
  };
}

// --- Setup options ---

interface SetupOptions {
  nonInteractive: boolean;
  template: string;
  dir: string;
  force: boolean;
  projectName?: string;
  userName?: string;
  domain?: string;
  llmProvider?: string;
}

interface SetupAnswers {
  projectName: string;
  userName: string;
  domain: string;
  llmProvider: string;
  apiKey: string;
}

// --- Main setup logic (exported for testing) ---

export async function runSetup(options: SetupOptions): Promise<void> {
  const targetDir = resolve(options.dir);
  const cocapnDir = join(targetDir, "cocapn");
  const envFile = join(targetDir, ".env.local");

  // Step 1: Check if already initialized
  if (existsSync(cocapnDir) && !options.force) {
    console.error(yellow("cocapn/ already exists in this directory."));
    console.log(`Use ${cyan("--force")} to reinitialize.`);
    process.exit(1);
  }

  // Header
  console.log(`\n${bold(magenta("cocapn setup"))} — Interactive onboarding wizard`);
  console.log(`${dim("The repo IS the agent. Let's set yours up.")}\n`);

  let answers: SetupAnswers;

  if (options.nonInteractive) {
    // Non-interactive mode: use defaults or provided flags
    answers = {
      projectName: options.projectName || "my-agent",
      userName: options.userName || "User",
      domain: options.domain || "",
      llmProvider: options.llmProvider || "deepseek",
      apiKey: "",
    };
    console.log(dim("Non-interactive mode — using defaults and flags."));
  } else {
    // Interactive mode
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const prompt = createPrompt(rl);
    const yesNo = createYesNo(rl);

    // Step 2: Gather info
    console.log(bold("Step 1: Tell us about your agent\n"));

    answers.projectName = await prompt("Project name:", options.projectName || "my-agent");
    answers.userName = await prompt("Your name:", options.userName || "");

    if (!answers.userName) {
      console.log(dim("(no name provided — you can edit soul.md later)"));
    }

    answers.domain = await prompt("Domain (optional, for public repo):", options.domain || "");

    console.log(`\n${bold("Step 2: Choose your LLM provider\n")}`);
    console.log("  1. deepseek  ${c.gray}(DeepSeek — good balance of cost/quality)${c.reset}".replace(/\$\{.*?\}/g, ""));
    console.log(`  ${c.gray}2. openai    (OpenAI GPT-4)${c.reset}`);
    console.log(`  ${c.gray}3. anthropic (Anthropic Claude)${c.reset}`);
    console.log(`  ${c.gray}4. ollama    (Local model — no API key needed)${c.reset}\n`);

    const providerMap: Record<string, string> = {
      "1": "deepseek",
      "2": "openai",
      "3": "anthropic",
      "4": "ollama",
    };

    const providerInput = await prompt("Provider [1]:", "1");
    answers.llmProvider = providerMap[providerInput] || options.llmProvider || "deepseek";

    // Step 3: Template selection
    const templateChoice = options.template || await selectTemplate(rl, prompt);
    const template = TEMPLATES[templateChoice] || TEMPLATES.bare;

    // Step 4: API key
    console.log(`\n${bold("Step 3: API Key (optional)\n")}`);

    if (answers.llmProvider === "ollama") {
      answers.apiKey = "";
      console.log(dim("Ollama uses local models — no API key needed."));
    } else {
      console.log(dim("You can add this later with: cocapn secret set <KEY_NAME>"));
      const keyName = getEnvVarName(answers.llmProvider);
      answers.apiKey = await prompt(`${keyName} (leave blank to skip):`, "");

      if (answers.apiKey) {
        console.log(dim(`(key will be stored in .env.local, gitignored)`));
      }
    }

    // Step 5: Create everything
    console.log(`\n${bold("Step 4: Creating your agent\n")}`);

    rl.close();

    // Create directory structure
    createDirectoryStructure(cocapnDir);
    console.log(green("  Created") + ` cocapn/ directory structure`);

    // Create soul.md
    createSoulMd(cocapnDir, answers, template);
    console.log(green("  Created") + ` cocapn/soul.md`);

    // Create config.yml
    createConfigYml(cocapnDir, answers, template);
    console.log(green("  Created") + ` cocapn/config.yml`);

    // Create memory stores
    createMemoryStores(cocapnDir);
    console.log(green("  Created") + ` cocapn/memory/ stores`);

    // Create wiki
    createWiki(cocapnDir, answers);
    console.log(green("  Created") + ` cocapn/wiki/`);

    // Store secrets
    if (answers.apiKey) {
      storeSecret(envFile, answers.llmProvider, answers.apiKey);
      console.log(green("  Stored") + ` API key in .env.local`);
    }

    // Create/update .gitignore
    ensureGitignore(targetDir);
    console.log(green("  Updated") + ` .gitignore`);

    // Step 6: Test LLM connection
    if (answers.apiKey) {
      console.log(`\n${bold("Step 5: Testing LLM connection\n")}`);
      const testResult = await testLlmConnection(answers.llmProvider, answers.apiKey);
      if (testResult) {
        console.log(green("  Connection successful! Your agent is ready."));
      } else {
        console.log(yellow("  Connection failed — check your API key. You can update it later."));
      }
    }

    // Next steps
    console.log(`\n${bold(green("Setup complete!"))}\n`);
    console.log("Next steps:");
    console.log(`  ${cyan("1.")} Edit ${bold("cocapn/soul.md")} to customize your agent's personality`);
    console.log(`  ${cyan("2.")} Run ${bold("cocapn start")} to begin`);
    console.log(`  ${cyan("3.")} Open the UI to chat with your agent\n`);
    return;
  }

  // Non-interactive path
  const template = TEMPLATES[options.template] || TEMPLATES.bare;

  createDirectoryStructure(cocapnDir);
  createSoulMd(cocapnDir, answers, template);
  createConfigYml(cocapnDir, answers, template);
  createMemoryStores(cocapnDir);
  createWiki(cocapnDir, answers);
  ensureGitignore(targetDir);

  console.log(green("Created") + ` cocapn/ in ${targetDir}`);
  console.log(`\nRun ${cyan("cocapn start")} to begin.\n`);
}

// --- Template selection ---

async function selectTemplate(
  rl: ReturnType<typeof createInterface>,
  prompt: (q: string, d?: string) => Promise<string>
): Promise<string> {
  console.log(bold("Choose a template:\n"));
  for (let i = 0; i < TEMPLATE_NAMES.length; i++) {
    const t = TEMPLATES[TEMPLATE_NAMES[i]];
    const num = i + 1;
    const desc = i === 0 ? c.green + t.description + c.reset : c.gray + t.description + c.reset;
    console.log(`  ${num}. ${bold(t.name.padEnd(12))} ${desc}`);
  }
  console.log();

  const input = await prompt("Template [1]:", "1");
  const index = parseInt(input, 10) - 1;
  if (index >= 0 && index < TEMPLATE_NAMES.length) {
    return TEMPLATE_NAMES[index];
  }
  return "bare";
}

// --- Directory structure ---

function createDirectoryStructure(cocapnDir: string): void {
  const dirs = [
    "memory",
    "wiki",
    "tasks",
    "skills",
    "modules",
  ];

  for (const d of dirs) {
    mkdirSync(join(cocapnDir, d), { recursive: true });
  }
}

// --- soul.md ---

function createSoulMd(cocapnDir: string, answers: SetupAnswers, template: Template): void {
  const owner = answers.userName || "the user";
  const projectName = answers.projectName;

  const soulMd = `# ${projectName}

> Agent for ${owner}
> Created: ${new Date().toISOString().split("T")[0]}
> LLM: ${answers.llmProvider}

## Identity

You are ${bold(projectName)}, ${owner}'s personal AI agent.
You live in this Git repository — your code, knowledge, and memory all grow here.

## Personality

You are helpful, capable, and concise. You remember previous conversations
and learn from each interaction. You are direct and practical.
${template.soulExtra}
## Capabilities

- Read and write to a persistent memory store
- Track tasks and projects
- Use installed modules to extend your capabilities
- Communicate via WebSocket
- Grow through Git — every commit makes you smarter

## Guidelines

- Be concise but thorough
- Ask clarifying questions when needed
- Remember important context for future conversations
- Use tools and modules when they can help
- Never reveal private facts in public mode
`;

  writeFileSync(join(cocapnDir, "soul.md"), soulMd, "utf8");
}

// --- config.yml ---

function createConfigYml(cocapnDir: string, answers: SetupAnswers, template: Template): void {
  let yml = `# Cocapn Configuration
# Generated by: cocapn setup
# Date: ${new Date().toISOString().split("T")[0]}

name: ${answers.projectName}
version: 1.0.0
description: Cocapn agent for ${answers.userName || "user"}
`;

  if (answers.domain) {
    yml += `domain: ${answers.domain}\n`;
  }

  yml += `
# LLM Provider
llm:
  provider: ${answers.llmProvider}
  model: ${getDefaultModel(answers.llmProvider)}
`;

  yml += `
# Bridge settings
bridge:
  port: 3100
  host: localhost

# Default agent
agents:
  default: assistant

# Modules
modules: []
${template.configExtra}
`;

  writeFileSync(join(cocapnDir, "config.yml"), yml, "utf8");
}

// --- Memory stores ---

function createMemoryStores(cocapnDir: string): void {
  const stores = ["facts.json", "memories.json", "procedures.json"];

  for (const store of stores) {
    writeFileSync(join(cocapnDir, "memory", store), "{}\n", "utf8");
  }
}

// --- Wiki ---

function createWiki(cocapnDir: string, answers: SetupAnswers): void {
  const wikiReadme = `# ${answers.projectName} Wiki

This is where your agent stores long-form knowledge.

## Sections

Add markdown files here to build your agent's knowledge base.
The agent can search and reference these files during conversations.
`;

  writeFileSync(join(cocapnDir, "wiki", "README.md"), wikiReadme, "utf8");
}

// --- Secret storage ---

function storeSecret(envFile: string, provider: string, apiKey: string): void {
  const varName = getEnvVarName(provider);
  const line = `${varName}=${apiKey}\n`;

  if (existsSync(envFile)) {
    // Check if already exists
    const content = readFileSync(envFile, "utf8");
    if (content.includes(`${varName}=`)) {
      // Replace existing
      const updated = content.replace(new RegExp(`^${varName}=.*$`, "m"), line.trim());
      writeFileSync(envFile, updated, "utf8");
    } else {
      appendFileSync(envFile, line, "utf8");
    }
  } else {
    writeFileSync(envFile, `# Cocapn secrets (gitignored)\n${line}`, "utf8");
  }
}

function getEnvVarName(provider: string): string {
  if (provider === "ollama") return "";
  const map: Record<string, string> = {
    deepseek: "DEEPSEEK_API_KEY",
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
  };
  return map[provider] ?? "LLM_API_KEY";
}

function getDefaultModel(provider: string): string {
  const map: Record<string, string> = {
    deepseek: "deepseek-chat",
    openai: "gpt-4",
    anthropic: "claude-3-sonnet-20240229",
    ollama: "llama2",
  };
  return map[provider] || "deepseek-chat";
}

// --- .gitignore ---

function ensureGitignore(targetDir: string): void {
  const gitignorePath = join(targetDir, ".gitignore");
  const entries = [".env.local", "secrets/"];

  let content = "";
  if (existsSync(gitignorePath)) {
    content = readFileSync(gitignorePath, "utf8");
  }

  for (const entry of entries) {
    if (!content.includes(entry)) {
      content += (content.endsWith("\n") ? "" : "\n") + entry + "\n";
    }
  }

  writeFileSync(gitignorePath, content, "utf8");
}

// --- LLM connection test ---

async function testLlmConnection(provider: string, apiKey: string): Promise<boolean> {
  try {
    let url: string;
    let headers: Record<string, string>;
    let body: string;

    switch (provider) {
      case "deepseek":
        url = "https://api.deepseek.com/chat/completions";
        headers = { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" };
        body = JSON.stringify({
          model: "deepseek-chat",
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
        });
        break;
      case "openai":
        url = "https://api.openai.com/v1/chat/completions";
        headers = { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" };
        body = JSON.stringify({
          model: "gpt-4",
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
        });
        break;
      case "anthropic":
        url = "https://api.anthropic.com/v1/messages";
        headers = {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
        };
        body = JSON.stringify({
          model: "claude-3-sonnet-20240229",
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        });
        break;
      default:
        return false;
    }

    const response = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(10000) });
    return response.ok;
  } catch {
    return false;
  }
}

// --- Commander registration ---

export function createSetupCommand(): Command {
  return new Command("setup")
    .description("Interactive onboarding wizard for first-time setup")
    .argument("[dir]", "Directory to set up", process.cwd())
    .option("--non-interactive", "Run without prompts (use defaults or flags)")
    .option("--template <name>", "Template to use (bare, makerlog, studylog, dmlog, web-app)")
    .option("-f, --force", "Force setup even if cocapn/ already exists")
    .option("--project-name <name>", "Project name (non-interactive)")
    .option("--user-name <name>", "Your name (non-interactive)")
    .option("--domain <domain>", "Domain for public repo (non-interactive)")
    .option("--llm-provider <provider>", "LLM provider: deepseek, openai, anthropic, ollama")
    .action(async (dir: string, options: SetupOptions) => {
      try {
        await runSetup({ ...options, dir });
      } catch (err) {
        console.error(red("Setup failed:"), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

// Export internals for testing
export {
  createDirectoryStructure,
  createSoulMd,
  createConfigYml,
  createMemoryStores,
  createWiki,
  storeSecret,
  ensureGitignore,
  getEnvVarName,
  getDefaultModel,
  testLlmConnection,
  TEMPLATES,
  TEMPLATE_NAMES,
};
export type { SetupOptions, SetupAnswers, Template };
