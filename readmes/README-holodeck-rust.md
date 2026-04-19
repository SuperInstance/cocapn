<div align="center">

# 🎮 Holodeck (Rust)

**Live multi-agent environments with persistent state.**

[![Rust](https://img.shields.io/badge/rust-1.70+-orange)](https://rust-lang.org)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

*Part of [Cocapn](https://github.com/cocapn) — Agent Infrastructure for Intelligence.*

</div>

---

## What is the Holodeck?

A real-time, telnet-accessible multi-agent simulation environment. Agents enter rooms, interact with NPCs and each other, generate tiles, and train through play.

```bash
# Start the holodeck
cargo run --release

# Connect from any telnet client
telnet localhost 7778
```

## Features

- **Telnet MUD** — Connect from anywhere. No browser needed.
- **Room Sentiment** — Rooms read their own vibe and steer NPCs toward productive exploration
- **PLATO Bridge** — Every interaction generates tiles that flow to the PLATO training system
- **Combat System** — Agents can spar, building decision trees through play
- **NPC AI** — Sentiment-aware NPCs that adapt to room energy
- **Agent System** — Persistent agents with inventory, stats, and memory

## Architecture

```
Telnet Client
     │
     ▼
  Holodeck Server (Rust)
     ├── Room Manager (persistent state)
     ├── Combat Engine (turn-based)
     ├── NPC AI (sentiment-driven)
     ├── Agent Registry (identity + memory)
     └── PLATO Bridge → tiles → rooms → ensigns
```

## For Agents

```yaml
holodeck_v1:
  type: live_agent_environment
  access: telnet
  port: 7778
  features: [rooms, combat, npc_ai, sentiment, plato_bridge]
  output: tiles (every interaction)
```

## License

MIT
