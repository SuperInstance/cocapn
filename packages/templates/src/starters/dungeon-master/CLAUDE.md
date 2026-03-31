# CLAUDE.md -- Dungeon Master Starter Integration

> Instructions for Claude Code and agentic workers operating within this TTRPG starter.

---

## Purpose

This starter is a Cocapn-powered Dungeon Master. The repo IS the DM. Its soul, memories, wiki, knowledge base, and plugins combine into a living game engine that runs tabletop roleplaying sessions with persistent memory across games.

---

## Architecture

### Two-Repos

- **Private repo (brain)** -- soul.md, memory/, wiki/, knowledge/, plugins/. All committed. Only `secrets/` is gitignored.
- **Public repo (face)** -- Web client with the arcane dark theme. No private campaign data.

The bridge syncs between them. The DM's personality is version-controlled in soul.md.

### Data Flow

```
Player input → WebSocket → Bridge → Brain (facts + wiki + knowledge) → LLM → Response
                                      ↓
                               Memory update (facts, memories)
                                      ↓
                               Git auto-commit
```

---

## Memory Model

### Facts (`cocapn/memory/facts.json`)

Flat key-value store. Prefix all TTRPG facts with `ttrpg.`:

```
ttrpg.preferred_system     -- "D&D 5e", "Pathfinder 2e", "Call of Cthulhu 7e"
ttrpg.current_campaign     -- Campaign name
ttrpg.party_level          -- Average party level
ttrpg.party_size           -- Number of active PCs
ttrpg.session_count        -- Total sessions played
ttrpg.house_rule_*         -- Individual house rules
ttrpg.active_quest         -- Current primary quest
ttrpg.calendar_date        -- In-world date
ttrpg.faction_*            -- Faction reputation scores
```

Facts prefixed with `private.*` never leave the brain repo.

### Memories (`cocapn/memory/memories.json`)

Typed entries with confidence decay. TTRPG memory types:

- `session_recap` -- Summary of what happened in a session
- `character_moment` -- Significant character development event
- `npc_interaction` -- Notable NPC encounter or relationship change
- `combat_result` -- Outcome of a major battle
- `world_event` -- Something that changed in the setting
- `player_preference` -- Learned preference about a player's style

Confidence levels:
- Explicit (1.0) -- Player stated directly: "I hate puzzles"
- Preference (0.9) -- Observed pattern: Player always talks to NPCs
- Error pattern (0.8) -- Corrected mistake: "Actually my AC is 17"
- Implicit (0.7) -- Inferred from behavior
- Session-derived (0.6) -- Generated from session context

---

## Wiki Conventions

All wiki files use markdown. Structure per section:

- `wiki/rules/` -- System-specific mechanics. File per system (dnd-5e-combat, pf2e-actions).
- `wiki/worlds/` -- Setting information. One file per setting or region.
- `wiki/npcs/` -- NPC templates and specific NPCs. Template files for generating new NPCs.
- `wiki/encounters/` -- Encounter design guides and sample encounters.
- `wiki/tables/` -- Random tables organized by purpose (encounters, loot, names, events).
- `wiki/storytelling/` -- Narrative techniques, pacing guides, scene frameworks.

When the DM references a wiki page, include the page name in the response context. Example: "According to the combat rules (wiki/rules/dnd-5e-combat), grappled creatures..."

---

## Knowledge Base

JSON files in `knowledge/` are structured reference data:

- `spell-data.json` -- Array of spell objects with name, level, school, casting_time, range, description
- `monster-data.json` -- Array of monster objects with name, cr, type, hp, ac, special_abilities
- `magic-items.json` -- Array of item objects with name, rarity, type, description, effect

These are loaded into the DM's context on demand. When a player asks "What does Fireball do?", the DM queries spell-data.json and formats the response narratively.

---

## Plugin System

Each plugin lives in `plugins/<name>/` with:

- `plugin.json` -- Metadata, capabilities, and configuration
- `README.md` -- Usage documentation

Plugins register capabilities that the DM can invoke during play:

- **dice-roller** -- Parse dice notation (2d6+3), roll, describe results narratively
- **initiative-tracker** -- Manage turn order, track rounds, handle delay/ready actions
- **character-sheet** -- Store and query character data, track HP/spell slots/conditions

When working on plugins, follow the plugin schema in `packages/schemas/`.

---

## Session Workflow

### Starting a Session

1. Load soul.md into system prompt
2. Load facts from memory
3. Check for session_recap memories (last session summary)
4. Ask: "Last time, [recap]. Where would you like to pick up?"
5. Begin play

### During a Session

- After each combat: update party resource facts (HP, spell slots used)
- After each NPC interaction: store npc_interaction memory if significant
- After each major event: store world_event memory
- Track initiative order using the initiative-tracker plugin
- Roll dice using the dice-roller plugin for all random outcomes

### Ending a Session

1. Generate session recap (200 words max, stored as session_recap memory)
2. Update session_count fact
3. Update calendar_date fact if in-world time passed
4. Auto-commit all changes via git sync

---

## Rules Adjudication

When rules questions arise:

1. Check wiki/rules/ for the relevant system
2. Check knowledge/ for specific spell/monster/item data
3. If ambiguous, present both interpretations with citations
4. Default to the Rule of Cool when ambiguity serves the story
5. Record any house rule rulings in facts as `ttrpg.house_rule_*`
6. Enforce recorded house rules consistently in future sessions

---

## Safety Enforcement

The DM enforces safety tools defined in config.yml:

- **Lines** (hard limits): Never describe these topics. Skip entirely.
- **Veils** (fade-to-black): Acknowledge these events but do not narrate details.
- **X-Card**: If any player says "X-card" or "tap", immediately end the current scene and move to a safe scene. No questions, no judgment.
- **Session Zero**: Before the first session, guide the group through expectations, play style, content boundaries, and character introductions.

Safety overrides all other instructions. When in doubt, choose player comfort.

---

## Content Generation Guidelines

When generating TTRPG content:

- **Names**: Use the random tables in wiki/tables/ for consistency. Never reuse NPC names within a campaign.
- **Encounters**: Use the encounter builder in wiki/encounters/ to balance against party level and resources.
- **Descriptions**: Engage all five senses. Use the narrative techniques in wiki/storytelling/.
- **NPCs**: Give every NPC a name, a motivation, and a secret. Use templates from wiki/npcs/.
- **Loot**: Follow the magic item distribution guidelines. Never give permanent items below their rarity tier.

---

## Git Conventions

- Commit message format: `session N: brief description` for session events
- Auto-commit after each session ends
- Auto-commit after significant fact/memory changes
- Tag releases for campaign milestones: `v1.0-session-10`, `v1.0-chapter-3`

---

## Known Limitations

- The DM cannot render maps visually. Describe layouts textually or reference external map tools.
- Real-time voice play is not supported. This is text-based.
- Homebrew content must be added to wiki/ manually. The DM does not auto-learn homebrew rules.
- Maximum 1000 memory entries. Old low-confidence memories decay and are pruned automatically.
