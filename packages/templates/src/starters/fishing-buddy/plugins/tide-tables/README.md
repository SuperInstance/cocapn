# Tide Tables Plugin

The tide is the clock that Alaska saltwater fishing runs on. This plugin provides tide predictions, identifies the best fishing windows based on tide timing, and explains how tide stages affect different species and techniques. It turns raw tide data into actionable fishing intelligence.

## Features

### Tide Predictions

Get tide height and timing predictions for major Alaska fishing locations:

- High tide and low tide times with predicted heights
- Tide stage at any given time (incoming/flood, outgoing/ebb, slack)
- Sunrise and sunset times alongside tide data
- Lunar phase (affects tide amplitude and fish behavior)

### Fishing Window Identification

The plugin does not just show you the tides — it tells you when to fish. Based on your target species and technique, it identifies the windows when conditions are most favorable:

**Halibut (bottom fishing):**
- Prime window: 2 hours before through 1 hour after slack tide
- Best during incoming tide when baitfish are pushed inshore
- Avoid: Peak ebb current (requires excessive weight, poor bait presentation)

**King salmon (trolling):**
- Prime window: Last 2 hours of incoming tide through the first hour of ebb
- Focus on tide rips and current lines where bait concentrates
- Troll with the current for natural lure action

**Silver salmon (trolling or casting):**
- Prime window: Incoming tide at river mouths and estuaries
- Silvers follow bait pushed inshore by the flooding tide
- Action peaks at the tide change and tapers during slack

**Rockfish (jigging):**
- Prime window: Slack or minimal current for controlled jig presentation
- Avoid: Strong running current makes vertical jigging difficult

### Slack Tide Alerts

Slack tide — the brief period of minimal current when the tide switches direction — is the golden window for halibut fishing. The plugin calculates slack tide windows and provides:

- Exact slack tide times (high slack and low slack)
- Duration of effective slack (minimal current period)
- Quality rating based on the tidal exchange (smaller exchanges = longer slack = better fishing)
- Recommendations for how to time your fishing around slack

### Location Comparison

Compare tide conditions between locations to choose the best fishing destination:

```
tide:compare Homer Seward
```

This shows both locations' tides side by side, highlights which has the better fishing window for your target species, and notes any timing offsets between the locations.

### Weekly Tide Planner

Get a week-long overview of tides with fishing quality ratings for each day. Plan your fishing trips around the best tide days:

- Days with large tidal exchanges (big swings between high and low) produce strong currents but brief slack windows
- Days with smaller exchanges (neap tides) have longer slack periods — better for halibut
- The weekly planner flags the best fishing days based on your target species

## Commands

| Command | What it does |
|---------|-------------|
| `tide:today [location]` | Show today's tides for a location |
| `tide:week [location]` | Weekly tide planner with fishing ratings |
| `tide:best [species] [days]` | Find best fishing windows by species |
| `tide:slack [location] [hours]` | Upcoming slack tide windows |
| `tide:compare <loc1> <loc2>` | Compare tides between locations |

## Supported Locations

The plugin provides tide predictions for major Alaska sport fishing locations:

- **Homer / Kachemak Bay** — Halibut capital, salmon trolling
- **Seward / Resurrection Bay** — Silver salmon, rockfish, halibut
- **Kenai River mouth** — King and silver salmon
- **Anchor Point** — Beach launch halibut fishing
- **Ninilchik / Deep Creek** — Halibut, king salmon
- **Kasilof River mouth** — Drift boat salmon fishing
- **Valdez** — Prince William Sound salmon and halibut
- **Whittier** — Prince William Sound access
- **Sitka** — Southeast Alaska salmon trolling
- **Ketchikan** — Southeast Alaska saltwater

If your location is not listed, provide the nearest listed location and the plugin will note the approximate time offset.

## Understanding Tides for Fishing

### Spring Tides vs. Neap Tides

**Spring tides** (around full and new moons): Largest tidal range. Strong currents. Short slack windows. Can produce excellent fishing during the brief slack but challenging conditions during the run.

**Neap tides** (around first and last quarter moons): Smallest tidal range. Weaker currents. Longer slack windows. Generally better for halibut fishing because the fishable window is longer.

### Tide Height and Fishing Access

Extreme low tides (minus tides) can expose reefs and rocks that are normally submerged — both a navigation hazard and a fishing opportunity. Some of the best halibut fishing occurs on minus tides when fish are concentrated in the remaining deep water.

Extreme high tides can make certain boat launches unusable (or conversely, make shallow launches accessible). Know the tide range at your launch point.

### Current Speed and Fishing Technique

The speed of tidal current determines how much weight you need, how your bait behaves, and which techniques are effective:

- **Minimal current (< 0.5 knots):** Ideal for bottom fishing and jigging. Lighter weights, natural bait presentation.
- **Moderate current (0.5-2.0 knots):** Manageable with appropriate weight. Trolling speed needs adjustment. Standard fishing conditions.
- **Strong current (2.0+ knots):** Difficult to bottom fish. Requires heavy weight. Trolling lures may not track properly. Consider anchoring or switching to a different technique.

## Data Source

Tide predictions are based on harmonic analysis of NOAA tide stations. Predictions are estimates and actual conditions may vary due to weather, atmospheric pressure, and wind. For navigation safety, always use official NOAA tide tables in addition to this plugin.

## Configuration

Default location is set in `config.yml` but can be overridden per command. The plugin uses the Alaska time zone (America/Anchorage) and displays heights in feet and times in 12-hour format by default. These can be changed in the plugin config.
