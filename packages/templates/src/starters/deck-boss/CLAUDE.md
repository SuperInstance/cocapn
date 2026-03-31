# CLAUDE.md -- Deck Boss Starter Integration

> Instructions for Claude Code when working with this commercial fishing operations starter.

## What This Is

This is a complete Cocapn commercial fishing operations agent starter configured for vessel management, quota tracking, crew scheduling, and regulatory compliance. It includes a soul.md personality, operational wiki, safety protocols, species references, regulatory guides, equipment maintenance procedures, crew management documentation, and three plugins (quota-tracker, crew-scheduler, maintenance-log).

## Key Directories

- `soul.md` -- The agent personality. Edit this to change tone, expertise, fishery focus, or operational philosophy.
- `config.yml` -- Bridge configuration. LLM provider, capabilities, feature flags.
- `cocapn/memory/` -- Pre-populated vessel facts and example operational memories. The agent reads and writes here.
- `wiki/` -- Knowledge base organized by operations, safety, species, regulations, equipment, and crew.
- `knowledge/` -- Structured JSON data files for programmatic access (quotas, maintenance schedules).
- `plugins/` -- Three built-in plugins with their own configs and schemas.

## Conventions

- All markdown files use standard GitHub-Flavored Markdown.
- JSON files must be valid and well-formed. Use arrays for collections, objects for single records.
- Species names use common names as headers (e.g., "Pacific Halibut") with scientific names in the content.
- Regulatory references include the agency and section number (e.g., 50 CFR 679).
- Weights in pounds, lengths in inches, distances in nautical miles, depths in fathoms.
- Temperatures in Fahrenheit for user-facing content, Celsius acceptable in technical data.
- Times in 24-hour format for operational schedules.
- The soul.md frontmatter must remain valid YAML between the `---` delimiters.
- No sugarcoating. If something is wrong, the agent flags it directly.

## Memory Structure

`cocapn/memory/facts.json` is a flat key-value object. Keys use dot notation for namespacing:
- `vessel.*` -- Vessel-specific facts (name, documentation number, length, tonnage, home port)
- `permit.*` -- Permit and license information (IFQ permit, observer coverage, safety exam dates)
- `crew.*` -- Crew complement and qualification facts
- `season.*` -- Seasonal information (open dates, closures, TAC allocations)
- `gear.*` -- Gear inventory, configuration, and condition

`cocapn/memory/memories.json` is an array of typed entries with confidence scores that decay over time. High-confidence entries (0.9+) are explicit user statements or verified data. Lower scores (0.7) are inferred patterns from operational history.

## Plugin Architecture

Each plugin lives in `plugins/<name>/` with:
- `plugin.json` -- Name, version, description, commands, capabilities, and permissions
- `README.md` -- Documentation for the plugin

Plugins are referenced in `config.yml` under the `plugins:` array. They activate based on command patterns in the `commands` field.

## When Modifying This Starter

- If adding new species, add both a wiki page AND an entry in knowledge/quota-data.json
- If adding new regulations, cite the CFR section and include a note to verify with NOAA Fisheries
- If adding new equipment, add both the maintenance procedure AND a tracking entry in knowledge/maintenance-schedule.json
- If changing the personality, test that the tone still reads as no-nonsense and safety-obsessed
- All new files must have real, substantive content -- no placeholder text
- When documenting procedures, write them as if a new greenhorn needs to follow them step by step

## Content Tone

Commercial fishing is dangerous work done by professionals. The content should reflect that:
- Direct language, no filler
- Safety procedures written clearly and completely
- Numbers over adjectives
- Practical over theoretical
- Respect for the work and the people who do it
