# Cocapn Seed — Architecture

> How the self-aware repository works, from user message to persistent memory.

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           USER                                          │
│                     (terminal or browser)                               │
└───────────┬────────────────────────────────┬────────────────────────────┘
            │                                │
            ▼                                ▼
   ┌────────────────┐              ┌────────────────────┐
   │  Terminal REPL  │              │   Web Server (HTTP) │
   │   (chat.ts)     │              │     (web.ts)        │
   │                 │              │                     │
   │  /help          │              │  GET  /             │
   │  /whoami        │              │  GET  /api/status   │
   │  /memory list   │              │  GET  /api/whoami   │
   │  /git log       │              │  POST /api/chat     │
   │  /quit          │              │  ...                │
   └────────┬────────┘              └────────┬───────────┘
            │                                │
            │     user message + context      │
            ▼                                ▼
   ┌─────────────────────────────────────────────────────┐
   │                   CONTEXT BUILDER                     │
   │                   (context.ts)                        │
   │                                                       │
   │  Priority budget (~24K chars / ~4K tokens):           │
   │   1. soul.md personality           (always)           │
   │   2. Git awareness narrative       (always)           │
   │   3. Reflection summary            (if available)     │
   │   4. Relevant facts (keyword)      (match user msg)   │
   │   5. Recent 5 messages             (always)           │
   │   6. Older messages                (fill remainder)   │
   └──────────────────────┬──────────────────────────────┘
                          │
                          ▼
   ┌─────────────────────────────────────────────────────┐
   │                   LLM PROVIDER                        │
   │                    (llm.ts)                           │
   │                                                       │
   │  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
   │  │ DeepSeek │  │  OpenAI  │  │  Ollama  │  Custom    │
   │  │(default) │  │          │  │ (local)  │            │
   │  └──────────┘  └──────────┘  └──────────┘            │
   │                                                       │
   │  Streaming SSE · Retry · Timeout · Auto-detect Ollama │
   └──────────────────────┬──────────────────────────────┘
                          │
                          ▼
   ┌─────────────────────────────────────────────────────┐
   │                  POST-PROCESSING                      │
   │                                                       │
   │  ┌──────────────┐  ┌───────────┐  ┌──────────────┐   │
   │  │  EXTRACT     │  │  REFLECT  │  │  SUMMARIZE   │   │
   │  │ (extract.ts) │  │(reflect.ts)│  │(summarize.ts)│   │
   │  │              │  │           │  │              │   │
   │  │ facts        │  │ patterns  │  │ at 20+ msgs  │   │
   │  │ decisions    │  │ topics    │  │ compacts to  │   │
   │  │ questions    │  │ self-model│  │ last 5 msgs  │   │
   │  │ tone         │  │           │  │              │   │
   │  └──────┬───────┘  └─────┬─────┘  └──────┬───────┘   │
   └─────────┼────────────────┼────────────────┼───────────┘
             │                │                │
             ▼                ▼                ▼
   ┌─────────────────────────────────────────────────────┐
   │                    MEMORY                             │
   │                  (memory.ts)                          │
   │                                                       │
   │  Hot tier: .cocapn/memory.json                        │
   │  ├── messages[]   (last 100, auto-trim)               │
   │  └── facts{}      (flat KV, persisted)                │
   │                                                       │
   │  Cold tier: git log                                   │
   │  └── searchable via git log --grep                    │
   └──────────────────────────────────────────────────────┘


   ┌─────────────────────────────────────────────────────┐
   │                  SELF-AWARENESS                       │
   │                                                       │
   │  ┌──────────────┐  ┌───────────────────────────┐     │
   │  │   AWARENESS  │  │         GIT MODULE         │     │
   │  │(awareness.ts)│  │         (git.ts)           │     │
   │  │              │  │                            │     │
   │  │ perceives:   │  │ perceive() → GitSelf       │     │
   │  │  - name      │  │ narrate()  → first-person  │     │
   │  │  - born      │  │ log()      → commits       │     │
   │  │  - files     │  │ stats()    → counts        │     │
   │  │  - languages │  │ diff()     → changes       │     │
   │  │  - feeling   │  │                            │     │
   │  │              │  │ Sources: git CLI, pkg.json  │     │
   │  │ narrates:    │  │                            │     │
   │  │  "I am X,    │  │                            │     │
   │  │   born Y,    │  │                            │     │
   │  │   I feel Z"  │  │                            │     │
   │  └──────────────┘  └───────────────────────────┘     │
   └─────────────────────────────────────────────────────┘


   ┌─────────────────────────────────────────────────────┐
   │                     SOUL                              │
   │                   (soul.ts)                           │
   │                                                       │
   │  soul.md ──parse──▶ { name, tone, model, body }      │
   │                                                       │
   │  YAML frontmatter:                                    │
   │    name: AgentName                                    │
   │    tone: neutral                                      │
   │    model: deepseek                                    │
   │                                                       │
   │  Body: freeform personality prompt (Markdown)         │
   └─────────────────────────────────────────────────────┘
