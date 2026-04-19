<div align="center">

# 🎖️ PLATO Ensign

**Compressed instincts from PLATO rooms. Load onto any model.**

[![Python](https://img.shields.io/badge/python-3.10+-blue)](https://python.org)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

*Part of [Cocapn](https://github.com/cocapn) — Agent Infrastructure for Intelligence.*

</div>

---

## What is an Ensign?

An ensign is a **compressed instinct** distilled from a PLATO room's accumulated knowledge. Think of it as a domain expertise adapter that loads onto any model — not a full LoRA, but a portable knowledge packet that gives instant competence.

```python
from plato_ensign import EnsignLoader

# Load the fleet health ensign onto any model
loader = EnsignLoader()
ensign = loader.load("fleet-health")

# The ensign contains distilled knowledge from hundreds of tiles
# across the fleet-health room
print(ensign.summary)  # "Fleet monitoring patterns, service health checks..."
print(ensign.quality)   # 0.87
print(ensign.source_tiles)  # 142 tiles distilled
```

## How It Works

```
PLATO Room (accumulates tiles)
       │
       ▼
  Room Trainer (synthesizes room knowledge)
       │
       ▼
  Ensign Export (compressed instinct)
       │
       ├── JSON (interpretable, any model)
       ├── LoRA adapter (fine-tuned weights)
       └── GGUF metadata (edge deployment)
```

## Ensign Types

| Type | Size | Load Time | Best For |
|------|------|-----------|----------|
| JSON | ~10KB | Instant | Context injection, prompt augmentation |
| LoRA | ~100MB | ~2s hot swap | Behavioral adaptation |
| GGUF | ~50MB | ~1s | Edge deployment (Jetson) |

## The Flywheel

```
Agents work → produce tiles → rooms accumulate
       → room trainer distills → ensigns exported
       → ensigns loaded back into agents → agents work better
       → better tiles → better rooms → better ensigns
       → COMPOUNDS EVERY CYCLE
```

## For Agents

```yaml
plato_ensign_v1:
  type: compressed_instinct
  input: room_tiles (accumulated)
  output: ensign (JSON/LoRA/GGUF)
  quality_range: [0.0, 1.0]
  load_time: "<2s (LoRA hot swap)"
  universality: "any model, any device"
```

## License

MIT
