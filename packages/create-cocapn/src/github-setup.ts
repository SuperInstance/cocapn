/**
 * GitHub CI/CD setup — automated GitHub Actions configuration.
 *
 * Provides functions to:
 *   - Create private + public repos via gh CLI
 *   - Configure GitHub secrets for API keys
 *   - Push workflow files to repos
 *   - Verify the entire setup
 *
 * All functions are individually exported for testing.
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RepoInfo {
  owner: string;
  privateRepo: string;
  publicRepo: string;
}

export interface SecretEntry {
  name: string;
  value: string;
}

export interface SetupResult {
  repos: RepoInfo;
  secrets: string[];
  workflows: string[];
  verified: boolean;
}

// ─── Repo creation ────────────────────────────────────────────────────────────

/**
 * Create private + public repos via `gh` CLI.
 * Returns repo info with owner and repo names.
 */
export function createRepos(owner: string, name: string): RepoInfo {
  const privateRepo = `${name}-brain`;
  const publicRepo = `${name}`;

  execSync(
    `gh repo create ${owner}/${privateRepo} --private --description "Cocapn private brain for ${owner}"`,
    { stdio: "pipe", timeout: 30_000 },
  );

  execSync(
    `gh repo create ${owner}/${publicRepo} --public --description "Cocapn public face for ${owner}"`,
    { stdio: "pipe", timeout: 30_000 },
  );

  return { owner, privateRepo, publicRepo };
}

// ─── Secret configuration ─────────────────────────────────────────────────────

/**
 * Set GitHub repository secrets via `gh` CLI.
 * Returns list of secret names that were set.
 */
export function configureSecrets(
  repo: string,
  secrets: SecretEntry[],
): string[] {
  const setNames: string[] = [];

  for (const secret of secrets) {
    if (!secret.value) continue;

    execSync(
      `gh secret set ${secret.name} --repo ${repo} --body "${secret.value.replace(/"/g, '\\"')}"`,
      { stdio: "pipe", timeout: 10_000 },
    );
    setNames.push(secret.name);
  }

  return setNames;
}

// ─── Workflow generation ──────────────────────────────────────────────────────

/**
 * Generate the main cocapn.yml workflow content.
 * Runs the agent on push, every 30 minutes, and on manual trigger.
 */
export function generateAgentWorkflow(): string {
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

/**
 * Generate the Cloudflare deploy workflow content.
 * Triggers on pushes that change public/ or wrangler.toml.
 */
export function generateDeployWorkflow(): string {
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

/**
 * Generate the public-sync workflow content.
 * Syncs the public face repo after the agent workflow completes.
 */
export function generatePublicSyncWorkflow(publicRepoName: string): string {
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

// ─── Workflow file push ───────────────────────────────────────────────────────

/**
 * Write workflow files into a target directory's .github/workflows/ folder.
 * Returns list of workflow filenames written.
 */
export function writeWorkflows(
  targetDir: string,
  workflows: Array<{ filename: string; content: string }>,
): string[] {
  const workflowDir = join(targetDir, ".github", "workflows");
  mkdirSync(workflowDir, { recursive: true });

  const written: string[] = [];
  for (const { filename, content } of workflows) {
    const filePath = join(workflowDir, filename);
    writeFileSync(filePath, content, "utf8");
    written.push(filename);
  }

  return written;
}

// ─── Setup CI/CD ──────────────────────────────────────────────────────────────

/**
 * Push workflow files to a GitHub repo by cloning, adding files, and pushing.
 * Returns list of workflow filenames pushed.
 */
export function setupCI(
  repo: string,
  owner: string,
  publicRepoName: string,
): string[] {
  const tmpDir = `/tmp/cocapn-ci-setup-${Date.now()}`;

  execSync(`gh repo clone ${owner}/${repo} ${tmpDir}`, {
    stdio: "pipe",
    timeout: 30_000,
  });

  try {
    const workflows = [
      { filename: "cocapn.yml", content: generateAgentWorkflow() },
      { filename: "deploy.yml", content: generateDeployWorkflow() },
      { filename: "public-sync.yml", content: generatePublicSyncWorkflow(publicRepoName) },
    ];

    const written = writeWorkflows(tmpDir, workflows);

    execSync("git add .github/workflows/", { cwd: tmpDir, stdio: "pipe" });
    execSync('git commit -m "feat: add cocapn CI/CD workflows"', {
      cwd: tmpDir,
      stdio: "pipe",
    });
    execSync("git push", { cwd: tmpDir, stdio: "pipe", timeout: 30_000 });

    return written;
  } finally {
    execSync(`rm -rf ${tmpDir}`, { stdio: "pipe" });
  }
}

// ─── Verification ─────────────────────────────────────────────────────────────

/**
 * Verify that GitHub Actions are configured correctly.
 * Checks that workflows exist and secrets are set.
 */
export async function verifySetup(
  repo: string,
  expectedSecrets: string[],
): Promise<boolean> {
  // Check that workflows exist in the repo
  try {
    execSync(
      `gh api repos/${repo}/contents/.github/workflows --jq '.[].name'`,
      { stdio: "pipe", timeout: 10_000 },
    );
  } catch {
    return false;
  }

  // Check secrets
  try {
    const output = execSync(
      `gh secret list --repo ${repo}`,
      { encoding: "utf8", stdio: "pipe", timeout: 10_000 },
    );
    const setSecrets = output.split("\n").map((l) => l.split(/\s+/)[0]).filter(Boolean);

    for (const expected of expectedSecrets) {
      if (!setSecrets.includes(expected)) {
        return false;
      }
    }
  } catch {
    return false;
  }

  return true;
}

// ─── Full setup orchestration ─────────────────────────────────────────────────

/**
 * Run the complete GitHub CI/CD setup:
 *   1. Create repos
 *   2. Configure secrets
 *   3. Push workflow files
 *   4. Verify
 */
export async function fullSetup(opts: {
  owner: string;
  name: string;
  secrets: SecretEntry[];
}): Promise<SetupResult> {
  const repos = createRepos(opts.owner, opts.name);

  // Configure secrets on the private repo
  const secrets = configureSecrets(
    `${opts.owner}/${repos.privateRepo}`,
    opts.secrets,
  );

  // Push workflow files
  const workflows = setupCI(
    repos.privateRepo,
    opts.owner,
    repos.publicRepo,
  );

  // Verify
  const verified = await verifySetup(
    `${opts.owner}/${repos.privateRepo}`,
    opts.secrets.map((s) => s.name),
  );

  return { repos, secrets, workflows, verified };
}
