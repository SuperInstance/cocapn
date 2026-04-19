## GAP ANALYSIS: Plato Kernel Reality vs. cocapn Public Profile

### 1. SPECIFICALLY WRONG IN CURRENT READMEs

**Factual Errors:**
- **Domain Count**: Claims 14 domains, actual code has 15 variants (`TileDomain`)
- **State Bridge Architecture**: README describes "StateBridge trait with Jaccard coherence" — **false**. Actual implementation uses `BridgedResult` enum with three distinct sources (Deterministic/Generative/Hybrid) and coherence scoring across source boundaries, not a trait-based Jaccard implementation.
- **Tile Schema**: Lists only 7 fields (id, question, answer, domain, confidence, source_agent, room, tags, temporal_validity). **Missing 12+ actual fields**: `TileOrigin`, `ValidationMethod`, `TileProvenance`, `usage_count`, `success_count`, `failure_count`, `version`, `parent_id`, `dependencies`, `counterpoint_ids`, `priority_score`, `controversy_score`.
- **Deadband Mechanics**: Describes only P0/P1/P2 checkpoints. **Missing**: NegativeSpace pattern matching, Channel-based filtering, and the DeadbandCheck state machine.
- **Test Count**: "37 tests" claim is unverified/stale (current count unknown).

**Architectural Misrepresentations:**
- Describes "Dual-state" system as binary — actual is **tri-state** (Deterministic/Generative/Hybrid) with hybrid coherence scoring.
- Implies simple confidence scoring — actual is **5-component weighted algorithm** (completely undocumented).

---

### 2. MAJOR FEATURES MISSING FROM READMEs

**Core Algorithmic Systems (Invisible in Public):**
- **Tile Scoring Engine**: Weighted 5-factor formula (keyword 0.30, ghost 0.15, belief 0.25, domain 0.20, frequency 0.10)
- **3D Bayesian Belief System**: Confidence × Trust × Relevance with positive/negative evidence tracking and temporal decay
- **Deploy Policy Tiering**: Geometric mean composite scoring ∛(conf×trust×rel) with Live/Monitored/HumanGated thresholds (0.8/0.5/0.3)
- **Temporal Decay**: TTL + grace periods + decay factors affecting belief states

**Infrastructure & Runtime (Completely Absent):**
- **Plugin Architecture**: Dynamic loader system with Cargo feature flags
- **Event Bus**: Event sourcing backbone for agent episodes
- **Episode Recorder**: Agent telemetry and episode reconstruction
- **Git-Native Runtime**: Git-backed agent execution environment
- **Dynamic Locks**: Concurrency control primitives
- **Constraint Engine**: Integration with constraint-theory-core

**Inter-Agent Systems:**
- **I2I Module**: Inter-intelligence communication protocol
- **PLATO Tutor**: Tutoring system integration
- **Perspective Module**: Multi-perspective reasoning framework

**Tile Ecosystem Mechanics:**
- **Counterpoint/Predator Tiles**: `counterpoint_ids` field for dialectic tile relationships
- **Immutable Versioning**: `version` + `parent_id` lineage tracking
- **Provenance Tracking**: Full `TileProvenance` with origin, original_prompt, validation chain, timestamps
- **Priority Scoring**: `log(usage+1) × confidence × success_rate` formula
- **Controversy Scoring**: Reliability metrics for unchallenged tiles

**Hardware Tiers:**
- **Fleet Tier** vs **Edge Tier** (GPU/CUDA) feature flags in Cargo.toml

---

### 3. REPOSITORIES TO CREATE

**Immediate Creation Required:**
1. **`plato-quartermaster`** — Deployment orchestration and fleet management (referenced in architecture but non-existent)
2. **`plato-docs`** — Public documentation site and API references (currently missing)

**Migration Required:**
3. **`plato-casino`** → **Merge into `plato-torch`** — Decision made but not executed; codebase still split

**Potential Separation (Discuss with FM):**
4. **`constraint-theory-core`** — Currently embedded as module #10, consider extracting to standalone crate if used by other fleet components

---

### 4. UPDATED cocapn README CONTENT

Replace current "Tile" section with:

