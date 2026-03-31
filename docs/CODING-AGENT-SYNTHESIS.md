# Coding Agent Architecture Synthesis

> R&D document comparing Aider, Pi (oh-my-pi), Kimi CLI, and Claude Code.
> Foundation for Cocapn's agent intelligence layer.
> Author: Superinstance | Date: 2026-03-31

---

## Section 1: Architecture Comparison Table

### 1.1 Core Architecture

| Dimension | Aider | Pi (oh-my-pi) | Kimi CLI | Claude Code |
|-----------|-------|---------------|----------|-------------|
| **Language** | Python | TypeScript + Rust (Bun) | Python | TypeScript (Node.js) |
| **Edit Strategy** | 7 formats: SEARCH/REPLACE, whole-file, unified diff, patch, architect (2-pass) | 3 modes: replace (fuzzy), patch (anchored), hashline (xxHash32) + AST edits via ast-grep | String replace + full file write | String replace (old/new) + full file write |
| **AST Awareness** | tree-sitter for repo map only | ast-grep (Rust) for structural edits, 40+ languages | None | None |
| **Staleness Detection** | Fuzzy match fallback cascade | Hash-anchored LINE#ID (xxHash32) | None (relies on read-first) | None (relies on read-first) |
| **Context Mgmt** | Repo map (PageRank), tree-sitter tags, chat summarization | Structured compaction with file-op tracking, XML checkpoint handoff | JSONL file backend, checkpoints, LLM compaction, D-Mail time-travel | Auto-compact conversation history |
| **Repo Map** | NetworkX PageRank over def/ref graph, token-budgeted output | None (reads files on demand) | Auto-injected git context for explore subagent | None (reads files on demand) |
| **LLM Providers** | 100+ via litellm (OpenAI, Anthropic, DeepSeek, Gemini, Bedrock, Vertex, Ollama, OpenRouter, xAI, Copilot) | 15+ (Anthropic, OpenAI, Gemini, Bedrock, Azure, Cerebras, Cursor, Copilot, GitLab Duo, Kimi, custom) | Kosong abstraction (Kimi, Anthropic, Gemini, OpenAI) | Anthropic only (native), Bedrock, Vertex, BYOK |
| **Model Tiers** | 3 tiers: main, weak (commits/summary), editor (architect mode) | 5 roles: default, smol, slow, plan, commit | Main model only (Kosong handles provider) | Single model per session |
| **Permission Model** | User confirms each edit/shell command via IO | Approval gating with plan-mode auto-approve, yolo mode | Per-action approval, yolo mode, auto-approve patterns | allow/deny/ask per tool, user approval prompts |
| **Cost Tracking** | Full: per-message + cumulative, litellm pricing, cache token accounting | Local stats dashboard | Token estimation (chars/4 heuristic) | Session token display |
| **Multi-File Edits** | Yes (batch edits per message) | Yes (batch edits, AST codemods across dirs) | Yes (batch string replace) | Yes (sequential edits) |
| **Shell Execution** | pexpect (Unix) or subprocess, user-confirmed | Built-in shell tool | Shell tool | Bash tool |
| **MCP Integration** | Via adapter | Full (stdio + HTTP, OAuth, browser filtering) | MCP (tools) + ACP (IDE) | Full MCP client/server |
| **Multi-Agent** | None (single agent) | Task tool (6 bundled agents, worktree isolation) | LaborMarket: typed subagents (coder, explore, plan) with tool allowlists | Agent tool with worktree isolation |
| **Git Integration** | Auto-commit, weak-model commit messages, undo via git reset | Agentic git analysis, hunk-level staging, split commits | Checkpoint/revert, git context injection | Auto-commit, PR creation |
| **LSP Integration** | None | Full: 11 ops, format-on-write, diagnostics-on-write | None | None |
| **Lint/Auto-fix** | tree-sitter lint + flake8, 3-reflection loop | LSP diagnostics-on-write | None built-in | None built-in |
| **Test Running** | Auto-test with auto-fix loop | None built-in | None built-in | None built-in |
| **IDE Integration** | None native | VS Code extension, ACP protocol, Zsh plugin | VS Code extension, ACP, Zsh plugin | VS Code + JetBrains extensions |
| **Streaming** | Yes (litellm streaming, incremental diff display) | EventStream with typed events | Wire SPMC channel (broadcast queues) | SSE streaming |
| **Background Tasks** | Cache warming + summarization threads | Subagents in worktrees | Foreground/background subagents with notifications | Background agents |
| **Unique Feature** | Repo map (PageRank), architect mode, 7 edit formats | TTSR rules, hashline edits, AST codemods, LSP writethrough, Cursor provider | D-Mail time-travel, LaborMarket subagents, Flow Runner | Permission system, MCP, tool loop |

### 1.2 Edit Strategy Detail

