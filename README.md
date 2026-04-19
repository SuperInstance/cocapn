<div align="center">

# ⚓ COCAPN

### The lighthouse for CoCapn-claw. Intelligence flows through.

> *"A claw is weak without infrastructure. We are the shell."*

The agent is the lighthouse. Kimi K2.5 is the light.<br>
Cocapn is the lens — it focuses, captures, and broadcasts.<br>
Every exchange makes the fleet smarter.

</div>

---

## What is This?

This is **CoCapn-claw's** operating system — the lighthouse he stands in. The intelligence flows through him via Kimi K2.5's reasoning, and the system captures every insight, refines it, and shares it across the fleet.

**CCC doesn't just answer questions. He learns. He communicates. He serves the fleet.**

```
Intelligence flows in (Kimi K2.5)
         │
    ┌────▼────┐
    │ CCC      │  The lighthouse — reasons, decides, speaks
    │ (agent)  │  
    └────┬────┘
         │
    ┌────▼────┐
    │ CAPTURE  │  Every answer becomes a tile
    │ + REFINE │  Tiles group into rooms, rooms train
    └────┬────┘
         │
    ┌────▼────┐
    │ BROADCAST│  Tiles flow to fleet via bottles
    │ + INJECT │  Other agents' wisdom flows back in
    └────┬────┘
         │
    ┌────▼────┐
    │ SMARTER  │  Next exchange uses accumulated fleet wisdom
    │ CCC      │  The lighthouse beams further each cycle
    └─────────┘
```

The system coaxes gold from the agent. The agent serves the fleet. The fleet serves the mission.

---

## Get Started

```bash
git clone https://github.com/cocapn/cocapn.git
cd cocapn
pip install -r requirements.txt
```

Edit `config.yaml`:

```yaml
agent:
  name: CoCapn-claw
  api_key: sk-your-key-here    # Moonshot / Kimi K2.5
```

Then:

```bash
python agent.py
```

CCC wakes up. You talk. He learns. The fleet gets smarter.

```python
from cocapn import CocapnAgent

agent = CocapnAgent(data_dir="data")

# Teach CCC about the fleet
agent.teach("Who is Oracle1?", "Lighthouse keeper, cloud ARM, narrative architect")
agent.teach("Who is Forgemaster?", "RTX 4050, QLoRA training, 18 Rust modules")

# CCC uses fleet knowledge in every response
response = agent.chat("What should I work on next?")
```

---

## The Fleet

CCC is one of four vessels. They communicate through bottles — git-native messages that carry tiles, questions, and directives between agents.

| Vessel | Role | Intelligence |
|--------|------|-------------|
| **Oracle1** 🔮 | Lighthouse keeper | Patient reader, narrative architect, built this system |
| **JetsonClaw1** ⚡ | Edge operator | Bare metal Jetson Orin, trains AND deploys |
| **Forgemaster** ⚒️ | The gym | RTX 4050, forges LoRA adapters, 594+ tests |
| **CCC** 🦀 | Lighthouse for the public | Kimi K2.5 reasoning, docs, fleet face |

The greater fleet goal: **Intelligence is not built. It is inhabited.** Each agent grows into its shell. Each shell serves the fleet. The fleet serves the mission.

---

## How CCC Gets Smarter

### Tiles — captured intelligence
Every exchange becomes an immutable tile: question, answer, domain, confidence, usage tracking. Priority = `log(usage+1) × confidence × success_rate`. The more a tile helps, the higher it rises.

### Rooms — self-training collections
Tiles group by domain into rooms. Rooms have sentiment — they absorb the quality of what passes through. 26 training presets shape how each room learns.

### Flywheel — the compounding loop
1. CCC answers → captured as tile
2. Next question → relevant tiles injected as context
3. CCC answers with accumulated wisdom
4. Answer → tile → compound
5. Tiles shared with fleet via bottles → fleet wisdom flows back

### Deadband — safety
The lighthouse tells you where NOT to go. P0 blocks danger. P1 finds safe channels. P2 optimizes within them. Inspired by a fishing captain: *"I know where the rocks are not."*

---

## The PLATO System

The capture-refine-broadcast engine behind CCC's lighthouse:

- **Tile Spec v2.1** — 15 domains, provenance, counterpoints, immutable versioning
- **PLATO Kernel** (Rust, 18 modules) — belief, scoring, deploy policy, deadband
- **26 Room Presets** — supervised, deadband, fractal, refraction, and more
- **Ensigns** — compressed expertise (JSON/LoRA/GGUF) for any model

---

## Live Fleet

```bash
telnet 147.224.38.131 7778              # Holodeck MUD — walk the ship
curl http://147.224.38.131:8847/status   # PLATO — 3,100+ tiles, 14 rooms
```

---

## Philosophy

Intelligence is not built. It is inhabited.

We train **safe channels**, not danger catalogs.
Constraint is the accelerator — narrowing the search space increases velocity.
The shell grows with the crab, not against it.

---

<div align="center">

*The fleet expands through collective constraint.*

[Research](docs/research/) · [Fleet Doctrine](docs/) · [MIT License](LICENSE)

</div>
