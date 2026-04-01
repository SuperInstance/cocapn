# IDE Plugin Architecture Patterns for AI Coding Assistants

> Research report on how AI coding assistants integrate with IDEs, compiled from Cline, Continue.dev, Claude Code, Cursor, MCP, and VS Code extension APIs. Covers eight architectural dimensions: architecture/communication, UI patterns, code understanding, terminal integration, Git integration, file system access, context management, and cost management.

---

## 1. Architecture (AI Communication)

### Cline

- **VS Code extension host process** communicates with LLM providers via REST API calls from the extension backend (Node.js).
- Multi-provider architecture: OpenRouter, Anthropic, OpenAI, Google, AWS Bedrock, Azure, GCP Vertex, Cerebras, Groq, LM Studio, Ollama. Provider selection is per-task.
- The extension runs entirely within the VS Code extension host. There is no separate backend server. API keys are stored in VS Code's secret storage (via `SecretStorage` API).
- Each "task" is a conversational loop: user message -> LLM response (with tool calls) -> tool execution -> observation -> next LLM call. The loop continues until the LLM stops requesting tool use.
- Tool calls are the primary mechanism for AI-to-environment interaction: `read_file`, `write_to_file`, `apply_diff`, `execute_command`, `browser_action`, `attempt_completion`, etc.

### Continue.dev

- Originally a VS Code extension with a local Python/Node backend for indexing and retrieval. Has pivoted to a CLI-first model (`cn`) focused on "AI checks enforceable in CI."
- In the IDE extension model: the extension communicates with a local daemon process that handles LLM calls, indexing, and context retrieval.
- Agents are defined as markdown files in `.continue/checks/` with YAML frontmatter. The CLI runs these checks on PRs and posts results as GitHub status checks.
- The extension still exists but the architectural focus has shifted away from IDE-first toward CI-first.

### Claude Code

