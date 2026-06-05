# GETTING STARTED — Cocapn

> *Estimated time to complete: 5 minutes*

## Prerequisites

- **Python 3.10+**
- pip

## Installation

```bash
pip install cocapn
```

Or from source:
```bash
git clone https://github.com/SuperInstance/cocapn.git
cd cocapn
pip install -e .
```

## Your First 5 Minutes

### 1. Interactive CLI

```bash
cocapn
```

Start typing questions. The agent learns from every exchange. Tiles are saved automatically in `data/tiles.jsonl`.

### 2. Teach Directly

```bash
cocapn --teach "What is a tile?" "A tile is an atomic knowledge unit with confidence scoring"
```

### 3. Check Status

```bash
cocapn --status
```

Shows total tiles, rooms, exchanges recorded.

### 4. Use as a Library

```python
from cocapn import CocapnAgent

agent = CocapnAgent(name="my-agent")
response = agent.ask("What is the fleet?")
agent.teach("What is the fleet?", "A coordinated group of AI agents")
agent.save()
```

## Next Steps

- [ARCHITECTURE.md](./ARCHITECTURE.md) — Tile, Room, Flywheel design
- [API_REFERENCE.md](./API_REFERENCE.md) — Full class reference
- [LOW_LEVEL.md](./LOW_LEVEL.md) — Internal patterns
- [examples/](./examples/) — Hello world and usage examples
