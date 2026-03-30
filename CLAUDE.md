# CLAUDE.md — Cocapn Development Guide

> **For Claude Code and agentic workers.** This file is the single source of truth for conventions, architecture, and workflows.

---

## Project Overview

**Cocapn** is a paradigm: the repo IS the agent. Not "an agent that works on a repo" — the repo itself is a living entity. Its code, AI, knowledge, wiki, frontend, and backend all grow together in Git. Clone it, it works. Deploy anywhere.

Two repos per user:
- **Private repo (brain)** — soul.md, facts, wiki, procedures, relationships. All committed. Only `secrets/` is gitignored.
- **Public repo (face)** — Vite app, skin, domain config. Everything committed. No secrets, no private data.

Git is the database. The agent has persistent memory across sessions. It understands WHY the code is the way it is through RepoLearner (git history analysis → repo-understanding/).

---

## The Paradigm

Five principles:

1. **Two repos, one agent.** Private = brain. Public = face. Git is the database.
2. **soul.md is the agent.** Edit this file, change who the agent is. Version-controlled personality.
3. **The repo IS the model.** The agent doesn't search the repo — it IS the repo. Senior maintainer through accumulated presence.
4. **Clone it, it works.** Fork → add secrets → run → website → growing.
5. **Framework vs vertical.** The cocapn monorepo is the engine. A vertical (fishinglog, dmlog) is a powered repo.

---

## Repository Structure

```
cocapn/
├── packages/
│   ├── local-bridge/          # Core bridge (Node.js, WebSocket, Git, agents)
│   │   ├── src/
│   │   │   ├── bridge.ts              # Bridge lifecycle
│   │   │   ├── ws/server.ts           # WebSocket JSON-RPC server
│   │   │   ├── agents/                # Agent registry, router, spawner
│   │   │   ├── brain/                 # Memory: facts, wiki, soul, procedures, relationships
│   │   │   ├── cli/                   # Init wizard, CLI commands
│   │   │   ├── cloud-bridge/          # Cloudflare Workers integration
│   │   │   ├── config/                # YAML config loading, types
│   │   │   ├── context/               # Context management
│   │   │   ├── fleet/                 # Fleet coordination
│   │   │   ├── git/                   # Git sync, repo-understanding
│   │   │   ├── handoff/               # Module handoff system
│   │   │   ├── health/                # Health checks
│   │   │   ├── llm/                   # Multi-provider LLM with streaming
│   │   │   ├── mcp-client/            # Connect to external MCP servers
│   │   │   ├── metrics/               # Metrics collection
│   │   │   ├── modules/               # Module manager
│   │   │   ├── multi-tenant/          # Multi-tenant support (rewriting for fleet-of-repos)
│   │   │   ├── personality/           # Personality presets (rewriting for soul.md-driven)
│   │   │   ├── plugins/               # Plugin system, loader, permissions
│   │   │   ├── publishing/            # Public/private boundary, profile export
│   │   │   ├── queue/                 # LLM request queue
│   │   │   ├── scheduler/             # Cron-based task scheduling
│   │   │   ├── security/              # JWT, fleet keys, age encryption
│   │   │   ├── settings/              # Bridge settings
│   │   │   ├── skills/                # Built-in skill system
│   │   │   ├── streaming/             # LLM streaming support
│   │   │   ├── templates/             # Template installer/manager
│   │   │   ├── tools/                 # Built-in tools (file, shell, git, etc.)
│   │   │   ├── utils/                 # Shared utilities
│   │   │   └── webhooks/              # GitHub/Slack/Discord webhook handlers
│   │   └── tests/                     # Unit + integration tests
│   ├── cloud-agents/          # Cloudflare Workers
│   │   └── src/
│   │       ├── admiral.ts             # AdmiralDO Durable Object
│   │       └── auth/                  # Signup, signin, JWT, rate limiting
│   ├── cli/                   # Command-line interface
│   │   └── src/commands/             # deploy, init, skills, start, status, etc.
│   ├── create-cocapn/         # Scaffolding (npm create cocapn)
│   │   └── src/
│   │       ├── index.ts               # Entry point
│   │       ├── prompts.ts             # Interactive prompts
│   │       ├── scaffold.ts            # Repo scaffolding
│   │       └── templates.ts           # Template selection
│   ├── protocols/             # MCP (client/server) + A2A protocol (zero deps)
│   ├── ui-minimal/            # Lightweight web client (Preact + HTM)
│   ├── modules/               # Reference modules
│   ├── templates/             # Built-in templates (bare, dmlog, makerlog, etc.)
│   ├── schemas/               # JSON schemas (enforced via SchemaValidator)
│   └── vscode-extension/      # VS Code extension
├── e2e/                      # Playwright end-to-end tests
├── docs/
│   ├── site/                  # Documentation site (HTML)
│   ├── designs/               # Design documents
│   └── ARCHITECTURE.md        # Architecture spec (this paradigm's source)
├── Dockerfile                # Docker support
├── docker-compose.yml        # Docker Compose config
└── CLAUDE.md                 # THIS FILE
```

