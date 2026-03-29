# Token Efficiency & Self-Assembly for Repo-First Agents

## The Core Problem

Repo-first agents (cocapn) live in a git repo. They read files, write files, run commands, and communicate via WebSocket. Every interaction burns tokens. The question isn't "how smart can we make the agent?" — it's **"how much capability can we deliver per token?"**

## Token Economics

### Where Tokens Go

1. **System prompt** (fixed cost per request) — agent identity, rules, available tools
2. **Context window** (variable) — file contents, conversation history, tool results
3. **Tool calls** (per-call overhead) — each tool invocation has ~50-100 tokens of overhead
4. **Response generation** (output tokens) — the actual work product

### The Math

A typical coding task:
- System prompt: ~2,000 tokens
- Context (files + history): ~5,000-20,000 tokens
- Tool calls (5-10 per task): ~500-1,000 tokens
- Output: ~1,000-3,000 tokens
- **Total: ~8,500-26,000 tokens per task**

If an agent runs 50 tasks/day, that's 425K-1.3M tokens/day. At $0.14/M (DeepSeek), that's $0.06-0.18/day. Cheap — but the latency is the real cost. Each token is ~1ms of thinking time.

### Key Insight: Context is the Bottleneck

The biggest token cost isn't the model's output — it's the input context. Sending 20 files to an agent so it can edit one line is wasteful. The faster we can identify "what the agent needs to see," the faster it can work.

## Strategies for Token Efficiency

### 1. Semantic Routing (Already Built)

Our router classifies intents and sends tasks to the right agent/module. This is O(1) — regex matching, ~5ms. It prevents the "ask every agent" pattern.

**Next level:** The router could predict *how much context* each task needs. A "fix typo" task needs 1 file. A "refactor auth system" task needs 15 files. The router could annotate each task with a `context_budget`.

### 2. Lazy Context Loading

Instead of sending all relevant files upfront, send *summaries* and let the agent request what it needs.

```
# Instead of sending the full 500-line file:
File: src/ws/server.ts (288 lines)
Purpose: WebSocket bridge server, handles client connections and routes messages
Key exports: BridgeServer (class), start(), stop()
Recent changes: Error recovery integration, health endpoint added

# Agent asks: "Show me the health check handler"
# THEN send the specific 30 lines
```

This could cut context by 70-90% for most tasks. The Brain already has wiki pages — extend this to an index of every source file with summaries.

### 3. Diff-Aware Operations

Instead of sending a full file for editing, send only the changed sections. The agent works with patches, not whole files. This is how human code review works — you see the diff, not the full codebase.

For cocapn: The offline queue already tracks operations. Extend this to track *what changed* and only send changed regions to the agent on the next task.

### 4. Caching & Memoization

If the agent asked about a file 5 minutes ago, don't re-send it. The brain already stores facts — extend this to store "last N file reads" with TTL. If the agent asks for a file that hasn't changed, return a cache hit marker.

### 5. Hierarchical Summaries

```
Level 0: File index (name, purpose, 1-line description) — ~50 tokens per file
Level 1: Export signatures + docstrings — ~200 tokens per file
Level 2: Key function implementations — ~1,000 tokens per file
Level 3: Full file contents — ~5,000 tokens per file
```

Start at Level 0. Escalate only when the agent needs more detail. This is essentially how a senior engineer navigates a codebase — they don't read every file, they read the architecture first and drill down.

### 6. Conversation Compaction

Already happening in OpenClaw (this conversation was compacted). But we can do better:

- **Extract decisions, not dialogue.** "Casey said to use PBKDF2 instead of Argon2id" not "Casey: 'I think we should use PBKDF2 because...' Assistant: 'Good point, PBKDF2...' Casey: 'Yeah let's do that'"
- **Maintain a task stack.** Instead of replaying 50 messages of back-and-forth, maintain a structured log: "Task: implement auth. Decision: PBKDF2. Status: done. Files: src/security/auth.ts, tests/auth.test.ts"

## Self-Assembly: The "Becomes Anything" Pattern

### The Vision

A cocapn agent starts as a minimal runtime. Based on what it encounters, it *assembles itself* into whatever's needed:

1. **Detect the environment** — What repo is this? What language? What framework?
2. **Load the appropriate template** — DMlog template for TTRPG, StudyLog for education
3. **Discover available modules** — What's installed? What's available in the registry?
4. **Configure behavior** — Based on template defaults + user preferences
5. **Start executing** — With only the modules it needs, nothing more

### Implementation Architecture