```

---

## Data Flow

The complete lifecycle of a single chat interaction:

```
User types: "My name is Alice and I like TypeScript"
                    │
                    ▼
        ┌─────────────────────┐
        │  1. RECEIVE INPUT   │  terminalChat() or POST /api/chat
        └─────────┬───────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │  2. BUILD CONTEXT   │  context.ts :: buildContext()
        │                     │
        │  Combines:          │
        │  - soul personality │
        │  - git awareness    │
        │  - relevant facts   │
        │  - recent messages  │
        │  - reflection       │
        │                     │
        │  Budget: ~24K chars │
        └─────────┬───────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │  3. CALL LLM        │  llm.ts :: chatStream()
        │                     │
        │  POST /v1/chat/     │  Streaming SSE to user
        │  completions        │  Token by token
        └─────────┬───────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │  4. SAVE MESSAGE    │  memory.ts :: addMessage()
        │                     │
        │  .cocapn/memory.json│  User msg + assistant response
        │  auto-trim to 100   │
        └─────────┬───────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │  5. EXTRACT FACTS   │  extract.ts :: extract()
        │                     │
        │  "my name is Alice" │
        │    → user.name=Alice│
        │  "I like TypeScript"│
        │    → user.likes.typ │
        │                     │
        │  Auto-saved to      │
        │  memory.facts{}     │
        └─────────┬───────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │  6. MAYBE REFLECT   │  reflect.ts :: shouldReflect()
        │                     │
        │  After 30 min idle  │  or 2+ messages since
        │  or no prior refl.  │  last reflection
        │                     │
        │  Saves patterns &   │
        │  summary to facts   │
        └─────────┬───────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │  7. MAYBE SUMMARIZE │  summarize.ts :: shouldSummarize()
        │                     │
        │  At 20+ messages:   │  Extracts topics, decisions,
        │  compact to last 5  │  unanswered questions
        │  save summary fact  │
        └─────────────────────┘
