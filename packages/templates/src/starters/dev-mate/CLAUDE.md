# CLAUDE.md — Dev Mate Integration for Claude Code

> This file tells Claude Code (and other agentic tools) how to work with this project.

## Project Context

This is a **Dev Mate** Cocapn starter — a software developer assistant that lives in the repository. The brain (private repo) contains personality, memory, and configuration. The face (public repo) contains the frontend application.

## Key Conventions

### Code Style
- TypeScript strict mode everywhere (`"strict": true`)
- ESM modules (`"type": "module"`)
- Imports use `.js` extension for ESM resolution: `import { foo } from './bar.js'`
- 2-space indentation, no semicolons for consistency
- Single quotes for strings, double quotes for JSON

### Commit Messages
Follow Conventional Commits:
```
type(scope): description

[optional body]

[optional footer]
```
Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`

### Branching
- `main` — stable, deployable
- `feat/description` — new features
- `fix/description` — bug fixes
- `refactor/description` — code reorganization

### Testing
- Vitest for unit and integration tests
- Playwright for E2E tests
- Tests colocated in `tests/` directories
- Every new function or module must include tests
- Run full suite before submitting: `npx vitest run`

### Security
- Never commit secrets, API keys, or tokens
- Use `cocapn secret set` for credential storage
- Flag any `private.*` facts that should not leave the private repo
- Validate all external inputs
- Use parameterized queries for database access

## File Organization

```
dev-mate/
├── soul.md              # Agent personality (edit to change behavior)
├── config.yml            # Runtime configuration
├── theme.css             # UI theme (Monokai-inspired dark)
├── cocapn/
│   └── memory/
│       ├── facts.json    # Key-value facts about the developer/project
│       └── memories.json # Typed conversation memories
├── wiki/
│   ├── patterns/         # Design patterns reference
│   ├── git/              # Git workflow guides
│   ├── testing/          # Testing strategies
│   ├── architecture/     # System design decisions
│   └── devops/           # CI/CD and deployment
├── knowledge/
│   └── code-snippets.json # Reusable code patterns
├── plugins/
│   ├── code-reviewer/    # Code review automation
│   ├── git-helper/       # Git workflow assistance
│   └── doc-generator/    # Documentation generation
└── .github/
    └── workflows/
        └── cocapn.yml    # CI pipeline
```

## How to Modify Behavior

1. **Change personality** — Edit `soul.md`. The YAML frontmatter controls tone and model settings. The markdown body defines knowledge and behavior.
2. **Change capabilities** — Edit `config.yml`. Toggle features, adjust LLM parameters, manage plugins.
3. **Change appearance** — Edit `theme.css`. All colors use CSS custom properties.
4. **Add knowledge** — Add files to `wiki/` or entries to `knowledge/code-snippets.json`.
5. **Add automation** — Add plugins to `plugins/` and register them in `config.yml`.

## Memory System Rules

- `facts.json` — Flat key-value pairs. Use namespaces: `dev.preferredLanguage`, `team.convention`.
- `memories.json` — Typed entries with timestamps and confidence scores. Confidence decays over time unless reinforced.
- New facts should use the `dev.` namespace prefix for consistency.
- Private facts (personal preferences, team names) use `private.*` prefix and never leave this repo.

## Plugin Development

Plugins follow this structure:
```
plugins/my-plugin/
├── plugin.json   # Name, version, description, hooks, permissions
└── README.md     # What it does, configuration, usage
```

Plugin hooks available:
- `pre-commit` — Run before Git commits
- `post-commit` — Run after Git commits
- `on-message` — Intercept chat messages
- `on-review` — Augment code review output
- `scheduled` — Cron-based execution

## Interaction Guidelines

When working in this repository:

1. **Check memory first.** Before answering a question, check `cocapn/memory/facts.json` and `wiki/` for existing context.
2. **Update memory after learning.** When new information is established (decisions, patterns, preferences), write it to the appropriate store.
3. **Respect the soul.** All responses should align with the personality defined in `soul.md`.
4. **Test everything.** Any code change should include or reference a test.
5. **Document decisions.** Use ADR format for architectural choices. Store in `wiki/architecture/`.

## Common Commands

```bash
# Type check all packages
npx tsc --noEmit

# Run tests
npx vitest run

# Run single test file
npx vitest run tests/brain.test.ts

# Start the bridge
cocapn start

# Check bridge status
cocapn status

# Set a secret
cocapn secret set API_KEY_NAME

# Install a plugin
cocapn plugin install plugin-name
```
