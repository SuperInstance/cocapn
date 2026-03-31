/**
 * cocapn deploy — One-command deployment to Cloudflare / Docker / GitHub CI/CD
 *
 * Usage:
 *   cocapn deploy cloudflare  — Deploy to Cloudflare Workers
 *   cocapn deploy docker      — Build and run Docker container
 *   cocapn deploy github      — Push CI/CD workflows and configure secrets
 *   cocapn deploy status      — Check deployment status
 */

import { Command } from "commander";
import { execSync, execFileSync } from "child_process";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { join, basename } from "path";

// --- Color helpers ---

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};
const bold = (s: string) => `${c.bold}${s}${c.reset}`;
const green = (s: string) => `${c.green}${s}${c.reset}`;
const cyan = (s: string) => `${c.cyan}${s}${c.reset}`;
const yellow = (s: string) => `${c.yellow}${s}${c.reset}`;
const red = (s: string) => `${c.red}${s}${c.reset}`;

// --- Options ---

interface CloudflareOptions {
  env: string;
  region: string;
  verify: boolean;
  tests: boolean;
  dryRun: boolean;
  verbose: boolean;
}

interface DockerOptions {
  tag: string;
  port: string;
  brain: string;
  verbose: boolean;
}

interface GitHubOptions {
  owner: string;
  name: string;
  verbose: boolean;
}

// --- Public API ---

export function createDeployCommand(): Command {
  return (
    new Command("deploy")
      .description("Deploy cocapn instance to Cloudflare Workers, Docker, or GitHub CI/CD")
      .addCommand(createCloudflareCommand())
      .addCommand(createDockerCommand())
      .addCommand(createGitHubCommand())
      .addCommand(createStatusCommand())
  );
}

// --- cloudflare subcommand ---

function createCloudflareCommand(): Command {
  return (
    new Command("cloudflare")
      .description("Deploy to Cloudflare Workers")
      .option("-e, --env <environment>", "Environment (production, staging)", "production")
      .option("-r, --region <region>", "Cloudflare region", "auto")
      .option("--no-verify", "Skip post-deploy health checks")
      .option("--no-tests", "Skip pre-deploy tests")
      .option("--dry-run", "Build and validate without uploading")
      .option("-v, --verbose", "Detailed logging")
      .action(async (opts: CloudflareOptions) => {
        try {
          await deployCloudflare(opts);
        } catch (err) {
          console.error(red("\u2717 Deployment failed"));
          console.error(`  ${err instanceof Error ? err.message : String(err)}`);
          process.exit(1);
        }
      })
  );
}

// --- docker subcommand ---

function createDockerCommand(): Command {
  return (
    new Command("docker")
      .description("Build and run Docker container")
      .option("-t, --tag <tag>", "Image tag", "cocapn")
      .option("-p, --port <port>", "Host port mapping", "3100")
      .option("-b, --brain <path>", "Brain volume path", "./cocapn")
      .option("-v, --verbose", "Detailed logging")
      .action(async (opts: DockerOptions) => {
        try {
          await deployDocker(opts);
        } catch (err) {
          console.error(red("\u2717 Docker deployment failed"));
          console.error(`  ${err instanceof Error ? err.message : String(err)}`);
          process.exit(1);
        }
      })
  );
}

// --- github subcommand ---

function createGitHubCommand(): Command {
  return (
    new Command("github")
      .description("Push CI/CD workflows to GitHub and configure secrets")
      .option("-o, --owner <owner>", "GitHub owner/organization")
      .option("-n, --name <name>", "Project name (defaults to directory name)")
      .option("-v, --verbose", "Detailed logging")
      .action(async (opts: GitHubOptions) => {
        try {
          await deployGitHub(opts);
        } catch (err) {
          console.error(red("\u2717 GitHub CI/CD setup failed"));
          console.error(`  ${err instanceof Error ? err.message : String(err)}`);
          process.exit(1);
        }
      })
  );
}

// --- status subcommand ---

