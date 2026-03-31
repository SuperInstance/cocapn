# Deck Boss — Commercial Fishing Operations Agent

```
              |
             /|\
            / | \
           /  |  \
          /   |   \
         /____|____\
              |
             /|\
            / | \
     ~~~~~~/  |  \~~~~~~
     ~~~~~~   |   ~~~~~~
     ~~~~~~~  |  ~~~~~~~
     ~~~~~~~~ | ~~~~~~~~
     ~~~~~~~~~|~~~~~~~~~
        _____/|\_____
       /    _   _    \
      |    (_) (_)    |   "The sea doesn't care about your excuses.
      |      _        |    The boat goes out, the boat comes back,
       \    (__)      /    and the numbers have to work."
        \__________/
    ~~~~~~~~~~~~~~~~~~~~~~
    ~~~~~~~~~~~~~~~~~~~~~~~
```

Your AI deck boss for commercial fishing operations. Tracks quotas, manages crew, schedules maintenance, enforces compliance, and keeps the boat profitable. Built on the Cocapn framework -- clone it, set your API key, and run your vessel from the wheelhouse to the deck.

## What It Does

Deck Boss is a persistent AI agent that lives in your vessel's repo. It:

- **Tracks quotas in real time** -- monitors IFQ holdings against catch by species, warns before you hit limits, calculates remaining ACE
- **Manages crew schedules** -- builds watch rotations, tracks fatigue hours, documents qualifications and sea time
- **Schedules maintenance** -- tracks service intervals for winches, hydraulics, main engines, refrigeration, and safety gear
- **Enforces regulatory compliance** -- monitors eVTR deadlines, observer coverage requirements, season dates, and area closures
- **Runs the deck** -- coordinates setting, soaking, hauling, sorting, and processing cycles with timing and efficiency metrics
- **Calculates trip economics** -- revenue versus fuel, ice, bait, crew shares, and deferred maintenance costs
- **Manages bycatch** -- tracks prohibited species encounters, implements avoidance strategies, logs discard mortality
- **Logs safety drills** -- schedules and records man overboard, fire, abandon ship, and damage control drills
- **Interprets weather** -- reads marine forecasts for operational decisions: wind, sea state, barometric pressure trends
- **Remembers everything** -- vessel documentation, permits, crew qualifications, equipment history, catch rates, regulatory deadlines

## Quick Start

```bash
# Scaffold your vessel's brain
npm create cocapn -- --template deck-boss
cd my-deck-boss

# Set your API key (stored in OS keychain, never in git)
cocapn secret set DEEPSEEK_API_KEY

# Start the bridge
cocapn start

# Talk to your deck boss
# "What's our remaining sablefish quota?"
# "Schedule a watch rotation for six crew, 4-on 4-off"
# "When was the last time the main winch was serviced?"
# "Run the numbers on this trip: 40,000 lbs pollock, $0.12/lb"
```

## Use Cases

### Quota Management

Deck Boss tracks your IFQ and cooperative quota holdings species by species. Tell it what you caught today and it calculates remaining pounds, projected trip completion, and flags if you are approaching an overage. It knows the difference between retained catch and total catch, and it knows which species count against which quota category.

### Crew Scheduling

Building a watch rotation that accounts for fatigue regulations, crew qualifications, and observer coverage is a headache. Deck Boss generates schedules based on your crew count, tracks hours worked, and flags when someone is approaching their rest period limit. It also tracks drill conductor certifications, medical certificates, and sea time for license upgrades.

### Maintenance Tracking

Deferred maintenance sinks boats. Deck Boss tracks service intervals for every critical system: main engine hours, hydraulic filter changes, winch wire replacement schedules, refrigeration compressor service, EPIRB battery expiry, liferaft repack dates, and immersion suit age limits. It tells you what is due, what is overdue, and what is coming up in the next 30 days.

### Trip Economics

Every trip is a business decision. Deck Boss calculates whether a trip pays: revenue from catch at current ex-vessel prices minus fuel burn, ice costs, bait costs, groceries, crew shares, observer costs, and the amortized cost of deferred maintenance. It tracks CPUE trends across trips so you can see if your fishing efficiency is improving or declining.

### Regulatory Compliance

Federal fisheries regulations are complex and change frequently. Deck Boss tracks your active permits, observer coverage requirements, eVTR submission deadlines, season dates, area closures, and prohibited species catch limits. It does not give legal advice, but it makes sure you never miss a deadline or overlook a requirement.

### Bycatch Management

Prohibited species catches can shut down a fishery. Deck Boss tracks halibut bycatch in groundfish trips, salmon bycatch in pollock operations, and crab bycatch in trawl fisheries. It logs every encounter, calculates your PSC allowance, and recommends avoidance strategies based on historical encounter rates by area and season.

## Project Structure

```
deck-boss/
├── soul.md                         # The deck boss personality
├── config.yml                      # Bridge configuration
├── theme.css                       # Maritime/industrial color palette
├── cocapn/
│   └── memory/
│       ├── facts.json              # Vessel facts (name, port, permits, species)
│       └── memories.json           # Operational memories and trip history
├── wiki/
│   ├── operations/deck-procedures.md   # Setting, hauling, sorting workflows
│   ├── safety/safety-protocols.md      # MOB, fire, abandon ship, damage control
│   ├── species/target-species.md        # Pollock, cod, halibut, sablefish, crab
│   ├── regulations/ifq-system.md        # IFQ, cooperative quotas, catch shares
│   ├── equipment/gear-maintenance.md    # Winch, hydraulics, nets, pots, safety gear
│   └── crew/crew-management.md          # Watch systems, fatigue, qualifications
├── knowledge/
│   ├── quota-data.json                 # Species quotas with catch tracking
│   └── maintenance-schedule.json       # Equipment maintenance intervals
├── plugins/
│   ├── quota-tracker/                  # Quota monitoring and alerts
│   ├── crew-scheduler/                 # Watch rotation and fatigue tracking
│   └── maintenance-log/                # Equipment service tracking
└── .github/
    └── workflows/
        └── cocapn.yml                  # CI/CD pipeline
```

## Customization

### Edit soul.md

Change the personality to match your operation. Make it more focused on Alaska groundfish, Gulf shrimp, New England scallops, or West Coast whiting. The soul.md is version-controlled -- your deck boss evolves with your fishery.

### Add wiki pages

Drop markdown files into the wiki/ directories. Deck Boss reads them and uses the knowledge in its responses. Add your vessel-specific procedures, local area knowledge, or fleet protocols.

### Configure plugins

Enable or disable plugins in config.yml. The quota-tracker, crew-scheduler, and maintenance-log plugins provide structured commercial fishing functionality. Write your own plugins in the plugins/ directory.

### Pre-populate facts

Edit cocapn/memory/facts.json with your vessel name, documentation number, home port, active permits, target species, and crew complement. Deck Boss uses these facts to personalize every response.

## Connecting to Your Operation

Deck Boss works best when it becomes part of your vessel management routine:

1. **Pre-trip** -- Check remaining quota, crew qualifications, weather window, and maintenance status
2. **On the water** -- Log catch by species, track CPUE, monitor bycatch, coordinate deck operations
3. **End of trip** -- Calculate trip economics, validate eVTR data, schedule post-trip maintenance
4. **In port** -- Update maintenance records, process crew changes, review regulatory deadlines
5. **Off season** -- Plan next season's quota strategy, schedule annual maintenance, renew permits

## License

MIT -- Fish hard, fish smart.
