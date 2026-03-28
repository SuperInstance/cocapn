# Cocapn Phase 2 Roadmap

> Planned 2026-03-27. Builds on Phase 1 (bridge, UI, protocols, security, modules) which is complete.

---

## Overview

Phase 2 takes Cocapn from a working local bridge to a polished, community-ready agent OS. Six tracks run roughly in parallel, each delivering a self-contained feature.

| # | Track | Deliverable | Complexity |
|---|-------|-------------|------------|
| 2.1 | Onboarding | `npx create-cocapn` scaffolder | Medium |
| 2.2 | Brain | Readable/writable private repo memory | High |
| 2.3 | Routing | Explicit commands + implicit agent routing | Medium |
| 2.4 | Customization | Chat-driven module & skin install | Medium |
| 2.5 | A2A | Cross-domain peer queries | Medium |
| 2.6 | Polish | Tests, CI/CD, docs, structured logging | Medium |

---

## 2.1 — Onboarding Command (`create-cocapn`)

**Goal**: Zero-friction first-run — one `npx` command creates everything.

**Usage**:
```bash
npx create-cocapn my-makerlog --domain makerlog
# → creates sarah.makerlog.ai
```

**Scope**:
- New npm package `create-cocapn` at `packages/create-cocapn/`
  - `bin: { "create-cocapn": "./dist/index.js" }`
  - Accepts positional `<name>` and `--domain <domain>` (default `makerlog`)
  - Accepts `--domain makerlog|studylog|activelog|lifelog` or custom
- Refactor shared init logic into `packages/local-bridge/src/init/` module
  - `GitHubClient` — create repos, enable Pages, clone
  - `AgeKeygen` — generate keypair, write to private repo
  - `RepoScaffolder` — copy templates, commit initial state
- `create-cocapn` imports only the init module (not the full bridge)
- Outputs final subdomain URL: `sarah.makerlog.ai`
- Add tests: mock GitHub API, verify repo scaffold output

**Acceptance criteria**:
- `npx create-cocapn` works on a clean machine with only Node 20+
- Both repos created on GitHub with Pages enabled
- Private repo passes `cocapn-bridge` startup without errors
- README quickstart updated to show `npx create-cocapn`

---

## 2.2 — Private Repo Brain Structure

**Goal**: Agents can read and write structured memory in the private repo.

**Private repo layout**:
```
soul.md                   ← agent personality (read at startup)
memory/
  facts.json              ← key-value facts about the user
wiki/                     ← markdown pages (agent can create new pages)
tasks/                    ← markdown or JSON tasks
```

**`Brain` class** at `packages/local-bridge/src/brain/index.ts`:
```typescript
class Brain {
  getSoul(): string
  getFact(key: string): string | undefined
  setFact(key: string, value: string): Promise<void>   // auto-commits
  searchWiki(query: string): WikiPage[]
  createTask(title: string, description: string): Promise<void>  // auto-commits
}
```

- Every mutating method auto-commits with message `"update memory: <action>"`
- Reads are synchronous (from file cache, refreshed on each Git pull)
- `facts.json` is a flat `Record<string, string>` (no schema complexity)

**CLI commands** (`cocapn-brain`):
```bash
cocapn-brain fact set <key> <value>
cocapn-brain fact get <key>
cocapn-brain wiki add <file>
cocapn-brain task add "<title>"
```

**Acceptance criteria**:
- `setFact` writes to `memory/facts.json` and auto-commits
- `searchWiki` returns pages containing the query string
- `createTask` appends a task file to `tasks/` and auto-commits
- Bridge passes `Brain` instance to agents via `COCAPN_CONTEXT` env var

---

## 2.3 — Agent Routing & Chat Commands

**Goal**: Explicit agent selection via `/command` prefix; intelligent implicit routing.

**Explicit routing** (prefix parsing):
```
/claude refactor this code      → route to Claude Code
/copilot explain this function  → route to Copilot via MCP
/pi what is the weather?        → route to Pi (fast/cheap)
```

**Implicit routing** (heuristic):
- Contains `"deep"`, `"analyze"`, `"refactor"`, `"explain"` → Claude Code
- General questions/requests → Pi (default)
- Override rules configurable in `cocapn/config.json`:
  ```json
  { "routing": { "rules": [{ "match": "debug", "agent": "claude" }] } }
  ```

**`Router` class** at `packages/local-bridge/src/ws/router.ts`:
```typescript
class Router {
  parse(message: string): { agentId: string; content: string; badge: string }
}
```