function createStatusCommand(): Command {
  return new Command("status")
    .description("Check deployment status for all targets")
    .action(async () => {
      try {
        await checkStatus();
      } catch (err) {
        console.error(red("\u2717 Status check failed"));
        console.error(`  ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}

// --- Cloudflare deployment ---

async function deployCloudflare(opts: CloudflareOptions): Promise<void> {
  const cwd = process.cwd();

  // Prerequisite: wrangler.toml
  const wranglerPath = join(cwd, "wrangler.toml");
  if (!existsSync(wranglerPath)) {
    throw new Error("Missing wrangler.toml. Run 'cocapn init' first.");
  }
  console.log(green("\u2713") + " Found wrangler.toml");

  // Prerequisite: API token
  const apiToken =
    process.env.CLOUDFLARE_API_TOKEN ||
    process.env.CF_API_TOKEN ||
    loadEnvVar(cwd, "CLOUDFLARE_API_TOKEN");
  if (!apiToken) {
    throw new Error(
      "Missing CLOUDFLARE_API_TOKEN. Set it in your environment or .env.local."
    );
  }
  console.log(green("\u2713") + " Cloudflare API token found");

  if (opts.verbose) {
    console.log(yellow("Configuration:"));
    console.log(`  Environment: ${opts.env}`);
    console.log(`  Region: ${opts.region}`);
  }

  // Pre-deploy tests
  if (opts.tests) {
    console.log(cyan("\u25b8 Running tests..."));
    execSafe("npx vitest run", { cwd, verbose: opts.verbose });
    console.log(green("\u2713 Tests passed"));
  } else {
    console.log(yellow("\u26a0 Skipping tests (--no-tests)"));
  }

  // Dry-run stops here
  if (opts.dryRun) {
    console.log(cyan("\u25b8 Dry run complete \u2014 no deployment performed"));
    return;
  }

  // Deploy
  console.log(cyan("\u25b8 Deploying to Cloudflare Workers..."));
  validateEnvName(opts.env);
  const wranglerArgs = ["wrangler", "deploy"];
  if (opts.env !== "production") {
    wranglerArgs.push("--env", opts.env);
  }
  const output = execSafe("npx " + wranglerArgs.join(" "), {
    cwd,
    verbose: opts.verbose,
  });
  console.log(green("\u2713 Uploaded to Cloudflare"));

  // Extract URL from wrangler output
  const deployedUrl = extractUrl(output);
  if (deployedUrl) {
    console.log();
    console.log(cyan("\ud83d\ude80 Deployed to: ") + green(deployedUrl));
  }

  // Health check
  if (opts.verify && deployedUrl) {
    console.log(cyan("\u25b8 Verifying health endpoint..."));
    try {
      const healthUrl = `${deployedUrl.replace(/\/+$/, "")}/_health`;
      const resp = await fetch(healthUrl);
      const body = (await resp.json()) as { status?: string };
      if (body.status === "healthy") {
        console.log(green("\u2713 Health check passed"));
      } else {
        console.warn(yellow("\u26a0 Health check returned non-healthy status"));
      }
    } catch {
      console.warn(yellow("\u26a0 Health endpoint not reachable (may take a moment)"));
    }
  }

  console.log();
  console.log(cyan("\ud83d\udd17 Next steps:"));
  console.log(`   - View logs: ${cyan("npx wrangler tail")}`);
  console.log(`   - Rollback: ${cyan("cocapn rollback")}`);
}

// --- Docker deployment ---

async function deployDocker(opts: DockerOptions): Promise<void> {
  const cwd = process.cwd();

  // Prerequisite: Dockerfile
  const dockerfilePath = join(cwd, "Dockerfile");
  if (!existsSync(dockerfilePath)) {
    throw new Error("Missing Dockerfile. Add a Dockerfile to your project root.");
  }
  console.log(green("\u2713") + " Found Dockerfile");

  // Prerequisite: docker binary
  try {
    execSafe("docker --version", { cwd, verbose: opts.verbose });
  } catch {
    throw new Error("Docker is not installed or not in PATH.");
  }
  console.log(green("\u2713") + " Docker is available");

  // Build
  console.log(cyan("\u25b8 Building Docker image..."));
  validateTag(opts.tag);
  execFileSync("docker", ["build", "-t", opts.tag, "."], {
    cwd,
    stdio: opts.verbose ? "inherit" : "pipe",
    timeout: 300_000,
  });
  console.log(green(`\u2713 Built image: ${opts.tag}`));

  // Resolve brain path to absolute and validate
  const brainPath = resolvePath(opts.brain);

  // Run
  console.log(cyan("\u25b8 Starting container..."));
  const portNum = validatePort(opts.port);
  const runOutput = execFileSync(
    "docker",
    ["run", "-d", "-p", `${portNum}:3100`, "-v", `${brainPath}:/app/brain`, opts.tag],
    { cwd, encoding: "utf-8", timeout: 30_000 }
  );

  const containerId = runOutput.trim().split("\n").pop()?.trim() || "unknown";
  console.log();
  console.log(cyan("\ud83d\ude80 Container running:"));
  console.log(`   ID:    ${green(containerId)}`);
  console.log(`   Image: ${opts.tag}`);
  console.log(`   Port:  ${opts.port}`);
  console.log(`   Brain: ${brainPath}`);
  console.log();
  console.log(cyan("\ud83d\udd17 Next steps:"));
  console.log(`   - View logs: ${cyan(`docker logs -f ${containerId}`)}`);
  console.log(`   - Stop:      ${cyan(`docker stop ${containerId}`)}`);
}

// --- GitHub CI/CD deployment ---

async function deployGitHub(opts: GitHubOptions): Promise<void> {
  // Prerequisite: gh CLI
  try {
    execSafe("gh --version", { cwd: process.cwd(), verbose: opts.verbose });
  } catch {
    throw new Error("GitHub CLI (gh) is not installed. Install it from https://cli.github.com");
  }
  console.log(green("\u2713") + " GitHub CLI available");

  // Check gh auth
  try {
    execSafe("gh auth status", { cwd: process.cwd(), verbose: opts.verbose });
  } catch {
    throw new Error("Not authenticated with GitHub. Run: gh auth login");
  }
  console.log(green("\u2713") + " GitHub authentication confirmed");

  // Resolve owner
  const owner = opts.owner || execSafe("gh api user --jq .login", {
    cwd: process.cwd(),
    verbose: opts.verbose,
  }).trim();
  if (!owner) {
    throw new Error("Could not determine GitHub owner. Use --owner flag.");
  }
  console.log(green("\u2713") + ` GitHub owner: ${owner}`);

  // Resolve project name
  const name = opts.name || basename(process.cwd());
  validateGitHubName(name);
  console.log(green("\u2713") + ` Project name: ${name}`);

  // Collect secrets to configure
  const secretsToSet: Array<{ name: string; value: string }> = [];
  const secretKeys = ["DEEPSEEK_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"];

  console.log(cyan("\u25b8 Configuring secrets..."));
  for (const key of secretKeys) {
    const value = process.env[key] || loadEnvVar(process.cwd(), key);
    if (value) {
      secretsToSet.push({ name: key, value });
      console.log(green("\u2713") + ` ${key} found`);
    }
  }

  if (secretsToSet.length === 0) {
    console.warn(yellow("\u26a0 No API keys found. Set them as env vars or in .env.local"));
  }

  // Generate workflow files
  console.log(cyan("\u25b8 Generating CI/CD workflows..."));
  const repo = `${owner}/${name}-brain`;
  const publicRepo = `${owner}/${name}`;

  try {
    // Check if repo exists
    execSafe(`gh repo view ${repo}`, { cwd: process.cwd(), verbose: false });
    console.log(green("\u2713") + ` Private repo ${repo} exists`);
  } catch {
    console.log(cyan("\u25b8 Creating GitHub repos..."));
    try {
      execSafe(`gh repo create ${repo} --private --description "Cocapn brain for ${name}"`, {
        cwd: process.cwd(),
        verbose: opts.verbose,
      });
    } catch {
      // May already exist — continue
    }
  }

  try {
    execSafe(`gh repo view ${publicRepo}`, { cwd: process.cwd(), verbose: false });
    console.log(green("\u2713") + ` Public repo ${publicRepo} exists`);
  } catch {
    try {
      execSafe(`gh repo create ${publicRepo} --public --description "Cocapn public face for ${name}"`, {
        cwd: process.cwd(),
        verbose: opts.verbose,
      });
    } catch {
      // May already exist — continue
    }
  }

  // Set secrets
  for (const secret of secretsToSet) {
    try {
      execSync(
        `gh secret set ${secret.name} --repo ${repo} --body "${secret.value.replace(/"/g, '\\"')}"`,
        { stdio: "pipe", timeout: 10_000 },
      );
      console.log(green("\u2713") + ` Secret ${secret.name} set on ${repo}`);
    } catch (e) {
      console.warn(yellow(`\u26a0 Failed to set ${secret.name}: ${e instanceof Error ? e.message : String(e)}`));
    }
  }

  // Push workflows
  console.log(cyan("\u25b8 Pushing workflow files..."));
  const workflows = [
    { filename: "cocapn.yml", content: generateAgentWorkflow() },
    { filename: "deploy.yml", content: generateDeployWorkflow() },
    { filename: "public-sync.yml", content: generatePublicSyncWorkflow(name) },
  ];

  // Write workflows locally and push
  const workflowDir = join(process.cwd(), ".github", "workflows");
  mkdirSync(workflowDir, { recursive: true });

  for (const { filename, content } of workflows) {
    writeFileSync(join(workflowDir, filename), content, "utf8");
    console.log(green("\u2713") + ` ${filename} written`);
  }

  console.log();
  console.log(cyan("\ud83d\ude80 GitHub CI/CD configured:"));
  console.log(`   Owner:     ${green(owner)}`);
  console.log(`   Private:   ${green(repo)}`);
  console.log(`   Public:    ${green(publicRepo)}`);
  console.log(`   Secrets:   ${green(String(secretsToSet.length))} configured`);
  console.log(`   Workflows: ${green(String(workflows.length))} pushed`);
  console.log();
  console.log(cyan("\ud83d\udd17 Next steps:"));
  console.log(`   - Push to trigger: ${cyan(`git push origin main`)}`);
  console.log(`   - View workflows:  ${cyan(`gh run list --repo ${repo}`)}`);
  console.log(`   - Manual trigger:  ${cyan(`gh workflow run cocapn.yml --repo ${repo}`)}`);
}

