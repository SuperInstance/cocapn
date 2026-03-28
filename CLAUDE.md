# Cocapn: Hybrid Agent OS

## Project Overview
Cocapn is a repo-first, domain-branded agent operating system with an optional Cloudflare edge tier. The system uses GitHub repositories as the primary database (public repo for UI/templates, private repo for encrypted memory) and a local Node.js bridge to execute CLI agents (Pi, Claude Code, Copilot via MCP).

## Architecture Layers
1. **UI Layer**: React SPA served from GitHub Pages at `[user].[domain].ai` (makerlog.ai, studylog.ai, etc.)
2. **Bridge Layer**: Node.js WebSocket server (local-first, optional Cloudflare tunnel)
3. **Protocol Layer**: MCP + A2A (extracted from existing cloud implementation)
4. **Storage Layer**: Git repositories (public=template, private=encrypted brain)
5. **Cloud Tier** (Optional): Existing Cloudflare Workers for 24/7 background tasks

## Key Directories
- `/packages/protocols/` - Shared MCP/A2A implementations (extract from existing)
- `/packages/local-bridge/` - NEW: WebSocket server, Git sync, agent spawner
- `/packages/ui/` - NEW: React app with domain skinning
- `/packages/cloud-agents/` - EXISTING: Your current Workers implementation
- `/templates/public/` - Template for user public repos
- `/templates/private/` - Template for user private repos

## Technology Stack
- **Bridge**: Node.js 20+, TypeScript, `ws` (WebSocket), `simple-git`, `chokidar`
- **UI**: React 18, Vite, TailwindCSS, xterm.js
- **Protocols**: MCP SDK, A2A specification
- **Encryption**: `age` for secrets in private repos
- **Storage**: Git (primary), Vectorize/D1 (cloud cache only)

## File Naming Conventions
- Config files: `cocapn.yml` (public), `cocapn/config.yml` (private)
- Schemas: `*.schema.json` for all JSON structures
- Agents: `[name].agent.ts` or `[name].agent.yml`
- Modules: `module.yml` in each submodule

## Critical Constraints
1. NEVER store unencrypted secrets in Git (use age encryption)
2. ALWAYS maintain Git as source of truth (cloud is cache only)
3. MUST work offline (local bridge functions without Cloudflare)
4. WebSocket port 8787 (local), fallback to wss://tunnel.cocapn.io

## Phase 1 Status: COMPLETE
Local bridge, UI, protocols (MCP+A2A), security (age/JWT/audit), module system, and onboarding wizard are all implemented and tested.

## Current Phase: Phase 2 — Agent Intelligence & Community UX
See `docs/ROADMAP.md` for full details. Work items in priority order:

1. **2.1** `create-cocapn` — standalone `npx create-cocapn` scaffolder package at `packages/create-cocapn/`. Shared init logic extracted to `packages/local-bridge/src/init/`.
2. **2.2** `Brain` — `packages/local-bridge/src/brain/` class with `getSoul/getFact/setFact/searchWiki/createTask`. Auto-commits on mutation. CLI `cocapn-brain` sub-commands.
3. **2.3** `Router` — Extend `BridgeServer` to parse `/claude`, `/copilot`, `/pi` prefixes and apply implicit content-based routing. Config-overridable in `cocapn/config.json`.
4. **2.4** Chat customization — `install-module` / `change-skin` WebSocket types; preview branches; `/modules` UI route.
5. **2.5** A2A peers — `/.well-known/cocapn/peer` endpoint; `GET /api/peer/fact`; cross-domain intent detection in Router.
6. **2.6** Polish — Vitest coverage, GitHub Actions CI/CD, structured logging (`Logger`), `SECURITY.md`, fix PAT-in-remote-URL and `secret:KEY` ref resolution.

## Active Architectural Decisions
- `Brain` lives at `packages/local-bridge/src/brain/` (not inside `ws/` or `agents/`)
- `Router` (chat command parser) lives at `packages/local-bridge/src/ws/router.ts` — distinct from `AgentRouter` (capability matcher) at `agents/router.ts`
- `create-cocapn` must have ZERO dependency on the full bridge — only imports `src/init/`
- `cocapn-brain` CLI is a separate binary entry point (same package as `cocapn-bridge`)
- A2A peer auth uses the same fleet JWT already in `security/jwt.ts`

## When to Ask
- When modifying protocol interfaces (MCP/A2A)
- When adding new storage backends (must justify why not Git)
- When changing encryption strategy
- When `Brain.setFact` / `createTask` commit format diverges from `"update memory: <action>"`
- When Router intent detection needs an LLM call (should stay regex/heuristic for offline use)
