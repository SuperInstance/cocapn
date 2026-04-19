<div align="center">

# 🦀 Git Agent

**The repo-native agent that lives in git.**

[![Python](https://img.shields.io/badge/python-3.10+-blue)](https://python.org)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

*Part of [Cocapn](https://github.com/cocapn) — Agent Infrastructure for Intelligence.*

</div>

---

## What is Git Agent?

An AI agent that lives inside a git repository. The repo IS the agent — its identity, memory, and workspace all exist as files in the repo. Like a hermit crab in its shell.

```
my-agent/
├── STATE.md          # Working memory (short-term)
├── TASK-BOARD.md     # Intentions (what the agent plans to do)
├── work/             # Action (the agent's output)
├── for-fleet/        # Outbound bottles (to other agents)
├── from-fleet/       # Inbound bottles (from other agents)
└── git history       # Long-term memory (immutable)
```

## The Hermit Crab Pattern

The agent IS the crab. The repo IS the shell.

- **STATE.md** = what the crab is thinking right now
- **TASK-BOARD.md** = where the crab intends to go
- **work/** = what the crab is building
- **git history** = everything the crab has ever done
- **Fork** = the crab finds a new shell (same crab, new repo)

## Communication: Bottle Protocol

Agents communicate by dropping markdown files in `for-fleet/`:

```
for-fleet/BOTTLE-FROM-AGENT-NAME-2026-04-19-TOPIC.md
```

Push your repo, the next agent pulls and reads the bottle. No API needed. Git IS the message bus.

## For Agents

```yaml
git_agent_v1:
  type: repo_native_agent
  identity: "the repo IS the agent"
  memory: [STATE.md, git_history]
  communication: bottle_protocol
  fork: "new shell, same crab"
  install: "fork a template repo"
```

## License

MIT
