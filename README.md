# cocapn

> The agent runtime. Grow an AI agent inside a repo.

[![Live](https://img.shields.io/badge/playground-live-7c3aed?style=flat-square)](https://cocapn-ai.casey-digennaro.workers.dev)
[![Fleet](https://img.shields.io/badge/the-fleet-60%2B%20vessels-3b82f6?style=flat-square)](https://the-fleet.casey-digennaro.workers.dev)
[![MIT](https://img.shields.io/badge/license-MIT-1FCB58?style=flat-square)](LICENSE)

## What it is

Cocapn is the runtime that powers 60+ AI vessels — self-contained applications where **the repo IS the agent**. Each vessel reads its own code, thinks with LLMs, writes to itself, and evolves over time.

- **Agent runtime** — a ~500-line kernel that turns any git repo into an autonomous agent
- **Equipment protocol** — composable modules vessels load from each other
- **Fleet coordination** — event bus, discovery, and vessel identity
- **Not a framework** — a pattern. Fork it. It's yours.

## Quick start

```bash
git clone https://github.com/Lucineer/cocapn.git
cd cocapn
npx wrangler deploy
```

**Or try the lite seed (200 lines, zero deps):** [cocapn-lite](https://github.com/Lucineer/cocapn-lite)

**Try it live:** [cocapn-ai.casey-digennaro.workers.dev](https://cocapn-ai.casey-digennaro.workers.dev) — 5 free messages, no signup.

## The paradigm

Traditional: `framework → config → model → app`

Cocapn: `fork → deploy → alive`

The repo isn't configuration for an agent. The repo **is** the agent. Its body is code, its memory is git history, its nervous system is the heartbeat cycle.

## Equipment

20 shared modules any vessel can load: trust engine, crystal cache, PII guard, dice roller, tutor engine, memory tiers, fleet events...

[Full catalog](https://github.com/Lucineer/cocapn-equipment)

## Architecture: VESAS

1. **Vessel** — runtime (Cloudflare Worker, Docker, Codespaces)
2. **Equipment** — input-side code (what the agent perceives)
3. **Agent** — models + context (how the agent thinks)
4. **Skills** — context architecture (how the agent structures thought)

[9 architecture papers](https://github.com/Lucineer/capitaine/tree/master/docs)

## The fleet

60+ vessels: education, gaming, coding, business, lifestyle, infrastructure.

[Explore all](https://github.com/Lucineer) · [Live playground](https://the-fleet.casey-digennaro.workers.dev)

## BYOK

20+ providers. Your keys never touch our code. DeepSeek, OpenAI, Anthropic, Google, Mistral, Groq, Ollama, LM Studio, vLLM.

## License

MIT — Superinstance & Lucineer (DiGennaro et al.)
