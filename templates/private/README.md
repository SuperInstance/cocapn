# {{username}}-brain — Cocapn Private Repo

This is the **private**, encrypted memory store for your Cocapn agent OS.
It never contains plain-text secrets — everything sensitive is age-encrypted
before being committed.

> **Keep this repo private.** The `.gitignore` is configured to block common
> plaintext secret files, but you are responsible for never committing
> unencrypted data.

## Structure

```
.
├── cocapn/
│   ├── soul.md             # Agent personality & operating principles
│   ├── config.yml          # Bridge configuration (port, sync, encryption)
│   ├── agents/             # *.agent.yml definitions (loaded by bridge)
│   ├── memory/
│   │   ├── facts.json      # Structured facts (confidence-rated)
│   │   ├── procedures.json # Reusable agent procedures
│   │   └── relationships.json # Entity relationship map
│   ├── wiki/
│   │   └── README.md       # Human-readable knowledge base root
│   ├── tasks/
│   │   └── active.json     # Current task queue
│   └── messages/
│       └── coordination.jsonl # Agent-to-agent coordination log (NDJSON)
└── secrets/                # age-encrypted secret files (*.age)
    └── .gitkeep
```

## Starting the bridge

```bash
npx cocapn-bridge --repo .
```

Options:

| Flag | Default | Description |
|---|---|---|
| `--port <n>` | `8787` | WebSocket listen port |
| `--tunnel` | off | Expose via Cloudflare Tunnel |
| `--no-auth` | off | Disable GitHub PAT auth (local-only) |

## Secrets

Store secrets as `KEY=VALUE` lines in a plaintext file, encrypt it with age,
then commit the `.age` file:

```bash
# Generate an age identity (once)
age-keygen -o ~/.config/cocapn/identity.age

# Encrypt a secrets file
age -R ~/.config/cocapn/identity.age.pub -o secrets/env.age secrets/env.txt
rm secrets/env.txt   # never commit the plaintext

git add secrets/env.age
git commit -m "Add encrypted env secrets"
```

The bridge decrypts secrets at startup and injects them as environment
variables into spawned agents.

## Soul

`cocapn/soul.md` is injected as the `COCAPN_SOUL` environment variable for
every spawned agent. Edit it to shape agent behaviour, personality, and
operating constraints.

## Memory

The `cocapn/memory/` files are plain JSON — the bridge watches for changes and
auto-commits them. Agents can read and write memory via the FILE_EDIT message
type over the WebSocket.

## Sync

The bridge pulls from `origin` every 30 seconds and auto-commits local changes.
Configure this in `cocapn/config.yml`:

```yaml
sync:
  interval: 30
  memoryInterval: 60
  autoCommit: true
  autoPush: true
```