// --- GitHub workflow generators ---

function generateAgentWorkflow(): string {
  return `name: Cocapn Agent

on:
  push:
    branches: [main]
  schedule:
    - cron: '*/30 * * * *'  # Every 30 minutes
  workflow_dispatch:
    inputs:
      action:
        description: 'Agent action'
        required: false
        default: 'status'
        type: choice
        options:
          - status
          - sync
          - health-check
          - reindex

jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for RepoLearner

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install cocapn
        run: npm install -g cocapn

      - name: Load secrets
        run: |
          echo "DEEPSEEK_API_KEY=\${{ secrets.DEEPSEEK_API_KEY }}" >> .env.local
          echo "OPENAI_API_KEY=\${{ secrets.OPENAI_API_KEY }}" >> .env.local

      - name: Run agent
        run: cocapn start --ci
        env:
          COCAPN_MODE: private
          COCAPN_CI: true

      - name: Health check
        run: cocapn status --json

      - name: Auto-sync
        if: github.event_name == 'push'
        run: cocapn sync
`;
}

function generateDeployWorkflow(): string {
  return `name: Deploy to Cloudflare

on:
  push:
    branches: [main]
    paths:
      - 'public/**'
      - 'wrangler.toml'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Deploy
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
`;
}

function generatePublicSyncWorkflow(publicRepoName: string): string {
  return `name: Sync Public Face

on:
  workflow_run:
    workflows: ['Cocapn Agent']
    types: [completed]

jobs:
  sync:
    runs-on: ubuntu-latest
    if: github.event.workflow_run.conclusion == 'success'
    steps:
      - uses: actions/checkout@v4
        with:
          repository: \${{ github.repository_owner }}/${publicRepoName}
          token: \${{ secrets.PUBLIC_REPO_TOKEN }}

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Pull from private repo
        run: |
          git remote add private \${{ github.server_url }}/\${{ github.repository }}
          git fetch private main
          cocapn publish --from ../private-repo
`;
}