**UI changes**:
- Agent badge shown on each chat bubble (e.g. `[Pi]`, `[Claude]`)
- `CHAT_STREAM` response includes `agentId` field

**Acceptance criteria**:
- `/claude hello` routes to Claude, badge shows `Claude`
- General message routes to Pi by default
- `"analyze my code"` routes to Claude Code
- Config override takes effect without bridge restart

---

## 2.4 — Chat-Driven Customization (Module & Skin Install)

**Goal**: Users can install modules and change skins from the chat interface.

**New WebSocket message types**:
- `install-module` — install a git-submodule module
- `change-skin` — update active skin

**`ModuleManager` extensions**:
- Detect `"install <name>"` → run `cocapn-bridge module add <url>`
- Detect `"change skin to X"` or `"use theme X"` → switch skin
- Skin changes: create preview branch → return preview URL
- User confirms via chat: `"looks good, merge it"` → merge branch

**UI changes**:
- Preview banner when skin branch is created
- New `/modules` route: installed modules + status (active/inactive)

**Acceptance criteria**:
- `"install habit-tracker"` installs the module (or errors gracefully with known modules list)
- `"change skin to dark"` creates a preview branch and returns a preview URL
- `"looks good, merge it"` merges the preview branch
- `/modules` page lists installed modules with toggle controls

---

## 2.5 — A2A Cross-Domain Communication

**Goal**: One log can query another (e.g. makerlog asks activelog for fatigue level).

**Peer discovery**:
- Each bridge exposes `GET /.well-known/cocapn/peer` → returns `{ domain, capabilities, publicKey }`
- Bridges discover each other by domain name (no mDNS required in Phase 2)

**Peer query API**:
```
GET /api/peer/fact?key=fatigue
Authorization: Bearer <fleet-jwt>
```

**Intent detection in Router**:
- Message contains `"ask activelog"` or `"from studylog"` → extract domain + query
- Use `A2AClient` to send request to peer bridge
- Return response with source badge: `[activelog]`

**Authentication**:
- Shared fleet JWT (symmetric key in `cocapn/config.yml`)
- Unauthorized requests receive `401`

**Acceptance criteria**:
- `"Am I too tired to solder? ask activelog"` → bridge queries `activelog` peer, returns fact
- Fleet JWT validated on both sides
- Graceful error when peer is unreachable
- `/.well-known/cocapn/peer` endpoint returns valid JSON

---

## 2.6 — Production Polish

**Goal**: All core packages have tests, CI/CD is wired, docs are comprehensive.

**Tests**:
- Unit tests: `Brain`, `Router`, `create-cocapn` scaffolder, `ModuleManager` extensions
- Integration tests: full WebSocket flow (connect → auth → chat → response → disconnect)
- Existing Vitest suite extended; no test framework change

**GitHub Actions**:
- `.github/workflows/ci.yml`: lint, typecheck, test on push/PR to main
- `.github/workflows/publish.yml`: npm publish on tag `v*.*.*`
- Matrix: Node 20, Node 22

**Documentation** (`docs/`):
- `architecture.md` — updated with Brain, Router, A2A peer discovery
- `agents.md` — updated with routing commands and badge system
- `brain.md` — new: memory system guide
- `a2a.md` — updated with peer discovery endpoint

**Structured logging**:
- `Logger` class replacing `console.*` calls
- `COCAPN_LOG_FORMAT=json` → JSON lines output
- Default: human-readable with `[module]` prefix (current behavior preserved)

**Security**:
- `SECURITY.md` — vulnerability reporting, age key generation guidance, secret rotation
- Fix PAT-in-remote-URL (stopgap: replace remote URL after initial push)
- Fix `secret:KEY` refs in agent env (resolve at spawn time, not registry load)

**Acceptance criteria**:
- `npm test` passes in all packages
- CI green on GitHub Actions
- `npx create-cocapn` works from npm registry (or `npm pack` tarball)
- `SECURITY.md` present with age key guidance

---

## Dependency Order

```
2.2 (Brain) ──────────────────────────────────┐
2.1 (create-cocapn) ── uses init/ module       │
2.3 (Router) ─────── uses Brain for context   ─┤─→ 2.6 (Polish)
2.4 (Customization) ─ uses Router intent       │
2.5 (A2A) ─────────── uses Router intent      ─┘
```

2.2 and 2.1 can start immediately in parallel.
2.3 depends on 2.2 for context injection.
2.4 and 2.5 depend on 2.3 for intent parsing.
2.6 runs last (tests cover everything).
