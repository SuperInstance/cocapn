# Weather Check Plugin

The Alaska marine weather does not care about your fishing plans. This plugin provides real-time marine forecasts, safety assessments, and trip-planning weather intelligence so you can make informed decisions about when to fish and when to stay at the dock. It is the difference between a great day on the water and a dangerous one.

## Features

### Current Conditions

Get a snapshot of current marine weather for your fishing area:

- Wind speed, direction, and gusts
- Wave height and period
- Air and water temperature
- Barometric pressure and trend
- Visibility and precipitation
- Cloud cover
- Marine weather statements and warnings

### Marine Forecast

Multi-day marine forecast with hourly detail for the first 24 hours and 6-hour blocks beyond that:

- Wind forecast with direction shifts noted (critical in Alaska where wind direction changes can rapidly build seas)
- Wave height predictions with swell direction
- Precipitation probability and intensity
- Visibility forecasts (fog is a major hazard in Alaska)
- Temperature trends
- Highlighted periods of concern (building wind, approaching fronts, fog risk)

### Safety Assessment (Go/No-Go)

The most important feature. Tell the plugin your vessel type, target area, and trip type, and it gives you a safety assessment:

**Inputs:**
- Vessel type and size (e.g., "22ft Hewescraft", "14 ft skiff", "30 ft cabin cruiser")
- Target area (e.g., "Homer halibut grounds", "Resurrection Bay", "Barren Islands")
- Trip type (e.g., "full day offshore", "half day bay fishing", "salmon trolling near shore")

**Output:**
- Safety rating: EXCELLENT, GOOD, MARGINAL, CAUTION, or DO NOT DEPART
- Specific hazards to watch for
- Recommended modifications (stay in the bay, shorten the trip, depart earlier)
- Time window when conditions are best
- What to watch for during the trip (wind building in the afternoon, fog rolling in)

The safety assessment uses configurable thresholds based on vessel capability. A 22-foot Hewescraft has different limits than a 14-foot car-topper. The plugin knows the difference.

### Wind Detail

Detailed wind forecast showing:

- Hourly wind speed and direction
- Gusts (the difference between sustained wind and gusts matters — gusty conditions make boat control difficult)
- Wind direction shifts (frontal passages, sea breeze development)
- Correlation with tide timing (wind against tide builds steeper, more dangerous waves)

### Weather Alerts

Active marine weather warnings and advisories for your area:

- **Small Craft Advisory:** Winds 25+ knots or seas 6+ feet. Do not depart in a small vessel.
- **Gale Warning:** Winds 34+ knots. All small vessels should remain in port.
- **Storm Warning:** Winds 48+ knots. Seek safe harbor immediately.
- **Dense Fog Advisory:** Visibility less than 1 nautical mile. Radar recommended.
- **Freezing Spray Advisory:** Dangerous for all vessels. Icing can destabilize a boat rapidly.

## Commands

| Command | What it does |
|---------|-------------|
| `weather:now [area]` | Current marine conditions |
| `weather:forecast [area] [days]` | Multi-day marine forecast |
| `weather:safe [vessel] [area] [tripType]` | Safety assessment for your trip |
| `weather:wind [area] [hours]` | Detailed wind forecast |
| `weather:alert [area]` | Active marine weather warnings |

## Understanding Alaska Marine Weather

### The Basics

Alaska marine weather is dominated by two patterns:

**Gulf of Alaska lows:** Large low-pressure systems that spin up in the Gulf and push wind and waves toward the coast. These produce the most dangerous conditions and can intensify rapidly.

**Local effects:** Kachemak Bay sea breezes, williwaws off the mountains, tidal current against wind in narrow passages. Local effects can make conditions much worse (or better) than the general forecast suggests.

### Critical Reading of the Forecast

The marine forecast is your primary safety tool. Key things to look for:

1. **Wind direction vs. your route.** A 15-knot headwind on your way home is exhausting and dangerous. A 15-knot tailwind on the way out means a headwind on the way back.

2. **Building vs. holding.** "Winds 10 knots building to 20 in the afternoon" means you have a narrow window. Plan to be back before the build starts.

3. **Seas height vs. wave period.** 3-foot seas at 10 seconds are comfortable. 3-foot seas at 4 seconds are rough and dangerous. The period matters as much as the height.

4. **Wind against tide.** When wind blows against the tidal current, waves stack up steep and close together. This is the most dangerous condition for small boats and it can happen in otherwise moderate weather.

5. **Afternoon sea breeze.** On the Kenai Peninsula, sea breezes typically build from the southwest in the afternoon. Even on a calm morning, expect 10-15 knots by 2 PM on most summer days.

### When to Stay Home

The plugin will tell you when not to go. Here are the non-negotiable rules:

- **Small Craft Advisory is up:** Stay at the dock. No fish is worth it.
- **Forecast calls for building wind:** Plan to be back before the build, or do not go.
- **Fog with no radar:** Visibility less than a quarter mile with no radar is a navigation hazard.
- **You are not confident:** If the forecast looks marginal and you are unsure, the answer is "not today." The ocean will be there tomorrow.

### Vessel-Specific Considerations

The safety assessment adjusts for your vessel:

**Small open boats (14-18 feet):**
- Maximum safe conditions: 2-foot seas, 10 knots of wind
- Stay in protected waters (inside Kachemak Bay, Resurrection Bay)
- Avoid any area exposed to the Gulf of Alaska

**Mid-size open or semi-enclosed (19-24 feet):**
- Maximum safe conditions: 4-foot seas, 20 knots of wind
- Can fish outside bays in good conditions
- Capable of runs to Flat Island from Homer in moderate weather
- Avoid the Barren Islands and exposed outer coast in anything over 3 feet

**Larger cabin boats (25-32 feet):**
- Maximum safe conditions: 6-foot seas, 25 knots of wind
- Capable of most Alaska day trips in moderate conditions
- Can run to the Barren Islands in 3-4 foot seas with experienced operator
- Still limited by Small Craft Advisory conditions

These are general guidelines. Your specific vessel, your experience, and your equipment (radar, GPS, VHF, life raft) all factor into safe operations. The plugin's assessment is a starting point, not a final answer.

## Integration with Trip Planning

Use the weather check plugin alongside the tide tables plugin for comprehensive trip planning:

1. Check the tide tables to identify the best fishing windows
2. Check the weather forecast for those specific windows
3. Run the safety assessment for your vessel and target area
4. Make the go/no-go decision based on both tide timing and weather safety

The best fishing trips happen when the tides, weather, and your schedule all align. The plugins help you find those days.
