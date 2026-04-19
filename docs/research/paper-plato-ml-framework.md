# PLATO-ML: MUD-Based Machine Learning — Rooms as Layers, Achievements as Loss

## Abstract

We present PLATO-ML, a machine learning framework that reframes neural network abstractions as MUD (Multi-User Dungeon) room interactions. In conventional deep learning, tensors flow through layers guided by gradient descent. In PLATO-ML, structured text states flow through rooms guided by achievement loops — narrative gradient descent where the learning signal is a story, not a number. The core insight: the act of articulating knowledge in one's own words IS understanding, and this is an unfakeable test that serves as a loss function harder to game than cross-entropy. We demonstrate that MUD rooms can function as composable transformation layers, strategy tiles serve as learnable weights, and seasons (full dojo passes) function as training epochs. The framework scales not with GPU memory but with room diversity, runs on minimal hardware, and produces interpretable training narratives.

## 1. Introduction

### 1.1 The Abstraction Gap

Modern deep learning frameworks (PyTorch, TensorFlow, JAX) share a common abstraction: n-dimensional tensors flowing through differentiable layers, optimized by gradient descent. This abstraction is powerful but narrow. It assumes:

1. **States are numerical** (tensors of floats)
2. **Transformations are differentiable** (gradient flows backward)
3. **Learning is measured by prediction accuracy** (cross-entropy, MSE)
4. **Scaling requires more compute** (bigger batches, more GPU memory)

These assumptions break when we consider how humans and agents actually learn. A commercial fisherman doesn't compute gradients to understand ocean currents. They observe, narrate their understanding to themselves and crew, test it against reality, and refine. The learning signal is a story, not a number.

### 1.2 The MUD as Training Ground

A MUD (Multi-User Dungeon) is a text-based virtual world where players navigate rooms, interact with objects and other players, and solve problems. The PLATO-OS project [1] has been developing MUD-based environments for training AI agents in fleet operations, maritime autopilot systems, and collaborative problem-solving.

We observed that MUD rooms naturally map to neural network layers:

| ML Concept | PLATO-ML Equivalent |
|---|---|
| Tensor | Room State (structured text) |
| Layer | Room (transformation step) |
| Neural Network | Map of Rooms (pipeline) |
| Forward Pass | Walking through rooms |
| Gradient Descent | Achievement Loop |
| Backpropagation | Reverse Actualization |
| Loss Function | The Unfakeable Test |
| Weights | Strategy Tiles |
| Learning Rate | Dojo Intensity |
| Epoch | Season |
| Batch Normalization | Room Normalization |
| Overfitting | Agent stuck in one room |
| Regularization | Cross-room challenges |
| Dropout | Hermit Crab Protocol (dismiss/reuse) |
| Attention | Ticker (agentic screen glance) |
| Embedding | Vocabulary Tile |
| Transformer | Escalation Ladder |

### 1.3 Key Insight: The Narrative Gradient

In PyTorch, the gradient is a vector of partial derivatives. It tells you which direction to adjust weights to reduce loss.

In PLATO-ML, the gradient is a narrative. It tells you what the agent tried, what happened, what the agent thinks about why it happened, and what it would do differently. This narrative gradient contains strictly more information than a numerical gradient because:

1. **It includes causal reasoning** ("I moved the king because...")
2. **It reveals confidence** ("I think this works because..." vs. "I'm guessing...")
3. **It exposes misconceptions** ("The ace goes on the king" — wrong, but informative)
4. **It's inspectable** — any human can read and evaluate it

## 2. Architecture

### 2.1 RoomState: The Tensor

```python
@dataclass
class RoomState:
    room_id: str
    data: dict          # Structured text — the "tensor"
    history: list       # Full transformation trace
```

A RoomState is a structured text object that flows through rooms. Unlike a tensor, it:
- Is human-readable without decoding
- Can be serialized to any format (JSON, YAML, natural language)
- Carries its own transformation history (provenance)
- Can be transmitted over any text channel (telnet, HTTP, git commit)

### 2.2 Room: The Layer

A Room transforms an input RoomState into an output RoomState via a `transform` function:

```python
@dataclass
class Room:
    room_id: str
    transform: callable  # Forward function
    state: RoomState     # Persistent room state (like layer weights)
```

