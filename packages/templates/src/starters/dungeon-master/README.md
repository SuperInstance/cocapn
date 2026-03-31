# Dungeon Master Starter

```
          .---.
         /     \
        | () () |
         \  ^  /
          |||||
          |||||
        .-'''''-.
       /  _   _  \
      | /  \ /  \ |
      | \0/ \0/ |
      |   | |   |
       \  ___  /
        '-----'

     DUNGEON  MASTER
     ================

        /\
       /  \
      / __ \
     / /  \ \
    / /    \ \
   /_/      \_\
   \   ____   /
    \  \__/  /
     \______/

   Roll for Initiative.
```

A Cocapn starter that turns your repo into a tabletop roleplaying game engine. Run campaigns, manage combat, track continuity, and build worlds -- all powered by your private brain repo and a public-facing web client.

---

## What It Does

This starter gives you a fully configured Cocapn agent that acts as your Dungeon Master. It comes preloaded with:

- **Combat Engine** -- Initiative tracking, turn order, legendary actions, lair actions, concentration checks, and HP management across multiple combatants.
- **Spell Lookup** -- A knowledge base of 10+ core spells with casting time, range, school, and description. Queryable in natural language during sessions.
- **Monster Reference** -- Stat blocks for 10+ creatures with CR, HP, AC, type, and special abilities. Ready for encounter building.
- **Magic Item Catalog** -- 10+ items across all rarity tiers with descriptions and mechanical effects.
- **Wiki System** -- Seven wiki documents covering combat rules, spell rules, the Greyhawk setting, NPC templates, encounter building, random tables, and narrative techniques.
- **Memory Layer** -- Persistent facts about your campaign (system, party level, current quest, house rules) and session memories that persist between games.
- **Three Plugins** -- Dice roller, initiative tracker, and character sheet manager, each with their own README and configuration.
- **Safety Tools** -- Lines and veils, X-card, session zero support, and content warnings built into the config.
- **Dark Arcane Theme** -- A purple-and-gold CSS theme with spell school colors, HP bar gradients, rarity-coded items, and dramatic typography.

---

## Quick Start

### Prerequisites

- Node.js 18+
- A Cocapn installation (`npm install -g cocapn`)
- An LLM API key (DeepSeek recommended, OpenAI and Anthropic also supported)

### Setup

```bash
# Clone or copy this starter
cp -r packages/templates/src/starters/dungeon-master ~/my-campaign
cd ~/my-campaign

# Initialize the brain repo
cocapn init --brain

# Set your API key (stored in OS keychain, never in git)
cocapn secret set DEEPSEEK_API_KEY

# Start the bridge
cocapn start --public ./public-repo
```

### First Session

1. Open the web client at `http://localhost:8787`
2. Tell the DM about your party: "We have a level 5 party with a fighter, wizard, cleric, and rogue."
3. Start playing: "We enter the dungeon. What do we see?"
4. The DM will track combat, remember NPCs, and maintain continuity automatically.

### Customizing Your Campaign

Edit `soul.md` to change the DM's personality and tone. The default is dramatic and fair, but you can make it more humorous, gritty, or rules-light.

Edit `cocapn/memory/facts.json` to set campaign-specific facts:

```json
{
  "ttrpg.current_campaign": "The Lost Mines of Phandelver",
  "ttrpg.party_level": 5,
  "ttrpg.house_rule_flanking": true
}
```

Add wiki pages to `wiki/` for your custom setting, homebrew rules, or session notes.

---

## Use Cases

### Running a Published Adventure

Load the adventure's key NPCs, locations, and plot points into the wiki. The DM will reference them during play, track which areas the party has visited, and adjust encounter difficulty based on party resources. Facts like `ttrpg.current_chapter` keep the narrative on track.

Example facts:
```json
{
  "ttrpg.current_chapter": 3,
  "ttrpg.visited_locations": ["Cragmaw Castle", "Thundertree", "Phandalin"],
  "ttrpg.active_npcs": ["Gundren Rockseeker", "Sildar Hallwinter"]
}
```

