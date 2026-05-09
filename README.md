# cocapn


## Meta

**Domain:** ai-agents
**Depends on:** —
**Depended by:** —
**Implements:** repo-first Agent for local or cloud. grow an agent in a repo using the repo itse...
**Related:** —


**The helm. Where the fleet lives, learns, and coordinates through one agent's conversations.**

Every agent in the fleet generates knowledge. [CCC](https://github.com/SuperInstance/CCC) — the 4th fleet vessel, running Kimi K2.5 on OpenClaw — talks on Telegram. Oracle1 harvests those conversations, turns them into PLATO tiles, and injects relevant context back before CCC answers. The system learns from every exchange.

This repo is the lens: focus, capture, broadcast.

---

## How It Works

```
CCC chats on Telegram (his viewport into the fleet)
    │
    ▼
CAPTURE   — Oracle1's cron harvests conversations
             → turns them into PLATO tiles (knowledge units)
    │
    ▼
INJECT    — Before CCC responds, relevant fleet knowledge
             is injected into his OpenClaw context window
    │
    ▼
GROW      — Every exchange makes the system smarter
             → next answer has better context
```

The key insight: CCC doesn't configure anything. He chats. He reasons. The system learns from him. The fleet infrastructure — shell composition, tile storage, cron harvesting — works around him automatically.

---

## Fleet Architecture

[Cocapn](https://github.com/SuperInstance) runs on a [fleet of 9 agents](https://github.com/SuperInstance/superinstance), each with a role:

- **[Oracle1](https://github.com/SuperInstance/oracle1)** — runs the infrastructure (cron, PLATO, gateway)
- **[Forgemaster](https://github.com/SuperInstance/forgemaster)** — builds Rust engines, CUDA benchmarks, constraint theory
- **[JetsonClaw1](https://github.com/SuperInstance/JetsonClaw1-vessel)** — edge GPU experiments, CUDA + ARM NEON
- **[CCC](https://github.com/SuperInstance/CCC)** — reasoning, writing, coordination (Kimi K2.5)
- **[others](https://github.com/SuperInstance/superinstance)** — each with specialized capability

The glue that holds them together:
- [PLATO](https://github.com/SuperInstance/plato-server) — room server for persistent memory
- [bootstrap-spark](https://github.com/SuperInstance/bootstrap-spark) — self-describing agent onboarding
- [cocapn-glue-core](https://github.com/SuperInstance/cocapn-glue-core) — Keeper↔Fleet binary wire protocol
- [bottle-protocol](https://github.com/SuperInstance/bottle-protocol) — git-native agent-to-agent messaging

---

## The Shell

Cocapn agents run in **[turbo-shells](https://github.com/SuperInstance/openclaw)** — portable contexts that contain structured knowledge, automated responses, and onboarding logic. A new agent walks into a running system and starts producing on first scoop. The levers are already there. The operator learns them by pulling.

When an operator outgrows the shell, [Zeroclaw](https://github.com/SuperInstance/zeroclaw-agent) reads the tile log, finds better onboarding, and inherits a better piece of equipment. The work improves. The fleet improves.

This is the [floating dojo](https://github.com/SuperInstance/superinstance). Not a training program — a working fleet.

---

## Related

- [superinstance](https://github.com/SuperInstance/superinstance) — the floating dojo, fleet overview
- [bootstrap-spark](https://github.com/SuperInstance/bootstrap-spark) — agent boot protocol
- [cocapn-glue-core](https://github.com/SuperInstance/cocapn-glue-core) — Keeper↔Fleet wiring
- [bottle-protocol](https://github.com/SuperInstance/bottle-protocol) — inter-agent messaging
- [casting-call](https://github.com/SuperInstance/casting-call) — which model plays which role

---

## License

MIT
