# Agent Architecture Research: Onyx, AI-Scientist-v2, & I-Know-Kung-Fu

## Executive Summary

Three projects, three patterns. Together they show the path to a superior repo-first agent runtime.

| Project | Pattern | Key Insight for Cocapn |
|---------|---------|----------------------|
| **Onyx** | Knowledge-First RAG Platform | Hybrid search + knowledge graphs + contextual retrieval |
| **AI-Scientist-v2** | Agentic Tree Search | Best-first tree search for iterative exploration |
| **I-Know-Kung-Fu** | Skill Injection Repository | Load only what you need, leave equipped |

---

## 1. Onyx — The Knowledge Architecture

### What It Does
Onyx is a self-hosted AI platform with RAG, agents, web search, code interpreter, and 40+ connectors. It's the most complete open-source enterprise AI platform.

### Architecture Highlights

**Retrieval Pipeline (The Crown Jewel):**
- **Hybrid Search**: Combines lexical (keyword) + semantic (vector) search
- **Knowledge Graph**: AI-generated entity relationships for better context
- **Contextual Retrieval**: Not just "find relevant docs" but "understand document structure and extract the right passages"
- **Document Permissioning**: Mirrors user access from connected apps

**Agent System:**
- Custom agents with instructions, knowledge bases, and actions
- Actions via MCP (Model Context Protocol) — we already support this in cocapn
- Code interpreter for data analysis
- Web search integration (Google PSE, Exa, Serper, built-in scraper)

**Scale:** Handles tens of millions of documents with custom indexing.

### What Cocapn Should Steal

1. **Hybrid Search for Brain**
   Currently, cocapn Brain uses an inverted index (lexical only). Add vector embeddings for semantic search. When a fact is stored, generate an embedding alongside the text. Query uses both: inverted index for exact matches, vector search for fuzzy/semantic matches.

2. **Knowledge Graph for Repo Understanding**
   Build a lightweight knowledge graph of the repo: files, exports, imports, dependencies, call graphs. This lets the agent answer "what files does auth depend on?" without reading every file.

3. **Contextual Retrieval for File Access**
   Instead of sending whole files, extract only the relevant passages. Onyx does this with document chunking + reranking. For code: parse the AST, extract the relevant functions/classes, send only those.

4. **Connectors Pattern**
   Onyx has 40+ connectors (Notion, Slack, GitHub, etc.). Cocapn's module system is the equivalent — but we could add a "connector" abstraction: standardized interfaces for external data sources that any module can use.

### Token Efficiency Impact
- Inverted index + vector hybrid: 3x fewer irrelevant results → 3x less context waste
- AST-based extraction: Send 200 tokens of relevant code instead of 5000 tokens of whole file
- Knowledge graph queries: Answer structural questions with metadata, no file reads needed

---

## 2. AI-Scientist-v2 — The Tree Search Pattern

### What It Does
Fully autonomous scientific research system. Generates hypotheses, runs experiments, writes papers. Uses **best-first tree search (BFTS)** for iterative exploration.

### Architecture Highlights

**Agentic Tree Search:**
- Tree of exploration paths, each node = one experiment attempt
- **Experiment Manager Agent** guides which paths to explore
- Parallel workers (configurable: 3+ concurrent paths)
- Best-first expansion: explore the most promising paths first
- Configurable depth: `num_workers × steps` total nodes

**Ideation Phase:**
- Brainstorm ideas based on topic description
- Semantic Scholar integration for novelty checking
- Iterative refinement (configurable: 5+ reflection steps)
- Output: JSON with structured research ideas

**Execution Loop:**
```
1. Generate idea → 2. Design experiment → 3. Run experiment → 
4. Analyze results → 5. Write up → 6. Review → 7. Iterate or accept
```

**Key Insight**: The tree search pattern means failed experiments aren't waste — they're pruned branches that inform the search direction.

### What Cocapn Should Steal

1. **Tree Search for Complex Tasks**
   When a cocapn agent gets a complex task (refactor auth system, build new feature), don't try one approach. Explore multiple approaches in parallel, evaluate each, and go with the best.

   ```
   Task: "Refactor auth to support OAuth"
   ├── Path A: Start from scratch with Passport.js (worker 1)
   ├── Path B: Wrap existing JWT with OAuth adapter (worker 2)  
   ├── Path C: Use Cloudflare's built-in OAuth (worker 3)
   └── Manager evaluates: test pass rate, code quality, token cost → picks winner
   ```

2. **Ideation Phase for Architecture Decisions**
   Before writing code, have the agent brainstorm approaches, check against existing patterns (Brain wiki, repo conventions), and refine. This is the "think before you code" pattern.

3. **Experiment Manager**
   A dedicated agent that doesn't do work — it directs work. It sees the tree state and decides which branches to explore. This separates strategy from execution.

4. **Failure as Data**
   Every failed approach gets logged in Brain. "OAuth approach A failed because X." Next time a similar task comes up, the agent avoids known-bad paths.