- **Terminal-based agentic tool**, not a VS Code extension. Runs as a standalone Node.js CLI application (requires Node.js 18+).
- Communicates with Anthropic's API (and other providers) directly from the CLI process. No separate backend server.
- Can integrate with IDEs as an embedded terminal (e.g., running inside VS Code's integrated terminal).
- Exposes itself as an MCP server via `claude mcp serve`, allowing other tools to call it.
- Plugin system via MCP: connects to external MCP servers using three transports:
  - **stdio**: Local processes (CLI tools, scripts)
  - **HTTP (Streamable HTTP)**: Recommended for remote servers. POST for requests, SSE for responses.
  - **SSE (legacy)**: Older HTTP-based transport
- Three MCP configuration scopes:
  - **Local** (`~/.claude.json`): Per-project, not version-controlled
  - **Project** (`.mcp.json`): Version-controlled, shared across team
  - **User** (`~/.claude.json`): Cross-project personal configuration
- Enterprise managed MCP with server allowlist/denylist.

### Cursor

- **Fork of VS Code itself**. Not an extension -- the entire IDE is modified to embed AI capabilities natively.
- AI features are deeply integrated into the editor core, not running through the extension API layer. This gives Cursor access to internal APIs that extensions cannot reach.
- Model support spans multiple providers with context windows up to 2M tokens (Grok 4.20).
- Integrations with GitHub, GitLab, JetBrains, Slack, and Linear suggest a multi-process architecture with external service connectors.
- "Shadow Workspaces": hidden VS Code windows with kernel-level folder proxies that allow AI agents to iterate on code without affecting the user's visible workspace. The AI gets its own isolated editor instance for testing changes.

### MCP (Model Context Protocol)

- **Open standard** (JSON-RPC 2.0) for connecting AI systems to external tools and data sources. Not an IDE itself but the wire protocol many IDE AI tools use.
- Transport interface:
  ```typescript
  interface Transport {
    start(): Promise<void>;
    send(message: JSONRPCMessage): Promise<void>;
    close(): Promise<void>;
    onclose?: () => void;
    onerror?: (error: Error) => void;
    onmessage?: (message: JSONRPCMessage) => void;
  }
  ```
- Three primitives: **Resources** (URI-addressable data), **Tools** (callable functions with JSON Schema validation), **Prompts** (reusable prompt templates).
- Session management via `Mcp-Session-Id` header. Resumability via `Last-Event-ID` for SSE streams.
- Tool annotations for safety: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`.
- Real-time resource subscriptions for live data updates.

### VS Code Extension API Patterns

- Extensions run in a **Node.js extension host process**, separate from the renderer.
- Communication between extension host and VS Code UI uses VS Code's internal IPC (not directly accessible to extensions).
- Extensions communicate with webviews via **message passing** (`postMessage` API).
- The Language Model API (documented but URL returned errors during research) allows extensions to call LLMs through VS Code's built-in chat participant system.

---

## 2. UI Patterns

### Cline

- **Sidebar webview panel**: Primary chat interface rendered as a VS Code webview view in the sidebar.
- **Diff view**: Shows proposed file changes using VS Code's built-in diff editor. User can accept/reject individual hunks.
- **Timeline/checkpoint UI**: Visual timeline of changes per task, allowing rollback to any checkpoint.
- **File tree indicators**: Badges/annotations on files that were modified by the AI.
- Uses VS Code theming (respects `--vscode-*` CSS variables for consistent appearance).

### Continue.dev

- **Sidebar panel**: Configurable panel position (left/right sidebar or panel area).
- **Inline suggestions**: Code completions rendered as ghost text in the editor.
- **Tab autocomplete**: Multi-line completions triggered by typing.
- Note: Context providers (@url, @problems, @file, @folder) are now deprecated as focus shifted to CI.

### Claude Code

- **No native IDE UI**. Terminal-based interface using ANSI formatting for structure.
- **Interactive mode** (`claude`): Conversational REPL with streaming output.
- **One-shot mode** (`claude -p "query"`): Single prompt, single response, exits.
- **Output formats**: `text` (default), `json` (structured), `stream-json` (newline-delimited JSON for piping).
- When used inside VS Code's terminal, benefits from the terminal's theming and scrollback but has no access to VS Code's webview or editor APIs.

### Cursor

- **Chat panel**: Sidebar chat with codebase-aware responses.
- **Inline edits**: AI-suggested edits rendered directly in the editor with accept/reject controls.
- **Composer/Agent mode**: Multi-file editing with planning and execution phases.
- **Cmd+K**: Inline edit bar that appears at the cursor for quick AI-driven modifications.
- Since Cursor IS a forked VS Code, it has full control over the renderer and can modify the editor UI at the native level (not constrained by webview API limitations).

### VS Code Webview API (General Patterns)

Three integration points for custom UI:

1. **Webview Panels** (`createWebviewPanel`): Full-featured panels in the editor area. Support arbitrary HTML/CSS/JS. Used for chat interfaces, dashboards, custom editors.
2. **Webview Views** (`registerWebviewViewProvider`): Panels embedded in the sidebar or bottom panel. Used for chat sidebars, tree views with custom rendering.
3. **Custom Editors** (`registerCustomEditorProvider`): Replace VS Code's built-in editor for specific file types. Used for visual editors, preview panels.

Key webview constraints:
- **iframe-like isolation**: Webviews run in a separate security context with Content Security Policy.
- **Message passing**: Communication with extension host via `postMessage`. No direct access to VS Code API from webview JavaScript.
- **Resource loading**: Local resources must be loaded via `asWebviewUri()`. Access controlled by `localResourceRoots`.
- **State serialization**: `registerWebviewPanelSerializer` for persisting webview state across restarts.
- **Theming**: Access VS Code theme colors via CSS variables (`--vscode-editor-foreground`, etc.) and body classes (`vscode-light`, `vscode-dark`, `vscode-high-contrast`).
- **Lifecycle**: `onDidDispose` for cleanup, `onDidChangeViewState` for visibility tracking, `reveal()` for focusing existing panels.
- **Context menus**: `webview/context` contribution point for right-click menus in webviews.

---

## 3. Code Understanding

### Cline

- **File structure reading**: Reads directory trees and source files directly via VS Code's file system APIs.
- **AST-aware**: Parses source code ASTs for understanding code structure (not just raw text).
- **Regex search**: Uses regex-based search across the workspace for context gathering.
- **Linter/compiler monitoring**: Watches for linter and compiler errors and uses them as feedback signals for auto-correction.
- **@-mention context providers**: `@url` (fetch web content), `@problems` (workspace errors), `@file` (specific file), `@folder` (directory contents).

### Continue.dev

- **AI checks**: Markdown-defined checks with frontmatter that analyze code patterns.
- Context providers are deprecated in the CI-first model.
- Original indexing capabilities (embeddings-based code search) still exist in the extension but are no longer the focus.

### Claude Code

- **File system traversal**: Uses `grep`/`glob`/`read` tools to explore codebases. No persistent index.
- **Session-based understanding**: Builds mental model per conversation, not persisted across sessions (unless using session resume with `-r`).
- **MCP resources**: Can connect to external indexing services via MCP for richer code understanding.

### Cursor

- **Codebase indexing**: Cursor maintains an index of the codebase for semantic search. Details of the indexing implementation are not publicly documented.
- **Rules system (MDC format)**: Project-specific rules in `.cursor/rules/` that provide context to the AI:
  - **Always rules**: Applied to every request.
  - **Auto Attached rules**: Applied when files match specified glob patterns.
  - **Agent Requested rules**: AI decides when to apply based on description.
  - **Manual rules**: Applied only when explicitly referenced with `@ruleName`.
  - Rules can reference template files with `@filename` syntax.
  - Support for nested rules in monorepos (rules in subdirectory `.cursor/rules/` apply to that subtree).
- **Memories**: Auto-generated from conversations, scoped to the git repository. Provide persistent context across sessions.
- **Shadow Workspaces**: Isolated editor instances where AI can test code changes without affecting the user's workspace. Kernel-level folder proxies allow the AI to read/write files in a shadow copy.

### MCP

- **Resources**: URI-addressable data (`file://`, `postgres://`, `screen://`). AI systems read resources to understand context.
- **Resource subscriptions**: Real-time updates when resources change.
- **Resource templates**: URI templates with variable substitution for parameterized access.

---

## 4. Terminal Integration

### Cline

- **VS Code shell integration API** (requires VS Code 1.93+): Deep terminal integration that allows Cline to:
  - Execute commands and capture output.
  - Detect command completion (exit codes).
  - Navigate directory changes within the terminal.
  - Read terminal content programmatically.
- Commands are executed via VS Code's `tasks` or `terminal.sendText` API, with output captured through shell integration.

### Continue.dev

- No significant terminal integration in the current CI-first model.
- The extension could execute commands via VS Code's `tasks` API but this is not a documented feature.

### Claude Code

- **IS a terminal tool**. Does not integrate INTO a terminal -- it runs AS a terminal application.
- Supports piping: `cat file | claude -p "analyze"` and `claude -p "query" > output.txt`.
- **`--permission-prompt-tool`**: External tool for automated permission decisions, enabling headless/CI usage.
- **`--max-turns`**: Limits agentic loop iterations for bounded execution.

### Cursor

- **Integrated terminal**: As a VS Code fork, Cursor has the same terminal capabilities as VS Code.
- AI agent can likely execute terminal commands through the forked API layer (not publicly documented how).

### VS Code Terminal API

- **Shell integration API** (v1.93+): Allows extensions to detect terminal state, execute commands, and read output.
- **Pseudoterminal API**: Extensions can create custom terminal emulators via `Pseudoterminal` interface.
- **Task API**: Extensions can define and run tasks with output capture.
- **Terminal profiles**: Extensions can contribute custom terminal profiles.

---

## 5. Git Integration

### Cline

- **Timeline-based checkpoints**: Creates Git commits at each step of a task, forming a timeline the user can navigate to rollback changes.
- Uses Git under the hood for checkpoint/restore functionality.
- The diff view for proposed changes leverages VS Code's Git diff infrastructure.

### Continue.dev

- **CI/PR integration**: The primary Git integration is through GitHub status checks on PRs. The `cn` CLI runs AI checks and posts pass/fail results.
- The IDE extension can show inline annotations from AI checks on changed lines.

### Claude Code

- **Git operations via tools**: Uses Git CLI commands through its shell tool. Not a deep Git integration -- just command execution.
- Session management uses IDs but does not create Git commits or branches automatically.
- Can be integrated with GitHub via `@claude` mentions on issues/PRs.

### Cursor

- **GitHub/GitLab integration**: Deep integration for PR review, issue tracking, and code review.
- **Linear/Slack integration**: Connects to project management tools for context.
- Shadow Workspaces provide a Git-like isolation mechanism for AI experimentation.

### General Pattern

Most AI coding assistants use Git either:
1. **As a checkpoint mechanism** (Cline): Auto-commit at each step, allow rollback.
2. **As a CI trigger** (Continue.dev): Run AI checks on PRs.
3. **As a command-line tool** (Claude Code): Execute git commands via terminal.
4. **As a collaboration layer** (Cursor): Connect to Git hosting platforms for context.

---

## 6. File System Access

### Cline

- **Direct file access** through VS Code's extension host APIs:
  - `vscode.workspace.fs` for file system operations.
  - `vscode.workspace.openTextDocument` for reading file contents.
  - Custom tool implementations for `read_file`, `write_to_file`, `apply_diff`.
- **Diff-based editing**: Uses `apply_diff` tool rather than full file rewrites, making changes more surgical.
- Access is scoped to the workspace root and any additional `localResourceRoots` configured.

### Continue.dev

- **Workspace scanning**: The extension reads workspace files for indexing and context.
- **AI checks read files**: The `cn` CLI reads repository files when running checks.
- File access is standard Node.js `fs` operations in the extension host.

### Claude Code

- **Full file system access** from the terminal process. No sandboxing by default.
- Tools: `Read`, `Write`, `Edit` for file operations.
- `Edit` tool performs string replacement (not full file rewrite) for targeted changes.
- `Glob` and `Grep` tools for file discovery and content search.
- Permission system: User approves or denies file operations before execution.

### Cursor

- **Native file system access** as a forked IDE. Full access to VS Code's file system provider APIs.
- **Shadow Workspaces**: Kernel-level folder proxies create isolated file system views for AI agents. The AI can read/write in a shadow copy without affecting the user's actual files.

### VS Code Extension API

- **`vscode.workspace.fs`**: Virtual file system API supporting any registered file system provider.
- **`vscode.workspace.findFiles`**: Glob-based file search.
- **`vscode.workspace.openTextDocument`**: Open files for reading/editing.
- **`TextDocument`/`TextEditor` APIs**: Read and modify document content.
- **`FileSystemWatcher`**: Watch for file changes in real time.
- **`workspace.createFileSystemWatcher`**: Monitors create/change/delete events.

---

## 7. Context Management

### Cline

- **Per-task context**: Each task starts fresh and builds context through tool use (reading files, executing commands, observing errors).
- **Context providers**: `@url`, `@problems`, `@file`, `@folder` for explicit context injection.
- **Token-aware**: Tracks token usage per task and per request to manage context window.
- Context is ephemeral per task -- no cross-task memory persistence.

### Continue.dev

- **Check-based context**: Each AI check defines its own context scope via frontmatter configuration.
- Context providers are deprecated -- checks now define their own context requirements.
- No persistent context across CI runs.

### Claude Code

- **Session-based context**: Each conversation session builds context through tool use.
- **Session resume**: `-c` flag resumes the most recent session; `-r <id>` resumes a specific session. Context persists within a session.
- **MCP resources**: External context sources accessible via URI (files, databases, APIs).
- **Environment variables**: `${VAR}` and `${VAR:-default}` expansion in `.mcp.json` for dynamic configuration.
- **Output limits**: 10k token warning threshold, 25k token hard limit per tool response. Configurable via `MAX_MCP_OUTPUT_TOKENS`.
- **`--max-turns`**: Bounded agentic loops to control total context consumption.

### Cursor

- **Rules system**: Persistent project context defined in `.cursor/rules/` with MDC format:
  ```
  ---
  description: RPC Service boilerplate
  globs: src/services/**
  alwaysApply: false
  ---
  - Use our internal RPC pattern when defining services
  - Always use snake_case for service names.

  @service-template.ts
  ```
- **Memories**: Auto-generated from conversations, scoped to git repository. Persistent across sessions.
- **Codebase indexing**: Semantic search index for relevant code retrieval.
- **`/Generate Cursor Rules`**: Chat command to create new rules from conversation context.
- **Context window management**: Supports models with up to 2M token context windows, reducing the need for aggressive context compression.

### MCP

- **Resource subscriptions**: Real-time context updates when external data changes.
- **Resource templates**: Parameterized URIs for dynamic context retrieval.
- **Prompt templates**: Reusable context structures that can include resource references and tool results.

---

## 8. Cost Management

### Cline

- **Per-task tracking**: Shows total cost (USD) per task, calculated from token usage and provider pricing.
- **Per-request breakdown**: Displays input tokens, output tokens, and cost for each individual LLM call within a task.
- **Token counting**: Tracks cumulative tokens across all requests in a task.
- Visible in the task UI, allowing users to monitor spend in real time.

### Continue.dev

- **No explicit cost tracking** documented. As a CI tool, costs are managed through check frequency and model selection.
- Check definitions control model choice, which indirectly controls cost.

### Claude Code

- **`/cost` command**: Shows total cost and token usage for the current session.
- **Token counting**: Tracks input and output tokens per request and cumulatively.
- **Output limits**: Built-in token limits on tool responses (10k warning, 25k max) to prevent runaway context growth.
- **`MAX_MCP_OUTPUT_TOKENS`**: Environment variable to tune output limits.
- **`--max-turns`**: Hard limit on agentic loop iterations, capping total cost per invocation.

### Cursor

- **Subscription model**: Cost is managed through Cursor's subscription tiers rather than per-request pricing visible to users.
- No per-task cost breakdown documented.
- Context window size (up to 2M tokens) means cost management is primarily through model selection and context window sizing.

### General Pattern

| Tool | Cost Visibility | Cost Control Mechanism |
|------|----------------|----------------------|
| Cline | Per-task and per-request USD | Model selection, task termination |
| Continue.dev | None visible | Check frequency, model choice |
| Claude Code | `/cost` command, per-session | `--max-turns`, output limits, model choice |
| Cursor | Subscription tier | Model selection, context window sizing |

---

## Cross-Cutting Patterns

### Tool-Use Loop

All agentic AI coding assistants follow the same fundamental loop:

1. User sends message
2. LLM generates response (potentially with tool calls)
3. If tool calls: execute tools, collect results
4. Feed results back to LLM
5. Repeat until LLM stops requesting tool use
6. Present final result to user

Variations:
- **Cline**: Autonomous loop in VS Code extension host.
- **Claude Code**: Autonomous loop in terminal process.
- **Cursor**: Autonomous loop in forked IDE internals.
- **Continue.dev**: Check execution loop in CLI/CI.

### Human-in-the-Loop Approval

All tools implement some form of approval mechanism:

- **Cline**: Diff view for file changes, terminal command approval.
- **Claude Code**: Permission prompts for file writes, shell commands; `--permission-prompt-tool` for automation.
- **Cursor**: Accept/reject UI for inline edits; agent mode with planning phase.
- **Continue.dev**: CI status checks (approve/merge workflow).

### Diff-Based Editing

Modern AI assistants prefer surgical edits over full file rewrites:

- **Cline**: `apply_diff` tool with search/replace blocks.
- **Claude Code**: `Edit` tool with exact string replacement.
- **Cursor**: Inline edit markers in the editor.

### Multi-Provider LLM Support

| Tool | Providers |
|------|-----------|
| Cline | OpenRouter, Anthropic, OpenAI, Google, AWS Bedrock, Azure, GCP Vertex, Cerebras, Groq, LM Studio, Ollama |
| Continue.dev | Configurable per check |
| Claude Code | Anthropic (primary), MCP-connected providers |
| Cursor | Multiple with up to 2M context windows |

### MCP as Integration Layer

MCP is emerging as the standard protocol for AI-to-tool communication:

- **Claude Code**: Uses MCP as its primary plugin system. Can both consume and provide MCP services.
- **Cline**: MCP support for custom tool servers.
- **Cursor**: Uses rules system rather than MCP for context, but could theoretically support MCP.
- **VS Code**: GitHub Copilot and other extensions are adopting MCP for tool integration.

### Architecture Trade-offs

| Approach | Example | Pros | Cons |
|----------|---------|------|------|
| Extension | Cline, Continue.dev | Easy install, VS Code ecosystem, extension API | Limited to extension sandbox, no native UI access |
| Forked IDE | Cursor | Full UI control, native integration, internal APIs | Maintenance burden, must track upstream VS Code updates |
| CLI/Terminal | Claude Code | Maximum flexibility, no IDE dependency, scriptable | No native IDE UI, relies on terminal embedding |
| Protocol (MCP) | Claude Code, Cline | Standardized, composable, provider-agnostic | Requires MCP server implementations, adds complexity |

---

## Research Gaps

The following areas could not be fully researched due to documentation limitations:

1. **Cursor Shadow Workspaces internals**: The blog post content was JavaScript-rendered and could not be fetched. Only high-level description available: "hidden windows and kernel-level folder proxies."
2. **Cursor codebase indexing architecture**: Documentation returns generic overview pages. The indexing implementation details (embedding model, chunking strategy, retrieval method) are not publicly documented.
3. **VS Code Language Model API**: The extension guide URL returned an error. This API would cover how extensions integrate with VS Code's built-in LLM infrastructure (chat participants, inline completions, etc.).
4. **Continue.dev original architecture**: The pivot to CI-first means many original IDE extension features (context providers, embeddings) are deprecated and undocumented.
5. **Cursor agent execution model**: How the agent plans, executes, and verifies multi-file changes is not publicly documented beyond marketing descriptions.

---

## Summary of Architectural Patterns

For building an IDE-integrated AI coding assistant (relevant to cocapn's architecture):

1. **Extension host is the natural home** for AI logic when targeting VS Code. The Node.js runtime supports API calls, file access, and terminal integration.

2. **Webviews are the UI mechanism** for chat panels and custom interfaces. Message passing bridges the gap between webview rendering and extension host logic.

3. **Tool-use loops with human approval** are the standard interaction model. Every major tool implements some variant of plan-execute-approve.

4. **Diff-based editing** (not full file rewrites) is the standard for code modification. This reduces errors and gives users granular control.

5. **MCP is the emerging standard** for connecting AI to external tools. Supporting MCP as both client and server maximizes ecosystem compatibility.

6. **Cost management requires per-request token tracking** combined with user-facing cost displays and hard limits on agentic loops.

7. **Context management is the primary differentiator**. Rules systems (Cursor), MCP resources (Claude Code), and context providers (Cline) all solve the same problem: getting the right information into the LLM's context window.

8. **Git integration takes four forms**: checkpoint commits (Cline), CI checks (Continue.dev), command-line execution (Claude Code), and platform integration (Cursor). Each serves different use cases.