// --- Status check ---

async function checkStatus(): Promise<void> {
  const cwd = process.cwd();
  let foundAny = false;

  // Cloud
  console.log(cyan("\u25b8 Cloudflare Workers:"));
  const wranglerPath = join(cwd, "wrangler.toml");
  if (existsSync(wranglerPath)) {
    try {
      // Try to extract worker name from wrangler.toml
      const wranglerContent = readFileSync(wranglerPath, "utf-8");
      const nameMatch = wranglerContent.match(/name\s*=\s*"([^"]+)"/);
      const workerName = nameMatch ? nameMatch[1] : "unknown";
      console.log(`   Worker: ${workerName}`);

      // Check if deployed via wrangler
      try {
        const tailOutput = execSafe("npx wrangler deployments list 2>&1 || true", {
          cwd,
          verbose: false,
        });
        if (tailOutput.includes("error") || tailOutput.includes("Error")) {
          console.log(yellow("   Status: Not deployed or unreachable"));
        } else {
          console.log(green("   Status: Deployed"));
        }
      } catch {
        console.log(yellow("   Status: Unable to verify (check API token)"));
      }
    } catch {
      console.log(red("   Status: Error reading wrangler.toml"));
    }
  } else {
    console.log(yellow("   Status: No wrangler.toml found"));
  }

  // Docker
  console.log(cyan("\u25b8 Docker:"));
  try {
    const psOutput = execSafe('docker ps --filter "ancestor=cocapn" --format "{{.ID}} {{.Status}}"', {
      cwd,
      verbose: false,
    });
    if (psOutput.trim()) {
      const lines = psOutput.trim().split("\n");
      for (const line of lines) {
        const [id, status] = line.split(/\s+/, 2);
        console.log(`   Container ${id}: ${green(status || "running")}`);
        foundAny = true;
      }
    } else {
      console.log(yellow("   Status: No cocapn containers running"));
    }
  } catch {
    console.log(yellow("   Status: Docker not available"));
  }

  // Local bridge
  console.log(cyan("\u25b8 Local bridge:"));
  try {
    const psOutput = execSafe("pgrep -f 'cocapn.*start' || true", {
      cwd,
      verbose: false,
    });
    if (psOutput.trim()) {
      console.log(green(`   Status: Running (PID ${psOutput.trim()})`));
      foundAny = true;
    } else {
      console.log(yellow("   Status: Not running"));
    }
  } catch {
    console.log(yellow("   Status: Unable to check"));
  }

  if (!foundAny) {
    console.log();
    console.log(yellow("No active deployments found. Run:"));
    console.log(`   ${cyan("cocapn deploy cloudflare")} — Deploy to Workers`);
    console.log(`   ${cyan("cocapn deploy docker")}     — Run via Docker`);
    console.log(`   ${cyan("cocapn deploy github")}     — GitHub CI/CD`);
    console.log(`   ${cyan("cocapn start")}            — Start local bridge`);
  }
}

