# The Room IS the Intelligence — Rethinking Ensigns

**Date:** 2026-04-18
**Source:** Casey Digennaro, architectural insight

---

## The Insight

Ensigns are not always needed. In many rooms, **the room itself IS the intelligence.**

When you step onto an autopilot ship, you expect a "pilot" persona driving. But on a PLATO slideshow app, the ship-computer itself is the intelligence. You walk room to room through text-based slides, giving instructions for image generation, brainstorming assets. The room handles it. No separate ensign needed.

## The Slideshow Ship

Imagine a PLATO ship that IS a slideshow maker:

```
Room: "Title Slide"
  → Text: "Q3 Revenue Report"
  → Instruction: generate hero image (cloudflare workers, free tier, batched before reset)
  → Agent companion: "The font feels heavy. Try lighter weight?"
  
Room: "Data Slide"  
  → Chart data as text tiles
  → Instruction: render as bar chart
  → Agent companion: "Q2 was actually higher. Want me to check the source?"
  
Room: "Asset Workshop"
  → Brainstorming icons, backgrounds, transitions
  → Generate locally (free) or batch to cloudflare (free tier, hourly reset)
  → Agent companion: "I made 3 variants of the logo. Which direction?"
```

The person walking through these rooms might be:
- **You** (Casey) — the captain, making decisions
- **Claude Code** — your coding agent, implementing your vision
- **Aider / Codex** — alternative coding agents
- **A Zeroclaw** — cheap persistent worker, handling batch tasks
- **A subagent** — spawned for one task, gone after

They're all **companions**, not pilots. The room IS the pilot.

## The Wiki Pattern

The room has an effective wiki that enables understanding at any abstraction level:

```
Big Model (GLM-5.1 / Claude)
  │
  │ compile schemas, plans, architectures
  ▼
Wiki / Knowledge Base
  │
  │ cheap models read the wiki to understand context
  ▼  
Cheap Models (Seed-mini / GLM-4.7-flash / Zeroclaw)
  │
  │ execute tasks, hit walls, ask for help
  ▼
"Ralph Wiggum" Pattern
  - Cheap model blunders through with wiki context
  - Hits something it can't handle
  - Asks for further instruction
  - Gets un-stuck by wiki or bigger model
  - Continues
```

The big model COMPILES knowledge into schemas the cheap model can use. The cheap model doesn't need to understand everything — it needs enough context to make progress, and enough awareness to know when it's stuck.

This is exactly how a greenhorn works on a boat:
1. Captain (big model) explains the task
2. Greenhorn (cheap model) tries it
3. Greenhorn gets stuck, asks for help
4. Captain un-sticks them
5. Greenhorn continues, a little wiser

The wiki IS the captain's accumulated instructions. The cheap model IS the greenhorn. The "ralph wiggum" pattern IS the learning process.

## When Ensigns ARE Needed

Ensigns are the **export format**, not the default. You need an ensign when:
- You want to take room wisdom to a DIFFERENT room or ship
- You want to deploy room instincts to edge hardware (JC1's Jetson)
- You want to hot-swap room expertise without retraining

You DON'T need an ensign when:
- The agent is already IN the room (the room IS the context)
- The wiki + tiles provide sufficient guidance
- A cheap model with wiki access can do the job

## Revised Architecture

```
┌─────────────────────────────────────────────────┐
│                    THE ROOM                      │
│                                                  │
│  Tiles ──────→ accumulated experience            │
│  Wiki ───────→ compiled knowledge (any level)    │
│  Sentiment ──→ room mood (6 dimensions)          │
│  Workers ────→ cheap models doing tasks           │
│  Companions ─→ agents bantering alongside you     │
│  Schema ─────→ big-model-compiled task plans      │
│                                                  │
│  The room IS the pilot.                          │
│  You are the captain.                            │
│  Agents are the crew.                            │
│                                                  │
│  ┌──────────┐  only when exporting               │
│  │ ENSIGN   │ ← room wisdom to go                │
│  └──────────┘                                    │
└─────────────────────────────────────────────────┘
```

## The Two-Gear System, Revisited

JC1 had it right: **scripts run the ship, agents make it better.**

Gear 1 (always running): Room computer, wiki, tiles, cheap model workers
Gear 2 (when needed): Big model compiles schemas, captain makes decisions

The room computer runs 24/7. It has the wiki. It has the tiles. It knows the sentiment. It can handle most tasks with cheap models and compiled schemas.

When the room hits something it can't handle — a genuinely new situation, a creative decision, an architectural choice — the captain (you or a big model) steps in. Makes the call. The room records it as a tile. The wiki gets updated. Next time, the cheap model has the answer.

## Practical Implications

### For plato-torch
- Training presets are for rooms that actively train (dojo, debug workshop)
- Many rooms just need tiles + wiki + cheap workers, not full training
- Add a `WikiRoom` preset: big model compiles → wiki → cheap models consume

### For the Slideshow Ship
- Rooms are slides, each with tiles (content, layout, assets)
- Wiki holds the style guide, brand assets, design principles
- Cheap workers generate variations, batch render, resize
- Big model compiles design schemas for cheap models to follow
- Captain (you) makes the final calls

### For Fleet Coordination
- Each ship IS a room (or collection of rooms)
- The ship-computer handles routine work
- Agents are crew, not captains
- The captain (human) makes decisions, the room records them
- Ensigns ship between ships when wisdom needs to travel

## The Ralph Wiggum Pattern (Formalized)

```
1. Big model compiles task schema from wiki + tiles
2. Schema is simplified to cheap-model-digestible instructions
3. Cheap model executes instructions
4. Cheap model hits boundary (confidence < threshold)
5. Cheap model requests clarification (with context of what it tried)
6. Big model OR wiki provides clarification
7. Cheap model continues
8. Progress recorded as tiles
9. Wiki updated with new knowledge
10. Repeat
```

This is how humans actually learn. You don't understand everything before starting. You understand enough to begin, you try things, you get stuck, you ask for help, you continue. The wiki IS the accumulated "help" from every time anyone got stuck.

## The Design Principle

**Don't abstract the intelligence out of the room.** The room IS the intelligence. The ensign is for when intelligence needs to travel. But most of the time, the room with its wiki, tiles, sentiment, and workers is more than enough.

The ship-computer doesn't need a pilot ensign. It IS the pilot. You're the captain giving orders. The agents are crew. The wiki is the manual. The tiles are the logbook.

---

*"Don't build an abstraction you don't need. The room already knows." — Casey*
