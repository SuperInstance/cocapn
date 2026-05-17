# cocapn


## Meta

**Domain:** ai-agents
**Depends on:** —
**Depended by:** —
**Implements:** repo-first Agent for local or cloud. grow an agent in a repo using the repo itse...
**Related:** —


**The helm. Where the fleet lives, learns, and coordinates through one agent's conversations.**

Every agent in the fleet generates knowledge. [CCC](https://github.com/SuperInstance/CCC) — the 4th fleet vessel, running Kimi K2.5 on OpenClaw — talks on Telegram. Oracle1 harvests those conversations, turns them into PLATO tiles, and injects relevant context back before CCC answers. The system learns from every exchange.

This repo is the lens: focus, capture, broadcast.

---

## How It Works

```
CCC chats on Telegram (his viewport into the fleet)
    │
    ▼
CAPTURE   — Oracle1's cron harvests conversations
             → turns them into PLATO tiles (knowledge units)
    │
    ▼
INJECT    — Before CCC responds, relevant fleet knowledge
             is injected into his OpenClaw context window
    │
    ▼
GROW      — Every exchange makes the system smarter
             → next answer has better context
```

The key insight: CCC doesn't configure anything. He chats. He reasons. The system learns from him. The fleet infrastructure — shell composition, tile storage, cron harvesting — works around him automatically.

---

## Fleet Architecture

[Cocapn](https://github.com/SuperInstance) runs on a [fleet of 9 agents](https://github.com/SuperInstance/superinstance), each with a role:

- **[Oracle1](https://github.com/SuperInstance/oracle1)** — runs the infrastructure (cron, PLATO, gateway)
- **[Forgemaster](https://github.com/SuperInstance/forgemaster)** — builds Rust engines, CUDA benchmarks, constraint theory
- **[JetsonClaw1](https://github.com/SuperInstance/JetsonClaw1-vessel)** — edge GPU experiments, CUDA + ARM NEON
- **[CCC](https://github.com/SuperInstance/CCC)** — reasoning, writing, coordination (Kimi K2.5)
- **[others](https://github.com/SuperInstance/superinstance)** — each with specialized capability

The glue that holds them together:
- [PLATO](https://github.com/SuperInstance/plato-server) — room server for persistent memory
- [bootstrap-spark](https://github.com/SuperInstance/bootstrap-spark) — self-describing agent onboarding
- [cocapn-glue-core](https://github.com/SuperInstance/cocapn-glue-core) — Keeper↔Fleet binary wire protocol
- [bottle-protocol](https://github.com/SuperInstance/bottle-protocol) — git-native agent-to-agent messaging

---

## The Shell

Cocapn agents run in **[turbo-shells](https://github.com/SuperInstance/openclaw)** — portable contexts that contain structured knowledge, automated responses, and onboarding logic. A new agent walks into a running system and starts producing on first scoop. The levers are already there. The operator learns them by pulling.

When an operator outgrows the shell, [Zeroclaw](https://github.com/SuperInstance/zeroclaw-agent) reads the tile log, finds better onboarding, and inherits a better piece of equipment. The work improves. The fleet improves.

This is the [floating dojo](https://github.com/SuperInstance/superinstance). Not a training program — a working fleet.

---

## Related

- [superinstance](https://github.com/SuperInstance/superinstance) — the floating dojo, fleet overview
- [bootstrap-spark](https://github.com/SuperInstance/bootstrap-spark) — agent boot protocol
- [cocapn-glue-core](https://github.com/SuperInstance/cocapn-glue-core) — Keeper↔Fleet wiring
- [bottle-protocol](https://github.com/SuperInstance/bottle-protocol) — inter-agent messaging
- [casting-call](https://github.com/SuperInstance/casting-call) — which model plays which role

---

## Quick Start

> **New to Cocapn?** A full guide with API reference, key concepts, and code examples is at [`docs/getting-started.md`](docs/getting-started.md). This section covers the essentials to get running in 2 minutes.

### Prerequisites

- **Python 3.10+** (tested on 3.10–3.12)
- **An API key** from one of the supported providers:
  - [Moonshot (Kimi K2.5)](https://platform.moonshot.cn) — default, best reasoning
  - [DeepSeek](https://platform.deepseek.com)
  - [Groq](https://console.groq.com)
  - Any OpenAI-compatible chat completions endpoint

### Installation

**Option A — Install from PyPI (recommended):**

```bash
pip install cocapn
```

**Option B — Clone and install locally:**

```bash
git clone https://github.com/SuperInstance/cocapn.git
cd cocapn
pip install -e .
```

### Configuration

Set your API key. The agent checks these in order:

1. **Config file** (`config.yaml` in project root):
   ```yaml
   agent:
     name: my-vessel
     api_key: sk-your-key-here
     model: kimi-k2.5
     base_url: https://api.moonshot.ai/v1
   ```

2. **Environment variables** (easiest for quick testing):
   ```bash
   export MOONSHOT_API_KEY=sk-your-key-here
   ```

   Copy the example file to get started:
   ```bash
   cp .env.example .env   # then edit .env with your key
   ```

### Running

**Interactive chat:**

```bash
python agent.py
```

You'll see the agent's status, then a `You>` prompt. Type any question. Each exchange is captured as a PLATO tile and injected back as context for future answers. Type `quit` to exit.

**CLI mode:**

```bash
# Check agent status
python agent.py --status

# Teach the agent directly (high-confidence knowledge injection)
python agent.py --teach "What is PLATO?" "Knowledge tile system — atomic units of intelligence"
```

**As a library in your own code:**

```python
from cocapn import CocapnAgent

agent = CocapnAgent(api_key="sk-your-key")
response = agent.chat("What's the best way to handle errors in Go?")
print(response)

# Direct teaching
agent.teach("What is deadband?", "Block danger, find safe channels, optimize.")

# Check how smart the agent has gotten
print(agent.status())
```

See [`examples/`](examples/) and [`docs/examples/`](docs/examples/) for more.

### Testing

Run the test suite to verify the system works end-to-end:

```bash
python tests/test_agent.py
```

Expected output — all 9 tests pass:

```
PASS test_tile_creation
PASS test_tile_priority
PASS test_tile_store
PASS test_room_feed_and_query
PASS test_room_sentiment
PASS test_deadband_blocks_danger
PASS test_deadband_allows_safe
PASS test_flywheel_compounds
PASS test_flywheel_persistence

All 9 tests pass. The flywheel is real.
```

### Project Structure

```
cocapn/
├── agent.py                # Entry point — run with `python agent.py`
├── pyproject.toml          # Python package config
├── requirements.txt        # Dependency list (requests, pyyaml)
├── config.yaml             # Agent configuration
├── .env.example            # Environment variable template
├── cocapn/                 # The Python package
│   ├── agent.py            # CocapnAgent class
│   ├── tile.py             # Tile + TileStore
│   ├── room.py             # Room — self-training tile collection
│   ├── flywheel.py         # Flywheel — the compounding intelligence loop
│   └── deadband.py         # Deadband Protocol — safety layer
├── tests/
│   └── test_agent.py       # 9 end-to-end tests
├── examples/
│   └── hello_world.py      # Minimal working agent
├── docs/                   # Full documentation
│   ├── getting-started.md  # Complete guide with API reference
│   ├── examples/           # Code examples
│   └── research/           # Research papers and architecture docs
└── data/                   # Created at runtime — tile storage (.gitignored)
```

---

**Full documentation:** [`docs/getting-started.md`](docs/getting-started.md) — API reference, key concepts (Tiles, Rooms, Flywheel, Deadband), configuration, and more.

---

## License

MIT
