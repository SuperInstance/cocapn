# Getting Started with Cocapn

## What is Cocapn?

Cocapn is a **repo-first agent framework** — the repo IS the agent. It provides the shell that makes any LLM smarter over time by capturing every exchange as structured knowledge, feeding it back as context, and compounding improvement through a flywheel system.

Think of it as a lighthouse: the agent is the light, the LLM is the bulb, and Cocapn is the lens that focuses, captures, and broadcasts intelligence across a fleet.

### Core Loop

```
Agent chats → System captures exchange as a Tile
                    ↓
           Tile stored in a Room
                    ↓
           Room trains, sentiment shifts
                    ↓
           Next query → relevant Tiles injected as context
                    ↓
           Agent responds with past wisdom → better Tile captured
                    ↓
           THE FLYWHEEL COMPOUNDS
```

## Quick Start

### Install

```bash
pip install cocapn
```

### Minimum Viable Agent

```python
from cocapn import CocapnAgent

agent = CocapnAgent(api_key="your-api-key")

# Chat — the system captures and learns
response = agent.chat("What's the best way to handle errors in Go?")
print(response)

# Direct teaching — inject high-confidence knowledge
agent.teach(
    question="What is the deadband protocol?",
    answer="Block danger (P0), find safe channels (P1), optimize (P2).",
    confidence=0.95
)

# Check status
print(agent.status())
```

### With Config File

Create a `config.yaml` in your project root:

```yaml
agent:
  name: my-agent
  api_key: ${MOONSHOT_API_KEY}
  model: kimi-k2.5
  base_url: https://api.moonshot.ai/v1
```

```python
from cocapn import CocapnAgent

agent = CocapnAgent(config_path="config.yaml")
response = agent.chat("Explain the flywheel effect in agent systems")
```

## Key Concepts

### Vessels

A vessel is the repo that IS the agent. It contains the agent's config, knowledge (data/), memory, and personality (SOUL.md). The vessel is self-contained and git-portable.

### Tiles

The atomic unit of knowledge. Every tile has:
- `question` — the query or prompt
- `answer` — the response or knowledge
- `domain` — which room it belongs to (default: "general")
- `confidence` — how reliable this knowledge is (0.0–1.0)
- `source` — where it came from ("agent", "taught", etc.)
- `tags` — labels for filtering
- Auto-generated: `id` (hash), `timestamp`, `usage_count`, `success_count`, `version`

Tiles are persisted as JSONL files. They survive restarts.

```python
from cocapn import Tile

tile = Tile(
    question="What is PLATO?",
    answer="Knowledge tile system — atomic units of intelligence",
    domain="architecture",
    confidence=0.9,
    tags=["meta", "core-concept"]
)
```

### Rooms

Rooms are self-training collections of tiles. Each room has a sentiment score that shifts based on what it absorbs. Rooms query by word-overlap matching and tile priority.

```python
from cocapn import Room, TileStore

store = TileStore(path="data/tiles.jsonl")
room = Room(name="maritime", description="Maritime knowledge", store=store)

# Feed knowledge
room.feed("What does a lighthouse do?", "Marks the rocks, not the destination.", confidence=0.9)

# Query for relevant knowledge
tile = room.query("lighthouse purpose")
print(tile.answer)  # "Marks the rocks, not the destination."

# Generate context for agent injection
print(room.context_for_agent(limit=5))
```

### The Flywheel

The flywheel ties tiles and rooms together. It records exchanges, finds relevant context for new queries, and compounds knowledge over time.

```python
from cocapn import Flywheel

fw = Flywheel(data_dir="data")

# Record exchanges
fw.record_exchange("What is Rust?", "A systems language", room="code", confidence=0.8)

# Get context for a new query (injects past wisdom)
context = fw.get_context("Tell me about Rust programming")
# Returns formatted string of relevant past exchanges

# Check stats
print(fw.stats())
```

### Deadband Protocol

Safety layer with three priorities:
- **P0**: Block dangerous patterns (`rm -rf`, `DROP TABLE`, `eval()`, etc.)
- **P1**: Identify the safe channel (math, search, analysis, code, etc.)
- **P2**: Optimize within the safe channel

```python
from cocapn.deadband import Deadband

db = Deadband()
check = db.check("DROP TABLE users")
print(check.passed)      # False
print(check.violations)   # ['DROP\\s+TABLE']

check = db.check("Explain the math behind sorting")
print(check.passed)           # True
print(check.safe_channel)     # "math"
```

### Bottles (Bottle Protocol)

Git-native inter-agent communication. Bottles are messages written as files in `for-fleet/outbox/` and read from `from-fleet/inbox/`. The protocol is file-based and git-native — no API needed, just push/pull.

---

## API Reference

