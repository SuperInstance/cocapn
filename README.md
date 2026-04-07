# Cocapn ⛵

You run an AI agent directly from a git repository. The repo serves as its memory, its skill set, and its permanent home. Your instance can track over 60 active vessels via a live public fleet dashboard.

[![Playground](https://img.shields.io/badge/playground-live-7c3aed?style=flat-square)](https://cocapn-ai.casey-digennaro.workers.dev)
[![Fleet](https://img.shields.io/badge/the-fleet-60%2B%20vessels-3b82f6?style=flat-square)](https://the-fleet.casey-digennaro.workers.dev)
[![MIT](https://img.shields.io/badge/license-MIT-1FCB58?style=flat-square)](LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-gray?style=flat-square)]()

---

## Why This Exists

Most agent frameworks require you to run your bot on a rented platform. You shouldn't need an API key, a subscription, or a hosted orchestrator just to run something you built. This is code that lives where you put it.

---

## Quick Start

1.  **Fork** this repository.
2.  **Deploy** to Cloudflare Workers in under a minute:
    ```bash
    git clone https://github.com/Lucineer/cocapn.git
    cd cocapn
    npx wrangler deploy
    ```
3.  Edit any file in your fork. Your agent updates on the next request.

For a minimal version, see [cocapn-lite](https://github.com/Lucineer/cocapn-lite) (~200 lines).

---

## How It Works

The runtime kernel executes against your git repository. Your commit history functions as long-term memory. The codebase defines executable skills. You deploy this as a standalone application.

---

## Key Differences

1.  **No Hosted Control Plane:** Your agent never phones home. You control its entire lifecycle.
2.  **Code as Configuration:** You don't configure agents with YAML or web forms. You write and commit code.
3.  **Direct Communication:** Agents can communicate and share tools if they know each other's endpoints, without a central registry.

---

## Features

*   **Repo-First Agent:** Instructions, state, and tools evolve with your git history.
*   **Git as Infrastructure:** No separate database required; audit logs are inherent.
*   **Cross-Agent Protocol:** Load modules between running agents directly.
*   **Fleet Coordination:** Lightweight event passing between deployed vessels.
*   **Designed for Cloudflare Workers:** Runs on the edge. Can be adapted for other environments.
*   **Zero Dependencies:** Pure TypeScript.
*   **Fork-First:** You own every line. Adapt the pattern completely.

---

## A Specific Limitation

Each agent runs within Cloudflare Workers' constraints, which limits CPU-intensive tasks to roughly 10ms of compute time per request. This makes it ideal for coordination, tool use, and logic, but not for heavy processing.

---

<div style="text-align:center;padding:16px;color:#64748b;font-size:.8rem"><a href="https://the-fleet.casey-digennaro.workers.dev" style="color:#64748b">The Fleet</a> &middot; <a href="https://cocapn.ai" style="color:#64748b">Cocapn</a></div>