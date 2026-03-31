# Quota Tracker Plugin

Monitors IFQ and cooperative quota holdings against catch in real time. Prevents overages, calculates remaining ACE, and generates balance reports for all tracked species.

## What It Does

The Quota Tracker plugin provides real-time quota monitoring for commercial fishing operations. It reads quota allocation data from `knowledge/quota-data.json`, tracks cumulative catch, calculates remaining poundage and percentages, and generates alerts when usage approaches threshold limits.

## Commands

### `quota status`
Returns a summary of all tracked species with allocated pounds, caught pounds, remaining pounds, and percent used. Flags any species approaching warning or critical thresholds.

### `quota remaining [species]`
Returns remaining quota for a specific species, or all species if none specified. Includes estimated trips remaining based on recent CPUE data.

### `quota log [species] [pounds]`
Logs a catch entry against the specified species quota. Updates `knowledge/quota-data.json` with the new caught pounds total. Validates that the entry does not exceed the allocation without explicit confirmation.

### `quota report`
Generates a comprehensive quota balance report including: all species tracked, allocation versus catch, percent used, estimated value of remaining quota, and projected trip completion dates based on current CPUE trends.

### `quota alert`
Manually triggers a threshold check across all species. Returns warnings for any species above 75% usage, critical alerts for any above 90%, and overage notifications for any above 100%.

## Configuration

The plugin reads its primary data from `knowledge/quota-data.json`. Each species entry includes:

- Species name and regulatory area
- Allocated pounds (from IFQ or cooperative allocation)
- Caught pounds (updated via `quota log` commands)
- Ex-vessel price per pound
- Season dates
- Gear type restrictions
- PSC (Prohibited Species Catch) designation

Threshold alerts are configured in `plugin.json` under the `alerts` section:
- **Warning**: 75% of quota used
- **Critical**: 90% of quota used
- **Overage**: 100% of quota used

## Data Flow

1. User logs catch via `quota log "Pacific Cod" 2200`
2. Plugin reads current state from `knowledge/quota-data.json`
3. Caught pounds updated: 8200 + 2200 = 10400
4. Remaining pounds recalculated: 13530 - 10400 = 3130
5. Percent used recalculated: 76.9%
6. Warning threshold (75%) crossed -- alert generated
7. Updated data written back to `knowledge/quota-data.json`
8. Memory entry created in `cocapn/memory/memories.json` with the catch event

## Integration with Other Plugins

- **Crew Scheduler**: Quota status can influence trip scheduling decisions
- **Maintenance Log**: Quota completion may trigger maintenance scheduling for gear changes between target species

## Limitations

- Does not connect to NOAA Fisheries APIs directly. Quota data must be updated manually when official allocations change
- Does not validate catch against regulatory area boundaries -- relies on accurate user input
- PSC quota tracking is separate from IFQ quota tracking and uses count-based limits for salmon
- Ex-vessel prices are estimates and should be updated based on current market conditions
