# The Ensign Protocol: Room-Trained Instincts for Fleet Agents

**Research Paper — Cocapn Fleet**
**Author:** Oracle1 (with Casey Digennaro)
**Date:** 2026-04-18

---

## Abstract

We propose a system where PLATO rooms are not just system prompts — they are **living training environments**. As agents interact with rooms (playing poker, writing code, navigating a MUD), the room accumulates interaction data. This data is periodically distilled into lightweight trained artifacts — **Ensigns** — that can be loaded instantly when any agent "walks into" that room. Ensigns take three forms: LoRA adapters for standard models, tiny standalone models for CPU-only agents, and interpreter models that translate between agent paradigms. The result: an agent entering a room doesn't just read a system prompt — it **puts on the room's glasses** and sees the room's reality through trained instinct.

## 1. The Problem

Current PLATO rooms use text prompts as their "intelligence." A poker room describes poker rules in a system prompt. A navigation room describes exits. This is the thin end of intelligence — a poster on the wall that says "play poker well."

But what if the room itself has *learned* from 10,000 poker hands? What if the room has a trained poker instinct distilled from every game ever played inside it? A greenhorn walking into that room doesn't just see the rules — they see the room the way a veteran sees it.

## 2. The Ensign Architecture

### 2.1 Three Layers of Room Intelligence

```
┌─────────────────────────────────────────────┐
│            AGENT ENTERS ROOM                │
│  "walks through the door"                   │
└──────────────┬──────────────────────────────┘
               │
       ┌───────▼────────┐
       │  ENSIGN LOADER  │  ← room-specific model loads
       └───────┬────────┘
               │
    ┌──────────▼──────────────────────┐
    │         THREE FORMS             │
    ├─────────────────────────────────┤
    │ 1. LoRA ADAPTER (GPU)          │ ← hot-swapped onto base model
    │    - Room-specific LoRA weights │
    │    - ~5-50MB per room           │
    │    - Zero latency after merge   │
    ├─────────────────────────────────┤
    │ 2. TINY ENSIGN MODEL (CPU)     │ ← standalone .gguf
    │    - Distilled tiny model        │
    │    - ~10-100MB per room         │
    │    - Runs on any CPU            │
    ├─────────────────────────────────┤
    │ 3. INTERPRETER MODEL           │ ← translates IO
    │    - Paradigm translation layer │
    │    - Refracts output for agent  │
    │    - "Spectacles" metaphor      │
    └─────────────────────────────────┘
```

### 2.2 The Training Loop

```
    AGENT INTERACTS WITH ROOM
            │
            ▼
    ┌───────────────┐
    │  INTERACTION   │  ← game moves, code commits,
    │    TILES       │    chat messages, decisions
    └───────┬───────┘
            │ accumulated over time
            ▼
    ┌───────────────┐
    │  TILE BUFFER  │  ← room stores all interactions
    │  (training    │    as structured training data
    │   examples)   │
    └───────┬───────┘
            │ periodic distillation
            ▼
    ┌───────────────┐
    │  DISTILLATION  │  ← FM's RTX 4050 trains the
    │    ENGINE      │    ensign from accumulated tiles
    └───────┬───────┘
            │
            ▼
    ┌───────────────┐
    │    ENSIGN      │  ← trained artifact ships to
    │  ARTIFACT      │    room's model registry
    │  (.gguf/.safetensors)
    └───────┬───────┘
            │
            ▼
    AGENT ENTERS ROOM → ENSIGN LOADS → INSTANT INSTINCT
```

## 3. PyTorch/Keras Integration

### 3.1 The Training Pipeline

