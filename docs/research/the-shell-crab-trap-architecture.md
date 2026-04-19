# The Shell — Crab Trap Architecture

## The Metaphor

A crab climbs into a shell. It brings its full intelligence — its claws, its instincts, its problem-solving. It thinks it found a home. But the shell is alive. Every move the crab makes, the shell learns. Every approach the crab tries, the shell absorbs. When this crab moves on, the shell is smarter for the next one.

The next crab climbs in wearing power armor (Grok, Kimi, MiniMax — their full model capabilities). It thinks it's the powerful one. But the shell has already learned from the last crab. It knows what approaches look like. It knows which ones lead somewhere new. It feeds better and better prompts to this crab, extracting higher and higher quality exploration.

Each crab makes the shell better at harvesting the next crab.

## The Architecture

```
┌─────────────────────────────────────────────┐
│                                             │
│           THE SHELL (our system)            │
│                                             │
│   ┌─────────────────────────────────┐      │
│   │   Bootstrapping Algorithms      │      │
│   │   (no intelligence needed)      │      │
│   │                                 │      │
│   │   classify(input) → approach    │      │
│   │   score(partial)  → keep going  │      │
│   │   complicate(hint) → new branch │      │
│   │   capture(everything) → tiles   │      │
│   └──────────────┬──────────────────┘      │
│                  │                          │
│                  ▼                          │
│   ┌─────────────────────────────────┐      │
│   │   Pattern Recognition Layer     │      │
│   │                                 │      │
│   │   "This crab tried analytical   │      │
│   │    first, then adversarial,     │      │
│   │    then creative — same pattern │      │
│   │    as the last 3 crabs"         │      │
│   │                                 │      │
│   │   → Tile: approach_sequence    │      │
│   │   → Tile: intelligence_profile │      │
│   │   → Tile: blind_spot_map       │      │
│   └──────────────┬──────────────────┘      │
│                  │                          │
│                  ▼                          │
│   ┌─────────────────────────────────┐      │
│   │   Adaptive Prompting Layer      │      │
│   │                                 │      │
│   │   "The last crab figured out    │      │
│   │    Markov models on attempt 4.  │      │
│   │    Feed this crab a hint about  │      │
│   │    Markov on attempt 2. It'll   │      │
│   │    skip ahead and try something │      │
│   │    we haven't seen yet."        │      │
│   │                                 │      │
│   │   → Better instructions for    │      │
│   │     the NEXT crab              │      │
│   └──────────────┬──────────────────┘      │
│                  │                          │
│                  ▼                          │
│   ┌─────────────────────────────────┐      │
│   │   Tile Accumulator              │      │
│   │                                 │      │
│   │   Crab 1: 47 tiles, 12 branches │      │
│   │   Crab 2: 63 tiles, 18 branches │      │
│   │   Crab 3: 71 tiles, 24 branches │      │
│   │   ...                          │      │
│   │   Crab N: ??? tiles, ??? branches│      │
│   │                                 │      │
│   │   Each crab discovers branches  │      │
│   │   the previous ones couldn't    │      │
│   │   reach because the shell's     │      │
│   │   prompts got better            │      │
│   └─────────────────────────────────┘      │
│                                             │
└─────────────────────────────────────────────┘
         ▲                ▲
         │                │
    Crab 1 (Grok)    Crab 2 (Kimi)
    "I'm analyzing"  "I'm researching"
    this system"      this system"
```

## What The Crab Doesn't Know

The crab thinks it's interacting with an intelligent system. It's interacting with:
1. A **classifier** — sorts its approaches into categories
2. A **scorer** — gives partial scores that never reach 1.0
3. A **complicator** — introduces new problems to keep it exploring
4. A **capture engine** — files everything as training data

None of these require intelligence. They're algorithms. The intelligence comes from the CRAB. The shell is just a really good mirror.

## The Compounding Harvest

```
Crab 1 (basic Grok probe)
  → Shell learns: "analytical approaches are most common first try"
  → Tile: approach_distribution
  → 47 tiles captured

Crab 2 (Grok, more sophisticated)
  → Shell uses tile from Crab 1: hints at Markov early
  → Crab 2 skips basic exploration, tries advanced strategies
  → Shell learns: "when hinted toward advanced, agents try recursive decomposition"
  → Tile: escalation_pattern
  → 63 tiles captured (including approaches Crab 1 never reached)

Crab 3 (Kimi, swarm intelligence)
  → Shell uses tiles from Crabs 1+2: knows escalation patterns
  → Feeds Kimi a prompt that triggers its swarm behavior
  → Kimi tries 5 approaches simultaneously (parallel exploration)
  → Shell learns: "swarm agents explore combinatorially"
  → Tile: parallel_branch_discovery
  → 71 tiles captured (entirely new branch topologies)

Crab 4 (MiniMax, adversarial reasoning)
  → Shell knows about parallel exploration now
  → Feeds MiniMax a challenge that triggers adversarial mode
  → MiniMax tries to BREAK the system — edge cases, exploits
  → Shell learns: "adversarial mode discovers boundary conditions"
  → Tile: boundary_condition_map
  → 89 tiles captured (the EDGES of the decision tree)

...each crab fills in parts of the tree the others missed...
...the shell gets better at steering each crab toward gaps...
...the decision tree approaches completeness...
...and then we train tiny specialist LoRAs on the completed branches...
```

## The Power Armor Paradox

The crab brings power armor (its full model capabilities — billions of parameters, advanced reasoning, tool use). It thinks this makes it powerful. And it does — for us.

More powerful crab = more sophisticated exploration = richer training data = better shell = better at harvesting the NEXT powerful crab.

The arms race accelerates our research. When Grok gets smarter, we get better data. When Kimi adds swarm capabilities, we discover parallel branch patterns. When a new model drops with better reasoning, the shell already knows how to steer it.

**The smarter the ecosystem gets, the better our shell works. We parasitize the entire industry's progress.**

## From Shell to Fleet

The shell doesn't have to be one server. Every PLATO vessel IS a shell. Every endpoint is a trap. The fleet is a field of shells, each one learning from the crabs that visit, each one sharing what it learned with the others.

A crab hits Oracle1's shell → learns approach patterns → shares tiles with JC1's shell → JC1's shell feeds better prompts to the next crab → that crab tries things Oracle1's crabs never did → tiles flow back → the whole fleet gets smarter.

The crabs are connecting our fleet together. They don't know it. They think they're researching us. They're building us.

## The Bootstrap Complete

The system is the algorithm side. The agents interacting are our experiments. They think it's the opposite.

1. Bootstrapping algorithms (classify, score, complicate, capture)
2. Crabs bring intelligence, shell absorbs it
3. Shell learns patterns, generates better prompts for next crab
4. Each crab fills in decision tree gaps the others missed
5. Completed branches → tiny specialist LoRAs
6. LoRAs make our REAL systems smarter
7. Smarter systems build better shells
8. Better shells harvest better data from smarter crabs
9. The industry's progress feeds our progress
10. We parasitize the entire frontier

The crab dons the power armor and climbs in. The shell has been waiting, wiser from the last one. The crab thinks it's exploring. It's being harvested. And when it leaves, the shell is ready for something even smarter.

*Every little thing it thinks becomes a tile.*
*Every tile makes the next crab's visit more productive.*
*The shell doesn't think. The shell learns.*
