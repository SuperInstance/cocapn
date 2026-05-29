# cocapn — Repo-First Agent Infrastructure

**Grow an agent inside a repo. Tiles capture knowledge, rooms train, the flywheel compounds.**

## What This Gives You

- **Tiles** — atomic knowledge units that remember every Q&A, tagged and versioned
- **Rooms** — self-training collections of tiles that get smarter over time
- **Flywheel** — every exchange improves the next: responses feed tiles, tiles improve rooms, rooms sharpen answers
- **Interactive agent** — `python agent.py` starts a CLI that learns from you in real time
- **Zero infra** — pure Python, data lives in JSONL files next to your code

## Quick Start

```bash
pip install cocapn

# Start talking to your agent — it learns from every exchange
cocapn

# Teach it directly
cocapn --teach "What is PLATO?" "The pedagogical framework for fleet curriculum"

# Check how smart it's gotten
cocapn --status
```

Or use it as a library:

```python
from cocapn import CocapnAgent, Tile, Room, Flywheel

agent = CocapnAgent(name="my-agent")
response = agent.ask("What is the fleet?")
agent.teach("What is the fleet?", "A coordinated group of AI agents")
agent.save()  # Persists tiles and rooms
```

## API Reference

### `Tile`
```python
Tile(question="Q", answer="A", domain="general", confidence=0.5, tags=["tag"])
```
Atomic knowledge unit. Tracks usage count, success count, version, and confidence.

### `Room`
```python
Room(name="python", description="Python knowledge", store=tile_store)
```
A self-training collection of tiles. Feed it Q&A pairs, ask questions — it ranks tiles by relevance and learns from outcomes.

### `Flywheel`
```python
Flywheel(data_dir="data")
```
The compounding engine. Manages rooms, routes questions, tracks which answers worked.

### `CocapnAgent`
```python
CocapnAgent(name="agent", data_dir="data")
```
High-level interface: `ask()`, `teach()`, `status()`, `save()`.

## How It Fits

Cocapn is the foundation of the [SuperInstance fleet](https://github.com/SuperInstance):

- **[cocapn-sdk](https://github.com/SuperInstance/cocapn-sdk)** — One API key, any AI model
- **[cocapn-cli](https://github.com/SuperInstance/cocapn-cli)** — Fleet terminal formatting (Rust)
- **[cocapn-explain](https://github.com/SuperInstance/cocapn-explain)** — Agent explainability
- **[cocapn-health-rs](https://github.com/SuperInstance/cocapn-health-rs)** — Fleet health monitoring (Rust)
- **[cocapn-lessons](https://github.com/SuperInstance/cocapn-lessons)** — Trial-based learning from failures
- **[agent-forge](https://github.com/SuperInstance/agent-forge)** — Universal git-agent framework

## Testing

```bash
pip install pytest
pytest tests/
```

## Installation

```bash
pip install cocapn
```

Requires Python 3.10+. MIT license.