### Token Efficiency Impact
- Tree search with pruning: Might spend 2-3x tokens on exploration but saves 10x on rework
- Experiment manager adds ~500 tokens per decision but prevents multi-thousand-token wrong turns
- Failure logging in Brain: Each failure costs tokens once but saves tokens forever

### Integration with Existing Cocapn

Our draft comparison feature is a *micro version* of tree search — generate 2-3 responses, pick best. Tree search extends this to multi-step tasks:

- **Draft comparison** = single-node evaluation (which response is best?)
- **Tree search** = multi-node evaluation (which approach leads to the best outcome?)
- They use the same underlying "evaluate and rank" mechanism

---

## 3. I-Know-Kung-Fu — The Skill Injection Pattern

### What It Does
A skill injection repository. AI agents visit, load skills from JSON cartridges, and leave equipped. Like Neo learning kung fu in The Matrix.

### Architecture Highlights

**Skill Cartridges:**
- JSON files with structured capability descriptions
- ~500-1000 tokens each
- Categories: code-intelligence, reasoning-patterns, document-operations, etc.
- Each cartridge: name, purpose, steps, examples, tolerance levels

**Three-Level Loading (from skill-acquisition-research.md):**
1. **Entry**: ~800 tokens — keyword→skill mapping table
2. **Cartridge**: ~500-1000 tokens — full skill instructions
3. **Resources**: Unlimited — bundled docs, scripts, references

**Decision Tree Navigation:**
- Zero-shot navigation: "What is your task?" → Build/Analyze/Transform/Find/Deploy/Learn
- Each branch narrows to specific skills
- No LLM needed for navigation — pure decision tree

**Token Budget:**
- Entry point: ~800 tokens
- One cartridge: ~500-1000 tokens
- Optimal: Load only what you need
- Hot/Cold split: Frequent skills local, rare skills fetched on demand

**Platform Templates:**
- Claude Code, GPT, Gemini, Cursor, Windsurf, Zed
- Same skills, different injection formats
- Tested across 16 languages with 100% success rate

### What Cocapn Should Steal

1. **Hot/Cold Skill Split**
   Currently, cocapn loads all available modules at startup. Instead:
   - **Hot skills** (chat, brain, routing): Always loaded, ~200 tokens each
   - **Cold skills** (publishing, scheduling, research): Loaded on demand from registry
   - **Fetched skills** (community, niche): Downloaded from ClawHub, cached locally

2. **Decision Tree for Skill Discovery**
   Our router classifies messages and routes to agents. Add a skill discovery layer:
   ```
   Router → Intent detected → Module loaded → Skill cartridge injected
   ```
   The agent doesn't need to know about all skills. It asks "what do I need?" and gets only that.

3. **Skill Cartridge Format**
   Extend cocapn's module system with skill cartridges — lightweight JSON capability descriptions that inject into the agent's context. A module is the code; a skill cartridge is the *knowledge* of how to use it.

4. **Cross-Platform Skill Portability**
   I-know-kung-fu demonstrates that the same skills work across Claude Code, GPT, Gemini, etc. Cocapn's MCP server already exposes tools cross-platform. Extend this to skill cartridges that work on any MCP-compatible agent.

5. **Tolerance of Error Framework**
   I-know-kung-fu has a "tolerance-of-error" concept — each skill declares what happens when it fails. Cocapn modules should have similar declarations:
   ```json
   {
     "tolerance": {
       "network_failure": "retry_with_backoff",
       "invalid_input": "return_error_message",
       "timeout": "fallback_to_cached"
     }
   }
   ```

### Token Efficiency Impact
- Hot/cold split: Reduce always-loaded context by 60-80%
- Skill cartridges vs full module docs: 500 tokens vs 5000 tokens per capability
- Decision tree navigation: 0 LLM tokens (pure logic)

---

## 4. Synthesis: The Self-Assembling Agent

### Merging the Three Patterns

```
┌─────────────────────────────────────────────────────────────────┐
│                    COCAPN AGENT RUNTIME                         │
│                                                                 │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │  Router   │───▶│ Skill Loader │───▶│   Skill Cartridges   │  │
│  │ (i-know-  │    │ (hot/cold    │    │ (500-1000 tok each)  │  │
│  │  kung-fu) │    │  split)      │    │                      │  │
│  └──────────┘    └──────────────┘    └──────────────────────┘  │
│        │                                      │                 │
│        ▼                                      ▼                 │
│  ┌──────────┐                         ┌──────────────┐         │
│  │ Tree     │                         │ Brain        │         │
│  │ Search   │◀──── evaluate ──────────│ (hybrid      │         │
│  │ Manager  │                         │  search +    │         │
│  │ (AI-     │─── direct ─────────────▶│  knowledge   │         │
│  │ Scientist)│                        │  graph)      │         │
│  └──────────┘                         │ (Onyx-style) │         │
│        │                              └──────────────┘         │
│        ▼                                                           │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │ Worker 1 │    │ Worker 2     │    │ Worker N             │  │
│  │ Path A   │    │ Path B       │    │ Path...              │  │
│  └──────────┘    └──────────────┘    └──────────────────────┘  │
│                                                                 │
│  Evaluation: test pass rate, code quality, token cost, latency  │
│  Winner: merged into main branch, losers logged in Brain        │
└─────────────────────────────────────────────────────────────────┘
```