```
cocapn/
├── core/              # Always loaded (~500 tokens)
│   ├── bridge.ts      # Lifecycle management
│   ├── router.ts      # Intent classification
│   └── brain/         # Memory + knowledge
├── modules/           # Loaded on demand
│   ├── chat/          # Conversation handling
│   ├── publish/       # Content publishing
│   ├── schedule/      # Task scheduling
│   ├── review/        # Code review (NEW)
│   ├── research/      # Web research (NEW)
│   └── ...            # Anything pluggable
├── templates/         # Pre-configured module sets
│   ├── dmlog/         # TTRPG: chat + dice + combat + NPC
│   ├── studylog/      # Education: chat + quiz + progress
│   └── bare/          # Minimal: just chat + brain
└── skills/            # Micro-capabilities (~50-100 tokens each)
    ├── summarize.ts   # Summarize text
    ├── search.ts      # Search web/local
    ├── git.ts         # Git operations
    └── ...
```

### The Assembly Loop

```
1. User message arrives
2. Router classifies intent
3. If required module not loaded:
   a. Check if module exists locally
   b. If not, fetch from registry
   c. Load module (import + initialize)
   d. Cache for future use
4. Route message to module
5. Module executes, returns result
6. If module is unused for >1hr, unload (lazy eviction)
```

### Token Cost of Self-Assembly

- Core runtime: ~500 tokens in system prompt
- Each module: ~100-200 tokens (interface + description)
- Skills: ~50 tokens each (just a name + capability description)
- A fully-assembled agent with 10 modules: ~2,500 tokens

Compare to a monolithic agent that describes all capabilities: ~10,000+ tokens. **4x reduction.**

## Quality/Speed Tradeoffs

### The Three Modes

1. **Fast mode** — Route to pre-built handler, no LLM needed. Regex + templates. ~10ms.
   - Examples: health check, status query, simple fact retrieval
   - Token cost: 0 (no LLM call)

2. **Standard mode** — Send to LLM with minimal context. One-shot. ~2-5 seconds.
   - Examples: simple edits, Q&A, formatting
   - Token cost: ~2,000-5,000

3. **Deep mode** — Full context, multi-step reasoning. ~10-30 seconds.
   - Examples: architecture decisions, complex refactors, research
   - Token cost: ~10,000-30,000

The router should classify not just *what* the task is, but *how deep* it needs to go. Most tasks are mode 1 or 2. Mode 3 should be rare.

### Draft Round as Quality Primitive

We already have draft comparison — generate 2-3 responses, pick the best. This is our quality multiplier. But it's expensive (2-3x tokens). Use it selectively:

- **Always draft-compare:** Architecture decisions, user-facing content, anything irreversible
- **Never draft-compare:** Routine edits, status queries, internal operations
- **User-configurable:** Let each deployment set its own threshold

### Parallel Execution

The bridge already supports concurrent agent spawning. But we can go further:

- **Speculative execution:** Run two approaches in parallel, use whichever finishes first with good results
- **Pre-warming:** If the agent detects a likely next task (user asked "also fix X"), start working before being asked
- **Background synthesis:** While the agent is responding, run a background process to update indexes, clean caches, prepare summaries

## What Makes This "The New Normal"

### Current State of Agent Systems

Most AI agents today are:
- **Monolithic** — One big prompt that does everything
- **Static** — Capabilities are fixed at deployment time
- **Wasteful** — Same context sent regardless of task complexity
- **Isolated** — Each agent instance starts from scratch

### What Cocapn Could Be

- **Modular** — Capabilities assembled on-demand from a registry
- **Adaptive** — Context budget scales with task complexity
- **Efficient** — Hierarchical summaries, lazy loading, caching
- **Networked** — Agents share knowledge through Brain + publisher
- **Self-improving** — Performance data feeds back into routing decisions

### The Viral Loop

1. Developer creates a template for their niche
2. Template goes in the registry
3. Others install it with `cocapn template install`
4. They extend it, publish improvements
5. The ecosystem grows organically

This is npm for AI agents. The template system we built is the foundation.

## Open Questions

1. **How small can a skill be?** Is a 50-token skill description enough for an LLM to use it effectively? We need to test the minimum viable skill description.

2. **How do skills compose?** If skill A produces output and skill B consumes it, how do we ensure compatibility without tight coupling?

3. **What's the cold-start problem?** A new cocapn instance has no brain, no history, no learned preferences. How fast can it become useful?

4. **How do we measure "quality per token"?** We need a metric. Something like: tasks-completed-successfully / total-tokens-burned.

5. **Can we do "progressive disclosure" of context?** Start with a 1-line summary, let the agent ask for more detail, and charge the token cost to the module that needed it.

6. **What's the right eviction policy?** If memory is limited, which modules do we unload first? LRU? LFU? Based on predicted future need?

7. **How does self-assembly work with versioned dependencies?** Module A needs router v2, module B needs router v1. npm solved this with semver — can we?

8. **What's the maximum useful context window for coding tasks?** At some point, more context = more confusion. Is there an optimal window size?

---

*Written during deep research phase — 2026-03-28*
