# Dev Mate — Your AI Pair Programmer

```
   ╔═══════════════════════════════════════════════════════╗
   ║                                                       ║
   ║   ██╗  ██╗ ██████╗ ██████╗ ██████╗                   ║
   ║   ██║  ██║██╔═══██╗██╔══██╗██╔══██╗                  ║
   ║   ███████║██║   ██║██████╔╝██║  ██║                  ║
   ║   ██╔══██║██║   ██║██╔══██╗██║  ██║                  ║
   ║   ██║  ██║╚██████╔╝██║  ██║██████╔╝                  ║
   ║   ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═════╝                   ║
   ║                                                       ║
   ║   ██████╗ ██████╗ ███╗   ██╗████████╗                 ║
   ║   ██╔════╝██╔═══██╗████╗  ██║╚══██╔══╝                ║
   ║   ██║     ██║   ██║██╔██╗ ██║   ██║                   ║
   ║   ██║     ██║   ██║██║╚██╗██║   ██║                   ║
   ║   ╚██████╗╚██████╔╝██║ ╚████║   ██║                   ║
   ║    ╚═════╝ ╚═════╝ ╚═╝  ╚═══╝   ╚═╝                   ║
   ║                                                       ║
   ║   Your AI pair programmer that lives in your repo.    ║
   ║   It remembers. It reviews. It ships.                 ║
   ║                                                       ║
   ╚═══════════════════════════════════════════════════════╝
```

## What It Does

Dev Mate is a Cocapn-powered software development assistant that embeds directly into your repository. It is not a chatbot you visit in a browser tab -- it is a persistent technical partner that:

- **Reviews your code** before it ships, catching bugs, security issues, and style violations
- **Remembers your decisions** -- architectural choices, bug patterns, team conventions -- across sessions
- **Debugs with you** by tracing execution paths, reading stack traces, and proposing ranked root causes
- **Generates tests** for untested code paths and identifies coverage gaps
- **Manages Git workflows** with conventional commit messages and well-crafted PR descriptions
- **Tracks dependencies** with scheduled audits and vulnerability alerts
- **Documents automatically** -- ADRs, API docs, inline comments, and architecture overviews

Dev Mate runs locally via the Cocapn bridge. Your code never leaves your machine unless you configure external LLM providers.

## Quick Start

```bash
# 1. Scaffold a new project with this template
npm create cocapn -- --template dev-mate

# 2. Enter your brain repo
cd my-project-brain

# 3. Set your LLM API key (stored in OS keychain, never in git)
cocapn secret set DEEPSEEK_API_KEY

# 4. Start the bridge
cocapn start --public ../my-project

# 5. Open the web client
open http://localhost:8787
```

Or clone directly:

```bash
# Clone and install
git clone https://github.com/cocapn/dev-mate-starter.git my-dev-brain
cd my-dev-brain
npm install

# Configure your LLM
cp .env.example .env
# Edit .env with your API key

# Start
cocapn start
```

## Use Cases

### Code Review
```
You: Review the last 3 commits on this branch

Dev Mate: I found 3 issues across commits a1b2c3d..e4f5g6h:

1. [SECURITY] src/auth/login.ts:42 — SQL injection via string
   interpolation in the WHERE clause. Use parameterized query:
   `db.query('SELECT * FROM users WHERE email = $1', [email])`

2. [PERFORMANCE] src/api/search.ts:118 — N+1 query in the
   product listing loop. Batch the category fetches with
   `WHERE id IN (...)`.

3. [STYLE] src/utils/format.ts:7 — Mixed tab/space indentation.
   Project convention (stored in memory) uses 2-space indent.
```

### Debugging
```
You: Getting ECONNREFUSED on the database connection in staging

Dev Mate: Checking memory... Last time this happened (2024-11-03),
the staging DB was rotated and the connection string wasn't updated.

Current connection attempts go to: db.staging.internal:5432

Likely causes ranked by probability:
1. (85%) Staging DB was rotated — check secrets for DATABASE_URL
2. (10%) Port changed — staging sometimes uses 5433 after rebuilds
3. (5%) Network partition — run `nc -zv db.staging.internal 5432`
```

### Architecture Decisions
```
You: We need to add real-time notifications. WebSocket or SSE?

Dev Mate: Given your current stack (Express, PostgreSQL, Redis),
I'd recommend SSE for these reasons:

1. Your notifications are server-to-client only (SSE's strength)
2. No need for bidirectional communication yet
3. Simpler infrastructure — no sticky sessions or connection state
4. Redis pub/sub already in place can feed SSE streams

If you later need client-to-server real-time (typing indicators,
presence), we can upgrade to WebSocket at that point. The SSE
endpoint becomes the WebSocket handshake.

Shall I create an ADR for this decision?
```

### Test Generation
```
You: Write tests for src/services/payment.ts

Dev Mate: Analyzing payment.ts... Found 4 exported functions and
2 untested edge cases:

- processPayment() — Missing: expired card, insufficient funds,
  network timeout, idempotency key collision
- refundPayment() — Missing: partial refund, already-refunded
  transaction, refund window expired
- calculateTax() — Missing: international address, tax-exempt
  customer
- formatReceipt() — Missing: multi-currency display

Generating tests in tests/services/payment.test.ts...
Writing 24 test cases across 4 describe blocks.
Run: npx vitest run tests/services/payment.test.ts
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `llm.provider` | `deepseek` | LLM provider (deepseek, openai, anthropic, local) |
| `llm.temperature` | `0.5` | Lower = precise, higher = creative |
| `brain.memoryLimit` | `2000` | Max memory entries before pruning |
| `features.codeReview` | `true` | Auto-review on Git commits |
| `features.dependencyAudit` | `true` | Weekly npm audit scheduling |
| `plugins` | `code-reviewer, git-helper, doc-generator` | Active plugins |

## Memory System

Dev Mate remembers across sessions using five brain stores:

| Store | What it tracks |
|-------|---------------|
| `facts.json` | Preferred languages, frameworks, editor config, team size |
| `memories.json` | Debugging sessions, code review outcomes, architecture discussions |
| `procedures.json` | Learned workflows — deployment steps, release checklist |
| `relationships.json` | Module dependencies, API contracts, service connections |
| `wiki/` | Persistent knowledge — patterns, guides, runbooks |

All memory is stored in Git. It persists across restarts and can be shared with team members.

## Plugins

- **code-reviewer** — Automated code review with security, performance, and style checks
- **git-helper** — Conventional commits, PR descriptions, branch management
- **doc-generator** — ADR templates, API docs, README updates, inline doc comments

## Requirements

- Node.js 18+
- Git 2.30+
- An LLM API key (DeepSeek, OpenAI, Anthropic, or local model via Ollama)

## License

MIT
