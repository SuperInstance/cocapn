# Cocapn

> Your data is in Git. You own it completely.

Cocapn is a **repo-first hybrid agent OS** — a local WebSocket bridge that runs Claude Code, Pi, and other CLI agents on your machine, backed by an encrypted private Git repository, with an optional Cloudflare edge tier for 24/7 background tasks.

```
┌──────────────────────────────────────────────────────────┐
│  Browser (your.domain.ai)                                │
│  React SPA — served from GitHub Pages, zero hosting fee  │
└───────────────────────┬──────────────────────────────────┘
                        │ WebSocket (ws://localhost:8787)
                        │ or Cloudflare tunnel (wss://…)
┌───────────────────────▼──────────────────────────────────┐
│  Local Bridge (cocapn-bridge)                            │
│  Node.js · TypeScript · runs on your machine             │
│  - Spawns agents (Claude Code, Pi, Copilot via MCP)      │
│  - Syncs private repo via Git                            │
│  - age-encrypted secrets, audit log, JWT fleet auth      │
└───────────────────────┬──────────────────────────────────┘
                        │
          ┌─────────────┴──────────────┐
          │                            │
┌─────────▼──────────┐    ┌────────────▼────────────┐
│  Private Git Repo  │    │  Cloudflare Workers      │
│  (encrypted brain) │    │  (optional 24/7 agents)  │
│  secrets/*.age     │    │  cloud-agents/            │
│  cocapn/agents/    │    └──────────────────────────┘
│  wiki/, tasks/     │
└────────────────────┘
```

## Philosophy

- **Git is the database.** Every agent action, wiki entry, and task is a commit. You can `git log` your brain.
- **Local-first.** The bridge runs on your machine. No cloud required — Cloudflare is opt-in for background tasks.
- **You own the keys.** Secrets are age-encrypted in your private repo. The bridge never sends plaintext secrets anywhere.
- **Domain-branded.** Your instance lives at `you.makerlog.ai`, `you.studylog.ai`, or your own domain — served from your GitHub Pages.

## Quickstart

### Prerequisites

- Node.js 20+
- Git
- A GitHub account (for repo creation and PAT auth)
- `age` CLI (`brew install age` or `apt install age`) — for secret management

### Install and init

Run a single command — it will ask for your GitHub PAT, create and clone both repos, generate an age keypair, and print your subdomain URL.

```bash
npx create-cocapn my-makerlog --domain makerlog
```

```bash
# Or for a custom domain:
npx create-cocapn my-log --domain studylog

# After setup, start the bridge manually:
cocapn-bridge --repo ./my-makerlog-brain
```

## Repository Structure

```
cocapn/
├── packages/
│   ├── local-bridge/   # WebSocket server, agent spawner, Git sync
│   ├── ui/             # React SPA (domain-skinned)
│   ├── protocols/      # Shared MCP + A2A implementations
│   └── cloud-agents/   # Optional Cloudflare Workers
├── templates/
│   ├── public/         # Template for your public GitHub repo
│   └── private/        # Template for your private encrypted repo
├── modules/            # Reference extension modules
│   ├── habit-tracker/
│   ├── perplexity-search/
│   └── zotero-bridge/
└── docs/               # Documentation site
```

## Modules

Extend Cocapn with git-submodule-based modules:

```bash
# Add a module
cocapn-bridge module add https://github.com/cocapn/habit-tracker

# List installed modules
cocapn-bridge module list

# Or from a chat message: "install habit-tracker"
```

Module types: `skin` (CSS themes), `agent` (new AI agents), `tool` (MCP servers), `integration` (webhooks/sync).

## Security

```bash
# Initialize age keypair
cocapn-bridge secret init

# Add an encrypted secret
cocapn-bridge secret add OPENAI_API_KEY

# Rotate all secrets with a new keypair
cocapn-bridge secret rotate

# Store GitHub token in OS keychain
cocapn-bridge token set
```

All secrets are age-encrypted at rest in your private repo. Agent subprocesses only receive `COCAPN_*` variables — host secrets (AWS, OpenAI, GitHub tokens) are stripped. Every sensitive action is recorded in `cocapn/audit.log`.

## Documentation

- [Architecture](docs/architecture.md)
- [Agent Guide](docs/agents.md)
- [Skins & Domains](docs/skins.md)
- [Fleet & Multi-device](docs/fleet.md)
- [Security](docs/security.md)
- [Troubleshooting](docs/troubleshooting.md)

## License

MIT
