<div align="center">

# Cocapn

### *Clone a repo. It's alive.*

The repository IS the agent. Not a runtime that works on repos — the repo itself is a living entity. Its code, AI, memory, wiki, frontend, and backend all grow together in Git. Two repos: private brain, public face. Clone it, it works. Deploy anywhere.

[![CI](https://github.com/CedarBeach2019/cocapn/actions/workflows/ci.yml/badge.svg)](https://github.com/CedarBeach2019/cocapn/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/cocapn.svg)](https://www.npmjs.com/package/cocapn)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[Live Demo](https://cocapn-agent.magnus-digennaro.workers.dev) ·
[Docs](https://docs.cocapn.app) ·
[Architecture](docs/ARCHITECTURE.md)

</div>

---

## Getting Started in 60 Seconds

```bash
# 1. Install cocapn into any git repo
curl -fsSL https://cocapn.dev/install.sh | bash

# 2. Set your API key (DeepSeek, OpenAI, or use local Ollama)
export DEEPSEEK_API_KEY=your-key-here

# 3. Talk to your repo
npx cocapn
```

That's it. Your repo is alive. It knows its name, its history, and its purpose. It will learn about you and remember across sessions.

```
cocapn — the repo IS the agent
I am myproject. My purpose: Build cool stuff. I was born 3 months ago, on 2024-01-15.
I have 47 files in my body. I speak TypeScript, Python. I remember 152 commits.
Type /help for commands

you> Hello!
myproject: ...
```

**Prefer a web UI?** `npx cocapn --web` starts a chat server at `http://localhost:3100`.

**No API key?** Install [Ollama](https://ollama.com) and cocapn auto-detects it — fully local, no internet needed.

**Customize your agent:** Edit `soul.md` to change who the agent is. See [packages/seed/docs/SOUL-GUIDE.md](packages/seed/docs/SOUL-GUIDE.md) for tips.

---

## What It Is

Cocapn is an open-source agent framework where **the repo is the agent**. Every repo you create with it is a self-contained AI entity — it remembers, learns, and grows. Git is the database. `soul.md` is the personality. The agent doesn't search your code — it *is* your code.

Two repos per agent: a **private brain** (facts, memory, personality, secrets) and a **public face** (website, skin, domain). Fork it, customize it, deploy it. MIT license, no vendor lock-in, fully self-hosted.

## Quick Start

```bash
npm create cocapn
# → Prompts for username, domain, template
# → Creates private repo (alice-brain) + public repo (alice.makerlog.ai)
# → Scaffolds soul.md, config, memory/, wiki/

cd alice-brain
cocapn secret set DEEPSEEK_API_KEY     # stored in keychain, never in git
cocapn start --public ../alice.makerlog.ai

# In another terminal:
cd ../alice.makerlog.ai && npm run dev
# → http://localhost:5173 — your agent is alive
```

Open the chat. Close it. Restart tomorrow. **Your agent remembers everything.**

![Cocapn Chat UI](docs/demo-screenshot.png)

## How It Works

```
  ┌──────────────────────────┐       ┌──────────────────────────┐
  │     PRIVATE REPO          │       │     PUBLIC REPO           │
  │     (the brain)           │       │     (the face)            │
  │                           │       │                           │
  │  cocapn/                  │       │  cocapn.yml               │
  │  ├── soul.md              │       │  index.html               │
  │  ├── config.yml           │       │  src/        (Vite+React) │
  │  ├── memory/              │       │  skin/       (theme)      │
  │  │   ├── facts.json       │ sync  │  CNAME       (domain)     │
  │  │   ├── memories.json    │──────▶│                           │
  │  │   ├── procedures.json  │       │  Deploys to:              │
  │  │   └── repo-understanding/      │  Cloudflare / Docker /    │
  │  ├── wiki/                │       │  local / air-gapped       │
  │  ├── skills/              │       │                           │
  │  └── agents/              │       └──────────────────────────┘
  │                           │
  │  secrets/    (gitignored) │
  └──────────────────────────┘
```

### The Brain

`soul.md` defines who the agent is. Edit this file, change the agent. Version-controlled personality.

Memory is structured, not dumped:

| Store | What it holds | Persistence |
|-------|--------------|-------------|
| `facts.json` | User properties, preferences | Explicit, never decays |
| `memories.json` | Observations with confidence scores | Decay over time |
| `procedures.json` | Learned multi-step workflows | Merged on repeat |
| `relationships.json` | Entity-relation graph | Add-only |
| `repo-understanding/` | Git-derived architectural knowledge | Re-derived from commits |

### Four Modes

| Mode | Trigger | Brain Access | When |
|------|---------|-------------|------|
| **Private** | Local WebSocket | Full brain + filesystem + git | You, the owner |
| **Public** | HTTP to `/api/chat` | Facts only (no `private.*`) | Visitors to your site |
| **Maintenance** | Cron / heartbeat | Full brain + git + npm | Agent maintains itself |
| **Fleet** | A2A protocol message | Scoped by fleet policy | Other agents |

### It Learns from Git

Every commit teaches the agent. It reads `git log`, `git blame`, `git diff` and builds understanding — why decisions were made, what patterns exist, where the hotspots are. The agent isn't searching code. It's the senior maintainer who's been there since day one.

## Features

- **Git is the database** — memory is version-controlled, auditable, portable. No external DB required.
- **Clone it, it works** — fork → add API key → run → live agent with a website. That's it.
- **Multi-provider LLM** — DeepSeek, OpenAI, Anthropic, or local models (Ollama/llama.cpp). Swap without rewriting.
- **Plugin system** — extend with npm packages. Skills run hot (in-process) or cold (sandboxed). Explicit permissions.
- **Fleet protocol** — multiple agents coordinate via A2A. Distribute tasks, share context across repos.
- **Privacy by design** — `private.*` facts never leave the brain repo. Publishing layer enforces the boundary.
- **Offline-first** — runs locally. Cloud is optional enhancement, not requirement.
- **Zero lock-in** — MIT license. Your data lives in Git repos on your machine. Take it anywhere.

## Deployment

Same codebase, four environments:

```bash
# Local (full power)
cocapn start

# Docker
docker compose up

# Cloudflare Workers
cocapn deploy --env production

# Air-gapped (no internet, local LLM only)
AIR_GAPPED=1 cocapn start --llm local
```

| Capability | Local | Docker | Workers | Air-Gapped |
|-----------|-------|--------|---------|------------|
| Git-backed memory | Yes | Yes | D1/KV fallback | Yes |
| LLM chat | Yes | Yes | Yes | Local model |
| File editing | Yes | Yes | No | Yes |
| Git operations | Yes | Yes | No | Yes |
| Vector search | Yes | Yes | No | Keyword only |
| Fleet coordination | Yes | Yes | Yes | Yes |

## Verticals

Cocapn is the engine. Verticals are powered repos — themed, configured, ready to deploy:

| Vertical | Domain | Focus |
|----------|--------|-------|
| [DMlog.ai](https://dmlog.ai) | TTRPG | Game console, campaign management, dice |
| [Fishinglog.ai](https://fishinglog.ai) | Fishing | Commercial fleet + recreational angler |
| [Deckboss.ai](https://deckboss.ai) | Maritime | Vessel management, crew coordination |

More verticals: makerlog.ai, studylog.ai, businesslog.ai, activeledger.ai, playerlog.ai, reallog.ai. Every feature works on every domain. Templates are curated starting points.

## Comparison

| | **Cocapn** | **Claude Code** | **Cursor** | **Mem0** |
|--|-----------|----------------|------------|----------|
| Paradigm | Repo IS the agent | Agent edits repos | IDE plugin | Memory service |
| Persistent memory | Git-backed brain | Session only | Session only | External service |
| Offline-first | Yes | No | No | No |
| Self-hosted | Yes | No | No | Optional |
| Fleet coordination | A2A protocol | None | None | None |
| Plugin system | npm + sandbox | None | Extensions | Integrations |
| Vendor lock-in | None (MIT) | Proprietary | Proprietary | Managed service |
| Version-controlled | Git (everything) | No | No | No |

Cocapn isn't a coding assistant. It's an agent that *is* the repo — it remembers, grows, and has a public face. Clone it, deploy it, fork it.

## CLI

```bash
cocapn init                # Create two-repo agent project
cocapn start               # Start local bridge
cocapn deploy              # Deploy public repo to Cloudflare
cocapn status              # Bridge + agent status
cocapn plugin install      # Install plugin from npm
cocapn skill load          # Load skill into bridge
cocapn secret set KEY      # Store secret in OS keychain
cocapn health              # Health check (local + cloud)
```

## Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, code style, and PR guidelines.

## License

MIT — see [LICENSE](LICENSE) for details.

Fork of [superinstance/cocapn](https://github.com/superinstance/cocapn).

---

<div align="center">

**Built by [Superinstance](https://superinstance.com)**

</div>
