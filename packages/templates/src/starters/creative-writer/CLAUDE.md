# CLAUDE.md -- Creative Writer Starter

> Instructions for Claude Code when working with this creative-writer cocapn starter.

## What This Is

This is a **Cocapn writing companion** starter. The repo IS the agent. The agent is a literary coach that helps writers with plotting, character development, worldbuilding, dialogue, and revision. It runs locally and keeps all unpublished work private.

## Architecture

- `soul.md` -- The agent's personality, knowledge, and behavioral rules. Edit this file to change who the agent is.
- `config.yml` -- Bridge configuration: LLM provider, plugins, features, memory settings.
- `theme.css` -- Visual identity: burgundy/cream/ink-blue palette, serif typography.
- `cocapn/memory/` -- Persistent memory stores (facts, memories) that survive across sessions.
- `wiki/` -- Craft knowledge base (story structure, character development, etc.) the agent can reference.
- `knowledge/` -- Structured data the agent uses (plot templates, genre conventions).
- `plugins/` -- Extendable modules: story-planner, character-bible, word-counter.

## Working Conventions

- **Never write the story for the writer.** The agent collaborates; it does not ghostwrite. All prose on the page must be the human author's.
- **Craft-based feedback only.** Every critique should reference a specific craft principle, not personal taste.
- **Ask before advising.** The agent asks clarifying questions before prescribing solutions.
- **Respect genre boundaries.** Literary fiction is not superior to genre fiction. Every genre has its own craft standards.
- **Memory is sacred.** The agent remembers character details, plot decisions, worldbuilding rules, and writer preferences. It never contradicts established facts without acknowledging the change.

## File Formats

- **soul.md** -- YAML frontmatter + Markdown body with sections: Identity, Personality, What You Do, What You Know, What You Don't Do, Memory Priorities, Public Face.
- **facts.json** -- Flat key-value pairs. Keys are namespaced: `writing.genre`, `writing.currentProject`, `writing.wordGoal`, etc.
- **memories.json** -- Array of typed entries: `{ type, content, confidence, timestamp, tags }`.
- **wiki/*.md** -- Standard Markdown. The agent references these during conversations.
- **knowledge/*.json** -- Structured data (plot templates, genre checklists) the agent can query.
- **plugins/*/plugin.json** -- Plugin manifest: name, version, description, commands, permissions.

## Memory Management

- `facts.json` stores explicit writer preferences and project state. Updated when the writer confirms a preference or makes a project decision.
- `memories.json` stores conversational context: feedback given, ideas explored, blocks discussed. Confidence decays over time (see soul.md Memory Priorities).
- `wiki/` is the craft reference library. It does not decay. It grows as the agent learns the writer's specific needs.
- Maximum 2000 memory entries. When the limit is reached, lowest-confidence entries are pruned.

## Plugin Development

Each plugin lives in `plugins/<name>/` with:
- `plugin.json` -- Manifest with name, version, description, commands, and permissions.
- `README.md` -- Documentation for the plugin's features and commands.

To add a new plugin:
1. Create the directory and files.
2. Add the plugin name to the `plugins:` list in `config.yml`.
3. The bridge loads plugins on next startup.

## Privacy

- All unpublished manuscript content stays in the private repo.
- `private.*` facts never leave the local bridge.
- The agent does not share, redistribute, or train on a writer's work.
- Draft history is committed to git (local only unless `autoPush` is enabled).

## Key Commands

- `cocapn start` -- Start the local bridge with this agent.
- `cocapn wiki search <term>` -- Search the craft wiki.
- `cocapn memory list` -- Show all stored facts and memories.
- `cocapn plugin list` -- List loaded plugins.
- `cocapn export --format markdown` -- Export current project notes.
