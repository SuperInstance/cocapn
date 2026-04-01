# IDE Integration Design — Cocapn as the Universal Code Intelligence Layer

> *"The repo doesn't need a plugin. The repo IS the intelligence. Plugins just open a window into it."*

---

## Table of Contents

1. [Claude Code Architecture Analysis](#1-claude-code-architecture-analysis)
2. [IDE Plugin Landscape](#2-ide-plugin-landscape)
3. [Cocapn VS Code Extension Design](#3-cocapn-vs-code-extension-design)
4. [Multi-IDE Integration](#4-multi-ide-integration)
5. [Synergy with Premium Coding Agents](#5-synergy-with-premium-coding-agents)
6. [Vibe Coding vs Hardcore Dev](#6-vibe-coding-vs-hardcore-dev)
7. [Architecture Diagrams](#7-architecture-diagrams)

---

## 1. Claude Code Architecture Analysis

### Source Audit

Claude Code ships as a single minified file (`cli.js`, ~16,750 lines). It is a Node.js CLI application that runs as a terminal-based agentic tool. The analysis below is derived from identifier extraction and known architecture patterns.

### Complete Tool Inventory

Claude Code exposes 22+ built-in tools organized by capability:

#### File System Tools
| Tool | Purpose | Pattern |
|------|---------|---------|
| `Read` | Read file contents (images, PDFs, notebooks) | Absolute path, line ranges, pagination |
| `Write` | Create new files atomically | Full content replacement |
| `Edit` | Modify existing files surgically | Exact string match + replacement |
| `Glob` | Fast file pattern matching | Glob syntax, sorted by mtime |
| `Grep` | Regex content search (ripgrep-powered) | Pattern + path + type filters |

#### Execution Tools
| Tool | Purpose | Pattern |
|------|---------|---------|
| `Bash` | Execute shell commands | Timeout, background, sandbox options |
| `Skill` | Invoke slash commands | Named skill + args |
| `Agent` | Spawn sub-agents for parallel work | Type: explore, plan, general |

#### Planning & Collaboration
| Tool | Purpose | Pattern |
|------|---------|---------|
| `EnterPlanMode` / `ExitPlanMode` | Structured planning sessions | Requires user approval |
| `AskUserQuestion` | Interactive user prompts | Multiple choice + free text |
| `TodoWrite` | Track progress on multi-step tasks | Status: pending/in_progress/completed |

#### Worktree & Isolation
| Tool | Purpose | Pattern |
|------|---------|---------|
| `EnterWorktree` / `ExitWorktree` | Isolated git worktree management | Keep or remove on exit |

#### Scheduling & Remote
| Tool | Purpose | Pattern |
|------|---------|---------|
| `CronCreate` / `CronDelete` / `CronList` | Time-based task scheduling | 5-field cron, session-only or durable |
| `RemoteTrigger` | Remote agent execution via API | CRUD + run actions |
| `TaskOutput` / `TaskStop` | Background task control | Task ID reference |

#### Knowledge & Memory
| Tool | Purpose | Pattern |
|------|---------|---------|
| `WebSearch` | Web search with current data | Domain filtering, source URLs |
| `NotebookEdit` | Jupyter notebook cell manipulation | Cell ID, insert/replace/delete |

#### MCP Integration
| Tool | Purpose | Pattern |
|------|---------|---------|
| `mcp__<server>__<tool>` | Dynamic MCP server tools | Schema-validated, auto-discovered |

### Agent Loop Internals

```
┌──────────────────────────────────────────────────┐
│                    AGENT LOOP                      │
│                                                    │
│  1. Receive user message                           │
│  2. Build context:                                 │
│     ├── System prompt (CLAUDE.md + tools)          │
│     ├── Tool definitions (JSON Schema)             │
│     ├── Conversation history (compressed)          │
│     └── Memory context (auto-loaded)               │
│  3. Call LLM API (streaming SSE)                   │
│  4. Process response:                              │
│     ├── text → display to user                     │
│     ├── tool_use → execute tool                    │
│     └── thinking → internal reasoning              │
│  5. Collect tool results                           │
│  6. Check permissions (allow/deny/prompt)          │
│  7. Append to history                              │
│  8. Repeat until stop_reason == "end_turn"         │
│  9. Compress history if approaching context limit  │
└──────────────────────────────────────────────────┘
```

**Stop reasons**: `end_turn` (normal), `max_tokens` (truncated), `tool_use` (needs execution), `stop_sequence` (custom trigger).

**Sub-agent spawning**: The `Agent` tool launches specialized subprocesses:
- `Explore`: Fast codebase search (Glob/Grep only, no edits)
- `Plan`: Architecture decisions (read-only analysis)
- `general-purpose`: Full tool access for autonomous tasks
- Each subagent gets its own context window; results are summarized back

### Permission System

Three-tier hierarchy (local overrides user overrides global):

```
Global:   ~/.claude/settings.json          # System-wide
User:     ~/.claude/settings.local.json    # User preferences
Project:  .claude/settings.json            # Repository-specific
Local:    .claude/settings.local.json      # Local overrides
```

Permission states per tool:
- **Allow**: Execute without prompting
- **Deny**: Block execution entirely
- **Confirm** (default): Prompt user before execution

Categories: file operations, command execution, network access, git operations, MCP connections.

The `--permission-prompt-tool` flag enables headless/CI automation by routing permission decisions to an external tool.

### Context Management Strategy

```
Token Budget (200k context window):
┌─────────────────────────────────────┐
│ System prompt + CLAUDE.md  (~5k)    │
├─────────────────────────────────────┤
│ Tool definitions           (~3k)    │
├─────────────────────────────────────┤
│ Conversation history       (dynamic)│
│  ↳ Auto-compressed at ~80%         │
├─────────────────────────────────────┤
│ Tool results               (dynamic)│
│  ↳ 10k warning, 25k hard limit     │
├─────────────────────────────────────┤
│ Completion budget          (~8k)    │
└─────────────────────────────────────┘
```

**Key optimizations**:
- **Prompt caching**: Static content (system prompt, tools) cached at API level. Cache writes cost 25% more but cache reads cost 90% less.
- **History compression**: Older messages automatically summarized when approaching context limits.
- **Tool output limits**: 10k token warning, 25k hard limit per tool response. Tunable via `MAX_MCP_OUTPUT_TOKENS`.
- **Session resume**: `-c` resumes last session; `-r <id>` resumes specific session with full history.

### MCP Integration Patterns

Claude Code supports MCP in three configurations:

| Scope | File | Purpose |
|-------|------|---------|
| Local | `~/.claude.json` | Per-project, not version-controlled |
| Project | `.mcp.json` | Version-controlled, shared with team |
| User | `~/.claude.json` | Cross-project personal config |

Transport types: `stdio` (local processes), `http` (Streamable HTTP, recommended), `sse` (legacy).

Tool naming: `mcp__<server_name>__<tool_name>`. Example: `mcp__4_5v_mcp__analyze_image`.

Claude Code can also **serve** as an MCP server via `claude mcp serve`, exposing its tools to other clients.

### Cost Tracking

```
Cost = (input_tokens × $3/M) + (output_tokens × $15/M)
Cached cost = (cache_read × $0.30/M) + (cache_write × $3.75/M)
```

- `/cost` command shows session totals
- Per-request token counting (input, output, cache_creation, cache_read)
- `--max-turns` caps total agentic loop iterations
- Output limits prevent runaway context growth

### Hook System

Hooks run shell commands in response to events:

```json
{
  "hooks": {
    "PreToolUse": [{ "command": "echo 'about to use ${tool}'" }],
    "PostToolUse": [{ "command": "git diff ${file_path}" }],
    "Notification": [{ "command": "notify-send 'Claude done'" }],
    "Stop": [{ "command": "echo 'session ended'" }]
  }
}
```

Hooks are configured in `.claude/settings.json` and execute in the system shell.

---

## 2. IDE Plugin Landscape

### Comparative Analysis

Four architectural approaches exist for AI coding assistants:

| Approach | Examples | Pros | Cons |
|----------|----------|------|------|
| **VS Code Extension** | Cline, Continue.dev | Easy install, ecosystem access | Limited to extension sandbox |
| **Forked IDE** | Cursor | Full UI control, native integration | Maintenance burden, upstream tracking |
| **CLI/Terminal** | Claude Code | Maximum flexibility, scriptable | No native IDE UI |
| **MCP Protocol** | Claude Code, Cline | Standardized, composable | Requires server implementations |

### Cline Architecture (Open Source)

Cline is the most relevant open-source reference for cocapn's VS Code extension:

- **Extension host process** handles LLM calls directly (no separate backend)
- **Sidebar webview** for chat UI with VS Code theming (`--vscode-*` CSS variables)
- **Diff-based editing** via `apply_diff` tool (search/replace blocks)
- **Git checkpointing**: auto-commits at each step, timeline UI for rollback
- **Shell integration API** (VS Code 1.93+) for command execution with exit codes
- **Multi-provider**: OpenRouter, Anthropic, OpenAI, Google, AWS Bedrock, Azure, Ollama
- **Cost visibility**: per-task and per-request USD breakdown

**Key lesson**: Cline proves that a full agentic coding experience fits inside a VS Code extension. The extension host's Node.js runtime supports API calls, file access, terminal integration, and webview rendering.

### Cursor Architecture (Forked IDE)

Cursor takes the radical approach of forking VS Code:

- **Shadow Workspaces**: Hidden editor instances with kernel-level folder proxies for isolated AI experimentation
- **Rules system**: `.cursor/rules/` with MDC format (always, auto-attached, agent-requested, manual)
- **Memories**: Auto-generated from conversations, scoped to git repo
- **Codebase indexing**: Semantic search index for relevant code retrieval
- **Deep integration**: GitHub, GitLab, Linear, Slack connectors
- **Native UI**: Full editor control for inline edits, Cmd+K bar, composer mode

**Key lesson**: Cursor's rules system (`.cursor/rules/`) is the most sophisticated context management approach. Cocapn's equivalent is `soul.md` + `wiki/` + `repo-understanding/`, which provides richer, version-controlled context.

### Continue.dev Architecture (CI-First)

Continue.dev pivoted from IDE extension to CI-first:

- **AI checks**: Markdown files in `.continue/checks/` with YAML frontmatter
- **CLI execution**: `cn` runs checks on PRs, posts GitHub status checks
- **Per-check context**: Each check defines its own scope and model
- Context providers (`@url`, `@problems`, `@file`) are deprecated

**Key lesson**: The CI integration pattern is relevant. Cocapn's git-backed brain can generate context for CI checks that no other tool can provide.

### VS Code Extension API Reference

Key APIs for building cocapn's extension:

```typescript
// Webview panels (chat UI, dashboards)
vscode.window.createWebviewPanel('cocapn.chat', 'Cocapn', ViewColumn.Beside, options);

// Sidebar webview views
vscode.window.registerWebviewViewProvider('cocapn.sidebar', provider);

// File system watching
vscode.workspace.createFileSystemWatcher('**/*.ts');

// Terminal integration (shell integration API, v1.93+)
vscode.window.createTerminal({ name: 'Cocapn', shellPath: '/bin/bash' });

// Language client (LSP)
vscode.languages.registerHoverProvider('typescript', hoverProvider);

// Status bar
vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
```

**Webview constraints**: iframe-like isolation, message passing via `postMessage`, CSP restrictions, no direct VS Code API access from webview JS.

---

## 3. Cocapn VS Code Extension Design

### Architecture Overview

Cocapn's VS Code extension is NOT just another chat sidebar. It's a **window into the living repo**. The extension connects to the local bridge (which IS the repo) and surfaces the repo's intelligence inside the IDE.

```
┌─────────────────────────────────────────────────────────────┐
│                    VS CODE EXTENSION                         │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │ Chat Panel  │  │ Brain Viewer │  │ Code Intelligence  │ │
│  │ (webview)   │  │ (tree view)  │  │ (LSP + diagnostics)│ │
│  └──────┬──────┘  └──────┬───────┘  └─────────┬──────────┘ │
│         │                │                     │            │
│  ┌──────▼────────────────▼─────────────────────▼──────────┐ │
│  │              Extension Host (Node.js)                    │ │
│  │  ├── WebSocket client → local-bridge (port 8787)        │ │
│  │  ├── MCP client → brain tools                           │ │
│  │  ├── File watcher → repo change detection               │ │
│  │  ├── Terminal integration → cocapn CLI                  │ │
│  │  └── Status bar → bridge status indicator               │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                   WebSocket / HTTP
                            │
┌───────────────────────────▼───────────────────────────────────┐
│                    LOCAL BRIDGE (THE REPO)                    │
│                                                               │
│  ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌───────────────┐  │
│  │  Brain   │  │  Soul   │  │   LLM    │  │  RepoLearner  │  │
│  │  Memory  │  │  .md    │  │ Provider │  │  (git→mind)   │  │
│  └─────────┘  └─────────┘  └──────────┘  └───────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

### Components

#### 3.1 Chat Panel (Webview)

The primary interaction surface. Not a generic chat — it's a **conversation with the repo**.

**Features**:
- Streaming responses via WebSocket
- Mode indicator: Public (green) / Private (amber) / Maintenance (blue)
- Soul.md personality badge
- Memory sidebar: Facts, Wiki, Procedures tabs
- File attachment: Drag files into chat for context
- Code actions: Right-click in editor → "Ask Cocapn"
- Diff preview: Accept/reject proposed changes inline

**Message types** (reusing existing WebSocket protocol):
```typescript
// Client → Bridge
{ type: 'CHAT', id: string, content: string, agentId: string, mode: string }
{ type: 'MEMORY_LIST', id: string }
{ type: 'WIKI_READ', id: string, file: string }
{ type: 'SOUL_GET', id: string }

// Bridge → Client
{ type: 'CHAT_STREAM', id: string, chunk: string, done: boolean }
{ type: 'CHAT_TOOL_USE', id: string, tool: string, args: object }
{ type: 'MEMORY_LIST', facts: Array<{key, value}> }
{ type: 'WIKI_LIST', pages: Array<{title, file}> }
```

#### 3.2 Brain Viewer (Tree View)

A sidebar tree view that shows the repo's brain contents:

```
🧠 Brain
├── 👤 Facts (12)
│   ├── user.name: "Alice"
│   ├── user.role: "Senior Engineer"
│   └── private.api_preference: "deepseek"
├── 📖 Wiki (8)
│   ├── Architecture Decisions
│   ├── API Design Patterns
│   └── Deployment Runbook
├── 🔄 Procedures (3)
│   ├── Deploy to Production
│   └── Code Review Checklist
├── 🔗 Relationships (15)
│   └── auth.ts → depends on → jwt.ts
└── 📊 Repo Understanding
    ├── Architecture (from git history)
    ├── Patterns (detected)
    └── Module Map
```

Each item is clickable: facts open an editor, wiki opens markdown preview, relationships show a graph.

#### 3.3 Code Intelligence Layer

**Not an LSP server in the traditional sense**. Cocapn doesn't parse ASTs or provide go-to-definition. Instead, it provides **semantic intelligence** that traditional LSPs can't:

- **Hover provider**: Shows WHY code exists (git rationale, related decisions, PR context)
- **Code actions**: "Explain this", "Refactor with context", "Generate tests (repo-aware)"
- **Diagnostics**: Surfaces RepoLearner insights as informational diagnostics
  - "This file was modified 47 times last month — high churn area"
  - "This pattern differs from the rest of the codebase (see wiki: Patterns)"
  - "This module has 3 open tasks in the brain"

```typescript
// Hover provider shows repo intelligence, not just types
vscode.languages.registerHoverProvider({ scheme: 'file' }, {
  provideHover(document, position) {
    const repoContext = await brain.getRepoUnderstanding(document.uri.fsPath);
    if (repoContext?.rationale) {
      return new vscode.Hover(`**Why this exists**: ${repoContext.rationale}`);
    }
  }
});
```

#### 3.4 Terminal Integration

The extension spawns a `cocapn start` process in the integrated terminal and monitors its status:

```typescript
// Auto-start bridge on workspace open
const terminal = vscode.window.createTerminal({
  name: 'Cocapn Bridge',
  shellPath: 'npx',
  shellArgs: ['cocapn', 'start'],
  isTransient: true  // Clean up on window close
});

// Monitor bridge status
const statusPoll = setInterval(async () => {
  const response = await fetch('http://localhost:3100/api/status');
  statusBarItem.text = response.ok ? '$(check) Cocapn' : '$(error) Cocapn';
}, 5000);
```

#### 3.5 File Watcher Integration

The extension watches for file changes and feeds them to the bridge's RepoLearner:

```typescript
const watcher = vscode.workspace.createFileSystemWatcher('**/*');
watcher.onDidChange(uri => {
  ws.send(JSON.stringify({
    type: 'FILE_CHANGE',
    path: uri.fsPath,
    event: 'change'
  }));
});
```

#### 3.6 Status Bar

```
[🟢 Cocapn: Private | 🧠 12 facts | 📖 8 wiki | 💰 $0.12/session]
```

Shows: bridge status, active mode, brain summary, session cost.

### Extension Manifest (package.json)

```json
{
  "name": "cocapn",
  "displayName": "Cocapn — The Repo IS the Agent",
  "activationEvents": ["onStartupFinished"],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      { "command": "cocapn.start", "title": "Cocapn: Start Bridge" },
      { "command": "cocapn.chat", "title": "Cocapn: Open Chat" },
      { "command": "cocapn.explainCode", "title": "Cocapn: Explain This Code" },
      { "command": "cocapn.refactor", "title": "Cocapn: Refactor with Context" },
      { "command": "cocapn.generateTests", "title": "Cocapn: Generate Tests" },
      { "command": "cocapn.showBrain", "title": "Cocapn: Show Brain" },
      { "command": "cocapn.syncRepo", "title": "Cocapn: Sync Repo Understanding" }
    ],
    "viewsContainers": {
      "activitybar": [{ "id": "cocapn", "title": "Cocapn", "icon": "brain.svg" }]
    },
    "views": {
      "cocapn": [
        { "id": "cocapn.brain", "name": "Brain", "type": "tree" },
        { "id": "cocapn.chat", "name": "Chat", "type": "webview" }
      ]
    },
    "menus": {
      "editor/context": [
        { "command": "cocapn.explainCode", "when": "editorHasSelection" },
        { "command": "cocapn.refactor", "when": "editorHasSelection" }
      ]
    },
    "configuration": {
      "title": "Cocapn",
      "properties": {
        "cocapn.bridgeUrl": {
          "type": "string",
          "default": "ws://localhost:8787",
          "description": "WebSocket URL for the Cocapn bridge"
        },
        "cocapn.autoStart": {
          "type": "boolean",
          "default": true,
          "description": "Automatically start bridge on workspace open"
        },
        "cocapn.defaultMode": {
          "type": "string",
          "enum": ["public", "private", "maintenance"],
          "default": "private",
          "description": "Default bridge mode"
        }
      }
    }
  }
}
```

---

## 4. Multi-IDE Integration

### 4.1 Cursor Integration

**Strategy: MCP Server + Rules Generation**

Cursor reads `.cursor/rules/` for project context. Cocapn generates these rules from its brain:

```
.cursor/rules/
├── architecture.mdc          # Generated from repo-understanding/architecture.json
├── patterns.mdc              # Generated from repo-understanding/patterns.json
├── conventions.mdc           # Generated from wiki/Conventions.md
└── cocapn-context.mdc        # Generated from soul.md + facts.json
```

**Generation command**:
```bash
cocapn cursor-rules   # Writes .cursor/rules/ from brain
cocapn cursor-rules --watch  # Regenerates on brain changes
```

Additionally, cocapn serves as an MCP server that Cursor can connect to for brain queries:

```json
// .mcp.json (Cursor config)
{
  "mcpServers": {
    "cocapn": {
      "command": "cocapn",
      "args": ["mcp", "serve"],
      "env": { "COCAPN_MODE": "private" }
    }
  }
}
```

### 4.2 Neovim Integration

**Strategy: LSP Client + Terminal**

Neovim connects to cocapn via a lightweight Lua plugin:

```lua
-- init.lua
-- Start cocapn bridge
vim.fn.jobstart('npx cocapn start', { detach = true })

-- Chat command
vim.api.nvim_create_user_command('CocapnChat', function()
  vim.cmd('split | terminal cocapn chat')
end, {})

-- Explain under cursor
vim.api.nvim_create_user_command('CocapnExplain', function()
  local line = vim.fn.getline('.')
  local file = vim.fn.expand('%:p')
  local cmd = string.format('cocapn ask "Explain line %d in %s: %s"',
    vim.fn.line('.'), file, line)
  vim.cmd('split | terminal ' .. cmd)
end, {})

-- Keymaps
vim.keymap.set('n', '<leader>cc', ':CocapnChat<CR>')
vim.keymap.set('n', '<leader>ce', ':CocapnExplain<CR>')
vim.keymap.set('v', '<leader>ca', ':!cocapn ask "<C-r>=getregion()<CR>"<CR>')
```

**Advanced: nvim-cmp integration** for inline suggestions (when cocapn exposes a completion API).

### 4.3 JetBrains Integration

**Strategy: Plugin + WebSocket**

JetBrains plugins use the IntelliJ Platform SDK with a WebSocket client:

```kotlin
class CocapnToolWindow : ToolWindowFactory {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val wsClient = WebSocketClient(URI("ws://localhost:8787"))
        // Webview-like panel using JCEF (Chromium Embedded Framework)
        val browser = JBCefBrowser()
        browser.loadURL("http://localhost:3100/ui")  // Reuse ui-minimal
        toolWindow.contentManager.addContent(
            ContentFactory.getInstance().createContent(browser.component, "Cocapn", false)
        )
    }
}
```

### 4.4 Standalone Web UI

Already built (`packages/ui-minimal/`). The web UI is the universal fallback:
- Any device with a browser
- Mobile support (responsive design)
- Mode-aware (public/private badge)
- Direct WebSocket to bridge

No IDE needed. The web UI IS the IDE for vibe coders.

---

## 5. Synergy with Premium Coding Agents

### The Teacher-Student Model

Cocapn doesn't compete with Claude Code, Cursor, or Copilot. It **supercharges** them. The repo-agent is the teacher. The coding agent is the student. The teacher has accumulated knowledge (git history, brain memory, wiki, repo understanding). The student has raw capability (code generation, refactoring, testing).

```
┌──────────────────────────────────────────────────────────────┐
│                     SYNERGY FLOWS                            │
│                                                              │
│  ┌───────────┐     Context      ┌──────────────────┐        │
│  │  Cocapn   │ ───────────────► │  Claude Code /   │        │
│  │  (Brain)  │                  │  Cursor / Copilot │        │
│  │           │ ◄─────────────── │  (Student)        │        │
│  └───────────┘     Results      └──────────────────┘        │
│        │                              │                      │
│   Remember                          Execute                 │
│   Learn                             Generate                 │
│   Teach                             Refactor                 │
│                                    Test                     │
└──────────────────────────────────────────────────────────────┘
```

### 5.1 Cocapn as MCP Server

Any MCP-compatible agent (Claude Code, Cline, Cursor) connects to cocapn for repo context:

```bash
# Start cocapn's MCP server
cocapn mcp serve

# Exposes these tools:
#   brain_read    — Read facts, memories, wiki, repo-understanding
#   brain_write   — Store new learnings
#   brain_search  — Semantic search across brain stores
#   brain_status  — Overview: counts, mode, last sync
#   brain_wiki    — CRUD on wiki pages
#   brain_repo    — Query RepoLearner (architecture, patterns, history)
```

**Example: Claude Code querying cocapn**:
```
Claude Code → "I need to understand the auth module"
  → calls mcp__cocapn__brain_repo({ query: "auth module architecture" })
  ← cocapn returns: architecture decisions, related commits, patterns, wiki pages
  → Claude Code uses this context to make informed code changes
```

### 5.2 CLAUDE.md Generation

Cocapn auto-generates `CLAUDE.md` from its brain, giving Claude Code instant repo understanding:

```bash
cocapn generate claude-md    # Writes CLAUDE.md from brain
cocapn generate claude-md --watch  # Regenerates on brain changes
```

**What it includes**:
- Architecture summary (from `repo-understanding/architecture.json`)
- Code patterns (from `repo-understanding/patterns.json`)
- Module map (from `repo-understanding/module-map.json`)
- Conventions (from `wiki/`)
- Known issues (from `facts.json` + git history)
- Deployment instructions (from `procedures.json`)

This is what Claude Code would take 30 minutes to learn on its own. With cocapn, it starts with full context.

### 5.3 Auto-Research Pipeline

Cocapn continuously researches and feeds findings to coding agents:

```
Cocapn Maintenance Mode (cron):
  1. Scan new commits → categorize changes
  2. Update repo-understanding/ with rationale
  3. Check for new patterns, anti-patterns
  4. Research latest best practices (WebSearch)
  5. Update wiki/ with findings
  6. Update CLAUDE.md and .cursor/rules/
  → Coding agents benefit from fresh knowledge next session
```

### 5.4 Cross-Session Memory

The biggest pain point with current coding agents: they forget everything between sessions. Cocapn remembers:

| What | Stored In | Available To |
|------|-----------|-------------|
| User preferences | `facts.json` | All agents via MCP |
| Architecture decisions | `repo-understanding/` | All agents via MCP |
| Code patterns | `repo-understanding/patterns.json` | All agents via MCP |
| Debugging sessions | `memories.json` | All agents via MCP |
| Deployment procedures | `procedures.json` | All agents via MCP |
| Team relationships | `relationships.json` | All agents via MCP |

Claude Code doesn't need to re-learn the codebase each session. Cursor doesn't need to re-index. Copilot doesn't need to re-read everything. Cocapn is the persistent memory layer.

### 5.5 Integration Matrix

| Agent | Connection Method | What Cocapn Provides |
|-------|-------------------|---------------------|
| Claude Code | MCP server + CLAUDE.md | Repo context, brain tools, auto-research |
| Cursor | MCP server + .cursor/rules/ | Repo context, brain tools, rules generation |
| GitHub Copilot | VS Code extension coexistence | Hover insights, code actions, brain viewer |
| Cline | MCP server | Repo context, brain tools |
| Aider | CLAUDE.md + MCP | Repo context, conventions, patterns |
| Codex (OpenAI) | CLAUDE.md equivalent | Repo context, architecture, conventions |

---

## 6. Vibe Coding vs Hardcore Dev

### The Spectrum

```
Vibe Coding ◄──────────────────────────────► Hardcore Dev
   "Just make it work"                         "Make it perfect"

   Chat interface                              IDE integration
   Natural language                            Precise commands
   "Fix the bug"                               Inline diagnostics
   "Add a feature"                             Refactoring assistance
   "Deploy it"                                 CI/CD pipeline
   Web UI                                      VS Code extension
   Mobile                                      Neovim
   No IDE needed                               Full IDE required
```

### How Cocapn Serves Both

**The same repo-agent. The same brain. Different interfaces.**

#### Vibe Coding Mode (Pathos)

The user interacts through natural language. The repo-agent does the work.

**Interface**: Web UI, chat panel, mobile
**Mode**: Public or Private
**Experience**:
- "Add a login page" → repo-agent generates code, commits, deploys
- "Fix the bug in auth" → repo-agent finds it, fixes it, tests it
- "What's the status?" → repo-agent reports from brain + git
- "Make it look better" → repo-agent adjusts skin/theme

The repo-agent handles all the complexity. The user just vibes.

**Tripartite mapping**: Pathos (the face) handles vibe coding. Pathos extracts intent from natural language and routes to Logos (the brain) for execution.

#### Hardcore Dev Mode (Logos)

The user is in the IDE. The repo-agent provides precise intelligence.

**Interface**: VS Code extension, Neovim plugin, JetBrains plugin
**Mode**: Private
**Experience**:
- Hover over a function → see WHY it exists, not just WHAT it does
- Right-click → "Refactor with context" → repo-agent uses full brain knowledge
- Diagnostics → repo-agent surfaces insights from RepoLearner
- Code actions → repo-agent generates repo-aware suggestions
- Terminal → `cocapn ask "..."` for targeted queries

The user has full control. The repo-agent is a precise assistant.

**Tripartite mapping**: Logos (the brain) provides hardcore dev intelligence. Logos surfaces accumulated knowledge through IDE integration points.

### Persona Detection

Cocapn adapts to the user's expertise level using the Pathos layer:

```
Expertise Detection (from brain facts + behavior):
  ├── user.role: "Senior Engineer" → hardcore mode, terse responses
  ├── user.role: "Junior Developer" → educational mode, explanatory responses
  ├── user.role: "Non-technical" → vibe mode, abstract complexity
  └── Behavior pattern: uses CLI vs uses web UI → adapt interface
```

The `soul.md` file controls the personality. The facts store tracks user preferences. Together, they create an experience that adapts to who's using it.

### Mode Switching

Users can switch modes fluidly:

```bash
# Vibe coding on the couch (mobile web UI)
https://alice.makerlog.ai/chat

# Hardcore dev at the desk (VS Code)
# → Extension connects to same bridge, same brain

# Quick question in terminal
cocapn ask "why does auth use JWT instead of sessions?"

# CI/CD integration
cocapn check --pr 42   # Brain-aware PR review
```

Same agent. Same knowledge. Different surfaces.

---

## 7. Architecture Diagrams

### Full Integration Map

```
                    ┌─────────────────────────┐
                    │      OUTSIDE WORLD       │
                    │  Users, APIs, Devices     │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │    PATHOS — The Face      │
                    │  ┌─────────────────────┐ │
                    │  │ Web UI (ui-minimal)  │ │
                    │  │ Mobile responsive    │ │
                    │  │ Public chat API      │ │
                    │  └─────────────────────┘ │
                    └────────────┬─────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
┌───────▼──────┐   ┌────────────▼───────────┐   ┌───────▼──────┐
│ VS Code      │   │ LOGOS — The Brain      │   │ Neovim /     │
│ Extension    │   │                        │   │ JetBrains    │
│              │   │  ┌──────────────────┐  │   │              │
│ • Chat       │◄──┤  │ Bridge (core)    │  ├──►│ • Terminal   │
│ • Brain view │   │  │                  │  │   │ • Lua plugin │
│ • Hover      │   │  │ Brain (memory)   │  │   │ • Kotlin     │
│ • Actions    │   │  │ Soul (.md)       │  │   │              │
│ • Watcher    │   │  │ LLM Provider     │  │   └──────────────┘
│ • Terminal   │   │  │ RepoLearner      │  │
└──────────────┘   │  └──────────────────┘  │   ┌──────────────┐
                   │                        ├──►│ MCP Clients  │
                   │  MCP Server Tools:     │   │              │
                   │  • brain_read          │   │ Claude Code  │
                   │  • brain_write         │   │ Cursor       │
                   │  • brain_search        │   │ Cline        │
                   │  • brain_repo          │   │ Aider        │
                   │  • brain_status        │   │ Copilot      │
                   └────────────────────────┘   └──────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │    ETHOS — The Hands      │
                    │  Execution layer          │
                    │  Git, fs, shell, deploy   │
                    └──────────────────────────┘
```

### MCP Integration Flow

```
Claude Code Session:
  1. Claude Code starts → reads CLAUDE.md (generated by cocapn)
  2. Claude Code connects to cocapn MCP server
  3. User: "Refactor the auth module"
  4. Claude Code calls mcp__cocapn__brain_repo({ query: "auth" })
  5. Cocapn returns:
     ├── architecture.json: "Auth uses JWT, decided in commit abc123"
     ├── patterns.json: "All auth checks go through middleware chain"
     ├── wiki/Auth.md: Full auth documentation
     └── relationships.json: auth.ts → jwt.ts → config.yml
  6. Claude Code uses this context for informed refactoring
  7. After refactoring, Claude Code calls mcp__cocapn__brain_write()
     to store learnings about the refactor
  8. Next session: context is already there. No re-learning.
```

### Context Generation Pipeline

```
Cocapn Brain → Context Generators:

┌─────────────┐     ┌─────────────┐     ┌──────────────────┐
│ repo-        │────►│ CLAUDE.md   │────►│ Claude Code      │
│ understand-  │     │ generator   │     │ reads on startup  │
│ ing/         │     └─────────────┘     └──────────────────┘
│              │     ┌─────────────┐     ┌──────────────────┐
│ architecture │────►│ .cursor/    │────►│ Cursor reads     │
│ patterns     │     │ rules/ gen  │     │ on startup        │
│ module-map   │     └─────────────┘     └──────────────────┘
│ file-history │     ┌─────────────┐     ┌──────────────────┐
│              │────►│ MCP brain   │────►│ Any MCP client   │
│              │     │ tools       │     │ connects live     │
└─────────────┘     └─────────────┘     └──────────────────┘
                    ┌─────────────┐     ┌──────────────────┐
│ wiki/             │────►│ IDE hover   │────►│ Hover shows WHY  │
│ procedures        │     │ provider    │     │ not just WHAT     │
│ facts             │     └─────────────┘     └──────────────────┘
└─────────────┘
```

### Cost Model

```
Cocapn costs vs agent costs:

Traditional agent session:
  ├── Agent reads 20 files to understand codebase    (~5k input tokens)
  ├── Agent asks questions about architecture         (~2k input tokens)
  ├── Agent makes mistakes due to missing context     (~10k wasted tokens)
  ├── Agent re-learns in next session                 (~17k redundant tokens)
  └── Total per session: ~34k tokens (~$0.10)

With cocapn:
  ├── Agent reads CLAUDE.md (pre-generated)           (~1k input tokens)
  ├── Agent queries brain for specific context        (~500 input tokens)
  ├── Agent has full context, fewer mistakes          (~3k saved tokens)
  ├── No re-learning needed                           (~17k saved tokens)
  └── Total per session: ~1.5k tokens (~$0.005)

Savings: ~95% reduction in redundant context tokens.
```

---

## Implementation Priority

### Phase 1: Foundation (Week 1-2)
1. Enhance VS Code extension with WebSocket connection to bridge
2. Add chat webview panel with streaming support
3. Add brain tree view with facts/wiki/procedures
4. Add status bar indicator

### Phase 2: Intelligence (Week 3-4)
5. Add hover provider (repo intelligence on hover)
6. Add code actions (explain, refactor, generate tests)
7. Add file watcher → RepoLearner feed
8. Add context menu integration

### Phase 3: MCP Server (Week 5-6)
9. Implement `cocapn mcp serve` command
10. Expose brain_read, brain_write, brain_search, brain_repo tools
11. Test with Claude Code as MCP client
12. Generate CLAUDE.md from brain

### Phase 4: Cross-IDE (Week 7-8)
13. Cursor rules generator (`.cursor/rules/` from brain)
14. Neovim Lua plugin
15. JetBrains plugin (Kotlin + JCEF)
16. Mobile web UI polish

### Phase 5: Synergy (Week 9-10)
17. Auto-research pipeline (cron → web search → wiki update)
18. Cross-session memory for all agents
19. Persona detection (Pathos layer)
20. Vibe coding vs hardcore dev mode switching

---

## Key Design Decisions

1. **Extension, not forked IDE** — Cocapn is an extension that connects to the bridge. The bridge IS the repo. The extension is just a window. This means cocapn works in any IDE that supports WebSocket connections.

2. **MCP server for universal access** — By exposing brain tools via MCP, every coding agent benefits from cocapn's accumulated knowledge without custom integrations.

3. **Context generation, not context search** — Cocapn doesn't search for context on demand. It generates context artifacts (CLAUDE.md, .cursor/rules/) proactively from its brain. Agents read static files instead of making live queries.

4. **Same brain, different interfaces** — The brain stores are IDE-agnostic. Web UI, VS Code extension, Neovim, and MCP clients all connect to the same bridge. The interface adapts to the user, not the other way around.

5. **Teacher-student, not competitor** — Cocapn doesn't try to be a better coding agent. It makes every coding agent better by providing context that agents can't get on their own.

6. **Tripartite alignment** — Pathos (face) handles vibe coding. Logos (brain) handles hardcore dev. Ethos (hands) handles execution. Each layer is independently replaceable.
