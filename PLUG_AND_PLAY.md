# PLUG_AND_PLAY — Cocapn

> **Repo-first agent infrastructure. Grow an agent inside a repo — tiles capture knowledge, rooms train, the flywheel compounds.**

## What Is This?

Cocapn is a lightweight Python framework for building self-improving agents. Every question-answer exchange creates a **tile** (atomic knowledge unit), tiles populate **rooms** (topic collections), and the **flywheel** routes questions to the best room. The more you use it, the smarter it gets.

## Why Should You Care?

- **Zero infrastructure** — Pure Python, data lives in JSONL files next to your code
- **Self-improving** — Every Q&A improves the next; confidence scores update automatically
- **Repo-native** — Grow your agent's knowledge directly in your git repository
- **Plays with any model** — Bring your own LLM or use the built-in CLI

## Quick Start

```bash
pip install cocapn
cocapn
```

## ✨ Key Features

- **Tiles** — Atomic knowledge units with confidence, tags, version tracking
- **Rooms** — Self-training collections that rank tiles by relevance
- **Flywheel** — Compounding engine that routes questions and tracks outcomes
- **Interactive CLI** — `cocapn` starts a learning session; `cocapn --teach "Q" "A"`

## Next Steps

| Guide | What It Covers |
|-------|----------------|
| [`GETTING_STARTED.md`](./GETTING_STARTED.md) | Install, first agent, teach a tile |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Tile, Room, Flywheel design |
| [`API_REFERENCE.md`](./API_REFERENCE.md) | Every public class and method |
| [`LOW_LEVEL.md`](./LOW_LEVEL.md) | Internals, extension points |

## Status

**v0.1.0 — Alpha.** Core tile/room/flywheel system is stable. CLI and Python API are functional.
