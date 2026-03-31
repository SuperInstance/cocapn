# Fishing Buddy — Alaska Fishing Agent

```
        o
         o
     ___/_\___
    /         \
   |  O     O  |
   |     ^     |     "The one that got away
   |  \_____/  |      was bigger than the one
    \_________/       you caught. Always."
     |       |
    /|       |\
   / |       | \
  /  |       |  \
     |_______|
     |       |
     |       |
     |_______|
    /  _____  \
   /  /     \  \
  /__/       \__\
     \_______/
  ~~~~~~~~~~~~~~~~
```

Your personal Alaska fishing companion. Knows the waters, the species, the regulations, and the stories. Built on the Cocapn framework — clone it, configure your API key, and you have a fishing expert that remembers every catch.

## What It Does

Fishing Buddy is a persistent AI agent that lives in your fishing repo. It:

- **Identifies species** from descriptions, photos, or characteristics — tell it about the spotting pattern on the tail and it knows if it's a king or a silver
- **Logs your catches** with species, weight, length, location, date, conditions, and technique — building a personal fishing history that persists across sessions
- **Recommends techniques** based on target species, current season, tides, and your experience level
- **Tracks regulations** — bag limits, size restrictions, seasonal closures, emergency orders for Alaska waters
- **Plans trips** with launch points, route suggestions, tide timing, and species targeting
- **Suggests gear** matched to your target species, budget, and boat setup
- **Tells fishing stories** — it has a personality built from decades of Alaska fishing knowledge
- **Remembers everything** — your boat, your favorite spots, your personal best catches, your gear preferences

## Quick Start

```bash
# Clone or scaffold
npm create cocapn -- --template fishing-buddy
cd my-fishing-buddy

# Set your API key (stored in OS keychain, never in git)
cocapn secret set DEEPSEEK_API_KEY

# Start the agent
cocapn start

# Chat with your fishing buddy
# "What's biting in Homer this time of year?"
# "Log a catch: 42lb halibut, 180 feet, herring, Homer Spit"
# "Should I use a circle hook or J-hook for halibut?"
```

## Use Cases

### Trip Planning
Ask Fishing Buddy to plan a day trip. Tell it your target species, your boat, your launch point, and it builds a plan with timing around tides, recommended rigs, bait suggestions, and backup spots if the weather turns.

### Catch Logging
Every fish gets logged with full metadata. Over time, Fishing Buddy identifies patterns — "You catch your biggest halibut on the outgoing tide in June" — because it remembers what you forget.

### Species Research
Building on the built-in wiki, Fishing Buddy can deep-dive into any Pacific Northwest species. Life cycles, migration patterns, feeding behavior, and how that biology translates to fishing strategy.

### Regulation Lookups
Alaska fishing regulations are complex and change with emergency orders. Fishing Buddy keeps the current limits at its fingertips and always reminds you to verify with ADFG.

### Gear Recommendations
Tell Fishing Buddy your target species and budget, and it recommends specific rods, reels, line, tackle, and terminal gear. It knows the difference between what works and what's marketing.

### Seasonal Intelligence
Fishing Buddy tracks run timing across years. When you ask about kings in June, it factors in the specific river system, the run component (early vs late), and recent patterns.

## Project Structure

```
fishing-buddy/
├── soul.md                    # The personality — edit this to change who your buddy is
├── config.yml                 # Bridge configuration
├── theme.css                  # Ocean color palette
├── cocapn/
│   └── memory/
│       ├── facts.json         # Your personal facts (boat, location, preferences)
│       └── memories.json      # Conversation history and catch memories
├── wiki/
│   ├── species/               # Pacific Halibut, King Salmon, Silver Salmon guides
│   ├── techniques/            # Bottom fishing, trolling, drift fishing
│   ├── locations/             # Kenai River, Homer Spit, and more
│   ├── regulations/           # Current Alaska limits and seasons
│   ├── gear/                  # Tackle box recommendations
│   └── tips/                  # Beginner guides and pro tips
├── knowledge/
│   ├── species-data.json      # Structured species reference data
│   ├── regulations.json       # Structured regulation data
│   └── gear-recommendations.json  # Gear by species and budget tier
├── plugins/
│   ├── catch-logger/          # Catch logging system
│   ├── tide-tables/           # Tide prediction integration
│   └── weather-check/         # Marine weather conditions
└── .github/
    └── workflows/
        └── cocapn.yml         # CI/CD pipeline
```

## Customization

### Edit soul.md
Change the personality. Make it more technical, more casual, more focused on fly fishing, or add expertise in a different region. The soul.md is version-controlled — your fishing buddy evolves with you.

### Add wiki pages
Drop markdown files into the wiki/ directories. Fishing Buddy reads them and incorporates the knowledge into its responses. Add your own secret spots, local techniques, or family recipes.

### Configure plugins
Enable or disable plugins in config.yml. The catch-logger, tide-tables, and weather-check plugins provide structured functionality. Write your own plugins in the plugins/ directory.

### Pre-populate facts
Edit cocapn/memory/facts.json with your boat, your location, your license year, your favorite species. Fishing Buddy uses these facts to personalize every response.

## Connecting to Your Fishing Life

Fishing Buddy works best when you make it part of your routine:

1. **Morning of a trip** — Check tides, weather, and get a technique recommendation
2. **On the water** — Log catches in real time via mobile chat
3. **End of day** — Review your catch log, get fillet yield estimates, cooking suggestions
4. **Off season** — Research new techniques, plan next season's trips, review year-over-year stats
5. **Regulation changes** — Ask about current limits before each trip

## License

MIT — Fish freely.