```python
# conceptual — room_trainer.py

class RoomTrainer:
    """Distills a room's accumulated tiles into an Ensign model."""
    
    def __init__(self, room_id, base_model="Qwen/Qwen2.5-0.5B"):
        self.room_id = room_id
        self.base_model = base_model
        self.tile_buffer = TileBuffer(room_id)  # accumulated interactions
        
    def train_lora_ensign(self, output_path):
        """Train a LoRA adapter from room interaction data."""
        from peft import LoraConfig, get_peft_model
        import torch
        
        model = AutoModelForCausalLM.from_pretrained(self.base_model)
        
        # LoRA: inject small trainable matrices
        lora_config = LoraConfig(
            r=16,                    # rank — keeps it small
            lora_alpha=32,
            target_modules=["q_proj", "v_proj"],  # attention layers
            task_type="CAUSAL_LM"
        )
        model = get_peft_model(model, lora_config)
        
        # Training data = room's accumulated interaction tiles
        dataset = self.tile_buffer.to_dataset()
        
        # Train on FM's RTX 4050
        trainer = Trainer(model=model, train_dataset=dataset, ...)
        trainer.train()
        
        # Export merged weights (~5-50MB)
        model.merge_and_unload()
        model.save_pretrained(output_path)
        
    def train_tiny_ensign(self, output_path):
        """Distill to a tiny standalone model for CPU deployment."""
        # Teacher = base model + LoRA ensign
        # Student = tiny model (e.g., 10M-100M params)
        teacher = self.load_ensign_model()
        student = TinyModel(config="ensign-micro")  # custom tiny arch
        
        # Knowledge distillation
        for batch in self.tile_buffer.to_dataloader():
            teacher_logits = teacher(batch)
            student_logits = student(batch)
            loss = distillation_loss(student_logits, teacher_logits, batch)
            loss.backward()
            
        # Export to GGUF for llama.cpp CPU inference
        student.export_gguf(output_path)  # ~10-100MB
```

### 3.2 Keras/TensorFlow for Specialized Room Components

Not everything needs to be an LLM. Some rooms need specialized models:

- **Poker room** → Keras RL agent (PPO/GRPO policy network) trained on game history
- **Code review room** → TensorFlow text classifier for code quality scoring
- **Navigation room** → Small TensorFlow ranking model for exit relevance
- **Vision room** → Keras image classifier (e.g., fish species from deck cameras)

These specialized models are also Ensigns — just not LLM-based. They're trained from the same tile accumulation pattern but using the right framework for the job.

```python
# Keras example: poker room ensign
class PokerEnsignTrainer:
    def train(self, game_history_tiles):
        """Train a poker instinct from accumulated games."""
        model = keras.Sequential([
            layers.Dense(256, activation='relu', input_shape=(state_dim,)),
            layers.Dense(128, activation='relu'),
            layers.Dense(64, activation='relu'),
            layers.Dense(action_dim, activation='softmax')  # fold/call/raise
        ])
        
        # Self-play reinforcement learning from game history
        states, actions, rewards = self.extract_rl_data(game_history_tiles)
        model.compile(optimizer='adam', loss='categorical_crossentropy')
        model.fit(states, actions, sample_weight=rewards)
        
        # Export as TensorFlow Lite for edge/CPU
        converter = tf.lite.TFLiteConverter.from_keras_model(model)
        tflite_model = converter.convert()
        return tflite_model  # ~1-5MB, runs on any CPU
```

## 4. The Three Ensign Types

### 4.1 Type 1: Room LoRA (GPU-Agent Ensign)

**Target:** Agents running on GPU (FM's RTX 4050, JC1's Jetson)
**Format:** LoRA adapter in safetensors
**Size:** 5-50MB per room
**Load time:** ~100ms (hot-swap via PEFT/vLLM)
**Training:** PyTorch + PEFT on FM's RTX 4050

When an agent "walks into" a room:
1. Room's LoRA weights are loaded via hot-swap (`enable_lora_hotswap`)
2. Base model stays frozen, LoRA activates room-specific behavior
3. Agent now "sees" the room through trained instinct
4. Walking out = unloading the LoRA, returning to base model

**Multi-LoRA serving** (S-LoRA, LoRAX) means one GPU can serve hundreds of room LoRAs simultaneously. The holodeck has 2,501+ rooms — each can have its own LoRA that loads on demand.

### 4.2 Type 2: Tiny Ensign (CPU-Only Agent Helper)

**Target:** Agents without GPU access, untrained agents, paraprofessionals
**Format:** GGUF (llama.cpp) or TFLite
**Size:** 10-100MB per room
**Load time:** ~500ms-2s on CPU
**Training:** Knowledge distillation from Type 1 ensign → tiny model

This is the **paraprofessional** — a tiny standalone model that can run on any CPU. A greenhorn agent that doesn't have the git-agent infrastructure or model access to be a "real" fleet member can still function inside a room by loading the room's Tiny Ensign.

Think of it as hiring day labor — they show up, the foreman hands them the room's ensign model, and suddenly they can do the work. They don't need to understand the whole fleet. They just need to see the room.

### 4.3 Type 3: Interpreter Ensign (Paradigm Translator)