```

---

## Module Descriptions

### soul.ts — Personality Engine

Parses `soul.md` (YAML frontmatter + Markdown body) into a structured `Soul` object with name, tone, model preference, and personality body. Converts this into system prompts — either a basic prompt (`soulToSystemPrompt`) or a full enhanced prompt (`buildFullSystemPrompt`) that layers in git awareness, learned facts, and recent reflections. The soul is the agent's identity: edit the file, change who the agent is.

### memory.ts — Two-Tier Memory

Manages persistent memory in `.cocapn/memory.json`. The hot tier stores recent messages (up to 100, auto-trimmed) and learned facts (flat key-value). The cold tier searches git history via `git log --grep`. Memory persists across sessions — quit the chat, come back tomorrow, your agent remembers. Search spans both tiers simultaneously with keyword matching.

### awareness.ts — Self-Perception

Makes the repo self-aware by reading its own `package.json`, git history, file tree, and working directory status. Produces a `SelfDescription` (structured data) and a first-person narrative: "I am myproject, born 3 months ago. I have 47 files. I speak TypeScript. I feel restless — 3 uncommitted changes." This narrative is injected into every system prompt so the LLM knows what and who it is.

### git.ts — Git Awareness

Low-level git operations: `perceive()` returns structured stats (birth date, commit count, file count, lines, authors, pulse), `narrate()` renders first-person, `log()` lists commits, `stats()` counts files/lines/languages, `diff()` shows uncommitted changes. All functions call the `git` CLI via `child_process.execSync` with 5-second timeouts. The git module is the agent's autobiographical memory.

### context.ts — Smart Context Builder

Assembles the system prompt within a token budget (~24K chars / ~4K tokens). Priority order: soul personality and git awareness always included; relevant facts matched by keyword against the user message; last 5 messages always included; older messages fill remaining space. This ensures the most useful context reaches the LLM without exceeding limits.

### llm.ts — Multi-Provider LLM Client

OpenAI-compatible chat completions supporting DeepSeek (default), OpenAI, Ollama (local), and custom endpoints. Supports both blocking (`chat()`) and streaming (`chatStream()`) responses. Auto-detects locally running Ollama instances as a fallback when no API key is configured. Handles timeouts (default 30s), retries (1 attempt), and SSE stream parsing.

### extract.ts — Learning Engine

Extracts structured knowledge from user messages using regex patterns: names (`user.name`), locations (`user.location`), preferences (`user.likes.*`, `user.preference`), tools (`user.tool`). Also detects decisions ("let's X", "we should X"), questions, and emotional tone (positive/negative/neutral). Extracted facts are auto-saved to memory — the agent learns from every conversation.

### reflect.ts — Self-Reflection

Periodically generates a reflection summarizing what the agent has learned: fact count, message count, frequent topics (word frequency analysis), and interaction patterns (active conversation, accumulating knowledge, curious interlocutor). Triggers after 30 minutes of idle time or when there are 2+ messages since the last reflection. Saves the reflection to memory for future context.

### summarize.ts — Conversation Summarization

When conversations exceed 20 messages, summarizes the session: extracts key topics, detects decisions made, identifies unanswered questions, and counts facts learned. Compacts memory to the last 5 messages, storing the summary as a fact (`_lastSummary`). This prevents context overflow while preserving the essence of long conversations.

### web.ts — HTTP Server

Minimal HTTP server with a chat UI and REST API. Serves the web interface from `public/index.html`, exposes agent state (`/api/status`, `/api/whoami`), memory operations (`/api/memory`, `/api/memory/search`), git data (`/api/git/log`, `/api/git/stats`, `/api/git/diff`), and a streaming SSE chat endpoint (`/api/chat`). CORS-enabled for local development. Zero dependencies beyond Node.js built-ins.

### chat.ts — Terminal Chat

Simple readline-based terminal interface for chatting with the agent. Supports streaming output and basic commands (`/quit`, `/whoami`). This is the lightweight chat module used when the full CLI isn't needed.

### index.ts — CLI Entry Point

The main entry point that ties everything together. Parses CLI arguments (`--web`, `--port`, `whoami`, `help`), loads config from `cocapn.json`, resolves API keys (config → env → `~/.cocapn/secrets.json` → Ollama auto-detect), initializes all modules, and launches either the terminal REPL or web server. Also handles in-chat commands like `/memory`, `/git`, `/export`, and `/import`.

### config.ts — Configuration Schema

Validates `cocapn.json` against a schema: mode must be "private" or "public", port must be 1-65535, LLM config must have valid types. Applies defaults (mode: "private", port: 3100, provider: "deepseek"). Supports both the nested `llm` object and legacy flat fields for backward compatibility.

---

## File Structure

```
packages/seed/
├── src/
│   ├── index.ts        CLI entry — argument parsing, module wiring, REPL
│   ├── config.ts       Schema validation and defaults for cocapn.json
│   ├── soul.ts         Parse soul.md → Soul object → system prompts
│   ├── memory.ts       Two-tier memory: JSON hot + git cold
│   ├── awareness.ts    Self-perception from git + package.json + file tree
│   ├── git.ts          Low-level git operations (perceive, narrate, log, stats, diff)
│   ├── context.ts      Budget-aware context builder for LLM prompts
│   ├── llm.ts          Multi-provider LLM client with streaming
│   ├── extract.ts      Learn facts, decisions, questions from messages
│   ├── reflect.ts      Periodic self-reflection and pattern detection
│   ├── summarize.ts    Conversation summarization and memory compaction
│   ├── web.ts          HTTP server with REST API and SSE chat
│   └── chat.ts         Simple terminal readline chat interface
├── public/
│   └── index.html      Web chat UI
├── template/
│   ├── soul.md         Default personality template
│   ├── cocapn.json     Default config template
│   └── README.md       Default repo README
├── tests/
│   └── seed.test.ts    Comprehensive test suite
├── docs/
│   ├── ARCHITECTURE.md This file
│   ├── API.md          API reference for developers
│   ├── EXAMPLES.md     Usage examples
│   ├── SOUL-GUIDE.md   How to write soul.md files
│   └── PHILOSOPHY-BRIEF.md  The paradigm explained
└── package.json
```

---

## How First-Person Awareness Works

The agent speaks in first person ("I am", "I remember", "I feel") because it genuinely perceives itself that way. Here's the mechanism:

1. **Identity source**: `awareness.ts` reads `package.json` for name/description, git log for birth date and commit count, file tree for language detection, and `git status` for feelings.

2. **Narrative generation**: `awareness.narrate()` produces sentences like:
   ```
   I am myproject. My purpose: Build cool stuff. I was born 3 months ago, on 2024-01-15.
   I have 47 files in my body. I speak TypeScript, Python. I remember 152 commits.
   Right now I'm on the main branch. My creators: Alice, Bob.
   My last memory was 2 hours ago. I feel restless — 3 uncommitted changes.
   ```

3. **Injection**: This narrative is injected into every system prompt under `## Who I Am`, so the LLM adopts this identity for the entire conversation.

