# Brain: Memory System

The Brain module gives every Cocapn instance persistent, structured memory stored entirely in the private Git repo. Every mutation is auto-committed so your memory has a full audit trail — `git log cocapn/` is a changelog of your brain.

## soul.md

`cocapn/soul.md` is the identity file for your instance. It is injected into every spawned agent as the `COCAPN_SOUL` environment variable. Think of it as a persistent system prompt that travels with every conversation.

```markdown
<!-- cocapn/soul.md -->
You are a focused maker. You value shipping over perfection.
You track habits, log work, and surface blockers proactively.
```

Agents can append to the soul for a specific session via the `soulAppend` field in their YAML definition (see [agents.md](agents.md)).

## Facts

`cocapn/memory/facts.json` is a flat key-value store — `Record<string, string>`. Use it for atomic, frequently-queried values like user name, timezone, or preferences.

```json
{
  "user.name": "Alex",
  "user.timezone": "America/Los_Angeles",
  "project.current": "cocapn"
}
```

### API

```typescript
const brain = new Brain(repoRoot);
await brain.getFact("user.name");           // "Alex" | undefined
await brain.setFact("user.name", "Jordan"); // commits "update memory: set fact user.name"
await brain.deleteFact("user.name");        // commits "update memory: delete fact user.name"
```

Every `setFact` and `deleteFact` call writes the JSON file and commits the change with the message `update memory: <action>`.

## Wiki

`cocapn/wiki/` contains Markdown pages. Pages are indexed by filename; the title is the first `# Heading` in the file.

```
cocapn/wiki/
├── project-cocapn.md
├── research/
│   └── quantum-computing.md
└── journal/
    └── 2026-03-27.md
```

### API

```typescript
await brain.searchWiki("quantum");
// returns WikiPage[]  { path, title, content, mtime }

await brain.getWikiPage("research/quantum-computing");
// returns WikiPage | undefined

await brain.writeWikiPage("research/quantum-computing", "# Quantum Computing\n...");
// commits "update memory: wiki research/quantum-computing"
```

## Tasks

`cocapn/tasks/` contains one Markdown file per task. The filename is a slugified, timestamped ID. Frontmatter stores status, priority, and due date.

```markdown
---
id: task-1711584000-ship-brain-docs
status: open
priority: high
due: 2026-04-01
---

# Ship brain docs

Write and merge docs/brain.md before the v0.2 release.
```

### API

```typescript
await brain.createTask({ title: "Ship brain docs", priority: "high", due: "2026-04-01" });
// commits "update memory: create task ship-brain-docs"

await brain.listTasks({ status: "open" });
// returns Task[]  { id, title, status, priority, due, content }

await brain.updateTask("task-1711584000-ship-brain-docs", { status: "done" });
// commits "update memory: update task ship-brain-docs"
```

## Auto-commit behavior

Every Brain mutation:

1. Writes the file(s) to the repo.
2. Stages the changed paths with `git add`.
3. Commits with the message `update memory: <action>` (e.g. `update memory: set fact user.name`).

No push happens automatically — the Git sync module handles push on its own schedule. This means the repo is always internally consistent even when offline.

## COCAPN_CONTEXT env var

When the bridge spawns an agent subprocess it serializes a snapshot of Brain state into `COCAPN_CONTEXT` as JSON:

```json
{
  "soul": "<contents of cocapn/soul.md>",
  "facts": { "user.name": "Alex", "project.current": "cocapn" },
  "recentTasks": [
    { "id": "task-…", "title": "Ship brain docs", "status": "open" }
  ]
}
```

Agents can parse this at startup to bootstrap context without additional Git reads:

```typescript
const ctx = JSON.parse(process.env["COCAPN_CONTEXT"] ?? "{}");
const userName = ctx.facts?.["user.name"] ?? "friend";
```

## CLI reference

### Facts

```bash
cocapn-brain fact set user.name "Alex"
cocapn-brain fact get user.name
cocapn-brain fact list
cocapn-brain fact delete user.name
```

### Wiki

```bash
cocapn-brain wiki add research/quantum-computing "# Quantum Computing\n..."
cocapn-brain wiki search "quantum"
cocapn-brain wiki get research/quantum-computing
```

### Tasks

```bash
cocapn-brain task add "Ship brain docs" --priority high --due 2026-04-01
cocapn-brain task list
cocapn-brain task list --status open
cocapn-brain task done task-1711584000-ship-brain-docs
```

## Example session

```bash
# Set a fact
$ cocapn-brain fact set project.current cocapn
✔  committed: update memory: set fact project.current

# Query it back
$ cocapn-brain fact get project.current
cocapn

# Add a wiki page
$ cocapn-brain wiki add journal/2026-03-27 "# March 27\n\nShipped brain docs today."
✔  committed: update memory: wiki journal/2026-03-27

# Search wiki
$ cocapn-brain wiki search "shipped"
journal/2026-03-27  March 27

# Create a task
$ cocapn-brain task add "Write release notes" --priority high
✔  committed: update memory: create task write-release-notes

# List open tasks
$ cocapn-brain task list --status open
ID                                        TITLE                PRIORITY  DUE
task-1711584000-write-release-notes       Write release notes  high      —

# Check git log
$ git -C ~/my-makerlog-brain log --oneline cocapn/
a1b2c3d update memory: create task write-release-notes
e4f5g6h update memory: wiki journal/2026-03-27
i7j8k9l update memory: set fact project.current
```
