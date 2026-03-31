# Story Planner Plugin

Break your story into architectural bones: beats, scenes, and turning points. Choose a structural framework, fill in the beats, and track your progress from first draft to final polish.

## Features

### Structural Frameworks

Pick a framework that fits your story:

- **Three-Act Structure** -- Setup, confrontation, resolution. The classic. Works for almost anything.
- **Hero's Journey** -- Departure, initiation, return. Best for transformation narratives and epic fantasy.
- **Save the Cat** -- 15-beat sheet with precise percentage targets. Best for plot-driven commercial fiction.
- **Seven-Point Structure** -- Dan Wells' streamlined 7-beat system. Flexible, expandable.
- **Kishotenketsu** -- Four-act structure without conflict. Best for literary fiction and quiet stories.
- **Fichtean Curve** -- Start in conflict, escalate continuously. Best for thrillers and in medias res openings.
- **Snowflake Method** -- Iterative expansion from one sentence to full outline.

### Beat Management

Each beat in your plan has:
- **Name** -- The structural label (e.g., "Inciting Incident", "Midpoint", "All Is Lost")
- **Description** -- What happens in this beat for your specific story
- **Scenes** -- One or more scenes that fulfill this beat
- **Status** -- Planned, drafted, revised, or complete
- **Notes** -- Craft notes, alternatives, or questions to revisit

### Scene Structure

Every scene within a beat tracks:
- **Goal** -- What the POV character wants in this scene
- **Conflict** -- What stands in the way
- **Disaster/Outcome** -- What actually happens
- **Word count** -- Current word count for this scene
- **POV character** -- Whose eyes we see through

### Gap Analysis

Run `plan:gaps` to check your story plan for common structural issues:
- Missing beats (e.g., no inciting incident identified)
- Overstuffed beats (too many scenes in one structural moment)
- Pacing problems (long stretches without turning points)
- Character arc gaps (a character who disappears for chapters)
- Unresolved subplots

### Timeline View

See your story's events in chronological order (which may differ from narrative order). Useful for tracking parallel plotlines and ensuring events in different locations make temporal sense.

## Commands

| Command | What it does |
|---------|-------------|
| `plan:new <title> <framework>` | Start a new story plan |
| `plan:beat <name> <description>` | Add or update a beat |
| `plan:scene <beat> <description>` | Add a scene to a beat |
| `plan:list` | Show all beats with status |
| `plan:gaps` | Analyze for structural problems |
| `plan:timeline` | Chronological event view |
| `plan:export <format>` | Export as markdown or JSON |

## Data Storage

Story plans are stored in the brain's facts store under the `story-plan` namespace:
- `story-plan.<title>.framework` -- The chosen structural framework
- `story-plan.<title>.beats` -- Array of beats with scenes and status
- `story-plan.<title>.timeline` -- Chronological event ordering

## Example Workflow

```
1. plan:new "The Cartographer's Ink" three-act
2. plan:beat "inciting-incident" "Maren notices the river has changed course to match her map"
3. plan:scene "inciting-incident" "Maren returns to the field site and finds the original channel dry"
4. plan:beat "midpoint" "Maren learns the survey company has always known about the maps"
5. plan:list
6. plan:gaps
7. plan:export markdown
```
