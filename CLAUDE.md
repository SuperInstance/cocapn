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

## Current Task
We are migrating from a Cloudflare-only architecture to a hybrid repo-first system. The first phase extracts shared protocols, then builds the local bridge, then integrates with existing cloud agents.

## When to Ask
- When modifying protocol interfaces (MCP/A2A)
- When adding new storage backends (must justify why not Git)
- When changing encryption strategy
- When uncertain about domain skinning implementation
