# Character Bible Plugin

Your story's casting department, continuity editor, and relationship cartographer. Track every character's physical details, psychological profile, arc trajectory, and scene-by-scene behavior across the entire manuscript.

## Features

### Character Profiles

Each character gets a structured profile with fields organized into three tiers:

**Identity Tier** (always filled):
- Name, aliases, nicknames
- Age and birthdate
- Occupation and economic situation
- Physical description (focusing on distinguishing features)
- Voice and speech patterns
- First and last appearance in the manuscript

**Psychology Tier** (for major and supporting characters):
- The Lie -- the false belief that drives their behavior
- The Wound -- the backstory event that installed the Lie
- The Want -- the conscious goal
- The Need -- the unconscious requirement for growth
- Fears -- specific, visceral, not abstract
- Strengths -- real competencies, not superpowers
- Contradictions -- the inconsistencies that make them human

**Arc Tier** (for POV characters and major arcs):
- Starting state (Act I)
- Key turning points and what triggers them
- Internal resistance points (moments they almost change but pull back)
- Breakthrough moment
- Ending state (Act III)

### Relationship Mapping

Track relationships between characters with:
- Relationship type (familial, romantic, professional, adversarial, etc.)
- Evolution over time (how the relationship changes across chapters)
- Key scenes that define the relationship
- Tension points and unresolved conflicts

Run `char:map` to see a text-based relationship diagram showing all tracked connections in your current project.

### Scene-Level Tracking

Record how each character appears in specific scenes:
- Emotional state entering the scene
- Key behavior or dialogue moments
- Physical state (injuries, clothing changes, new possessions)
- Emotional state leaving the scene

This creates a continuity ledger so you never write a scene where a character who broke their arm in chapter 3 opens a heavy door in chapter 5 without acknowledging the injury.

### Consistency Checking

Run `char:check <name>` to scan for:
- Missing profile fields that should be filled for the character's role
- Physical description contradictions across scenes
- Behavioral inconsistencies (a shy character suddenly commanding a room without explanation)
- Timeline problems (a character appearing in two places at once)
- Unresolved arc elements (a wound that never gets addressed)

## Commands

| Command | What it does |
|---------|-------------|
| `char:new <name>` | Create a new character profile |
| `char:profile <name> [field] [value]` | View or update profile fields |
| `char:arc <name> <element> <description>` | Set arc elements (lie, wound, want, need) |
| `char:relate <char1> <char2> <relationship>` | Create or update a relationship |
| `char:scene <name> <chapter> <notes>` | Record scene-level continuity data |
| `char:check <name>` | Flag inconsistencies and gaps |
| `char:cast` | List all characters with roles |
| `char:map` | Show relationship diagram |

## Data Storage

Character data is stored in the brain's facts store under the `character` namespace:
- `character.<name>.profile` -- Full profile object
- `character.<name>.arc` -- Arc elements and trajectory
- `character.<name>.scenes` -- Per-scene continuity records
- `character.<name>.relationships` -- Relationship list
- `project.cast` -- List of all characters and their roles

## Example Workflow

```
1. char:new "Maren Ashworth"
2. char:profile "Maren Ashworth" occupation "Cartographer, National Coastal Survey"
3. char:arc "Maren" lie "Objective measurement reveals truth"
4. char:arc "Maren" wound "Father abandoned the family when she was 12; he was an artist who called his work 'a kind of truth'"
5. char:arc "Maren" want "To map the entire coastline perfectly"
6. char:arc "Maren" need "To accept that all observation is interpretation"
7. char:relate "Maren" "Hale" "supervisor, father figure, will ultimately betray her trust"
8. char:scene "Maren" "ch3" "Noticed the river discrepancy for the first time. Dismisses it. Can't stop thinking about it."
9. char:cast
10. char:check "Maren Ashworth"
```