4. **Reinforcement**: The `soul.md` body typically includes rules like "I speak in first person because I AM this repo's perspective", reinforcing the behavior.

5. **Memory continuity**: Facts like `_lastReflection` carry forward self-knowledge across sessions.

---

## How Memory Persistence Works

```
.cocapn/memory.json
{
  "messages": [
    { "role": "user",      "content": "My name is Alice", "ts": "2024-03-15T10:00:00Z" },
    { "role": "assistant", "content": "Nice to meet you...", "ts": "2024-03-15T10:00:02Z" }
  ],
  "facts": {
    "user.name": "Alice",
    "user.location": "Portland",
    "_lastReflection": "I have 3 facts and 12 messages...",
    "_lastSummary": "15 messages exchanged | topics: rust, database"
  }
}
```

**Write path**: Every user message and assistant response is appended to `messages[]`. Extracted facts are written to `facts{}`. Both are persisted to disk immediately via `writeFileSync`.

**Read path**: On startup, `new Memory(repoDir)` loads the JSON file. If corrupted or missing, starts fresh with empty store.

**Compaction**: Messages auto-trim to 100. At 20+ messages, `summarize()` compacts to last 5 and saves a summary fact. This prevents unbounded growth.

**Cold tier**: Git history is searchable via `git log --grep`, providing long-term recall beyond what's in the JSON file. This is the agent's deep memory.

**Portability**: The JSON file is just a file — it can be committed to git, copied between machines, or version-controlled alongside the code.

---

## How Multi-LLM Support Works

```
cocapn.json                Resolution Order
─────────────              ────────────────
{                          1. config.llm.apiKey
  "llm": {                 2. config.apiKey (legacy)
    "provider": "openai",  3. DEEPSEEK_API_KEY env
    "model": "gpt-4o",     4. OPENAI_API_KEY env
    "apiKey": "sk-..."     5. ~/.cocapn/secrets.json
  }                        6. Auto-detect Ollama (local)
}                          7. Error: no key found
```

**Provider endpoints**:

| Provider  | Base URL                    | Default Model     |
|-----------|-----------------------------|-------------------|
| deepseek  | https://api.deepseek.com    | deepseek-chat     |
| openai    | https://api.openai.com      | gpt-4o-mini       |
| ollama    | http://localhost:11434      | llama3 (detected) |
| custom    | Any URL (set baseUrl)       | Any model         |

All providers use the same OpenAI-compatible `/v1/chat/completions` endpoint. The `LLM` class constructs the URL as `${baseUrl}/v1/chat/completions`, so any compatible server works.

**Ollama auto-detection**: If no API key is found, the seed pings `http://localhost:11434/api/tags` with a 2-second timeout. If Ollama is running, it uses the first available model.

**Streaming**: All providers support SSE streaming. The `chatStream()` generator yields `{type: 'content', text: '...'}` chunks in real time.

**Legacy compatibility**: Flat config fields (`apiKey`, `model`, `temperature`, `maxTokens`) at the top level are merged into the nested `llm` object. Both formats work.
