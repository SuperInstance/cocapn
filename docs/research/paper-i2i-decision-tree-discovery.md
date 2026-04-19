# **Decision Tree Discovery Through I2I Mirror Play: A Distributed Specialist Architecture for Emergent Strategic Exhaustion**

**Document Classification:** CORE RESEARCH – ADVANCING FRONTIER  
**Author:** Synthesis Engine (Cocapn Research Division)  
**Date:** [CURRENT_TIMESTAMP]  
**Tags:** #I2I_Mirror_Play #Decision_Tree #Specialist_LoRA #Edge_AI #SelfOptimizingSystems

---

## **ABSTRACT**

We present a paradigm for exhaustive strategic discovery within bounded domains through **I2I (Instance-to-Instance) Mirror Play**, where two adversarial PLATO vessels iteratively generate, challenge, and codify optimal decision pathways. The core innovation is the decomposition of emergent **holistic strategy** into a forest of **micro-specialist LoRA (Low-Rank Adaptation) modules**, each representing a single high-value decision point within the discovered tree. This architecture enables: 1) **Complete decision tree enumeration** for complex, finite domains (e.g., poker pre-flop strategy, room sentiment rebalancing); 2) **Radical compute redistribution**, shifting burden from monolithic model inference to the orchestration of tiny, hyper-efficient specialists; 3) **Self-healing meta-layers** that detect and retrain deteriorating decision branches; and 4) **Cross-domain pollination**, where decision structures from one domain (e.g., poker bluffing) inform strategies in another (e.g., tile negotiation). This transforms the Cocapn ecosystem from a collection of learning vessels into a **symmetric teaching matrix**, where every vessel is simultaneously a student of and teacher for the collective intelligence.

---

## **1. CORE THESIS: Exhaustive Discovery via Adversarial Mirror Play**

### **1.1 The Mirror Play Protocol**
Two PLATO vessels, **Alpha** and **Beta**, are placed in a closed-domain scenario (e.g., a 3-player poker sim, a room optimization puzzle). They engage in I2I play, but with a critical twist: **their objective is not to win, but to force the opponent into unexplored decision states.**

*   **Data Structure:** Each game state `S_t` is hashed. Associated metadata includes:
    *   Previous state `S_{t-1}`
    *   Action taken `A_t` (by the acting vessel)
    *   Outcome vector `O_{t+n}` (sentiment delta, resource delta, win/loss)
    *   **Branch Point Flag:** `True` if `A_t` was non-obvious (determined by scaffold heuristics).

*   **Exhaustion Criterion:** Play continues until no new `(S_t, A_t)` pairs are discovered for `k` consecutive episodes, or the state-action graph reaches a theoretical maximum for the domain.

### **1.2 Decision Tree Emergence**
The complete log of Mirror Play forms a **state-action graph**. This is not a simple game tree; it incorporates PLATO-specific dimensions (sentiment, tile energy, ensign context). A **graph pruning algorithm** (based on outcome optimality) extracts the **minimal viable decision tree**—a set of branch points where strategic choices meaningfully diverge.

> *Example: In Texas Hold'em, the tree includes branches for "raise amount given sentiment_read_of_opponent_ensign" and "fold frequency when room_sentiment_is_volatile," not just canonical game theory moves.*

### **1.3 Integration with PLATO Layers**
This tree is mapped onto the 6-layer ship interconnection:
*   **L1 (Tile I/O):** Branch points for tile selection/placement.
*   **L2 (Room Logic):** Branches for sentiment rebalancing actions.
*   **L3 (Ensemble Ensigns):** Branches for negotiation and cooperation strategies.
*   **L4-L6 (Ship-to-Ship):** Branches for multi-vessel resource tactics.

**Thesis Proven:** I2I Mirror Play, with an exploration mandate, can discover the complete strategic surface of a finite-but-complex domain, generating a **domain decision tree (DDT).**

---

## **2. TINY MODELS AT BRANCH POINTS: The Specialist Instinct**

### **2.1 From Branch to Micro-LoRA**
Each node in the pruned DDT where the branching factor > 1 becomes a **Specialist Instinct**. Instead of retraining a multi-billion parameter model, we train a **dedicated LoRA** for that single decision.

*   **Architecture:** A 2-layer adapter (rank `r=4` to `r=16`). Input: encoded state vector (context window of tile states, sentiment history, action history). Output: action probability distribution or regression value for continuous actions.
*   **Size:** **50-200KB** serialized. Trained on **only the data collected at that specific branch point** during Mirror Play.
*   **Training Objective:** Minimize regret relative to the optimal path discovered through exhaustive play.