---

## Architecture

### Two-Repo Model

```
Private repo (brain):          Public repo (face):
alice-brain/                   alice.makerlog.ai/
├── cocapn/                    ├── cocapn.yml
│   ├── soul.md                ├── index.html
│   ├── config.yml             ├── src/
│   ├── memory/                ├── skin/makerlog/
│   ├── wiki/                  └── CNAME
│   ├── tasks/
│   └── agents/
└── secrets/  (gitignored)
```

### Brain Memory Model — Five Stores

| Store | Purpose | Latency | Conflict |
|-------|---------|---------|----------|
| `facts.json` | Flat KV — user properties, preferences | ~2ms | Last-write-wins |
| `memories.json` | Typed entries with confidence decay | ~5ms | Duplicate rejection |
| `procedures.json` | Learned workflows (step-by-step) | ~2ms | Merge steps |
| `relationships.json` | Entity-relation graph | ~3ms | Add edges, never remove |
| `repo-understanding/` | Git-derived self-knowledge | ~10-50ms | Manual > git-derived |

Knowledge confidence levels: Explicit (1.0, never decays) > Preference (0.9) > Error pattern (0.8) > Implicit (0.7) > Git-derived (0.6). Decay runs every 6 hours. Max 1000 entries.

### Multi-Mode Agent

| Mode | Trigger | Brain Access | External Access |
|------|---------|-------------|-----------------|
| **Public** | HTTP to /api/chat | Facts only (no `private.*`) | LLM API |
| **Private** | WebSocket from local client | Full brain | LLM + filesystem + git |
| **Maintenance** | Cron / heartbeat | Full brain | LLM + git + npm |
| **A2A** | Fleet protocol message | Config-defined subset | LLM + tools |

Facts prefixed with `private.*` never leave the private repo. The publishing layer (`src/publishing/`) strips private keys before any public response.

### RepoLearner (planned)

Git history analysis that populates `repo-understanding/`:
- `architecture.json` — Decision log with rationale (from commit messages, ADRs)
- `file-history.json` — Per-file historical context
- `patterns.json` — Detected code patterns
- `module-map.json` — Module boundaries with reasons

On startup: scans last 200 commits. On each commit: categorizes and updates.

### Deployment Spectrum

| Feature | Local | Docker | Workers | Air-Gapped |
|---------|-------|--------|---------|------------|
| Git-backed memory | full | full | D1/KV fallback | full |
| LLM chat | full | full | full | Local model only |
| File editing | full | full | no | full |
| Git operations | full | full | no | full |
| Fleet coordination | full | full | full | full |

Environment auto-detects: `CLOUDFLARE_ACCOUNT_ID` → Workers, `DOCKER_CONTAINER` → Docker, `AIR_GAPPED=1` → local models only.

---

## Development Workflow

```bash
cd /tmp/cocapn

# Local bridge (most work happens here)
cd packages/local-bridge && npm install
npx vitest run                        # Run all tests
npx vitest run tests/brain.test.ts    # Single test file
npx tsc --noEmit                      # Type check

# CLI
cd packages/cli && npm install && npm run build

# Protocols
cd packages/protocols && npx vitest run

# Cloud agents
cd packages/cloud-agents && npx tsc --noEmit

# E2E
cd e2e && npx playwright test

# Docker
docker-compose up --build

# Deploy to Cloudflare Workers
cd packages/cli && cocapn deploy --env production
```

---

## Key Files

### Core Bridge
| File | What it does |
|------|-------------|
| `local-bridge/src/bridge.ts` | Bridge lifecycle: start/stop, wires all subsystems |
| `local-bridge/src/ws/server.ts` | WebSocket server: JSON-RPC, streaming, auth |
| `local-bridge/src/brain/index.ts` | Memory layer: facts, wiki, soul, tasks, relationships |
| `local-bridge/src/agents/router.ts` | Routes messages to agents by capability or substring |
| `local-bridge/src/agents/spawner.ts` | Spawns agent processes with env/context |
| `local-bridge/src/agents/registry.ts` | Loads agent definitions from YAML |
| `local-bridge/src/config/types.ts` | BridgeConfig interface + defaults |
| `local-bridge/src/config/loader.ts` | YAML to BridgeConfig with defaults merge |
| `local-bridge/src/llm/provider.ts` | Multi-provider LLM (deepseek, openai, anthropic, local) |

### Brain & Memory
| File | What it does |
|------|-------------|
| `local-bridge/src/brain/index.ts` | Brain API: getSoul, getFact, setFact, searchWiki, createTask |
| `local-bridge/src/git/` | GitSync — repo sync, auto-commit, auto-push |
| `local-bridge/src/publishing/` | Public/private boundary enforcement, profile export |
| `local-bridge/src/personality/` | Personality presets (being replaced by soul.md-driven) |