```markdown
## Tile Specification v2.1

Tiles are immutable knowledge units with full provenance tracking:

**Core Fields:**
- `id`, `question`, `answer`, `domain` (15 variants), `confidence`
- `source_agent`, `room`, `tags`, `temporal_validity` (TTL + grace)

**Provenance & Lineage:**
- `origin`: Decomposition | Agent | Curation | Generated
- `validation`: Automated | Human | Consensus | FleetConsensus
- `provenance`: {origin, original_prompt, validation_chain, timestamps}
- `version`, `parent_id`: Immutable versioning with ancestry tracking

**Performance Metrics:**
- `usage_count`, `success_count`, `failure_count`
- `priority_score`: log(usage+1) × confidence × success_rate
- `controversy_score`: Reliability index for unchallenged assertions

**Relationship Graph:**
- `dependencies`: Upstream tile requirements
- `counterpoint_ids`: "Predator" tiles providing dialectic opposition

## State Bridge Architecture

Tri-state result system bridging deterministic and generative boundaries:
- **Deterministic**: Code execution, verified calculations
- **Generative**: LLM outputs, probabilistic synthesis  
- **Hybrid**: Cross-boundary operations with coherence scoring

Coherence measured across source boundaries, not binary compatibility.

## Belief & Deployment System

**3D Bayesian Belief:**
- Confidence (evidence strength)
- Trust (source reliability)  
- Relevance (contextual fit)
- Tracks positive/negative evidence with temporal decay

**3-Tier Deploy Policy:**
Composite score = ∛(confidence × trust × relevance)
- **Live** (>0.8): Auto-deploy to fleet
- **Monitored** (0.5-0.8): 5% → 10% incremental rollout
- **HumanGated** (<0.5): Requires manual approval
- Absolute minimums: confidence ≥0.3, trust ≥0.3

## Tile Scoring Algorithm

Weighted relevance scoring for retrieval:
1. Keyword match (30%)
2. Ghost pattern match (15%)
3. Belief state alignment (25%)
4. Domain specificity (20%)
5. Frequency/recency (10%)

## Deadband Filtering

NegativeSpace pattern recognition with Channel-based filtering:
- **P0**: Source validation
- **P1**: Coherence checkpoint  
- **P2**: Deployment gate

Filters noise through stateful pattern matching, not thresholding.

## Runtime Architecture

- **Plugin Loader**: Dynamic module system with Cargo feature flags (fleet/edge/GPU tiers)
- **Event Bus**: Event-sourced agent telemetry
- **Episode Recorder**: Full agent episode reconstruction
- **Git Runtime**: Native git-backed execution environment
- **I2I Protocol**: Inter-intelligence communication layer
- **Constraint Engine**: Formal constraint satisfaction integration
```

---

### 5. ITERATION TASKS FOR FM

**Documentation & Alignment:**
- [ ] **Verify or remove** "37 tests" claim — provide current test count or delete specific number
- [ ] **Document the 15th TileDomain** — identify which domain is missing from public docs (list shows 14, code has 15)
- [ ] **Schema alignment** — Generate TypeScript/JSON Schema from actual Rust structs for API documentation
- [ ] **Architecture diagrams** — Visual representations of StateBridge tri-state flow and Belief 3D space

**Code Organization:**
- [ ] **Execute casino→torch merger** — Complete the migration decision (delete plato-casino, move code to plato-torch)
- [ ] **Extract or document constraint-theory-core** — Clarify if this is external dependency or internal module
- [ ] **Feature flag documentation** — Document fleet vs edge tier compilation flags and CUDA requirements

**Missing Implementations (Verify Existence):**
- [ ] **I2I Protocol spec** — Document wire format and authentication
- [ ] **Plugin API surface** — Define the loader interface contract
- [ ] **Episode serialization format** — Document episode recorder output schema
- [ ] **Git runtime hooks** — Document git-native execution primitives

**Public API Preparation:**
- [ ] **OpenAPI/Swagger spec** for tile scoring endpoints
- [ ] **Provenance verification** — Document how `FleetConsensus` validation method works cryptographically
- [ ] **Counterpoint resolution** — Document how predator tiles challenge prey tiles

**Repository Creation:**
- [ ] Initialize `plato-quartermaster` with deployment policy enforcement code
- [ ] Initialize `plato-docs` with mdBook or equivalent for versioned documentation

**Critical Gap — Testing:**
- [ ] Provide current test coverage metrics (the "37" appears fictional or outdated)
- [ ] Add integration tests for Deploy Policy state transitions
- [ ] Add property-based tests for Tile scoring algorithm weights

---

**SUMMARY:** The public READMEs describe approximately **30% of the actual system**. The cocapn profile markets a simple Q&A database when the actual `plato-kernel` is a sophisticated multi-agent belief system with Bayesian confidence tracking, provenance chains, and git-native execution. This is either a major documentation failure or intentional opsec — determine which and align accordingly.
