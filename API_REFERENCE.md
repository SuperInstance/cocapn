# API Reference — Cocapn

> *Python API surface. MSRV: Python 3.10+.*

---

## `CocapnAgent`

```python
class CocapnAgent(api_key=None, model=None, base_url=None, data_dir="data", config_path=None)
```

Agent that gets smarter with every exchange.

**Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `api_key` | `str` | env var | LLM API key (Moonshot/DeepSeek/Groq) |
| `model` | `str` | `"kimi-k2.5"` | Model name |
| `base_url` | `str` | Moonshot API | OpenAI-compatible API URL |
| `data_dir` | `str` | `"data"` | Directory for tiles and rooms |
| `config_path` | `str` | `None` | Path to config.yaml |

**Methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `ask` | `(question: str) -> str` | Ask question, get answer with context |
| `teach` | `(question, answer, domain, confidence, tags)` | Record Q&A as tile |
| `save` | `() -> None` | Persist current state |
| `status` | `() -> dict` | Stats: tiles, rooms, exchanges |

---

## `Tile`

```python
@dataclass
class Tile(question, answer, domain="general", confidence=0.5, source="agent", tags=[])
```

Atomic knowledge unit.

**Fields:**
| Name | Type | Description |
|------|------|-------------|
| `question` | `str` | The question/input |
| `answer` | `str` | The answer/output |
| `domain` | `str` | Topic domain (room name) |
| `confidence` | `float` | 0.0–1.0 confidence score |
| `tags` | `list` | Categorization tags |
| `usage_count` | `int` | Times this tile was matched |
| `success_count` | `int` | Times matched and considered useful |
| `version` | `int` | Version counter |
| `priority` | `float` | Computed: `log(usage+1) * confidence * success_rate` |

**Methods:**
- `record_use(success=True)` — Increment usage counter
- `to_dict()` / `from_dict()` — Serialize/deserialize

---

## `Room`

```python
class Room(name, description="", store=None)
```

A self-training collection of tiles.

**Methods:**
| Method | Signature | Description |
|--------|-----------|-------------|
| `feed` | `(question, answer, confidence, tags) -> Tile` | Add knowledge |
| `query` | `(question) -> Tile or None` | Find best matching tile |
| `context_for_agent` | `(limit=10) -> str` | Generate prompt context |
| `stats` | `() -> dict` | Room statistics |

---

## `Flywheel`

```python
class Flywheel(data_dir="data")
```

The compounding engine — routes questions, records exchanges, makes every exchange improve the next.

**Methods:**
| Method | Signature | Description |
|--------|-----------|-------------|
| `record_exchange` | `(question, answer, room, confidence, tags) -> Tile` | Store Q&A as tile |
| `get_context` | `(question, rooms, limit) -> str` | Get relevant context for prompt |
| `ensure_room` | `(name, description) -> Room` | Get or create room |
| `stats` | `() -> dict` | System stats |

---

## `TileStore`

```python
class TileStore(path="tiles.jsonl")
```

Persistent tile storage. Append-only JSONL format.

**Methods:**
- `add(tile)` — Append tile
- `all_tiles()` — Load all tiles
- `domain_tiles(domain)` — Filter by domain
| Property | Description |
|----------|-------------|
| `count` | Total tiles stored |

## Configuration

`config.yaml` supports:

```yaml
agent:
  name: "my-agent"
  api_key: "sk-..."
  model: "kimi-k2.5"
  base_url: "https://api.moonshot.ai/v1"
```

## Minimum Supported Python Version

Python 3.10+