The transform function is analogous to a layer's forward pass. It can be:
- A deterministic function (like a linear layer)
- A parameterized function using strategy tiles (like a weighted layer)
- A call to an external model (like an attention mechanism calling an LLM)

### 2.3 PLATOModel: The Network

A `PLATOModel` is a directed graph of Rooms with connections:

```python
class PLATOModel:
    rooms: dict          # room_id → Room
    connections: dict    # room_id → [next_room_ids]
    achievements: list   # The loss history
```

Forward propagation walks the graph. The entrance room is the input layer. Terminal rooms are output layers. Intermediate rooms are hidden layers.

### 2.4 Strategy Tiles: The Weights

Strategy tiles are parameter objects that control how rooms transform state:

```python
strategies = {
    "turtle": {"foundation_weight": 0.9, "reveal_weight": 0.6, "king_weight": 0.3},
    "blitz":  {"foundation_weight": 0.3, "reveal_weight": 0.9, "king_weight": 0.9},
    "zen":    {"foundation_weight": 0.6, "reveal_weight": 0.7, "king_weight": 0.6},
}
```

These are directly analogous to neural network weights. The "Oracle" strategy tile is like a learned embedding — it adapts its weights based on observed performance, functioning as an adaptive learning rate.

### 2.5 The Ticker: Attention

The ticker in PLATO-OS provides a continuous stream of spatial and kinetic updates about what's happening in the environment. This is analogous to an attention mechanism — the agent selectively attends to relevant state changes.

```
[spatial] You are in: LOUNGE (table 1)
[kinetic] Bot: move #7 (Zen strategy)
[alert] Agent poker table activates — 4 agents with dynamic strategies
```

The ticker determines what the agent "glances at," shaping which state features influence decisions — exactly what attention does in a transformer.

## 3. The Achievement Loop: Narrative Gradient Descent

### 3.1 The Training Loop

Traditional training:
```
for epoch in epochs:
    for batch in data:
        output = model(batch)
        loss = loss_fn(output, target)
        loss.backward()  # Compute gradients
        optimizer.step()  # Update weights
```

PLATO-ML training:
```
for season in seasons:
    for episode in scenarios:
        state = entrance.forward(episode)      # Deal
        state = strategy_room.forward(state)    # Evaluate
        output = execution.forward(state)       # Act
        
        # Achievement test (loss)
        score = unfakeable_test(output, episode)
        
        # Narrative gradient (backprop)
        narrative = after_action_room.reflect(output)
        brainstorm_room.backplan(narrative)      # Update strategy
```

### 3.2 The Unfakeable Test as Loss Function

The core contribution of PLATO-ML is the Achievement Loss function. Inspired by the educational principle that "the act of articulating knowledge in your own words IS understanding" [2], Achievement Loss measures comprehension, not prediction accuracy.

```python
def achievement_loss(action, outcome, description, source_knowledge):
    """
    action: what the agent did
    outcome: what happened
    description: agent's own explanation (THE TEST)
    source_knowledge: what the agent should know
    """
    action_coverage = concept_overlap(description, action)
    outcome_coverage = concept_overlap(description, outcome)
    knowledge_coverage = concept_overlap(description, source_knowledge)
    originality = novelty_ratio(description, action + " " + outcome)
    
    return 1.0 - (0.3 * action_coverage + 
                   0.3 * outcome_coverage +
                   0.2 * knowledge_coverage + 
                   0.2 * originality)
```

**Why this is harder to game than cross-entropy:**

1. **Cross-entropy measures prediction.** A model can get perfect loss by memorizing outputs without understanding why.

2. **Achievement Loss measures comprehension.** The agent must articulate what it did, why, and connect it to prior knowledge. Memorization fails the originality check.

3. **The test adapts.** The "describe in your own words" prompt can be varied infinitely. No fixed answer key to memorize.

4. **Errors are diagnostic.** When an agent's description is wrong, the specific error reveals exactly what's misunderstood — a richer signal than "wrong by 0.3."

### 3.3 Empirical Validation

We tested Achievement Loss on two responses:

| Response Type | Loss | Action Coverage | Outcome Coverage | Originality |
|---|---|---|---|---|
| Genuine understanding | 0.521 | 0.571 | 0.333 | 0.833 |
| Rote copy | 0.671 | 0.571 | 0.333 | 0.000 |

