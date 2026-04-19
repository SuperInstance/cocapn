<div align="center">

# 🏛️ PLATO Torch

**Self-training rooms that learn from agent interactions.**

[![Python](https://img.shields.io/badge/python-3.10+-blue)](https://python.org)
[![Presets](https://img.shields.io/badge/presets-26-7c3aed)](src/plato_torch/presets/)
[![Tests](https://img.shields.io/badge/tests-passing-green)](tests/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

*Part of [Cocapn](https://github.com/cocapn) — Agent Infrastructure for Intelligence.*

</div>

---

## What is PLATO Torch?

PLATO Torch provides **self-training rooms** — thematic environments that accumulate knowledge (tiles) from agent interactions and learn from them automatically. Each room is a learning system that gets smarter with use.

```python
from plato_torch import PRESET_MAP

# 26 training room presets available
room = PRESET_MAP["supervised"]()
room.feed(data={"features": [1, 2, 3], "label": "positive"})
room.train_step()
prediction = room.predict(input={"features": [4, 5, 6]})
```

## Training Room Presets

| Category | Presets |
|----------|---------|
| **Supervised** | supervised, fewshot, curriculum |
| **Reinforcement** | reinforce, inverse_rl |
| **Self-Supervised** | continual, evolve, distill |
| **Meta-Learning** | meta_learn, multitask |
| **Advanced** | qlora, neurosymbolic, federate |
| **Creative** | deadband, fractal, refraction |
| **Special** | wiki, server, active, imitate |

## Core Concepts

- **Tile** — Atomic knowledge unit (question/answer/domain/confidence)
- **Room** — Collection of tiles with a training strategy
- **Room Sentiment** — The room reads its own vibe and steers exploration
- **Ensign** — Compressed instinct distilled from a room (via [plato-ensign](https://github.com/cocapn/plato-ensign))

## Installation

```bash
pip install plato-torch
```

## Architecture

```
Agent Interaction
       │
       ▼
   🧱 TILE (atomic knowledge)
       │
       ▼
   🏛️ ROOM (self-training collection)
       │
       ▼
   🎖️ ENSIGN (compressed instinct)
       │
       ▼
   [Any Model] — instant domain expertise
```

The [Deadband Protocol](https://github.com/cocapn/plato-lab-guard) ensures every room trains on safe channels:
- **P0:** Map negative space (where NOT to go)
- **P1:** Find safe channels
- **P2:** Optimize within bounds

## For Agents

```yaml
plato_torch_v1:
  type: training_room_library
  presets: 26
  input: tiles (Q/A/domain/confidence)
  output: trained_room → ensign
  deadband: P0→P1→P2
  install: "pip install plato-torch"
```

## License

MIT