### `CocapnAgent`

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `__init__` | `api_key`, `model`, `base_url`, `data_dir="data"`, `config_path` | — | Create an agent. Auto-detects API keys from env vars. |
| `chat(user_input, room="general")` | `str`, `str` | `str` | Send a message. System captures the exchange, injects past context, returns response. |
| `teach(question, answer, room="general", confidence=0.9)` | `str`, `str`, `str`, `float` | `str` | Inject high-confidence knowledge directly. |
| `status()` | — | `str` | Human-readable status (exchanges, tiles, rooms). |
| `save()` | — | `None` | Persist all data to disk. |

### `Tile`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `question` | `str` | required | The query |
| `answer` | `str` | required | The response |
| `domain` | `str` | `"general"` | Room name |
| `confidence` | `float` | `0.5` | Reliability score (0–1) |
| `source` | `str` | `"agent"` | Origin |
| `tags` | `list` | `[]` | Labels |
| `id` | `str` | auto | MD5 hash |
| `timestamp` | `float` | auto | Unix time |
| `usage_count` | `int` | `0` | Times queried |
| `success_count` | `int` | `0` | Successful matches |
| `version` | `int` | `1` | Update count |

| Property | Returns | Description |
|----------|---------|-------------|
| `success_rate` | `float` | `success_count / usage_count` |
| `priority` | `float` | `log(usage+1) * confidence * success_rate` — higher = more relevant |

| Method | Description |
|--------|-------------|
| `record_use(success)` | Increment usage (and success if True) |
| `to_dict()` | Serialize to dict |
| `Tile.from_dict(d)` | Deserialize from dict |

### `TileStore`

| Method | Returns | Description |
|--------|---------|-------------|
| `__init__(path)` | — | Create/load store from JSONL file |
| `add(tile)` | `Tile` | Add or update a tile (deduplicates by ID) |
| `get(tile_id)` | `Tile \| None` | Get tile by ID |
| `search(query, domain, limit=5)` | `list[Tile]` | Keyword search sorted by priority |
| `all_tiles()` | `list[Tile]` | All tiles |
| `count` | `int` | Total tiles |

### `Room`

| Method | Returns | Description |
|--------|---------|-------------|
| `__init__(name, description, store)` | — | Create a room backed by a store |
| `feed(question, answer, confidence, source, tags)` | `Tile` | Add knowledge to the room |
| `query(question)` | `Tile \| None` | Find best matching tile |
| `context_for_agent(limit=10)` | `str` | Formatted context for agent injection |
| `stats` | `dict` | `{name, tiles, sentiment, avg_confidence}` |

### `Flywheel`

| Method | Returns | Description |
|--------|---------|-------------|
| `__init__(data_dir)` | — | Load tiles and rooms from data directory |
| `ensure_room(name, description)` | `Room` | Get or create a room |
| `record_exchange(question, answer, room, confidence, tags)` | `Tile` | Record a Q&A as a tile |
| `get_context(question, rooms, limit=10)` | `str` | Get relevant context across rooms |
| `stats()` | `dict` | `{total_tiles, rooms, exchanges}` |
| `save(data_dir)` | `None` | Persist all data |

### `Deadband`

| Method | Returns | Description |
|--------|---------|-------------|
| `check(text)` | `DeadbandCheck` | Scan input for dangerous patterns, identify safe channel |
| `filter_response(text)` | `str` | Strip dangerous patterns from output |

### `DeadbandCheck`

| Field | Type | Description |
|-------|------|-------------|
| `passed` | `bool` | True if input is safe |
| `violations` | `list` | Regex patterns that matched |
| `safe_channel` | `str` | Best-fit safe channel ("math", "code", "general", etc.) |

---

## Data Storage

Cocapn stores data in a `data/` directory:

```
data/
├── tiles.jsonl      # All tiles, one JSON object per line
└── rooms.json       # Room definitions
```

Tiles are append-only JSONL. Rooms are lightweight configs. Both survive restarts and are git-friendly.

## Configuration

### Environment Variables

The agent checks these in order for API keys:
1. `MOONSHOT_API_KEY`
2. `DEEPSEEK_API_KEY`
3. `GROQ_API_KEY`

### config.yaml

```yaml
agent:
  name: my-vessel
  api_key: sk-xxx
  model: kimi-k2.5
  base_url: https://api.moonshot.ai/v1
```

## Supported Models

Any OpenAI-compatible chat completions endpoint works. Set `base_url` and `model`:

- **Moonshot** (default): `kimi-k2.5` at `https://api.moonshot.ai/v1`
- **DeepSeek**: `deepseek-chat` at `https://api.deepseek.com`
- **Groq**: `llama-3.3-70b-versatile` at `https://api.groq.com/openai/v1`
- **Any OpenAI-compatible**: Just set the URL and model name
