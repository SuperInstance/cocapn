# CLAUDE.md — Fishing Buddy Starter

> Instructions for Claude Code when working with this fishing agent starter.

## What This Is

This is a complete Cocapn fishing agent starter configured for Alaska Pacific Northwest fishing. It includes a soul.md personality, species wiki, technique guides, location references, regulation summaries, gear recommendations, and three plugins (catch-logger, tide-tables, weather-check).

## Key Directories

- `soul.md` — The agent personality. Edit this to change tone, expertise, or regional focus.
- `config.yml` — Bridge configuration. LLM provider, capabilities, feature flags.
- `cocapn/memory/` — Pre-populated facts and example memories. The agent reads and writes here.
- `wiki/` — Knowledge base organized by species, techniques, locations, regulations, gear, and tips.
- `knowledge/` — Structured JSON data files for programmatic access.
- `plugins/` — Three built-in plugins with their own configs and schemas.

## Conventions

- All markdown files use standard GitHub-Flavored Markdown.
- JSON files must be valid and well-formed. Use arrays for collections, objects for single records.
- Species names use common names as headers (e.g., "Pacific Halibut") with scientific names in the content.
- Locations reference real Alaska geography — no invented place names.
- Regulation data includes the disclaimer to verify with ADFG for current emergency orders.
- Weights in pounds, lengths in inches, depths in feet, distances in nautical miles (saltwater) or statute miles (freshwater).
- Temperatures in Fahrenheit for the user-facing content, Celsius acceptable in technical data.
- The soul.md frontmatter must remain valid YAML between the `---` delimiters.

## Memory Structure

`cocapn/memory/facts.json` is a flat key-value object. Keys use dot notation for namespacing:
- `user.*` — User-specific facts (location, boat, preferences)
- `season.*` — Seasonal information (run timing, ice conditions)
- `regulations.*` — Regulatory facts and deadlines
- `gear.*` — Gear inventory and preferences

`cocapn/memory/memories.json` is an array of typed entries with confidence scores that decay over time. High-confidence entries (0.9+) are explicit user statements. Lower scores (0.7) are inferred patterns.

## Plugin Architecture

Each plugin lives in `plugins/<name>/` with:
- `plugin.json` — Name, version, description, commands, and data schema
- `README.md` — Documentation for the plugin

Plugins are referenced in `config.yml` under the `plugins:` array. They activate based on command patterns in the `commands` field.

## When Modifying This Starter

- If adding new species, add both a wiki page AND an entry in knowledge/species-data.json
- If adding new locations, include GPS coordinates where appropriate and note access points
- If updating regulations, always include the ADFG verification disclaimer
- If changing the personality, test that the tone still reads as knowledgeable and helpful
- All new files must have real, substantive content — no placeholder text