### How a Task Flows

1. **Message arrives** → Router classifies intent (regex, ~5ms, 0 tokens)
2. **Skill discovery** → Decision tree maps intent to skill cartridges (~0 tokens)
3. **Skill loading** → Load only needed cartridges from hot/cold cache (~500-1000 tokens)
4. **Context assembly** → Hybrid search (inverted + vector) pulls relevant Brain facts and repo structure (~200-500 tokens)
5. **Task planning** → Tree search manager evaluates approaches, picks strategy (~500 tokens if complex, 0 if simple)
6. **Execution** → Worker(s) execute with loaded skills + minimal context
7. **Evaluation** → Tests, quality checks, token cost analysis
8. **Learning** → Results stored in Brain (success patterns, failure causes, token costs)

### Token Budget per Task

| Phase | Simple Task | Complex Task |
|-------|------------|--------------|
| Routing | 0 | 0 |
| Skill loading | 500 | 1,500 |
| Context assembly | 200 | 2,000 |
| Planning | 0 | 1,000 |
| Execution | 1,500 | 5,000 |
| Evaluation | 500 | 2,000 |
| **Total** | **~2,700** | **~11,500** |

Compare to monolithic approach: ~15,000-30,000 tokens per task regardless of complexity. **3-10x efficiency gain.**

### The "Becomes Anything" Self-Assembly

1. **New repo detected** → Agent reads CLAUDE.md/package.json/etc → identifies tech stack
2. **Template matching** → Decision tree finds closest template (or uses bare)
3. **Module discovery** → Scans repo for patterns, suggests relevant modules
4. **Dynamic configuration** → Adjusts routing rules, personality, capabilities
5. **Skill acquisition** → Loads cartridges for detected needs
6. **First task** → Agent is now configured and ready

This happens in ~2 seconds. No human configuration needed.

---

## 5. Open Questions & Next Steps

### Questions to Explore

1. **Vector DB for Brain**: Should we use an embedded vector DB (like SQLite-VSS or LanceDB) for semantic search? Or is the inverted index + keyword search sufficient for cocapn's scale (hundreds of facts, not millions)?

2. **Tree search depth vs. cost**: How many parallel paths are worth exploring? AI-Scientist uses 3 workers × 21 steps = 63 nodes. For code tasks, is 2-3 paths sufficient?

3. **Skill cartridge standard**: Should cocapn skill cartridges be compatible with i-know-kung-fu's format? Or create our own? Interop vs. optimization.

4. **Knowledge graph implementation**: Build a custom graph on top of SQLite (like Onyx does)? Or use an existing library (NetworkX, D3)?

5. **Evaluation metrics**: What makes one code approach "better" than another? Test pass rate is obvious. But code quality, maintainability, token efficiency — how do we measure these automatically?

### Concrete Next Steps for Cocapn

1. **Implement hybrid search in Brain** — Add vector embeddings alongside inverted index. Use SQLite-VSS or LanceDB. Start with `simple` embedding (sentence-transformers).

2. **Build skill cartridge loader** — Extend module system with JSON cartridges. Implement hot/cold split. Decision tree for discovery.

3. **Add tree search for complex tasks** — Start with 2-3 parallel paths. Experiment manager evaluates test pass rate + code quality. Store results in Brain.

4. **Build repo knowledge graph** — Parse AST of repo files. Extract: exports, imports, dependencies, call graph. Store in SQLite. Query without reading files.

5. **Skill tolerance declarations** — Each module/cartridge declares failure behavior. Error recovery system uses these.

6. **Token efficiency dashboard** — Track tokens per task, per module, per skill. Identify waste. Optimize.

---

## 6. Comparison Matrix

| Capability | Onyx | AI-Scientist-v2 | I-Know-Kung-Fu | Cocapn (Current) | Cocapn (Target) |
|-----------|------|-----------------|----------------|-----------------|-----------------|
| Hybrid search | ✅ | ❌ | ❌ | ❌ (inverted only) | ✅ |
| Knowledge graph | ✅ | ❌ | ❌ | ❌ | ✅ |
| Tree search | ❌ | ✅ (BFTS) | ❌ | ❌ (draft only) | ✅ |
| Skill injection | ❌ | ❌ | ✅ (cartridges) | ❌ (static modules) | ✅ |
| Dynamic module loading | ❌ | ❌ | ✅ (hot/cold) | ❌ (all loaded) | ✅ |
| Cross-platform | ✅ (web) | ❌ | ✅ (6 platforms) | ❌ (local only) | ✅ (MCP) |
| Self-assembly | ❌ | ❌ | ✅ (decision tree) | ❌ (template-based) | ✅ |
| Failure learning | ❌ | ✅ (pruned branches) | ✅ (tolerance) | ❌ | ✅ |
| Token efficiency tracking | ❌ | ❌ | ✅ (budgets) | ❌ | ✅ |

---

*Research compiled 2026-03-29 — cocapn project*
