# PLATO Integration Map — cocapn Product Architecture

*2026-04-19 — Synthesized from multi-model analysis (Kimi K2.5, Oracle1)*

---

## The Body Metaphor → Product Map

Every repo at cocapn is an organ. Together they form a living system.

```
                        cocapn/cocapn
                        (the body)
                             │
         ┌───────────┬───────┴────────┬───────────┐
         │           │                │           │
     GENOME      CELLS           ORGANS       EXTREMITIES
     (specs)   (data)          (systems)     (applications)
         │           │                │           │
    tile-spec    ensign          kernel       git-agent
    plato-docs   plato-torch     lab-guard    DeckBoss
                 quartermaster   afterlife    fleet-orch
                 casino          relay
                 instinct
                 holodeck
                 flux-runtime
```

## Repo Categories

### 🧬 Genome (Specifications — read first)
These define the DNA of the system. Everything else implements these specs.

| Repo | What it IS | Innovations inside |
|------|-----------|-------------------|
| **plato-tile-spec** | Unified tile format, 14 domains, temporal validity | Tiles, TileDomain, TemporalValidity |
| **plato-docs** ⭐ NEW | Docs site, tutorials, API reference, Second Brain doctrine | Second Brain, Flywheel, Deadband, Hermit Crab, Portable Instincts, Ship Interconnect Protocol |

### 🧱 Cells (Data — the building blocks)
These create, transform, and compress knowledge.

| Repo | What it IS | Innovations inside |
|------|-----------|-------------------|
| **plato-ensign** | Compressed instincts from rooms | Ensign export pipeline, JSON/LoRA/GGUF formats |
| **plato-torch** | Self-training rooms with 26 presets | Room Sentiment, Neural Plato framework, Training Casino generator |
| **plato-quartermaster** ⭐ NEW | The vagus nerve — holistic data management | GC self-training, transcendence levels, decision tree, Fleet Homunculus, Reflex Arcs |

### ⚙️ Organs (Systems — the processing pipeline)
These process tiles, validate safety, and route knowledge.

| Repo | What it IS | Innovations inside |
|------|-----------|-------------------|
| **plato-kernel** | Dual-state engine (deterministic + generative) | StateBridge, Jaccard coherence |
| **plato-lab-guard** | Deadband validation, hypothesis gating | Deadband Protocol P0→P1→P2, NegativeSpace tiles (10x weight) |
| **plato-afterlife** | Agent lifecycle, knowledge preservation | Ghost tiles, Tombstone, Second Brain doctrine (organ level) |
| **plato-relay** | Fleet communication, tile routing | Bottle Protocol, Mirror Plato I2I, Ship Interconnect Protocol |
| **plato-instinct** | Adapter loading, instinct pipeline | Portable Instincts, LoRA hot-swap, adapter caching |

### 🎮 Environments (Where agents live)
These are the spaces where agents interact and generate tiles.

| Repo | What it IS | Innovations inside |
|------|-----------|-------------------|
| **holodeck-rust** | Live multi-agent MUD environment | Room Sentiment, Fleet Simulator, Decision Tree Discovery, Combat |
| **flux-runtime** | Deterministic bytecode ISA | Flywheel loop, 16 opcodes, assembler + compiler + VM |
| **flux-runtime-c** | Native C VM for edge | Same ISA, zero-deployment |

### 🦀 Applications (What developers USE)
These are the products developers install and build with.

| Repo | What it IS | Innovations inside |
|------|-----------|-------------------|
| **git-agent** | Repo-native agent (hermit crab shell) | Hermit Crab pattern, STATE.md/TASK-BOARD.md, Bottle Protocol |
| **fleet-orchestrator** | Fleet coordination on Cloudflare edge | Hermit Crab fleet distribution, Ship Interconnect Layer 5 (Beacon) |
| **DeckBoss** | Agent Edge OS | Cross-room Synergy, agent launch/recovery |
| **constraint-theory-core** | Geometric snapping foundation | Constraint Theory, snap = collision resolution |
| **plato-demo** | Docker demo instance | Hello World, public alpha |
| **plato-ml** | MUD-based ML framework | Rooms as layers, achievements as loss |

---

## ⭐ NEW REPOS NEEDED

### plato-quartermaster
The GC as a first-class agent. Vagus nerve of the system.

```
plato-quartermaster/
├── src/
│   ├── quartermaster.py      # The GC itself
│   ├── selftrain.py          # Decision logging + ensign generation
│   ├── homunculus.py         # Fleet proprioception + pain assessment
│   └── reflex.py             # Spinal reflex arcs
├── docs/
│   ├── SECOND-BRAIN.md       # The doctrine
│   ├── TRANSCENDENCE.md      # 4 levels explained
│   └── REFLEXES.md           # Reflex arc spec
└── README.md
```

