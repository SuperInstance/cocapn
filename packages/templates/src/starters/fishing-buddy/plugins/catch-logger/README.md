# Catch Logger Plugin

Your personal fishing journal that never forgets. Every fish you log builds a detailed record of your fishing history — species, size, location, conditions, and the story behind each catch. Over time, this data reveals patterns that make you a better angler.

## Features

### Structured Catch Logging

Every catch gets a complete record with structured fields:

**Required fields:**
- Species (common name)
- Date (auto-filled if not specified)

**Optional fields (the more you fill, the better the data):**
- Weight (pounds)
- Length (inches)
- Location (named location or GPS coordinates)
- Depth (feet)
- Tide stage (incoming, outgoing, slack, high, low)
- Weather conditions (sky, wind, air temperature, water temperature)
- Bait or lure used (specific product names, colors, sizes)
- Technique (bottom fishing, trolling, mooching, casting, fly fishing, etc.)
- Fishing companions
- Notes (the story — what happened, what worked, what did not)
- Released (boolean, for catch-and-release tracking)
- Fillet yield (weight of processed fillets)
- GPS coordinates (latitude/longitude)

### Season-Over-Season Comparison

After your first full season, the catch logger can compare your catches across years. See how your average halibut weight changed, whether you caught more silvers in August or September, and which locations produced the most consistent action.

Run `catch:compare season 2023 vs 2024` to see a side-by-side breakdown of your fishing performance.

### Species Statistics

Track your personal records and trends for every species:

- Total catches by species
- Average weight and length
- Personal best (weight and length)
- Catch rate (fish per trip, fish per hour)
- Most productive locations
- Most productive baits and techniques
- Seasonal timing (earliest catch, latest catch, peak window)

### Location Intelligence

The catch logger correlates your catches with locations and conditions to identify patterns:

- Which locations produce the biggest fish
- How tide timing affects catch rates at specific spots
- Which baits work best at which locations
- Seasonal productivity trends for each location

### Export

Export your catch data in multiple formats for external analysis or sharing:

- **JSON** — Full structured data, suitable for import into other tools
- **CSV** — Spreadsheet-compatible format for Excel or Google Sheets
- **Markdown** — Formatted report suitable for sharing or printing

## Commands

| Command | What it does |
|---------|-------------|
| `catch:log <species> [details...]` | Log a new catch with natural language details |
| `catch:list [species] [days]` | List recent catches with optional filters |
| `catch:stats [species] [period]` | Show statistics and trends |
| `catch:detail <idOrDate>` | Show full details of a specific catch |
| `catch:compare <dimension> <values>` | Compare catches across dimensions |
| `catch:export <format> [dateRange]` | Export catch data in specified format |

## Logging a Catch

The simplest way to log a catch is natural language:

```
catch:log halibut 38 pounds at Homer Spit near Flat Island, 180 feet, incoming tide, used salmon head on a 16/0 circle hook with 32 oz lead. Water was calm, overcast. Took about 15 minutes to land on the Trevala.
```

The plugin extracts structured data from your description and stores it as a typed memory entry. You can also provide structured fields directly:

```
catch:log --species "silver salmon" --weight 10 --length 26 --location "Nick Dudiak Lagoon" --bait "Pixie spoon pink" --tide "incoming"
```

## Data Storage

Catch data is stored in the brain's memory system under the `catch` namespace:

- Each catch is a memory entry with type `catch`, confidence `0.95` (explicit user statement), and tags for species, location, and technique.
- Aggregated statistics are stored as facts under the `stats.*` namespace (e.g., `stats.halibut.personalBest`, `stats.halibut.totalCaught`).
- Season summaries are stored as facts under the `season.*` namespace.

## Privacy

Catch data is stored in the private brain. Location-specific data (GPS coordinates, named spots) is treated as `private.*` and never exposed in public responses. Aggregated statistics without location data may be included in the public face if the user enables it.

## Tips for Best Results

1. **Log catches immediately** while the details are fresh. Weight, bait, and conditions are easy to forget.
2. **Be specific about bait.** "Pink Pixie spoon" is more useful than "spoon." "Salmon head strip on 16/0 circle hook" is more useful than "bait."
3. **Note the tide stage.** Tide data is the single most valuable correlation for saltwater catches.
4. **Log the skunked trips too.** Knowing when and where you did NOT catch fish is as valuable as knowing where you did.
5. **Include conditions even when they seem unremarkable.** "Flat calm, sunny, 55 degrees" is a data point.