### Security & Fleet
| File | What it does |
|------|-------------|
| `local-bridge/src/security/jwt.ts` | Fleet JWT signing/verification |
| `local-bridge/src/fleet/` | Fleet coordination and presence |
| `local-bridge/src/webhooks/` | GitHub/Slack/Discord handlers, HMAC verification |

### Cloud & Auth
| File | What it does |
|------|-------------|
| `cloud-agents/src/admiral.ts` | AdmiralDO: tasks, heartbeats, registry, messages |
| `cloud-agents/src/auth/` | Signup, signin, JWT, rate limiting |

### CLI & Scaffolding
| File | What it does |
|------|-------------|
| `cli/src/commands/deploy.ts` | Deploy to Cloudflare Workers |
| `cli/src/commands/init.ts` | Initialize cocapn project |
| `cli/src/commands/start.ts` | Start the bridge |
| `create-cocapn/src/scaffold.ts` | Two-repo scaffolding |

### Protocols
| File | What it does |
|------|-------------|
| `protocols/src/mcp/` | MCP client/server/transport (zero external deps) |
| `protocols/src/a2a/` | A2A client/server (zero external deps) |

---

## Conventions

- **Superinstance attribution** — commits by agentic workers: `Author: Superinstance`
- **TypeScript strict** — all packages use `"strict": true`
- **ESM only** — all packages use `"type": "module"`
- **Absolute imports** — `../src/foo.js` (with `.js` extension for ESM)
- **No JSX in backend** — Preact + HTM for web (no JSX build step)
- **Vitest** — test framework. Tests go in `tests/` next to `src/`.
- **No console.log in production** — use Logger class or `console.info`/`console.warn` with `[prefix]`
- **YAML config** — `config.yml` (private) and `cocapn.yml` (public)
- **Schemas enforced** — JSON files validated against `schemas/` via SchemaValidator
- **Privacy by design** — `private.*` facts never leave the private repo

### Subagent Spawning

When spawning subagents for parallel work:
- Use the Agent tool with `isolation: "worktree"` for code changes
- Use `subagent_type: "Explore"` for codebase research
- Use `subagent_type: "Plan"` for architecture decisions
- Keep subagent prompts specific and self-contained

---

## Verticals

The cocapn monorepo is the engine. Verticals are powered repos:

| Vertical | Domain | Focus |
|----------|--------|-------|
| DMlog.ai | dmlog.ai | TTRPG game console, campaign management |
| Fishinglog.ai | fishinglog.ai | Commercial + recreational fishing |
| Deckboss.ai | deckboss.ai | Fleet management (commercial fishing) |

All features are installable on any domain. Templates (bare, businesslog, cloud-worker, dmlog, makerlog, studylog, web-app) are curated starting points with soul.md, config, and default modules.

---

## Onboarding Flow

```bash
npm create cocapn
# → Prompts: username, domain, template
# → Creates private repo (alice-brain) and public repo (alice.makerlog.ai)
# → Scaffolds soul.md, config.yml, memory/, wiki/, Vite app, skin/

cd alice-brain
cocapn secret set DEEPSEEK_API_KEY    # OS keychain, never in git

cocapn start --public ../alice.makerlog.ai
# → Loads soul.md → initializes brain → starts WebSocket
```

---

## Codebase Status

### What EXISTS (works now)
- Bridge lifecycle, WebSocket JSON-RPC, multi-provider LLM
- Brain memory (facts, wiki, soul, tasks, relationships)
- Git sync, auto-commit, publishing layer
- Plugin system, skill cartridges, template installer
- MCP client for external tool servers
- Fleet protocol (A2A), webhooks, analytics
- Docker support (Dockerfile, docker-compose.yml)
- Cloudflare Workers deployment (AdmiralDO, auth)

### What's BEING REWRITTEN
- `brain/index.ts` — Adding mode-aware access, repo-understanding integration
- `create-cocapn` — Rewriting for two-repo model (private + public)
- `multi-tenant/` — Rewriting for fleet-of-repos (each repo is a tenant)
- `personality/` — Replacing presets with soul.md-driven personality

### What's PLANNED (not yet built)
- **RepoLearner** — Git history → repo-understanding/ (core new module)
- **Mode switcher** — Public/private/maintenance/A2A detection
- **soul.md compiler** — Explicit parsing into system prompt
- **Offline LLM** — Ollama/llama.cpp for air-gapped deployment

### Known Issues
- `age-encryption` libsodium WASM fails on ARM64 (Jetson) — platform-specific, not a code bug
- Agent secret injection doesn't resolve `"secret:KEY"` references (registry.ts)
- PAT embedded in git remote URL during init (init.ts) — security consideration