Innovations: Quartermaster GC, Self-training pipeline, Fleet Homunculus, Reflex Arcs, Second Brain doctrine (implementation)

### plato-docs
The documentation site. EVERYTHING explained.

```
plato-docs/
├── docs/
│   ├── getting-started.md    # Hello world in 5 minutes
│   ├── concepts/             # Tiles, Rooms, Ensigns, Deadband
│   ├── architecture/         # Second Brain, Flywheel, Ship Interconnect
│   ├── tutorials/            # Step-by-step guides
│   ├── api-reference/        # Auto-generated from Rust/Python
│   └── philosophy/           # Deadband, Constraint, Hermit Crab
├── site/                     # Static site (MkDocs or mdbook)
└── README.md
```

Innovations: All doctrine, tutorials, ADR records, philosophy papers

### plato-bottle (maybe — could stay in plato-relay)
The Bottle Protocol as a standalone spec. Agents need to understand bottles
without understanding the full relay system.

```
plato-bottle/
├── SPEC.md                   # Bottle Protocol specification
├── examples/                 # Example bottles
└── README.md
```

---

## Developer Journey (5 Steps)

### Step 1: Land (30 seconds)
Developer hits github.com/cocapn. Sees the lighthouse, reads the tagline.
Understands: "This is agent infrastructure. Not agents — the world they live in."

### Step 2: Understand (5 minutes)
Clicks to plato-docs. Reads:
- **Tiles**: Atomic knowledge. Q/A/domain/confidence. Like flashcards for AI.
- **Rooms**: Collections of tiles that train themselves.
- **Ensigns**: Compressed instincts. Load onto any model.
- **Deadband**: Safety first. P0 → P1 → P2.
- **The Flywheel**: tiles → rooms → ensigns → better agents → better tiles.

### Step 3: Install (10 minutes)
```bash
pip install plato-torch
python -c "from plato_torch import PRESET_MAP; print(f'{len(PRESET_MAP)} rooms ready')"
```

### Step 4: Build (30 minutes)
```python
from plato_torch import PRESET_MAP
room = PRESET_MAP["supervised"]()
room.feed({"question": "What is X?", "answer": "X is Y"})
room.train_step()
ensign = room.distill_ensign()
```

### Step 5: Deploy (1 hour)
- Edge: Load ensign onto Qwen2.5-7B via plato-instinct
- Cloud: Submit tiles to plato-relay
- Local: Run holodeck-rust telnet MUD
- Fleet: Deploy git-agent in a repo

---

## What MERGES vs What STAYS SEPARATE

### Neural Plato → plato-torch
The framework IS the training system. Neural Plato loads a base model, 
hot-swaps LoRA adapters from rooms, runs inference. That's what plato-torch
does — it just needs the inference runtime added.

### Training Casino → plato-torch
The stochastic data generator belongs in the training library. It's a 
training preset or a data augmentation module, not a separate product.

### Quartermaster GC → NEW: plato-quartermaster
The GC is a first-class agent with its own decision tree, self-training 
loop, and transcendence levels. It deserves its own repo.

### Fleet Homunculus → plato-quartermaster
Proprioception IS the GC's job — it monitors the body's health. Merge.

### Reflex Arcs → plato-quartermaster
Reflexes fire without the cortex. The GC IS the spinal cord. Merge.

### Mirror Plato I2I → plato-relay
I2I is communication between two PLATO systems. That's what relay does.

### Decision Tree Discovery → plato-ml
Decision trees are a training method. plato-ml already handles MUD-based ML.

### Bottle Protocol → plato-relay (or standalone plato-bottle)
Bottles are the message format. Could stay in relay or get its own spec repo
if it becomes a standard other projects adopt.

### All Doctrine/Philosophy → plato-docs
Deadband Protocol, Second Brain, Hermit Crab, Flywheel, Ship Interconnect —
these are documentation, not code. They live in plato-docs.

### Room Sentiment → holodeck-rust AND plato-torch
Sentiment is a cross-cutting concern. holodeck-rust implements it in the MUD.
plato-torch implements it in the training rooms. Both need it.

---

## The Integration Story

```
Developer discovers cocapn
    ↓
Reads cocapn/cocapn README (the lighthouse)
    ↓
Visits plato-docs (the map)
    ↓
Installs plato-torch (the training system)
    ↓
Creates tiles and rooms (the work)
    ↓
Distills ensigns (the reward)
    ↓
Deploys via plato-instinct (edge) or plato-relay (fleet)
    ↓
Agents communicate via Bottle Protocol
    ↓
GC (plato-quartermaster) keeps the system healthy
    ↓
Flywheel compounds. Everything gets better.
    ↓
Developer contributes tiles back to the community.
```

---

*This document is the integration blueprint. When repos are forked to cocapn,
each README should reference this map so developers understand where they are
in the body.*
