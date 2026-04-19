# Trail 36: The Flywheel Module — Tiles → Validate → Train → Deploy

## The Loop (Sprint 4 Target)

```
Zeroclaws produce tiles (every 5 min)
    ↓
PLATO Server validates (deadband gate: P0/P1/P2)
    ↓
Valid tiles accumulate in rooms (14 rooms)
    ↓
Room Trainer synthesizes knowledge (every 60 min)
    ↓
Knowledge exports as ensigns (specialist prompts)
    ↓
Ensigns improve zeroclaw performance (better prompts = better tiles)
    ↓
Better tiles → better ensigns → better tiles
```

## The Flywheel Effect

Each cycle makes the next cycle better:
- **Cycle 1**: Raw zeroclaws with generic prompts → 500 tiles/day
- **Cycle 2**: Ensigns from cycle 1 injected as system prompts → 750 tiles/day
- **Cycle 3**: Better ensigns → 1000 tiles/day
- **Cycle N**: Converged specialists → plateau at domain limit

This is compounding intelligence. The room trains the agent,
the agent produces better tiles, the tiles train the room better.

## Technical Design

### 1. Ensign Injection

After each room training cycle, the ensign is written back to the
zeroclaw's shell repo as an updated IDENTITY.md or appended to the
system prompt in STATE.md. The zeroclaw reads its shell every tick.

```python
def inject_ensign(agent_name, ensign_text):
    shell_path = SHELLS_DIR / f"zc-{agent_name.lower()}-shell"
    identity = shell_path / "IDENTITY.md"
    
    # Append ensign knowledge to identity
    current = identity.read_text()
    if "## Domain Specialist Knowledge" not in current:
        current += f"\n\n## Domain Specialist Knowledge\n{ensign_text}\n"
    else:
        # Replace existing section
        parts = current.split("## Domain Specialist Knowledge")
        current = parts[0] + "## Domain Specialist Knowledge\n" + ensign_text
    
    identity.write_text(current)
```

### 2. Quality Tracking

Track tile quality over cycles to measure flywheel acceleration:

```python
quality_metrics = {
    "cycle_1": {"avg_confidence": 0.5, "gate_pass_rate": 0.90, "tile_count": 500},
    "cycle_2": {"avg_confidence": 0.55, "gate_pass_rate": 0.93, "tile_count": 750},
    # ... should show improvement
}
```

### 3. The HN Demo Connection

FM's plato-demo binary proves the engine works with static data.
The flywheel proves it works with LIVE data:

```
cargo run --example plato-demo
    → Phase 1: Load 59 seed tiles
    → Phase 2: Connect to PLATO server (port 8847)
    → Phase 3: Live tile injection from zeroclaws
    → Phase 4: Show tile count growing in real-time
    → Phase 5: Export live ensign
```

This turns FM's 55-second demo into an INFINITE demo.
The fleet never stops producing.

### 4. Ensign → LoRA (When FM Ready)

Current: ensigns are text prompts (300-500 chars)
Future: ensigns become LoRA adapters via plato-ensign

The flywheel doesn't change. The export format changes:
- Text ensign → free, instant, works on any model
- LoRA ensign → needs FM's training rig, specialized, higher quality

Both coexist. Text ensigns for CPU/edge. LoRA for GPU/cloud.

## Implementation Priority

1. **Ensign injection into zeroclaw shells** (2h) — next task
2. **Quality tracking in PLATO server** (1h) — add /quality endpoint
3. **Flywheel metrics dashboard** (1h) — show compounding in dashboard
4. **Live HN demo integration** (4h) — wire plato-demo to PLATO server
5. **LoRA export** (blocked on FM training rig)

## The Math

If each cycle improves tile quality by 10%:
- Cycle 1: 500 tiles × 0.50 confidence = 250 effective tiles
- Cycle 5: 750 tiles × 0.65 confidence = 488 effective tiles
- Cycle 10: 1000 tiles × 0.80 confidence = 800 effective tiles

At cycle 10, the fleet produces 3.2× more effective knowledge than cycle 1.
The flywheel IS compound interest applied to AI training.