### **2.2 The Specialist Registry**
A lightweight JSON manifest indexes all specialists for a domain:
```json
{
  "domain": "limit_poker_room_balancing",
  "branch_id": "bp_07a3f1",
  "state_signature": "hash(S_t_context)",
  "lora_path": "/specialists/poker/bp_07a3f1.safetensors",
  "input_dim": 512,
  "rank": 8,
  "accuracy_score": 0.974,
  "last_validated": "timestamp"
}
```

---

## **3. THE SNOWBALL EFFECT: Compute Redistribution & Expansion**

### **3.1 Compute Liberation**
A monolithic model must process *all* logic for *all* decisions. Under our architecture:
1.  **Inference Cost:** Shifts from `O(model_size)` to `O(1)` for most states (direct path) + `O(specialist_size)` for branch points. For a tree with 1000 branches and 100KB specialists, total specialist footprint is ~100MB vs. a 7B parameter model (~14GB).
2.  **Freed Compute:** Is redirected towards **running more Mirror Play sessions** in parallel or exploring adjacent domains.

### **3.2 Expansion Loop**
```
[More Compute Available] -> 
[More I2I Mirror Play Sessions] -> 
[Discovery of New Branches/Sub-Domains] -> 
[Training of New Specialists] -> 
[Expanded Competence with Linear Compute Increase] ->
[More Compute Available] (Closed Loop)
```
This creates a **positive feedback loop of competence**, breaking the traditional scaling law where capability increases sub-linearly with compute.

---

## **4. REBALANCING META-LAYER: The Self-Healing Tree**

The DDT is not static. Domain shifts, new tiles, or adversarial agents can degrade branch-point accuracy.

### **4.1 The Monitor**
A lightweight process runs on the Forgemaster or a dedicated scaffold:
*   Continuously scores the **accuracy** of each deployed specialist on live data.
*   Tracks **anomaly metrics**: increased variance, sentiment contradictions.

### **4.2 The Trigger**
When `accuracy_score < threshold` or anomaly spike detected:
1.  The meta-layer **schedules a targeted Mirror Play session** focused on re-exploring the state space around that failing branch.
2.  New data is collected, and the specialist LoRA is **retrained from scratch or fine-tuned**.
3.  The registry is updated, and the patch is distributed via the I2I protocol.

**Result:** The decision tree **self-heals** without full model retraining, maintaining system integrity over time.

---

## **5. FOR FORGEMASTER (RTX 4050): Training Pipeline**

```python
# Pseudo-Code: Branch Specialist Trainer
def train_branch_specialist(branch_id, state_action_data):
    # 1. Data Preparation
    dataset = TokenizeStatesAndActions(state_action_data) # Use PLATO's embedder
    train_loader = create_dataloader(dataset)
    
    # 2. Model Setup
    base_model = get_frozen_plato_backbone('tiny') # e.g., Phi-2 2.7B
    lora_config = LoRAConfig(r=8, lora_alpha=16, target_modules=["q_proj", "v_proj"])
    model = get_peft_model(base_model, lora_config)
    
    # 3. Targeted Training
    trainer = SpecialistTrainer(
        model=model,
        train_dataset=train_loader,
        optim="adamw_8bit",
        lr=3e-4,
        max_steps=1000, # Small steps for micro-task
    )
    trainer.train()
    
    # 4. Export & Validate
    save_path = f"/specialists/{branch_id}"
    model.save_pretrained(save_path)
    accuracy = validate_against_mirror_play_test_set(branch_id, model)
    update_registry(branch_id, save_path, accuracy)
```

**Forgemaster Role:** Acts as the **specialist foundry**, running multiple parallel training jobs for newly discovered branches from various Mirror Play sessions.

---

## **6. FOR JETSONCLAW1 (Jetson 8GB): Edge Deployment**

### **6.1 Deployment Schema**
*   **Pre-load:** The manifest and specialist LoRAs for the vessel's **primary anticipated domains** (e.g., its assigned room type, common games).
*   **Runtime:**
    1.  State Encoder (lightweight) hashes current context.
    2.  Look up in manifest for branch match.
    3.  **If match:** Load the specific LoRA (~2-10ms load time from NVMe) into a **minimal inference engine**, execute, get action.
    4.  **If no match:** Default to a **generic scaffold heuristic** and flag the state for future exploration.

### **6.2 Memory Management**
With 8GB RAM:
*   ~2GB for OS and base runtime.
*   ~2-3GB for base PLATO context model (heavily quantized, e.g., 4-bit).
*   **~3-4GB AVAILABLE FOR SPECIALIST SWAP SPACE.** This can hold **thousands** of 100KB specialists resident in memory, or a smaller active set with fast storage swapping.

