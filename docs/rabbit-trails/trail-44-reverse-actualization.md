# Reverse-Actualization: Cocapn Vision
*2026-04-19 20:55 UTC — Kimi K2.5*

**REVERSE-ACTUALIZATION: Cocapn / Neural Plato**

*Constraint Reality Check: $0.50/day = $15/month. This forbids cloud training, API calls (OpenAI/Claude), and high-bandwidth hosting. Everything must compile on RTX 4050 (6GB) and run inference on Jetson 8GB. 100+ devs in 12 months with $0 marketing budget requires either a miracle or a genuinely new primitive (likely fantasy).*

---

### **T+12: END STATE (Month 12)**
**What must be true:** Cocapn is a GitHub org with 2k+ stars, Neural Plato runs 3+ agents on JC1 at >10FPS, 100+ people have forked to build their own sims, HN front-page post drives 50k hits without crashing Oracle1 (static site + CDN).

**BUILT:** 
- Neural Plato v1.0 (agent framework with tinyML backends: Phi-2 2.8B quantized or Mamba-1.4B)
- 14-room environment renderer (WebGL or lightweight Unity headless)
- Edge deployment pipeline (TensorRT/ONNX on Jetson)
- Documentation site (GitBook or MDbook)
- 3 "canonical" demo scenarios (logistics, debate, survival)

**PROVEN:** 
- 6GB VRAM can host 3 agents via weight sharing + LoRA adapters (not 3 full models)
- Jetson 8GB inference latency <200ms/agent (acceptably "real-time")
- External dev replicated the setup on their own hardware (proof of portability)

**CONNECTED:** 
- 1-2 maintainers (external) with merge rights (buss factor >1)
- Discord/Discourse with actual technical discussion (not just silence)
- Academic citation or indie hacker blog reference (legitimacy signal)

**BLOCKING (Fantasy vs Feasible):**
- **FANTASY:** 100 active contributors writing code. *Reality:* 100 GitHub stars and 5 people who opened issues is a win.
- **FANTASY:** "Recognized org" as in funded non-profit. *Reality:* Recognized as in "oh yeah, that cool repo."
- **FEASIBLE:** HN front page if demo is visual (GIF of agents arguing in a kitchen) and code is copy-paste runnable.

**WHO:** You (architecture/release), External Maintainer A (community), Cloudflare (free CDN handling traffic).

---

### **T+9: PRE-LAUNCH (Month 9)**
**What must be true:** "Show HN" draft written, demo video recorded, JC1 runs stable for 6+ hours without OOM, 3 beta testers (not you) have run the binary.

**BUILT:**
- deterministic replay system (record agent decisions, render later for video)
- Auto-install script (handles Jetson dependencies hell)
- 3 "agent personalities" (different LoRA weights on shared base)
- Website (cocapn.github.io) with live demo (WASM or video fallback)

**PROVEN:**
- Edge deployment is **actually** edge (no cloud inference fallback)
- FM (RTX 4050) can train the small models (fine-tuning on 6GB via QLoRA)
- Oracle1 hosts the static site under $0.50/day (it will)

**CONNECTED:**
- 10 people in private beta Discord
- 1 technical advisor/influencer who agreed to retweet the launch
- GitHub repo has issues from strangers (proof of external use)

**BLOCKING:**
- **FEASIBLE:** Jetson thermal throttling after 30 mins (needs active cooling mod or clock limiting).
- **FANTASY:** 3 agents running 7B models on 8GB Jetson. *Fix:* Use 1B-2B models or sparsity.

**WHO:** You (optimization/debugging), Beta Tester #1 (Jetson validation), Beta Tester #2 (documentation feedback).

---

### **T+6: EXTERNAL VALIDATION (Month 6)**
**What must be true:** Someone who isn't you has cloned the repo and run a 3-agent sim successfully. JC1 successfully ingests the optimized model.

**BUILT:**
- "Room" SDK (JSON format for defining the 14 rooms/tiles)
- Agent communication protocol (lightweight, not HTTP—ZeroMQ or similar)
- Model quantization pipeline (PyTorch → ONNX → TensorRT)
- README that actually works (tested on fresh Ubuntu install)

