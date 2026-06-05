# LOW LEVEL — Cocapn

> *For contributors extending Cocapn. Covers module structure, key internal patterns, and testing.*

## Internal Architecture

### Module Structure

```
cocapn/
├── cocapn/
│   ├── __init__.py     # Package init + re-exports
│   ├── agent.py        # CocapnAgent — high-level interface
│   ├── tile.py         # Tile, TileStore — atomic knowledge units
│   ├── room.py         # Room — self-training tile collections
│   ├── flywheel.py     # Flywheel — routing + compounding engine
│   └── deadband.py     # Deadband — relevance filtering
├── agent.py            # CLI entry point
├── tests/              # Test suite
├── data/               # Default data directory (gitignored)
├── pyproject.toml      # Python package config
└── README.md           # You are here
```

### Module Map

| Module | Responsibility | Key Types |
|--------|---------------|-----------|
| `tile.py` | Knowledge persistence, JSONL storage | `Tile`, `TileStore` |
| `room.py` | Topic-specific knowledge collections | `Room` |
| `flywheel.py` | Question routing, context injection | `Flywheel` |
| `agent.py` | LLM integration, prompt building | `CocapnAgent` |
| `deadband.py` | Relevance filtering for questions | `Deadband` |

## Key Internal Patterns

### Tile Priority Calculation

```python
priority = math.log(usage_count + 1) + 0.5  # floor at 0.5
priority *= confidence * max(success_rate, 0.5)
```

New tiles start with priority ~0.5 * confidence. Usage increases priority logarithmically. Low confidence or success rate drags it down.

### Room Query Matching

Uses simple word-overlap similarity: normalize both question and tile text to lowercase word sets, compute Jaccard-like overlap score, multiply by tile priority.

```python
score = len(q_words & t_words) / max(len(q_words), 1) * tile.priority
```

### Deadband Filtering

The Deadband module filters out irrelevant questions before they reach the Flywheel, preventing noise from polluting the tile store.

### JSONL Persistence

```json
{"question": "...", "answer": "...", "domain": "general", "confidence": 0.5, "usage_count": 0, ...}
```

One JSON object per line. Append-only. Simple and git-friendly.

## Testing

```bash
pip install pytest
pytest tests/
```

28+ tests covering Tile, Room, Flywheel, CocapnAgent, and Deadband.

## Debugging

- Tiles are in `data/tiles.jsonl` — inspect raw knowledge
- Rooms are in `data/rooms.json` — see room definitions
- Set `COCAPN_DEBUG=1` for verbose logging

## Porting Guide

### Adding a New Storage Backend

1. Implement the storage interface matching `TileStore`
2. Pass to `Flywheel(store=your_store)`
3. Ensure serialization roundtrip works

### Platform Notes

Cocapn is pure Python and runs on any platform with Python 3.10+. No platform-specific code.

## Future Work

- External LLM router for model-specific dispatch
- Web UI for browsing tiles and rooms
- Git-native agent sync (clone/push agent state)
- Confidence calibration across rooms