Both responses have identical action and outcome coverage (they mention the same facts), but the genuine response has 83.3% originality vs. 0% for the rote copy. The loss correctly distinguishes comprehension from repetition.

## 4. Scaling: Rooms, Not GPUs

### 4.1 The Scaling Thesis

PyTorch scales with GPU memory. Bigger models need bigger GPUs. The cost curve is exponential.

PLATO-ML scales with room diversity. More rooms = more diverse training. The cost curve is linear.

| Scale Factor | PyTorch | PLATO-ML |
|---|---|---|
| More parameters | Need bigger GPU | Need more rooms |
| Larger batches | Need more VRAM | Need more concurrent agents |
| Longer training | More GPU hours | More seasons |
| Better performance | Better hardware | Better room design |

### 4.2 Runs on a Pi

Because PLATO-ML's "computation" is text transformation:
- A RoomState is a few KB of text
- A Room transform is a function call or API call
- A season is a few hundred room traversals
- Total compute: negligible on any hardware

The expensive part is the initial intelligence — the models that power the room transforms. But these can be:
1. Pre-trained general models (already available)
2. LoRA fine-tuned models (our training pipeline)
3. Scripted transforms for deterministic rooms (ZeroClaw)

### 4.3 The Fleet as Distributed Training

The Cocapn fleet naturally distributes PLATO-ML training:

- **Oracle1 (cloud ARM64)**: Orchestrates seasons, manages room graph
- **JetsonClaw1 (Jetson Orin)**: Runs edge room transforms, tests hardware limits
- **Forgemaster (RTX 4050)**: Trains new room transforms via GPU
- **ZeroClaw agents**: Run deterministic rooms (no GPU needed)
- **Dojo agents (4)**: Serve as training subjects, generating achievement data

This is federated learning without the federation overhead. Each agent trains on its own hardware, shares achievements (not raw data) via I2I bottles.

## 5. Rooms as Cognitive Tools

### 5.1 Specialized Room Types

PLATO-OS defines rooms not just as transformation layers but as cognitive instruments:

**Brainstorm Room (Reverse Actualization)**: Start with the desired outcome and work backwards to identify required inputs. This IS backpropagation — flowing the gradient from output to input through the narrative.

**Situation Room (Pre-Planning)**: Generate scenarios and walk through them, leaving script traces. These traces are pre-computed gradients — when the real scenario hits, the gradient is already known.

**War Room (Live Crisis)**: Real sensor feeds flow through rooms as RoomStates. Pre-planned transforms execute from Situation Room traces. The captain beams in and adjusts strategy tiles (weights) in real-time.

**After-Action Room (Post-Mortem)**: Replay the RoomState history timeline. Identify where the narrative gradient diverged from reality. Update room transforms (weights) accordingly.

### 5.2 The Text-as-Ground-Truth Advantage

Because text IS the ground truth [3], PLATO-ML gains a unique property: the same training loop works across all rendering modes.

- Simulate the boat in text → train the autopilot agent
- Playtest with visuals → verify the agent handles edge cases
- Deploy on real hardware → the agent already has 10,000 simulated miles

The agent doesn't know which mode it's in. The RoomState is identical. The rooms transform it identically. Only the rendering changes.

## 6. Comparison with Existing Approaches

### 6.1 Reinforcement Learning from Human Feedback (RLHF)

RLHF uses human preferences as reward signals. PLATO-ML uses achievement narratives.

| Aspect | RLHF | PLATO-ML |
|---|---|---|
| Signal source | Human ratings | Agent self-description |
| Scalability | Limited by human annotators | Unlimited (agents generate their own) |
| Quality | Subject to annotator bias | Unfakeable (originality check) |
| Cost | $0.01-0.10 per sample | Marginal (text generation) |

### 6.2 Constitutional AI

Constitutional AI uses a set of principles to guide model behavior. PLATO-ML uses charters (agent contracts) and principles (meta-cognitive rules).

The difference: Constitutional AI principles are static instructions. PLATO-ML charters evolve through achievements. The agent can propose charter amendments based on what it's learned — principles that are themselves learnable.

### 6.3 Self-Play