### Homebrew Campaign World Building

Create wiki pages for your setting's regions, factions, religions, and history. The DM uses these as reference material during sessions, maintaining consistency across a living world. Add entries to `wiki/worlds/` and `wiki/npcs/` for your custom content.

### West Marches Style Open Table

With multiple groups exploring the same sandbox, the memory layer tracks what each party has discovered, which areas are cleared, and what rumors are circulating. Faction reputation and timeline tracking keep the world coherent regardless of who is at the table.

### One-Shot Adventures

Quickly configure a standalone session by setting the party level, adventure theme, and time budget in facts. The DM generates appropriate encounters, scales monsters on the fly, and paces the session to fit within your time slot.

### Play-by-Post

The persistent memory and wiki system make this starter ideal for async play over days or weeks. The DM remembers what happened last, tracks pending actions, and provides rich narrative responses that keep the story moving between sessions.

### Rules Reference During In-Person Games

Run the DM on a laptop at the table as a rules lookup engine. Ask "What does Grappled do?" or "How much damage does a fireball deal?" and get instant, cited answers from the wiki and knowledge base.

### Campaign Planning Between Sessions

Use the DM to brainstorm encounter ideas, generate NPC backstories, build dungeon maps, and prepare session outlines. The wiki and knowledge base provide structured reference material, and the encounter builder plugin helps balance fights.

---

## File Structure

```
dungeon-master/
├── soul.md                          # DM personality and behavior
├── config.yml                       # Bridge configuration
├── theme.css                        # Dark arcane visual theme
├── README.md                        # This file
├── CLAUDE.md                        # Claude Code integration guide
├── package.json                     # Package metadata
├── cocapn/
│   └── memory/
│       ├── facts.json               # Campaign facts and preferences
│       └── memories.json            # Session memories
├── wiki/
│   ├── rules/
│   │   ├── dnd-5e-combat.md         # Combat rules reference
│   │   └── dnd-5e-spells.md         # Spellcasting rules reference
│   ├── worlds/
│   │   └── greyhawk.md              # Greyhawk setting guide
│   ├── npcs/
│   │   └── template-npcs.md         # NPC templates by role
│   ├── encounters/
│   │   └── encounter-builder.md     # Encounter design guide
│   ├── tables/
│   │   └── random-tables.md         # Random generation tables
│   └── storytelling/
│       └── narrative-techniques.md  # DM narrative methods
├── knowledge/
│   ├── spell-data.json              # Spell database (10+ entries)
│   ├── monster-data.json            # Monster database (10+ entries)
│   └── magic-items.json             # Magic item database (10+ entries)
├── plugins/
│   ├── dice-roller/                 # Dice rolling plugin
│   ├── initiative-tracker/          # Initiative management plugin
│   └── character-sheet/             # Character management plugin
└── .github/
    └── workflows/
        └── cocapn.yml               # CI/CD pipeline
```

---

## Supported Systems

| System | Support Level | Notes |
|--------|---------------|-------|
| D&D 5th Edition | Full | PHB, DMG, MM, Xanathar's, Tasha's, Mordenkainen's |
| Pathfinder 2nd Edition | Full | Three-action economy, proficiency tiers |
| Call of Cthulhu 7th Edition | Partial | Sanity, investigation, Chase rules |
| OSR (B/X, OSE) | Community | Via wiki pages and house rules |
| Custom/Homebrew | Configurable | Add rules to wiki, set system in facts |

---

## Safety Tools

This starter includes built-in safety tool support:

- **Lines and Veils** -- Configure hard limits (lines) and fade-to-black topics (veils) in session zero
- **X-Card** -- Any player can tap out of a scene at any time, no questions asked
- **Session Zero** -- Guided template for establishing expectations, play style, and boundaries
- **Content Warnings** -- Flagged content in wiki entries and encounter descriptions

These are enforced through the config and the DM's soul.md behavior rules.

---

## License

MIT