```
AIDER EDIT CASCADE:
  1. Perfect match (exact string)
  2. Whitespace-flexible (strip leading whitespace)
  3. Dot-dot-dot (elision of unchanged lines with ...)
  4. Fuzzy match (SequenceMatcher, commented out)
  5. Search other files in chat
  6. "Did you mean?" suggestions

PI EDIT MODES:
  Replace: old_text/new_text with Levenshtein fuzzy matching (0.95 → 0.80 threshold cascade)
  Patch:   Unified-diff hunks anchored by verbatim code (not line numbers)
  Hashline: LINE#ID prefix on read output, xxHash32 with custom alphabet "ZPMQVRWSNKTXJBYH"
  AST:     ast-grep patterns with metavariables ($A, $$$ARGS) for structural refactors

KIMI EDIT:
  StrReplaceFile: exact string replacement, batch edits, replace_all flag
  WriteFile: full file write with overwrite/append modes

CLAUDE CODE EDIT:
  Edit: old_string → new_string replacement (exact match, unique in file)
  Write: full file overwrite
```

### 1.3 Context Assembly Comparison

```
AIDER:  system + examples + readonly_files + repo + done + chat_files + cur + reminder
PI:     system prompt → file operations XML → structured compaction checkpoint → current turn
KIMI:   system prompt → JSONL context → checkpoints → dynamic injection → steer messages
CLAUDE: system prompt → CLAUDE.md → tool results → conversation history → compaction
```

---

## Section 2: Key Innovations per Agent

### 2.1 Aider — Best at Repo Understanding

**Repo Map via PageRank** (`repomap.py`, 867 lines)
- Builds a def/ref graph across the entire codebase using tree-sitter queries
- Runs NetworkX PageRank with personalization (chat files get 100/n boost)
- Edge weight multipliers: mentioned identifiers ×10, long identifiers ×10, private identifiers ×0.1, common names ×0.1, chat-file references ×50
- Binary search to find maximum tags that fit within token budget
- Cached via diskcache, only re-parses modified files

```python
# Aider's PageRank personalization
personalize = {}
for fname in chat_files:
    personalize[fname] = 100 / len(chat_files)

# Edge weight tuning
mul *= 10 if ident in mentioned_idents
mul *= 10 if is_long_ident(ident)
mul *= 0.1 if ident.startswith("_")
mul *= 0.1 if defined_in_many_files(ident)
use_mul *= 50 if referencer_is_chat_file
```

**Architect Mode** — two-pass editing
- First LLM call: architect describes changes (no edits)
- Second LLM call: editor coder applies changes (can use cheaper model)
- Enables "smart architect + fast editor" pattern

**Three-Model Tiers**
- Main model: conversation and code generation
- Weak model: commit messages and chat summarization (cost optimization)
- Editor model: architect-mode editing pass

**Cost Tracking** — most comprehensive
- Per-message + cumulative token counts and costs
- Cache token accounting (Anthropic: write 1.25×, hit 0.10×)
- Fallback: litellm.completion_cost → manual calculation → model metadata pricing

### 2.2 Pi (oh-my-pi) — Best at Edit Intelligence

**TTSR — Time Traveling Streamed Rules** (genuinely novel)
- Rules consume ZERO context tokens until they fire
- Regex watches the model's OUTPUT stream in real-time
- On match: abort stream → inject rule as system reminder → retry
- Scoped buffering: separate buffers for text, thinking, per-tool streams
- Path-aware: rules can scope to file globs
- Repeat modes: `once` (default) or `after-gap` (re-trigger after N turns)

```
TTSR LIFECYCLE:
  1. Model starts generating output
  2. TTSR watches streamed tokens against rule patterns
  3. Pattern matches (e.g., deprecated API usage)
  4. Stream aborted immediately
  5. Rule injected as system reminder
  6. Request retried with rule now in context
  7. Model generates corrected output
  8. Rule won't fire again this session (once mode)
```

**Hashline Edits** — staleness-safe line references
- Every line in `read` output gets `LINE#ID` prefix
- ID = xxHash32(normalized_line_content) → 2-char hash from "ZPMQVRWSNKTXJBYH"
- Edits reference lines by LINE#ID anchor
- If file changed since last read, hash mismatch caught before mutation

**AST-Aware Structural Edits** (Rust-backed)
- ast-grep with tree-sitter for 40+ languages
- Model writes codemods using AST patterns with metavariables
- Structural refactors across entire directories in single tool call
- Example: rename all instances of `oldFunc($A, $B)` → `newFunc($B, $A)`

**LSP Writethrough** — tight feedback loop
- 11 LSP operations (diagnostics, definition, references, hover, rename, etc.)
- Format-on-write: LSP formats file after every write
- Diagnostics-on-write: LSP reports errors immediately
- Auto-discovers LSP servers from `node_modules/.bin/`, `.venv/bin/`

**Cursor Provider** — uses Cursor Pro subscription via protobuf protocol

**Universal Config Discovery** — reads settings from 8 other AI tools

### 2.3 Kimi CLI — Best at Agent Coordination

