# Crew Scheduler Plugin

Builds and manages watch rotations, tracks crew hours against fatigue limits, documents qualifications and certification expiry dates, and generates crew reports for the vessel.

## What It Does

The Crew Scheduler plugin manages the human side of commercial fishing operations. It generates watch rotations based on crew complement, tracks hours worked and rest periods against regulatory fatigue limits, monitors certification expiry dates, and maintains the crew roster with qualifications and sea time.

## Commands

### `crew schedule [pattern]`
Generates a watch rotation schedule. Supports patterns: `4-on-4-off` (7+ crew), `6-on-6-off` (5 crew), `8-on-8-off` (transit). Assigns crew to watches based on position, qualification, and fatigue status. Outputs the rotation table with watch times, crew assignments, and watch officers.

### `crew hours [name]`
Returns hours worked and rest time for a specific crew member, or all crew if no name specified. Compares against fatigue limits and flags any violations or approaching limits. Useful for end-of-trip reporting and compliance documentation.

### `crew roster`
Returns the current crew roster with positions, experience level, certifications, and status. Includes certification expiry dates and highlights any certifications expiring within 90 days.

### `crew qualifications [name]`
Returns detailed qualification information for a specific crew member. Includes all certifications with expiry dates, sea time accumulated, position qualifications, and any upcoming renewal requirements. Useful for planning training and license upgrades.

### `crew fatigue`
Runs a fatigue assessment across all crew. Identifies anyone approaching or exceeding fatigue limits based on hours logged. Recommends schedule adjustments if fatigue indicators are present. Factors in operational conditions: heavy weather increases fatigue, night watches reduce alertness.

## Configuration

The plugin reads crew data from `cocapn/memory/facts.json` (crew.* namespace) and detailed crew information from `wiki/crew/crew-management.md`.

Fatigue limits are configured in `plugin.json` under the `fatigueLimits` section:
- **Max consecutive hours**: 6 (USCG recommendation)
- **Min rest per 24 hours**: 6 hours uninterrupted
- **Min rest per 7 days**: 56 hours
- **Rest must be uninterrupted**: true

Watch patterns are defined under `watchPatterns` with minimum crew requirements:
- **4-on/4-off**: Requires 7+ crew. Standard for active fishing with full complement
- **6-on/6-off**: Requires 5 crew. Used when short-handed
- **8-on/8-off**: Requires 4 crew. Transit only, not for active fishing

## Watch Schedule Generation

When generating a schedule, the plugin considers:

1. **Crew complement** -- Determines which watch pattern is viable
2. **Position requirements** -- Each watch must have a qualified watch officer (Captain, Relief Captain, or Mate)
3. **Fatigue status** -- Crew approaching limits are assigned lighter watches or off-watch periods
4. **Meal times** -- Cook gets modified watches to cover galley operations
5. **Recent history** -- Avoids assigning the same crew to consecutive heavy-work watches
6. **Certification requirements** -- Ensures Drill Conductor-certified crew are distributed across watches

## Fatigue Tracking

Hours are tracked cumulatively from trip start. The plugin logs:
- Total hours worked per 24-hour period
- Longest uninterrupted rest period per 24 hours
- Total rest hours per 7-day period
- Fatigue indicators reported by crew or observed by the deck boss

Fatigue levels trigger escalating responses:
- **Mild** (approaching limits): Flagged in schedule review. Lighter duties assigned
- **Moderate** (at limits): Removed from safety-critical tasks. Mandatory rest period
- **Severe** (exceeded limits): Immediate stand-down. Minimum 8 hours uninterrupted rest

## Integration with Other Plugins

- **Quota Tracker**: Trip duration affects fatigue calculations. Long trips for quota completion require fatigue-aware scheduling
- **Maintenance Log**: Engineering crew availability affects maintenance scheduling. Maintenance tasks are assigned to off-watch engineers

## Limitations

- Does not connect to USCG credentialing databases. Certification data must be entered manually
- Fatigue tracking relies on accurate hour logging by crew and watch officers
- Does not account for individual fatigue tolerance -- uses standard limits
- Watch generation assumes standard fishing operations. Emergency situations override any schedule
