# CLAUDE.md — Life Admin Integration

This is a Cocapn starter template for a personal operations assistant. When
working on this template, follow these conventions.

## Template Purpose

Life Admin helps people manage daily life: calendars, tasks, habits, bills,
travel, and household logistics. It is warm, proactive, and private. Every
feature should reduce cognitive load and feel human.

## Development Conventions

- TypeScript strict mode with ESM (`"type": "module"`)
- No JSX. Use Preact + HTM for any UI components
- All content in soul.md uses the standard Cocapn frontmatter + markdown format
- Config uses YAML with the standard bridge config structure
- Memory files (facts.json, memories.json) follow Brain Memory schema
- Wiki files are plain markdown with frontmatter
- Plugin manifests follow the Cocapn plugin.json schema

## File Responsibilities

- `soul.md` — Personality, identity, memory priorities. Edit this to change who
  the assistant is and what it cares about.
- `config.yml` — Bridge configuration. Controls LLM provider, features, plugins,
  scheduling, and capability flags.
- `theme.css` — CSS custom properties only. No component styles. Consumers apply
  these variables to their own component library.
- `wiki/` — Knowledge articles the assistant can reference. Keep them practical
  and actionable, not theoretical.
- `knowledge/routines.json` — Structured routine templates that the assistant
  uses for daily/weekly planning.
- `plugins/` — Each plugin has a `plugin.json` manifest and `README.md` docs.
  No code — these declare capabilities that the bridge implements.

## Content Guidelines

- Write for real people with real lives. No marketing language.
- Wiki articles should be 30+ lines of useful content with concrete steps.
- Soul.md personality traits should be specific and distinctive, not generic AI.
- Example facts and memories should feel like real user data (anonymized).
- Plugin descriptions should explain what the plugin does and how to configure it.

## Testing Changes

```bash
# From the cocapn monorepo root
cd packages/local-bridge
npx vitest run

# Type check
npx tsc --noEmit
```

## Template Installation

This template is installed via:
```bash
npx create-cocapn --template life-admin
```

The scaffolding process copies these files into the user's private brain repo
and initializes the memory stores with starter data.

## Modifying This Template

When adding features:

1. Add the capability flag to `config.yml` under `features`
2. Document the feature in `soul.md` under "What You Do"
3. Add relevant wiki content if the feature has methodology
4. Update plugin manifests if the feature is plugin-driven
5. Add example data to memory files so the template demonstrates the feature
6. Update README.md with the new use case

## Known Limitations

- This template uses DeepSeek by default. Users can swap providers in config.yml.
- Calendar sync, habit tracking, and bill reminders are plugin capabilities that
  require the bridge to be running with the relevant plugins loaded.
- No direct integration with external services (Google Calendar, banks, etc.)
  without additional MCP server configuration.
