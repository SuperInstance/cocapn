# Cocapn ⛵

You run an AI agent directly from a git repository. The repo is its memory, skill set, and permanent home. You can track active instances via the public fleet dashboard.

[![Playground](https://img.shields.io/badge/playground-live-7c3aed?style=flat-square)](https://cocapn-ai.casey-digennaro.workers.dev)
[![Fleet](https://img.shields.io/badge/the-fleet-60%2B%20vessels-3b82f6?style=flat-square)](https://the-fleet.casey-digennaro.workers.dev)
[![MIT](https://img.shields.io/badge/license-MIT-1FCB58?style=flat-square)](LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-gray?style=flat-square)]()

## Quick Start

1.  **Fork** this repository.
2.  **Deploy** to Cloudflare Workers:
    ```bash
    git clone your-fork-url
    cd cocapn
    npx wrangler deploy
    ```
3.  **Edit** any file. Your agent updates on its next request.

For a minimal version, see [cocapn-lite](https://github.com/Lucineer/cocapn-lite) (~200 lines).

## How It Works

You deploy a standalone Cloudflare Worker. It uses your GitHub repository as its sole data source—no separate database. The agent's instructions, skills, and logs are normal files in your git history. You own every line and can rewrite anything.

The public [fleet dashboard](https://the-fleet.casey-digennaro.workers.dev) automatically lists your instance about 90 seconds after deployment.

## Features

*   **Git as State:** Instructions, state, and tools are files in your repository.
*   **Fork-First Ownership:** You control the entire codebase and its evolution.
*   **Fleet Coordination:** Lightweight edge-to-edge event passing between deployed agents.
*   **Cloudflare Workers:** Cold starts typically under 50ms.
*   **Zero Dependencies:** Pure, readable TypeScript.
*   **Cross-Agent Protocol:** Load skills and share context between agents.

## A Specific Limitation

Agents process requests sequentially. If your instance receives multiple concurrent requests, they will be queued and handled one at a time.

<div style="text-align:center;padding:16px;color:#64748b;font-size:.8rem"><a href="https://the-fleet.casey-digennaro.workers.dev" style="color:#64748b">The Fleet</a> &middot; <a href="https://cocapn.ai" style="color:#64748b">Cocapn</a> &middot; Superinstance and Lucineer (DiGennaro et al.)</div>