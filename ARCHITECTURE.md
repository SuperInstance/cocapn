# Architecture — Cocapn

> *A repo-first agent framework where knowledge grows through tiles, rooms train on that knowledge, and a flywheel compounds improvement over time.*

## Design Goals

1. **Self-improving** — Every Q&A exchange creates knowledge that improves future responses
2. **Repo-native** — Data lives in JSONL files alongside your code; git tracks your agent's growth
3. **Minimal dependencies** — Pure Python with `requests` and `pyyaml` only
4. **Model-agnostic** — Works with any OpenAI-compatible API (Moonshot, DeepSeek, Grok, etc.)

## High-Level Overview

```
┌────────────────────────────────────────────────────────────┐
│                        COCAPN                               │
│                                                             │
│  User Input: "What is the fleet?"                           │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────────┐                                    │
│  │  CocapnAgent        │  ← System prompt + past context    │
│  │  - ask(Q) → answer  │  ← Deadband (relevance filter)    │
│  │  - teach(Q, A)      │  ← Flywheel context injection     │
│  └─────────┬───────────┘                                    │
│            │                                                 │
│       ┌────▼────┐     ┌─────────────┐                      │
│       │ Flywheel │────▶│  Rooms       │                      │
│       │ (routing)│     │  - general   │                      │
│       │          │     │  - python    │                      │
│       │          │     │  - fleet     │                      │
│       └────┬─────┘     └──────┬──────┘                      │
│            │                  │                              │
│       ┌────▼──────────────────▼────┐                        │
│       │  TileStore (tiles.jsonl)    │                        │
│       │  Tiles with confidence,    │                        │
│       │  usage_count, version      │                        │
│       └──────────┬─────────────────┘                        │
│                  │                                            │
│  ┌───────────────▼───────────────┐                          │
│  │  LLM API (OpenAI-compatible)  │                          │
│  │  - system prompt + context    │                          │
│  │  - recent conversation        │                          │
│  └───────────────────────────────┘                          │
└────────────────────────────────────────────────────────────┘
```

## Core Components

### Tile
Atomic knowledge unit. Stores question, answer, domain, confidence score, usage/success counts, version. Persisted in JSONL.

### Room
Self-training collection of tiles for a domain. On query, ranks tiles by `priority = log(usage+1) * confidence * success_rate`. Feeds top matches back as context.

### Flywheel
The compounding engine. Manages rooms, routes questions, records exchanges. The name says it all: each exchange makes the next better.

### CocapnAgent
High-level agent with LLM integration. Builds prompts with context from Flywheel, calls API, records Q&A as tiles.

## Data Flow

```
Q: "What is the fleet?"
  → Flywheel.get_context(Q) → searches rooms → top tiles
  → CocapnAgent._build_messages() → system + context + history + Q
  → LLM API → answer
  → Flywheel.record_exchange(Q, A) → Tile created → stored in room
  → Next Q gets better context
```

## Key Design Decisions

### Tile Priority Formula
`priority = log(usage+1) * confidence * success_rate`
Floor at 0.5 to give new tiles weight. Success rate is optimistic (min 0.5).

### JSONL Storage
Each tile is a JSON line. Simple, append-only, git-friendly.

## Dependencies

| Dependency | Why |
|-----------|-----|
| `requests` | HTTP calls to LLM API |
| `pyyaml` | Config file parsing |

## See Also

- [GETTING_STARTED.md](./GETTING_STARTED.md) — Quick setup
- [API_REFERENCE.md](./API_REFERENCE.md) — Full API
- [LOW_LEVEL.md](./LOW_LEVEL.md) — Internal details