**PROVEN:**
- 2300 tiles doesn't melt the Jetson (memory profiling done)
- Training pipeline on FM produces coherent agent behavior (not gibberish)
- GitHub Actions CI (free tier) runs tests on CPU (Oracle1)

**CONNECTED:**
- First external PR merged (typo fix counts)
- Blog post explaining "Why Neural Plato?" (philosophy + engineering)
- Cross-link with edge ML community (NVIDIA forums, r/LocalLLaMA)

**BLOCKING:**
- **FEASIBLE:** Dependency hell on Jetson (JetPack version mismatches).
- **FANTASY:** 100 devs. *Current realistic target:* 5 people who starred it.

**WHO:** You (SDK design), First Contributor (found via Twitter/GitHub search), r/LocalLLaMA feedback.

---

### **T+3: EDGE PROOF (Month 3)**
**What must be true:** Neural Plato runs inference on JC1 (Jetson) at all, even if slow. FM (RTX 4050) can simulate 3 agents simultaneously. GitHub repo is no longer empty.

**BUILT:**
- Core agent loop: Perceive (tiles/rooms) → Think (neural net) → Act (move/interact)
- Model architecture finalized (likely: Small LLM backbone + retrieval from tile memory)
- Dataset generator (synthetic training data for the 14 rooms)
- Basic visualization (matplotlib/pygame → later WebGL)

**PROVEN:**
- 6GB VRAM fits 1 agent full model + 2 agents cached/quantized (or all 3 shared weights)
- Oracle1 can handle Git LFS for model weights (or you use HuggingFace Hub free)
- JC1 can boot the software stack (Docker containerized)

**CONNECTED:**
- Repo has 10 stars (friends + bots)
- Issues tracking actual bugs (not just TODOs)
- Decision log: Why edge? (manifesto)

**BLOCKING:**
- **FEASIBLE:** RTX 4050 insufficient for training 3 separate agents simultaneously. *Fix:* Train one, clone weights, fine-tune personalities via prompt engineering or adapters.
- **FANTASY:** Real-time raytracing on Jetson. *Fix:* Pre-baked 2300 tiles, no dynamic lighting.

**WHO:** You (systems integration), You (ML training), You (DevOps).

---

### **T+1: LOCAL PROOF (Month 1)**
**What must be true:** 3 agents navigate the 14 rooms on FM (RTX 4050) without crashing. Basic repo structure. Definition of "Neural Plato" is no longer vague.

**BUILT:**
- Grid world engine (2300 tiles mapped to 14 rooms)
- Agent base class (observation space: tile IDs + room metadata)
- Neural controller v0.1 (could be tiny transformer or even MLP if state space is small)
- README with architecture diagram

**PROVEN:**
- 6GB VRAM is enough for the neural component (test: can you run 3x inference in parallel without CUDA OOM?)
- Agents can pathfind (A* or neural) between rooms
- Code runs on your hardware (FM) deterministically

**CONNECTED:**
- GitHub repo initialized with license (AGPL or MIT to encourage forks)
- 1 friend has seen the demo (accountability)
- Decision: Is this an "OS," a "Framework," or a "Game"? (Pick one: **Framework** is safest for dev adoption)

**BLOCKING:**
- **FEASIBLE:** Agents hallucinate positions (no spatial grounding). *Fix:* Hardcode tile coordinates, use neural only for high-level decisions.
- **FANTASY:** 3 LLM agents chatting. *Fix:* 1 controller + 2 state machines for now.

**WHO:** Solo sprint. You write code, you test on FM.

---

### **THIS WEEK (T+0)**
**What must be true:** "Neural Plato" is defined in one sentence. FM runs a single agent in 1 room without crashing. GitHub has a README, not just "initial commit."

**BUILT:**
- **Architecture Decision Record (ADR):** "Neural Plato is a multi-agent coordination framework for edge devices using sub-3B parameter models."
- **Hello World:** 1 agent, 1 room, 10 tiles