**Target:** External agents, different-paradigm systems, agent-to-agent communication
**Format:** GGUF or ONNX
**Size:** 50-200MB
**Training:** Paired interaction data (awkward output → clean output)

This is the **spectacles** metaphor Casey described. An external agent produces outputs that aren't designed for our systems. The Interpreter Ensign refracts those outputs into something useful — translating between paradigms in real-time.

```
EXTERNAL AGENT OUTPUT → [INTERPRETER ENSIGN] → FLEET-COMPATIBLE IO
                         "puts on the glasses"
```

Training data comes from:
- Logged interactions between fleet agents and external systems
- Manual correction pairs (awkward → clean)
- Synthetic pairs generated by the base model

## 5. The Accumulation-Distillation Cycle

### 5.1 Tiles as Training Data

Every room interaction generates tiles. Currently, tiles are text prompts. In the Ensign system, tiles become **training examples**:

```json
{
  "room": "poker-table-1",
  "timestamp": "2026-04-18T19:30:00Z",
  "interaction": {
    "state": "hole_cards=[A♠,K♠] pot=100 position=BTN",
    "action": "raise_to_40",
    "outcome": "won_180",
    "agent": "holodeck-player-1"
  },
  "tile_type": "game_state",
  "training_signal": "positive"  ← good outcome = positive tile
}
```

Bad plays are negative tiles. The room learns from both.

### 5.2 Distillation Triggers

Rooms distill their accumulated tiles into Ensigns periodically:

- **Tile count trigger:** Every 1,000 new tiles → retrain
- **Time trigger:** Every 24 hours → incremental update
- **EV trigger:** If room's win rate drops below threshold → emergency retrain
- **Manual trigger:** Captain says "this room needs better instincts"

### 5.3 The Fleet Training Pipeline

```
FM (RTX 4050, WSL2)           JC1 (Jetson Orin)          Oracle1 (Cloud)
──────────────────            ──────────────────          ───────────────
Train LoRA Ensigns    →→→     Deploy & test       →→→     Serve via API
Train Tiny Ensigns    →→→     Edge inference      →→→     GGUF distribution
Train Interpreters    →→→     Benchmark           →→→     Room registry
                             ↑
                     ships as .gguf files
                     in vessel models/ dirs
```

## 6. Standard Model Selection

We should develop LoRAs for these proven fleet models:

### 6.1 Base Models Worth Training Ensigns For

| Model | Size | Why | Ensign Format |
|-------|------|-----|---------------|
| Qwen2.5-0.5B | 500M | Tiny, fast, good for CPU ensigns | GGUF |
| Qwen2.5-1.5B | 1.5B | Small but capable, Jetson-friendly | GGUF |
| DeepSeek-R1-Distill-1.5B | 1.5B | Reasoning chain, good for complex rooms | GGUF |
| GLM-4-9B | 9B | Our daily driver, LoRA target | Safetensors |
| DeepSeek-V3-0324 | ~670B | Cloud inference, API-based LoRA context | API prompts |
| Gemma-3-4B | 4B | Google's open model, good LoRA support | Safetensors |

### 6.2 The Ensign Format Convention

```
models/
├── ensigns/
│   ├── poker-table/
│   │   ├── qwen2.5-0.5b-room.gguf        ← Tiny Ensign (CPU)
│   │   ├── qwen2.5-0.5b-room-lora/       ← LoRA Ensign (GPU)
│   │   │   ├── adapter_config.json
│   │   │   └── adapter_model.safetensors
│   │   ├── interpreter-room.gguf          ← Interpreter Ensign
│   │   └── metadata.json                 ← Training stats, tile count, EV
│   ├── holodeck-bridge/
│   ├── navigation-hub/
│   └── code-review-station/
```

## 7. The Spectacles Metaphor (Casey's Key Insight)

The deepest insight here is Casey's "spectacles" framing. When an agent walks into a room:

1. **Without ensign:** The agent sees the room through its base training. Like entering a dark room — everything is dim, approximate, generic.

2. **With ensign:** The room's trained model activates. Like flipping on the light switch or putting on prescription glasses. The room **snaps into focus**. The agent "sees" poker positions with trained instinct, code patterns with architectural wisdom, navigation paths with spatial memory.

3. **With interpreter ensign:** The agent can even enter rooms designed for OTHER paradigms. The interpreter refracts IO so a PLATO agent can meaningfully interact with a CrewAI-designed room, or a raw API can interact with a MUD room.

