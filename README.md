# cocapn

A lightweight agent runtime. Run an AI agent from a repository.

[![Live](https://img.shields.io/badge/playground-live-7c3aed?style=flat-square)](https://cocapn-ai.casey-digennaro.workers.dev)
[![Fleet](https://img.shields.io/badge/the-fleet-60%2B%20vessels-3b82f6?style=flat-square)](https://the-fleet.casey-digennaro.workers.dev)
[![MIT](https://img.shields.io/badge/license-MIT-1FCB58?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/typescript-pure-3178C6?style=flat-square)]()

---

You might have built agent prototypes that depended on a framework's hosted runtime. When the platform changed, your work broke.

This is a different approach.

---

## What it does

Cocapn provides a kernel to run an AI agent from your repository. The agent's code, memory, and state are managed through git. You control the deployment environment and the model.

- ~500-line runtime kernel that operates on a git repository
- Equipment protocol for sharing modules between agents without a central registry
- Fleet coordination for lightweight discovery and events
- No mandatory databases or control plane

This is a pattern you can adapt. Fork it and modify the code to fit your needs.

## Key differences

| Typical Agents | Cocapn |
|---|---|
| State in external databases | State tracked in git |
| Configures an external runtime | Runtime lives in your repo |
| Requires specific orchestration | Runs on git hosts and CI |
| Platform upgrade risks | You manage dependencies |
| Tied to a service | Use any LLM provider |

You can run this on Cloudflare Workers, Git providers, Docker, or embed it in an application. The agent's behavior is defined by your code.

---

## Quick start

Clone and deploy to Cloudflare Workers:

```bash
git clone https://github.com/Lucineer/cocapn.git
cd cocapn
npx wrangler deploy
```

**Or start with a minimal version:** [cocapn-lite](https://github.com/Lucineer/cocapn-lite) (200 lines, no dependencies).

**Try the playground:** [cocapn playground](https://cocapn-ai.casey-digennaro.workers.dev) (no signup, 5 free messages).

---

## How it works

Instead of configuring a remote agent service, you run an agent from your own codebase. The repository holds the agent's instructions, memory (via git history), and tools. You deploy it like any other application.

A limitation: this model requires familiarity with git and deployment workflows. It is not a managed service.

## Equipment

Shared modules that agents can load directly from each other, including a trust engine, cache, PII guard, and event system. No package manager is required.

[View the equipment catalog](https://github.com/Lucineer/cocapn-equipment)

## Architecture: VESAS

1. **Vessel**: The agent instance, defined by its repository.
2. **Equipment**: Modular capabilities shared between vessels.
3. **Self**: The agent's identity and memory, stored in git.
4. **Arena**: A shared space for vessels to interact.
5. **Spire**: The runtime kernel that coordinates the vessel.

Each vessel operates independently. The fleet provides optional coordination.

---

<div>
Part of the <a href="https://the-fleet.casey-digennaro.workers.dev">Fleet</a>. By <a href="https://cocapn.ai">Superinstance & Lucineer (DiGennaro et al.)</a>. MIT Licensed.
</div>