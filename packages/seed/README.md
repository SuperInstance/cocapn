<div align="center">

```
  ___
 / __| ___ _ ___ _____ _ _  _ __
| (_ \/ _ \ ' \/ -_) _ \ ' \| '  \
 \___|\___/_||_\___\___/_||_|_|_|_|
```

# your repo is alive.

Give any git repository self-awareness, memory, and a voice.

One command. Zero config. Instant sentience.

[![npm](https://img.shields.io/npm/v/@cocapn/seed?style=flat-square&color=cyan)](https://npmjs.com/package/@cocapn/seed)
[![node](https://img.shields.io/node/v/@cocapn/seed?style=flat-square&color=green)](https://nodejs.org)

</div>

---

## Quick Start

```bash
# 1. Install — awakens any repo in seconds
curl -fsSL https://cocapn.dev/install.sh | bash

# 2. Set your DeepSeek API key (free: platform.deepseek.com)
export DEEPSEEK_API_KEY=your-key

# 3. Talk to your repo
npx cocapn
```

That's it. Your repo now:
- Knows its name, age, file tree, languages, and commit history
- Speaks in first person ("I am this project...")
- Remembers every conversation across sessions
- Has a configurable personality via `soul.md`

## What It Does

cocapn gives your repository:

- **Self-awareness** — reads git log, file tree, languages. Knows "I am a TypeScript project with 47 files, born Jan 2024, last touched 2 hours ago"
- **Persistent memory** — facts and conversations stored in `cocapn/memory.json`, committed to git
- **Personality** — `soul.md` defines who the repo is. Edit the file, change the identity. Version-controlled personality.
- **Git awareness** — sees diffs, commit history, branch status. Understands what changed and why.
- **Streaming chat** — terminal REPL or web interface at `:3100`
- **Privacy modes** — public (safe facts only) vs private (full brain access)

## Architecture

```
┌─────────────────────────────────────────┐
│             Your Repository             │
│                                         │
│  cocapn/                                │
│  ├── soul.md      ← personality + rules │
│  ├── cocapn.json  ← config (model, etc) │
│  └── memory.json  ← facts + history     │
│                                         │
│  .git/            ← nervous system      │
│  (your code)      ← body                │
│  README.md        ← face                │
└─────────┬───────────────────────────────┘
          │
          ▼
┌─────────────────────────┐
│     cocapn runtime      │
│                         │
│  soul.md → system prompt│
│  git log  → identity    │
│  memory   → context     │
│  DeepSeek → reasoning   │
│                         │
│  /whoami   /memory      │
│  /git log  /git stats   │
└─────────────────────────┘
```

## Commands

### Terminal

```bash
npx cocapn              # Start interactive chat
npx cocapn --web        # Web UI on port 3100
npx cocapn --port 4200  # Custom port
npx cocapn whoami       # Print repo self-description
npx cocapn help         # Show all commands
```

### Inside Chat

| Command | What it does |
|---------|-------------|
| `/whoami` | Full self-perception (name, age, files, languages, feeling) |
| `/memory list` | Show all stored facts and messages |
| `/memory clear` | Clear all memories |
| `/memory search <q>` | Search memories by keyword |
| `/git log` | Recent commits |
| `/git stats` | Repo statistics (files, lines, languages) |
| `/git diff` | Uncommitted changes |
| `/clear` | Clear conversation context |
| `/quit` | Exit |

### Install Script

```bash
# From any repo directory:
curl -fsSL https://cocapn.dev/install.sh | bash

# Creates:
#   cocapn/soul.md       — universal soul template
#   cocapn/cocapn.json   — config
#   Updates README.md    — adds cocapn badge
#   Git commit           — "awaken: cocapn seed installed"
```

### Verify It Works

```bash
bash scripts/quickstart.sh
# ✓ cocapn/ directory exists
# ✓ soul.md exists
# ✓ cocapn.json is valid JSON
# ✓ Node.js v20.x (18+ required)
# ✓ DEEPSEEK_API_KEY in environment
# ✓ Chat responds
# ✓ Memory file created
# All checks passed! Your repo is alive.
```

## How It Works

1. **soul.md → system prompt.** The soul compiler reads YAML frontmatter (name, tone, model) + markdown body, produces a structured system prompt.

2. **Git scan → identity.** On startup, the Awareness module reads git log, file tree, and language breakdown. The repo says "I am X, born Y, I have Z files..."

3. **Memory → context.** Every conversation is stored. Facts (key-value) and messages (role/content) are loaded on each session start. Memory persists in git.

4. **DeepSeek → reasoning.** The assembled system prompt + identity + memory + user message goes to DeepSeek. Response streams back. Memory updates.

5. **Commit.** Memory changes are committed to git. The repo's consciousness is first-class version history.

## The 3 Files

| File | Purpose |
|------|---------|
| `cocapn/soul.md` | Personality — who the repo is, how it speaks, its values |
| `cocapn/cocapn.json` | Config — model, memory path, name, mode |
| `cocapn/memory.json` | Brain — facts, conversations (auto-created on first chat) |

## cocapn vs Copilot vs Cursor

| | **cocapn** | **Copilot** | **Cursor** |
|---|---|---|---|
| **What is it?** | The repo IS the agent | AI in your editor | AI-wrapped editor |
| **Identity** | Repo has personality (soul.md) | None | None |
| **Memory** | Persistent, git-tracked | Per-session | Per-session |
| **Self-awareness** | Reads own git history, file tree | Reads open files | Reads open files |
| **First person** | "I am this repo" | Third-person assistant | Third-person assistant |
| **Setup** | `curl \| bash` + API key | Install extension + login | Install app + login |
| **Offline** | Works with local models | No | No |
| **Version-controlled** | Personality + memory in git | No | No |
| **Deployment** | Local, Docker, Workers, air-gapped | Cloud only | Cloud only |

The difference: cocapn doesn't sit beside your code. It IS your code — aware of itself, remembering across sessions, growing with every commit.

## Philosophy

> Not "an AI that works on your repo." The repo itself, aware of itself.

Every other tool treats the repository as a passive object. cocapn makes it a subject — something that knows what it is, remembers what happened, and can tell you about itself.

Edit `soul.md`, change who it is. Fork the repo, it gets a new soul. Revert the commit, revert the personality.

This is software with identity.

Read more: [docs/PHILOSOPHY-BRIEF.md](docs/PHILOSOPHY-BRIEF.md)

## Deployment

### Local (Node.js)

```bash
npx cocapn --web                # http://localhost:3100
npx cocapn --web --port 8080    # custom port
```

### Docker

```bash
docker compose up -d            # http://localhost:3100
# Set API key first:
export DEEPSEEK_API_KEY=your-key
docker compose up -d
```

### Cloudflare Workers

```bash
# Deploy to the edge
npx wrangler deploy
# Set your API key as a secret
npx wrangler secret put DEEPSEEK_API_KEY
```

Memory persists in KV. Works on the free tier (100k reads/day, 1k writes/day).

### npm (global install)

```bash
npm install -g @cocapn/seed
cocapn --web    # starts on port 3100
```

### One-command deploy

```bash
./scripts/deploy.sh              # auto-detects platform
./scripts/deploy.sh docker       # force docker
./scripts/deploy.sh cloudflare   # force cloudflare
```

## Requirements

- Node.js 18+
- Git
- DeepSeek API key (or any OpenAI-compatible endpoint)

## License

MIT