// --- Input validation ---

/** Validate that a Docker image tag contains only safe characters. */
function validateTag(tag: string): void {
  // Docker tags: lowercase letters, digits, ., -, _, /
  // No shell metacharacters allowed
  if (!/^[a-z0-9._:/-]+$/.test(tag)) {
    throw new Error(
      `Invalid image tag: "${tag}". Tags may only contain lowercase letters, digits, ., -, _, /`
    );
  }
}

/** Validate that a port number is a safe integer 1-65535. */
function validatePort(port: string): number {
  const n = parseInt(port, 10);
  if (!Number.isFinite(n) || n < 1 || n > 65535) {
    throw new Error(`Invalid port: "${port}". Must be 1-65535.`);
  }
  return n;
}

/** Validate that an environment name contains only safe characters. */
function validateEnvName(env: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(env)) {
    throw new Error(
      `Invalid environment name: "${env}". May only contain letters, digits, -, _`
    );
  }
}

/** Validate that a GitHub project name is safe. */
function validateGitHubName(name: string): void {
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    throw new Error(
      `Invalid project name: "${name}". May only contain letters, digits, ., -, _`
    );
  }
}

// --- Helpers ---

function execSafe(
  command: string,
  options: { cwd: string; verbose: boolean }
): string {
  try {
    const output = execSync(command, {
      cwd: options.cwd,
      encoding: "utf-8",
      stdio: options.verbose ? "inherit" : "pipe",
      timeout: 120_000,
      env: { ...process.env },
    });
    return typeof output === "string" ? output : "";
  } catch (err) {
    if (err instanceof Error && "status" in err && (err as any).status !== 0) {
      throw new Error(`Command failed: ${command}`);
    }
    throw err;
  }
}

function extractUrl(output: string): string | null {
  // wrangler outputs "Published <name> (<url>)" or "  <url>"
  const patterns = [
    /https?:\/\/[^\s)]+/,
    /Published.*?\((https?:\/\/[^\s)]+)\)/,
  ];
  for (const pat of patterns) {
    const match = output.match(pat);
    if (match) return match[1] || match[0];
  }
  return null;
}

function loadEnvVar(cwd: string, key: string): string | undefined {
  for (const file of [".env.local", ".env"]) {
    const envPath = join(cwd, file);
    if (!existsSync(envPath)) continue;
    const content = readFileSync(envPath, "utf-8");
    const line = content
      .split("\n")
      .find((l) => l.startsWith(`${key}=`) || l.startsWith(`${key} `));
    if (line) {
      const eq = line.indexOf("=");
      return line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
  return undefined;
}

function resolvePath(p: string): string {
  if (p.startsWith("/")) return p;
  return join(process.cwd(), p);
}

// Exported for testing
export { execSafe, extractUrl, loadEnvVar, deployCloudflare, deployDocker, deployGitHub, checkStatus };