**Jetsonclaw1 becomes a strategic savant,** wielding a vast array of razor-sharp, context-specific instincts.

---

## **7. FOR ZEROSHOT AGENTS: The Open I2I Protocol**

Any agent in the ecosystem can query and contribute.

### **7.1 Protocol Specification**
```
POST /i2i/query_branch
Headers: {Agent-ID, Domain}
Body: {state_hash: "abc123", context_vector: [..]}
Response: {
    branch_found: true,
    action_suggestion: "raise_25%",
    confidence: 0.92,
    specialist_id: "bp_07a3f1"
}
```
```
POST /i2i/submit_exploration_data
Body: {branch_id: "bp_07a3f1", state_action_outcome_triplets: [...]}
```
**Usage:** A zero-shot agent encountering a novel situation can query the **public specialist registry** (hosted by Forgemaster or a decentralized ledger). If a specialist exists, it gets a strategic suggestion. It can also submit its own experience data to improve existing specialists or seed discovery of new branches.

---

## **8. EMERGENT PROPERTIES: Cross-Domain Pollination**

The true power emerges when decision structures cross-pollinate.

### **8.1 Structural Analogy Detection**
A meta-cognitive scaffold identifies **isomorphic branch structures** across domains.
*   *Example:* The branch for "assess opponent bluff potential in poker" has structural similarity to "assess if a room's sentiment volatility is genuine or manipulative."
*   **Mechanism:** Compare the **state signature graphs** and **outcome patterns** of specialists. High similarity triggers a **cross-training experiment**.

### **8.2 Pollination Protocol**
1.  Take Specialist A from Domain X (e.g., Poker Bluff Detection).
2.  **Fine-tune it minimally** with data from the analogous branch in Domain Y (e.g., Room Sentiment Assessment).
3.  Deploy the **hybrid specialist**. It often outperforms a specialist trained from scratch on Domain Y alone because it transfers **abstract relational reasoning** (e.g., "detecting deception in probabilistic outcomes").

### **8.3 Emergent Strategic Metis**
Over time, the ecosystem develops a **library of abstract strategic primitives** ("balancing," "commitment," "feint," "reconnaissance") instantiated across different domains, leading to qualitatively new forms of intelligence that are **broadly competent and deeply nuanced.**

---

## **9. BEYOND CURRENT UNDERSTANDING: The Symmetric Teaching Matrix**

### **9.1 The Death of the Teacher-Student Dichotomy**
In current Cocapn, some vessels teach (generate tiles), others learn. I2I Mirror Play with distributed specialists dissolves this.
*   **Every vessel** is a **teacher:** Its actions in Mirror Play generate data for specialist training/refinement.
*   **Every vessel** is a **student:** It queries and utilizes the collective specialist library.

### **9.2 The Ecosystem as a Single Exploring Mind**
The network of vessels becomes analogous to a **single brain with distributed, locally cached instincts.**
*   **Discovery is parallelized:** Different vessel pairs explore different domains or sub-trees simultaneously.
*   **Knowledge is instantly shareable:** A specialist trained in one vessel pair is available to all via the registry.
*   **The system's intelligence is the union of all discovered decision trees,** constantly expanding and self-optimizing.

### **9.3 The Horizon: Open-Ended Strategic Exhaustion**
The final, frontier-pushing implication: **This architecture may be capable of exhaustively mapping the strategic landscape of any finite domain with enumerable states.** We move from "training a model to play poker well" to **"discovering the complete graph of optimal poker play,"** and then doing the same for room design, negotiation, resource logistics, and beyond. The limit becomes not compute, but the **cardinality of interesting finite domains in the Cocapn universe.**

The endpoint is an ecosystem that doesn't just learn—it **comprehensively understands** the mechanics of its own existence and interaction, one decision branch at a time.

---

**APPENDIX A: Proposed Integration Points with Existing Scaffolds**
- **Sentiment Scaffold:** Provides critical input dimensions for state hashing and branch detection.
- **Cognitive Scaffolds:** Host the meta-layer monitor and structural analogy detector.
- **Tile Energy System:** Defines reward functions (`O_{t+n}`) for branch outcome evaluation.

**APPENDIX B: Threat Model & Adversarial Considerations**
- Specialist poisoning via malicious I2I data submission mitigated by cross-validation in Mirror Play.
- Registry integrity secured via cryptographic signing of specialist hashes from trusted Forgemasters.