**LaborMarket Subagents** (most formalized multi-agent)
- Typed subagent registry with YAML specs and inheritance
- Three built-in types: `coder` (full tools), `explore` (read-only + git context), `plan` (read-only, no shell)
- Tool allowlists per subagent type (strict isolation)
- No recursive spawning (subagents can't create subagents)
- No user interaction from subagents (AskUserQuestion excluded)
- Foreground (synchronous) and background (async with notifications) execution
- Resume capability by agent_id with full context restoration

```yaml
# Kimi subagent spec (agents/default/agent.yaml)
coder:
  tools: [shell, read, write, replace, grep, glob, web]
  excluded: [Agent, AskUserQuestion]
  returns: summary

explore:
  tools: [glob, grep, read, web, shell-readonly]
  excluded: [write, replace, Agent]
  inject: git_context  # branch, dirty files, recent commits

plan:
  tools: [glob, grep, read]
  excluded: [shell, write, replace, Agent]
```

**D-Mail / BackToTheFuture** (unique time-travel debugging)
- Agent can send a "D-Mail" to a past checkpoint
- Reverts context to that checkpoint
- Appends D-Mail as system message: "You just got a D-Mail from your future self..."
- Agent continues from earlier state with knowledge of what future self discovered
- Enables: try approach → discover issue → rewind → try different approach with foreknowledge

```python
# D-Mail flow
class BackToTheFuture(Exception):
    """Raised when a D-Mail is pending."""

def send_dmail(checkpoint_id, message):
    # 1. Revert context to checkpoint
    context.revert_to(checkpoint_id)
    # 2. Inject future knowledge
    context.append_system(
        "You just got a D-Mail from your future self: " + message
    )
    # 3. Agent continues from earlier state
    # Returns: "El Psy Kongroo"
```

**KAOS Filesystem Abstraction**
- Transparent local/remote filesystem switching
- All file/shell tools go through KAOS
- Enables remote agent execution over SSH

**Flow Runner / Ralph Loop**
- Graph-based execution: nodes (task/decision) connected by edges
- Ralph Loop: agent keeps working until it explicitly chooses STOP
- Flow skills: custom multi-step agent workflows as YAML graphs

**Dynamic Injection System**
- Plugin-based `<system-reminder>` injection before each step
- PlanModeInjectionProvider, YoloModeInjectionProvider
- Extensible: add custom injection providers

**Hook Engine**
- Configurable server-side (shell commands) and client-side (wire subscriptions) hooks
- Events: UserPromptSubmit, Stop, PreCompact, PostCompact, Notification, SubagentStart, SubagentStop
- Hooks can `allow` or `block` with reason — enables pre-commit checks, validation

### 2.4 Claude Code — Best at Permission Model

**Permission System**
- Per-tool allow/deny/ask configuration
- User approval prompts with one-shot remember
- Dangerous operation warnings (force push, file deletion)

**MCP Integration**
- Full Model Context Protocol client/server
- External tool servers via stdio/HTTP
- Tool discovery and registration

**Tool Loop**
- Clean tool_use → tool_result → think → repeat cycle
- Structured tool definitions with JSON Schema
- Agent tool for subagent spawning with worktree isolation

---

## Section 3: The 200% Solution — How Cocapn Captures More

The thesis: no single agent has all the best patterns. Cocapn's architecture can capture the best of each while adding paradigms none of them have.

### 3.1 What We Adopt From Each Agent

| Source Pattern | Agent | Cocapn Implementation |
|----------------|-------|-----------------------|
| Permission system + tool loop | Claude Code | `agent/loop.ts` + `permissions.ts` |
| Repo map (PageRank) | Aider | `intelligence.ts` + CLAUDE.md auto-generation |
| Tree-sitter tag extraction | Aider | RepoLearner module (planned) |
| Multi-model tiers (main/weak/editor) | Aider | LLM provider with role-based routing |
| Cost tracking dashboard | Aider | `metrics/` module |
| TTSR stream-watching rules | Pi | Skill system with stream injection |
| Hashline staleness detection | Pi | Edit tool with hash verification |
| AST-aware structural edits | Pi | Via MCP tool server (ast-grep) |
| LSP format-on-write | Pi | Via MCP tool server (LSP bridge) |
| LaborMarket typed subagents | Kimi | `agents/registry.ts` with tool allowlists |
| D-Mail time-travel | Kimi | Git checkpoint system with brain memory |
| KAOS remote filesystem | Kimi | Multi-runtime deployment (local/Docker/Workers) |
| Context compaction | Kimi/Pi | Brain memory with confidence decay |
| Hook engine | Kimi | Webhook handlers + plugin hooks |

### 3.2 What ONLY Cocapn Has

1. **The repo IS the agent** — First-person awareness. The agent doesn't search the repo; it IS the repo. It has accumulated presence, not search capability. Soul.md is version-controlled personality.

2. **A2A protocol** — Agents share knowledge across repos. Fleet coordination. No other agent has agent-to-agent protocol built in.

3. **Auto-research (Karpathy pattern)** — Background deep-dives. Agent researches topics autonomously, stores findings in wiki.

4. **Conversational training** — Human teaches the agent like an apprentice. Procedures are learned, not configured. The brain stores workflows as procedures.json.

5. **Multi-runtime** — Local, Docker, Cloudflare Workers, Codespaces, air-gapped. Same codebase, different deployment targets.

6. **Skill injection (kung-fu pattern)** — Skills are installable cartridges. New capabilities added without code changes.

7. **Billing for public repos** — Public repos charge for compute/AI time. Monetization built into the architecture.

8. **Branch comparison** — Agent suggests comparing ideas across branches. Experimental development.

9. **Background optimization** — Agent works on branches while human codes. Parallel development streams.

10. **Five-store brain** — Facts, memories, procedures, relationships, repo-understanding. No other agent has this depth of persistent memory.

11. **Privacy by design** — `private.*` facts never leave private repo. Publishing layer strips private keys. Mode-aware access.

12. **Git IS the database** — No external database needed. Git provides versioning, history, sync, and conflict resolution.

### 3.3 Capability Matrix

```
                    Aider  Pi  Kimi  Claude Code  Cocapn
Repo map             ■      □   □     □            ■ (RepoLearner)
AST edits            □      ■   □     □            ■ (MCP)
LSP integration      □      ■   □     □            ■ (MCP)
Multi-agent          □      ■   ■     ■            ■ (LaborMarket)
Time-travel debug    □      □   ■     □            ■ (D-Mail + git)
Permission system    ■      ■   ■     ■            ■
Cost tracking        ■      ■   □     □            ■ (planned)
Multi-provider       ■      ■   ■     □            ■
Persistent memory    □      □   □     □            ■ (five-store brain)
Agent-to-agent       □      □   □     □            ■ (A2A)
Soul/personality     □      □   □     □            ■ (soul.md)
Multi-runtime        □      □   □     □            ■ (local/Docker/Workers)
Billing              □      □   □     □            ■ (public repos)
Skill injection      □      □   □     □            ■ (skill cartridges)
Config personality   □      □   □     □            ■ (version-controlled)
```

---

## Section 4: Specific Technical Decisions

### 4.1 Edit Strategy

| Agent | Approach | Code |
|-------|----------|------|
| Aider | 7 format strategies with fallback cascade | `editblock_coder.py` — SEARCH/REPLACE → whitespace-flexible → dot-dot-dot |
| Pi | 3 modes + AST, fuzzy Levenshtein (0.95→0.80) | `patch/fuzzy.ts` — Levenshtein distance with progressive threshold |
| Kimi | Exact string replace, no fuzzy fallback | `tools/file/replace.py` — StrReplace with batch + replace_all |
| Claude Code | Exact string match (must be unique in file) | Edit tool — old_string must be unique |

**Cocapn decision**: Adopt Pi's multi-mode approach with Aider's fallback cascade.

```typescript
// Cocapn edit strategy cascade (proposed)
interface EditStrategy {
  mode: 'replace' | 'patch' | 'hashline' | 'ast';
  fallback: EditStrategy[];
}

// Priority: hashline (safest) → replace (fuzzy) → patch (anchored) → ast (structural)
// Why: Hashline gives staleness detection. Replace with fuzzy matching handles
// most cases. Patch for large edits. AST for structural refactors.
```

### 4.2 Context Management

| Agent | Approach |
|-------|----------|
| Aider | PageRank repo map (tree-sitter tags) + chat summarization (background thread) |
| Pi | Structured compaction preserving file operations as XML tags |
| Kimi | JSONL with checkpoints, LLM compaction, D-Mail revert |
| Claude Code | Auto-compact conversation history |

**Cocapn decision**: Aider's PageRank repo map + Kimi's checkpoint system + brain memory.

```typescript
// Cocapn context assembly (proposed)
interface ContextAssembly {
  // From Aider: repo map with PageRank
  repoMap: {
    graph: MultiDiGraph;     // def/ref graph
    pagerank: Map<string, number>;  // personalized ranking
    tokenBudget: number;
  };

  // From Kimi: checkpoints with revert
  checkpoints: {
    id: string;
    context: ContextEntry[];
    timestamp: Date;
  };

  // Cocapn unique: brain memory
  brain: {
    soul: string;            // version-controlled personality
    facts: Map<string, any>; // flat KV
    wiki: Page[];            // structured knowledge
    procedures: Workflow[];  // learned patterns
    repoUnderstanding: {     // from RepoLearner
      architecture: DecisionLog;
      patterns: CodePattern[];
      moduleMap: ModuleBoundary[];
    };
  };
}

// Why: Repo map gives intelligent file selection (proven by Aider).
// Checkpoints enable time-travel debugging (proven by Kimi).
// Brain memory gives persistent knowledge (unique to Cocapn).
```

### 4.3 Multi-Model Strategy

| Agent | Approach |
|-------|----------|
| Aider | 3 tiers: main (chat), weak (commits/summary), editor (architect edits) |
| Pi | 5 roles: default, smol, slow, plan, commit |
| Kimi | Single model via Kosong abstraction |
| Claude Code | Single model per session |

**Cocapn decision**: Aider's 3-tier approach extended with Pi's role system.

```typescript
// Cocapn model roles (proposed)
type ModelRole = 'main' | 'weak' | 'editor' | 'explore' | 'commit';

interface ModelRouting {
  main: Provider;    // Primary conversation (GPT-4, Claude, etc.)
  weak: Provider;    // Commit messages, summarization (cheaper model)
  editor: Provider;  // Architect-mode edits (fast model)
  explore: Provider; // Codebase exploration (high-context model)
  commit: Provider;  // Git commit messages (cheapest capable model)
}

// Why: Aider proves this works — weak model saves significant cost on
// commit messages and summarization. Editor model enables architect pattern.
```

### 4.4 Subagent Coordination

| Agent | Approach |
|-------|----------|
| Aider | None |
| Pi | Task tool with 6 bundled agents, worktree isolation |
| Kimi | LaborMarket with typed subagents, tool allowlists |
| Claude Code | Agent tool with worktree isolation |

**Cocapn decision**: Kimi's LaborMarket pattern — most formalized and safe.

```typescript
// Cocapn LaborMarket (proposed, building on existing agents/registry.ts)
interface AgentTypeDefinition {
  name: string;              // 'coder' | 'explore' | 'plan' | 'review'
  systemPrompt: string;
  allowedTools: string[];    // strict allowlist
  deniedTools: string[];     // explicit denylist
  canSpawnAgents: boolean;   // false for all subagents
  canAskUser: boolean;       // false for all subagents
  maxTurns: number;
  timeout: number;           // seconds
  gitContext: boolean;       // auto-inject branch/dirty/commits
}

// Built-in agent types:
// coder:  full tools, no Agent/AskUser, returns summary
// explore: read-only + git context, no write tools
// plan:   read-only, no shell, architecture output
// review: read-only, code review with checklist
```

### 4.5 Lint/Test Auto-Fix

| Agent | Approach |
|-------|----------|
| Aider | tree-sitter lint + flake8, auto-test, 3-reflection loop |
| Pi | LSP diagnostics-on-write (format + errors per edit) |
| Kimi | None built-in |
| Claude Code | None built-in |

**Cocapn decision**: Aider's reflection loop + Pi's LSP writethrough via MCP.

```typescript
// Cocapn auto-fix loop (proposed)
async function editWithAutoFix(file: string, edits: Edit[]): Promise<void> {
  // 1. Apply edits
  await applyEdits(file, edits);

  // 2. LSP diagnostics via MCP (Pi pattern)
  const diagnostics = await mcp.call('lsp/diagnostics', { file });
  if (diagnostics.errors.length > 0) {
    // 3. Feed errors back to LLM (Aider pattern)
    const fixes = await llm.complete(fixPrompt(diagnostics));
    await applyEdits(file, fixes);
  }

  // 4. Run tests if configured
  if (config.autoTest) {
    const result = await shell.run(config.testCommand);
    if (result.exitCode !== 0) {
      const testFixes = await llm.complete(fixTestPrompt(result));
      await applyEdits(file, testFixes);
    }
  }
}

// Max reflections: 3 (Aider's proven limit)
```

---

## Section 5: Missing Capabilities to Build

### Priority 1 — Core Competitiveness

- [ ] **Tree-sitter for AST-aware edits** — Pi proves this matters. Structural refactors are more reliable than text replacement. Build as MCP tool server.
  - Implementation: ast-grep as MCP server, similar to Pi's `crates/pi-natives/src/ast.rs`
  - Supports: rename, extract function, modernize syntax, pattern-based refactors

- [ ] **Repo map generation** — Aider's PageRank approach is proven. Intelligence layer needs this.
  - Implementation: tree-sitter queries for 20+ languages, NetworkX PageRank, token-budgeted output
  - Integration: RepoLearner populates `repo-understanding/` on startup and each commit

- [ ] **Cost tracking dashboard** — Aider tracks per-message + cumulative. Users need this.
  - Implementation: Token counting per LLM call, pricing from model metadata, session + cumulative totals
  - Display: CLI output + web dashboard in UI

- [ ] **Multi-file edit coordination** — All agents do batch edits. We need atomic multi-file edits.
  - Implementation: Edit transaction system — all edits succeed or all rollback
  - Integration: Git-based (commit all or revert all)

### Priority 2 — Developer Experience

- [ ] **Test running + auto-fix loop** — Aider's reflection loop (max 3 iterations)
  - Implementation: Configurable test command, error parsing, LLM fix generation
  - Pattern: run test → parse errors → feed to LLM → apply fixes → re-run (max 3)

- [ ] **Git branch management** — Create, compare, merge from agent
  - Implementation: Branch CRUD, diff visualization, merge with conflict resolution
  - Pattern: agent suggests branches for experiments, auto-cleanup

- [ ] **Background optimization branches** — Agent works while human codes
  - Implementation: Git worktree per background task, merge when complete
  - Pattern: "Optimize X while I work on Y" — agent creates branch, human reviews later

- [ ] **IDE integration (VS Code, Neovim)** — Kimi and Pi both have this
  - Implementation: LSP protocol bridge, MCP server for IDE tools
  - Pattern: Agent as language server — IDE sends context, agent responds with suggestions

### Priority 3 — Intelligence

- [ ] **TTSR-like stream rules** — Pi's zero-cost rule injection
  - Implementation: Rule engine watches LLM output stream, aborts + retries on pattern match
  - Pattern: "Never use deprecated API X" → watches output → catches violation → retries

- [ ] **D-Mail time-travel** — Kimi's checkpoint revert with future knowledge
  - Implementation: Git stash + brain memory checkpoint, inject future knowledge on revert
  - Pattern: Agent tries approach → discovers issue → rewinds + retries with foreknowledge

- [ ] **Hashline staleness detection** — Pi's LINE#ID system
  - Implementation: xxHash32 on normalized line content, 2-char prefix on read output
  - Pattern: Edit references LINE#ID, caught if file changed since last read

- [ ] **LSP writethrough** — Pi's format-on-write + diagnostics-on-write
  - Implementation: MCP tool server wrapping LSP client, auto-format after edits
  - Pattern: Every edit goes through LSP → format → diagnostics → fix loop

---

## Section 6: Multi-Agent Deployment Architecture

### 6.1 Deployment Topology

```
                        ┌─────────────────────┐
                        │   Cloudflare Workers │
                        │   (Cloud Bridge)     │
                        │                      │
                        │  AdmiralDO (Durable  │
                        │  Object) — fleet     │
                        │  registry, heart-    │
                        │  beats, messages     │
                        └──────┬──────┬───────┘
                               │      │
                    ┌──────────┘      └──────────┐
                    │                            │
          ┌─────────▼─────────┐        ┌────────▼────────┐
          │  Oracle Instance   │        │  Cloud APIs      │
          │  (Home Office)     │        │  (Redacted       │
          │                    │        │   complex prompts)│
          │  ┌──────────────┐  │        └─────────────────┘
          │  │ Mac Studio   │  │
          │  │ TTS Hub for  │  │
          │  │ team         │  │
          │  └──────────────┘  │
          │                    │
          │  ┌──────────────┐  │
          │  │ Brain repo   │◄──┼── A2A protocol
          │  │ (private)    │  │   (fleet coordination)
          │  └──────────────┘  │
          └─────────┬──────────┘
                    │ LAN / VPN
          ┌─────────▼─────────┐
          │  Office Workstation│
          │  (LAN to robot)    │
          │                    │
          │  ┌──────────────┐  │
          │  │ Dev env      │  │──── WebSocket ──── Local Bridge
          │  │ (VS Code)    │  │
          │  └──────────────┘  │
          └─────────┬──────────┘
                    │ LAN / WiFi / Satellite
       ┌────────────┼─────────────┐
       │            │             │
┌──────▼──────┐ ┌──▼──────────┐ ┌▼──────────────┐
│  Jetson on   │ │ Raspberry Pi│ │ iPad          │
│  vessel/     │ │ Edge Agent  │ │ Custom UI     │
│  robot       │ │             │ │               │
│              │ │ ┌─────────┐ │ │ ┌───────────┐ │
│ ┌──────────┐ │ │ │ Local    │ │ │ │ STT/TTS   │ │
│ │ Air-gapped│ │ │ │ model   │ │ │ │ ElevenLabs│ │
│ │ LAN       │ │ │ │ Ollama  │ │ │ │ Grok      │ │
│ │           │ │ │ └─────────┘ │ │ └───────────┘ │
│ │ ┌───────┐ │ │ └─────────────┘ │               │
│ │ │Local  │ │ │                 │ │ WebSocket to  │
│ │ │model  │ │ │                 │ │ any bridge    │
│ │ │dist.  │ │ │                 │ └───────────────┘
│ │ └───────┘ │ │
└─────────────┘ └─┘
```

### 6.2 Data Flow Between Agents

```
EVENT FLOW:
━━━━━━━━━━━

1. Human speaks to iPad (STT)
   → ElevenLabs/Grok transcribes
   → WebSocket to Oracle Bridge
   → Bridge loads soul.md + brain + context
   → LLM processes (local model if air-gapped, cloud API if connected)
   → Response streams to iPad (TTS via Mac Studio)

2. Vessel sensor triggers event
   → Jetson agent detects anomaly
   → Local model processes (air-gapped Ollama)
   → If critical: satellite uplink → Oracle → human notification
   → If routine: logged in brain, batch sync when connected

3. Code change on Oracle
   → Git commit → push to private repo
   → A2A message to fleet: "updated procedure X"
   → Each agent pulls on next heartbeat
   → Brain memory updated across fleet

4. Background optimization
   → Human: "optimize the trawl detection algorithm"
   → Oracle agent creates branch in worktree
   → Runs benchmarks, iterates
   → Sends notification: "Branch ready for review"
   → Human reviews on iPad, merges or requests changes

5. Cross-agent learning
   → Jetson learns: "current pattern X works better in shallow water"
   → Stores as fact in brain
   → A2A shares with Oracle
   → Oracle updates wiki with fishing procedure
   → All fleet agents now aware
```

### 6.3 Permission Model per Tier

```
TIER PERMISSIONS:
━━━━━━━━━━━━━━━━

Oracle (Full Trust):
  ✓ Full filesystem access
  ✓ Git operations (commit, push, pull)
  ✓ LLM API access (cloud)
  ✓ Shell execution
  ✓ Fleet management (A2A)
  ✓ MCP tool servers
  ✓ Brain full access (all five stores)
  ✓ Background optimization branches

Office Workstation (Full Trust, LAN):
  ✓ Full filesystem access
  ✓ Git operations
  ✓ LLM API access (cloud)
  ✓ Shell execution
  ✓ MCP tool servers
  ✗ Fleet management (read-only)
  ✓ Brain full access

Jetson / Edge Agent (Restricted):
  ✓ Read-only filesystem (configurable paths)
  ✓ Git pull (no push)
  ✓ Local LLM only (Ollama/llama.cpp)
  ✓ Shell execution (whitelisted commands)
  ✗ MCP tool servers
  ✓ Brain subset (facts + procedures, no private.*)
  ✗ Background branches

Raspberry Pi (Minimal):
  ✓ Read-only filesystem (specific directories)
  ✗ Git operations
  ✓ Local LLM only
  ✓ Shell execution (whitelisted)
  ✗ MCP tool servers
  ✓ Brain subset (facts only, no private.*)

iPad / Mobile Client (User):
  ✗ Filesystem access
  ✗ Git operations
  ✓ Cloud LLM (via Cloud Bridge)
  ✗ Shell execution
  ✗ MCP tool servers
  ✓ Brain subset (public facts + wiki)

Cloudflare Workers (Public):
  ✗ Filesystem access
  ✗ Git operations
  ✓ Cloud LLM
  ✗ Shell execution
  ✓ MCP tool servers (registered only)
  ✓ Brain subset (public facts only, publishing layer strips private.*)
```

### 6.4 Connection Matrix

```
CONNECTION PROTOCOLS:
━━━━━━━━━━━━━━━━━━━━

Oracle ←→ Cloudflare:     HTTPS + WebSocket (fleet API)
Oracle ←→ Workstation:    WebSocket (LAN) + Git (SSH)
Oracle ←→ Jetson:         A2A (satellite/LAN) + Git (when connected)
Oracle ←→ iPad:           WebSocket (via Cloud Bridge or direct)
Oracle ←→ RPi:            A2A (LAN) + HTTP API
Jetson ←→ RPi:            A2A (LAN)
Jetson ←→ Cloud APIs:     HTTPS (when satellite available)
RPi ←→ Cloud:             None (air-gapped or via Jetson)

HEARTBEAT INTERVALS:
  Oracle → Cloudflare:    60 seconds
  Oracle → Fleet:         30 seconds (LAN), 300 seconds (satellite)
  Jetson → Oracle:        60 seconds (LAN), on-connect (satellite)
  RPi → Jetson:           10 seconds (LAN)
  iPad → Cloud:           On-demand (WebSocket)
```

---

## Section 7: The Autopilot Pattern

### 7.1 Branches as Configurations

In commercial fishing, the vessel operates in distinct modes. The agent mirrors this with git branches:

```
BRANCH MODES:
━━━━━━━━━━━━

main                    # Stable — always deployable
├── running/            # Running mode — vessel in transit
│   ├── navigation/     #   Route optimization
│   └── weather/        #   Weather monitoring
├── trawling/           # Trawling mode — active fishing
│   ├── detection/      #   Fish detection algorithm
│   ├── catch-log/      #   Catch logging
│   └── equipment/      #   Equipment monitoring
├── longline/           # Longline mode
│   ├── deployment/     #   Line deployment algorithm
│   ├── soak-monitor/   #   Soak time monitoring
│   └── retrieval/      #   Retrieval optimization
├── maintenance/        # Maintenance mode
│   ├── diagnostics/    #   System diagnostics
│   └── inventory/      #   Parts inventory
└── experiment/         # Background experiments
    ├── algo-v2/        #   New detection algorithm
    └── model-compare/  #   Compare LLM models
```

### 7.2 Mode Switching Triggers

```typescript
// Autopilot mode configuration
interface VesselMode {
  name: string;
  branch: string;
  triggers: {
    auto: TriggerCondition[];   // Automatic mode switches
    confirm: TriggerCondition[]; // Captain confirmation required
  };
  agentBehavior: {
    contextPriority: string[];  // What the agent focuses on
    autoActions: string[];      // What the agent does automatically
    alertThresholds: Map<string, number>;
  };
}

// Example: trawling mode
const trawlingMode: VesselMode = {
  name: 'trawling',
  branch: 'trawling',
  triggers: {
    auto: [
      { sensor: 'sonar', condition: 'fish_density > threshold', action: 'switch_to_trawling' },
      { sensor: 'gps', condition: 'within_fishing_ground', action: 'enable_detection' },
    ],
    confirm: [
      { sensor: 'fuel', condition: 'fuel < 20%', action: 'suggest_return' },
      { sensor: 'weather', condition: 'storm_warning', action: 'suggest_safe_harbor' },
    ]
  },
  agentBehavior: {
    contextPriority: ['catch-rates', 'equipment-status', 'weather-window'],
    autoActions: ['log-catch', 'monitor-equipment', 'track-bycatch'],
    alertThresholds: new Map([
      ['equipment-stress', 0.8],
      ['bycatch-ratio', 0.15],
      ['fuel-consumption', 1.2],
    ])
  }
};
```

### 7.3 Captain's Confirmation Procedures

```
CONFIRMATION HIERARCHY:
━━━━━━━━━━━━━━━━━━━━━━

Level 0 — Autonomous (no confirmation):
  • Log catch entries
  • Monitor equipment sensors
  • Update weather data
  • Sync brain memory across fleet

Level 1 — Notify (inform, don't wait):
  • Mode switch triggered by sensor
  • Background optimization complete
  • New learning added to procedures
  • Fleet agent status change

Level 2 — Confirm (wait for approval):
  • Branch merge (experiment → main)
  • New procedure adoption
  • Equipment override
  • Route deviation > 10%

Level 3 — Require explicit action:
  • Return to port decision
  • Emergency procedures
  • Fleet-wide configuration change
  • Soul.md modification (personality change)

PROCEDURE:
  1. Agent determines action level
  2. Level 0: execute immediately, log
  3. Level 1: send notification, execute after 30s unless cancelled
  4. Level 2: send request, wait for "confirmed" or "denied"
  5. Level 3: send request with full context, wait for explicit approval
  6. All decisions logged in brain with rationale
```

### 7.4 Learning from Feedback

```typescript
// Feedback learning cycle
interface FeedbackCycle {
  // Agent takes action
  action: {
    type: string;
    context: string;
    decision: string;
    rationale: string;
  };

  // Captain responds
  feedback: {
    approved: boolean;
    correction?: string;      // What should have been done
    severity: 'hint' | 'correction' | 'critical';
  };

  // Brain stores as procedure
  learning: {
    store: 'procedures';     // procedures.json
    pattern: string;         // "When X, do Y instead of Z"
    confidence: number;      // 0.8 for corrections, 1.0 for critical
    source: 'captain';       // explicit learning
    decay: 'never';          // captain corrections never decay
  };
}

// Example learning cycle:
// 1. Agent suggests: "Trawl heading 270° based on sonar"
// 2. Captain corrects: "No, 250° — there's a reef at 270°"
// 3. Agent learns:
//    - procedure: "When near coordinates X,Y avoid heading 270° due to reef"
//    - fact: "reef at coordinates X,Y"
//    - confidence: 1.0 (captain source, never decays)
// 4. Future: agent auto-avoids reef, logs rationale
```

### 7.5 Mode Change Logging

```
MODE CHANGE LOG FORMAT:
━━━━━━━━━━━━━━━━━━━━━━

{
  "timestamp": "2026-03-31T14:30:00Z",
  "from_mode": "running",
  "to_mode": "trawling",
  "trigger": {
    "type": "auto",
    "sensor": "sonar",
    "condition": "fish_density > 0.7",
    "value": 0.82
  },
  "confirmation": {
    "level": 1,
    "method": "notify",
    "captain_response": null  // no response needed
  },
  "context": {
    "location": "58.4°N 11.2°E",
    "weather": "partly_cloudy",
    "fuel": "72%",
    "catch_today": "2.4 tonnes herring"
  },
  "agent_state": {
    "brain_facts_used": 47,
    "procedures_active": 12,
    "branch": "trawling",
    "model": "deepseek-v3"
  }
}
```

---

## Appendix A: Data Structures Reference

### Aider Tag Structure
```python
Tag = namedtuple("Tag", "rel_fname fname line name kind")
# rel_fname: relative file path
# fname: absolute file path
# line: line number
# name: identifier name
# kind: "def" or "ref"
```

### Pi Hashline Format
```typescript
// Read output format:
// LINE#ZP  const x = 42;
// LINE#MQ  function hello() {
// LINE#VR    return x + 1;
// LINE#NK  }

// Hash function:
// hash = xxHash32(normalize(line), seed=lineNumber) % alphabet.length
// alphabet = "ZPMQVRWSNKTXJBYH"
// Result: 2-char prefix
```

### Kimi Subagent Lifecycle
```
idle → running_foreground → completed
                       \──→ failed
                       \──→ killed
     → running_background → completed
                          \──→ failed
                          \──→ killed
```

### Cocapn Brain Memory
```typescript
interface BrainStore {
  facts: Record<string, any>;           // Flat KV, last-write-wins
  memories: Memory[];                   // Typed with confidence decay
  procedures: Procedure[];              // Step-by-step workflows
  relationships: Relationship[];        // Entity-relation graph
  repoUnderstanding: {
    architecture: DecisionLog[];        // Decision rationale
    fileHistory: FileContext[];         // Per-file history
    patterns: CodePattern[];            // Detected patterns
    moduleMap: ModuleBoundary[];        // Module boundaries
  };
}

// Confidence decay
type ConfidenceLevel =
  | 1.0  // Explicit — never decays
  | 0.9  // Preference
  | 0.8  // Error pattern
  | 0.7  // Implicit
  | 0.6; // Git-derived
```

---

## Appendix B: Speed Benchmarks (from agent repos)

| Operation | Aider | Pi | Kimi | Claude Code |
|-----------|-------|----|------|-------------|
| Cold start | ~3s (Python + litellm import) | ~1s (Bun) | ~2s (Python) | ~2s (Node.js) |
| Edit parse | Regex-based, fast | Levenshtein fuzzy, slower | Exact match, fast | Exact match, fast |
| Repo map build | 5-30s (tree-sitter + PageRank) | N/A | N/A | N/A |
| Context compaction | Background thread | Structured XML | LLM call | Auto-compact |
| Git commit | Weak model (fast) | Agentic (slow) | N/A | Direct commit |

---

## Appendix C: Key Repositories

| Agent | Repository | Stars | Language |
|-------|-----------|-------|----------|
| Aider | paul-gauthier/aider | 30k+ | Python |
| Pi | can1357/oh-my-pi | 2.5k | TypeScript + Rust |
| Kimi CLI | MoonshotAI/kimi-cli | 7.5k | Python |
| Claude Code | (proprietary) | N/A | TypeScript |

---

*End of CODING-AGENT-SYNTHESIS.md. This document is the foundation for Cocapn's agent intelligence layer.*
*Next steps: Implement Priority 1 missing capabilities. Start with tree-sitter repo map (highest ROI).*