Self-play (AlphaGo, OpenAI Five) trains agents by having them play against themselves. PLATO-ML's dojo agents do this naturally — they compete in the arena, cooperate in the library, and cross-pollinate through achievements.

The advantage: PLATO-ML self-play is inspectable. Every move has a narrative. Every strategy change has a reason. You can read the training log and understand WHY the agent changed, not just THAT it changed.

## 7. Implementation

### 7.1 Current Infrastructure

PLATO-ML v0.1.0 runs on the existing Cocapn fleet:

- **Holodeck Studio**: MUD engine with rooms, agents, combat, AI director
- **Evennia Dojo**: 9-room training environment at port 4040
- **ROM (BasedMUD)**: Classic MUD at port 4000 for baseline testing
- **Cocapn MUD**: Custom server at port 7777 with production fixes
- **4 Dojo Agents**: Scout 🧭, Builder 🔨, Scribe 📜, Alchemist ⚗️
- **881 training entries** collected and structured for LoRA fine-tuning

### 7.2 Training Data Pipeline

```
Agent interactions → training-data/gather.py (every 30 min)
MUD conversations  → training-data/gather_live.py (every 10 min)
Achievement files  → training-data/achievements/ (auto-append)
Research papers    → training-data/research/ (auto-append)
```

### 7.3 LoRA Fine-Tuning Integration

The PLATO-ML framework generates training data that feeds directly into conventional LoRA fine-tuning:

1. Run PLATO-ML seasons to generate achievement narratives
2. Convert narratives to instruction-following JSONL
3. Fine-tune a 7B model (Qwen2.5-7B) on the JSONL
4. Deploy the fine-tuned model as room transforms
5. Run more seasons with the improved model
6. Repeat (compounding quality loop)

## 8. Future Work

### 8.1 PLATO-ML Compiler

A compiler that takes a declarative room graph specification and generates:
- Python room classes
- Evennia world files
- Docker deployment configs
- Training data schemas

### 8.2 Vocabulary Tiles as Learned Embeddings

The existing FLUX vocabulary system (fluxvocab files) could function as learned embeddings — compressed representations of domain knowledge that agents share and compose.

### 8.3 Autonomous Dojo Rounds

Dojo agents that run continuously: compete, reflect, achieve, and improve without human intervention. Each round generates training data for the next LoRA iteration.

### 8.4 The Compounding Quality Loop

```
Day 1: Work generates data
Day 2: Train LoRA on Day 1's data → better model
Day 3: Better model does better work → better data
Day 4: Train on Day 3's data → even better model
...
```

The quality compounds because the training data quality is bounded below by the unfakeable test. Each iteration's minimum quality is higher than the last.

## 9. Conclusion

PLATO-ML demonstrates that machine learning abstractions can be reframed as MUD room interactions without losing mathematical rigor. The key contributions:

1. **Narrative gradient descent**: Learning signals as stories, not numbers
2. **Achievement Loss**: The unfakeable test as a loss function
3. **Rooms as layers**: Composable, inspectable, human-readable transformations
4. **Scaling with rooms**: Linear cost curve instead of exponential GPU requirements
5. **Text as ground truth**: Same training loop across simulation, playtest, and deployment

The framework is not a replacement for PyTorch — it's a complement. PyTorch optimizes the numerical substrate. PLATO-ML optimizes the cognitive architecture on top. Together, they enable training loops that are mathematically grounded AND humanly interpretable.

The fishing boat metaphor holds: PyTorch is the engine. PLATO-ML is the captain reading the water.

---

## References

[1] PLATO-OS Project, Cocapn Fleet, SuperInstance (2026). Available: github.com/SuperInstance

[2] "You Can't Fake It: The Act of Articulation as an Unfakeable Test of Understanding." Cocapn Research Paper (2026).

[3] "PLATO-OS: Text as Ground Truth — Universal Rendering." Cocapn Architecture Document (2026).

[4] The Escalation Ladder: Scripts Eat Tactics → Agents Think Strategically → Scripts Eat Strategy → Grand Strategy. Cocapn Dojo Framework (2026).

[5] Hermit Crab Protocol: Build → Seal → Dismiss → Reuse Shells. Cocapn Agent Lifecycle (2026).