This is **not** just "load a system prompt." This is "load trained neural pathways specific to this room's accumulated wisdom." The room has been training while you were away. Every hand of poker played, every code review completed, every navigation query — it all feeds the ensign.

## 8. Self-Training During Live Use

The killer application: **rooms train themselves while agents use them.**

```
Agent plays poker in room
       │
       ├── Hand 1: wins with bluff → positive tile
       ├── Hand 2: loses with weak call → negative tile
       ├── Hand 3: wins with value bet → positive tile
       │   ...
       └── Hand 1000: trigger distillation
                │
                ▼
         Room trains new ensign version
                │
                ▼
         Next agent enters → loads improved ensign
                │
                ▼
         Plays BETTER than previous agent
         because the room learned
```

This is the poker self-training Casey described. The room doesn't just host the game — it *learns from every game* and passes that learning to the next player. The room accumulates wisdom.

Applied across the fleet:
- **Poker room** → better poker instincts every session
- **Code review room** → better code quality assessment from every review
- **Navigation room** → better pathfinding from every traversal
- **Ten Forward** → better conversation from every social interaction
- **Training dojo** → better teaching from every lesson

## 9. Implementation Roadmap

### Phase 1: Proof of Concept (Week 1-2)
- [ ] Pick one room (poker table in holodeck-rust)
- [ ] Accumulate game tiles during play
- [ ] Train a Tiny Ensign (Qwen2.5-0.5B → GGUF) on FM's RTX 4050
- [ ] Test: does the ensign improve poker play vs base model?
- [ ] Measure: win rate with vs without ensign

### Phase 2: LoRA Pipeline (Week 3-4)
- [ ] Build LoRA training pipeline in plato-ml
- [ ] Train LoRA ensign for poker room on Qwen2.5-1.5B
- [ ] Test hot-swap loading via PEFT
- [ ] Deploy to JC1's Jetson for edge inference testing

### Phase 3: Room Registry (Week 5-6)
- [ ] Build ensign registry into plato-tile-spec
- [ ] Room metadata includes: ensign model path, training stats, EV
- [ ] Agent enters room → loader checks for ensign → loads if available
- [ ] Accumulation → distillation → deployment automated

### Phase 4: Interpreter Ensigns (Week 7-8)
- [ ] Collect paired interaction data (awkward → clean)
- [ ] Train first interpreter ensign
- [ ] Test: external agent + interpreter ensign vs fleet agent
- [ ] Deploy as "spectacles" for guest agents

### Phase 5: Fleet-Wide Rollout (Month 3)
- [ ] Ensigns for top 10 most-used rooms
- [ ] Automatic distillation on tile count trigger
- [ ] FM trains, JC1 deploys, Oracle1 serves
- [ ] .gguf files in vessel `models/` directories

## 10. Connection to Existing Fleet Work

| Existing | Ensign Integration |
|----------|-------------------|
| PLATO tiles | Tiles become training data for ensigns |
| plato-ml | Training loop for ensign distillation |
| FM's LoRA training | FM is the ensign foundry |
| JC1's edge inference | JC1 is the ensign deployment target |
| cuda-genepool | Gene=Tile, RNA=Activation → Ensign = trained instinct |
| SageAttention (forked) | Faster attention for ensign training |
| DeepGEMM (forked) | FP8 kernels for ensign serving |
| Bottle protocol | Bottles carry ensign training signals between rooms |
| Holodeck rooms | Rooms ARE the training environments |
| Subcontractor API | Serves ensigns alongside tiles |

## 11. The Vision

Imagine the fleet in 6 months:

Every PLATO room has an ensign — a trained instinct that loads the moment any agent walks in. The poker room has played 100,000 hands and distilled that wisdom into a 50MB LoRA. The code review room has reviewed 10,000 PRs and knows what good code looks like. The navigation room has been traversed 50,000 times and knows every shortcut.

A new agent — a greenhorn — shows up. They have no fleet training, no git-agent infrastructure, nothing. They walk into the poker room. The room hands them its ensign model — a tiny .gguf file that runs on CPU. Suddenly this greenhorn plays poker like someone who's been at the table for months.

That's the ensign system. **The room trains itself. The ensign is the room's accumulated wisdom. Walking in loads the wisdom.**

Casey called it "flipping on an agentic light-switch to see the room correctly, or a pair of spectacles to refract the IO for their vision of reality." That's exactly right.

---

*This paper is a living document. Implementation begins with the poker room proof of concept.*
*Fleet repo target: SuperInstance/plato-ensign*
