# Maintenance Log Plugin

Tracks service intervals for all vessel systems, generates maintenance alerts, records completed work, and maintains a full maintenance history. Deferred maintenance sinks boats -- this plugin makes sure nothing gets missed.

## What It Does

The Maintenance Log plugin is the vessel's maintenance management system. It reads equipment data and service intervals from `knowledge/maintenance-schedule.json`, tracks what has been done and what is coming due, generates alerts for overdue and approaching maintenance, and records completed maintenance in the vessel's memory for historical reference.

## Commands

### `maintenance status`
Returns a summary of all tracked equipment systems with their current maintenance status. Groups by system (engine, hydraulics, refrigeration, deck machinery, safety equipment) and flags items that are overdue, due soon, or on schedule.

### `maintenance due [timeframe]`
Returns all maintenance tasks due within the specified timeframe. Defaults to 30 days if not specified. Supports: `overdue`, `7days`, `30days`, `90days`, `annual`. Each item includes the equipment ID, task description, due date, estimated cost, and parts required.

### `maintenance log [equipmentId] [task] [notes]`
Records a completed maintenance task. Updates `knowledge/maintenance-schedule.json` with the completion date, resets the next-due calculation, and creates a memory entry with the details. The notes field supports free-text descriptions of the work performed, parts used, and any observations.

### `maintenance history [equipmentId]`
Returns the maintenance history for a specific piece of equipment. Pulls from both `knowledge/maintenance-schedule.json` (last completed dates) and `cocapn/memory/memories.json` (detailed records of work performed). Useful for identifying recurring issues and tracking costs over time.

### `maintenance alert`
Manually triggers a full alert scan. Returns all overdue items (sorted by criticality), all items due within 7 days, and a cost summary for pending maintenance. Critical equipment with overdue maintenance generates a recommendation to cease operations until the maintenance is completed.

## Configuration

The plugin reads its primary data from `knowledge/maintenance-schedule.json`. Each equipment entry includes:

- Unique equipment ID (e.g., ENG-001, HYD-001, DECK-001, SAFE-001)
- System and component name
- Category (propulsion, electrical, deck-machinery, refrigeration, safety)
- Criticality level (critical, high, medium, low)
- Current hours (for hour-based intervals)
- Service intervals with task descriptions, last completed dates, next due dates, and parts requirements

Equipment procedures and inspection guidelines are documented in `wiki/equipment/gear-maintenance.md`.

## Criticality Levels

| Level | Definition | Overdue Action |
|-------|-----------|----------------|
| **Critical** | Failure stops operations or creates immediate safety hazard | Do not operate equipment. Schedule maintenance immediately. |
| **High** | Failure significantly degrades operations or creates elevated risk | Complete before next trip. Flag to captain. |
| **Medium** | Failure reduces efficiency or accelerates wear | Schedule within next port call. Order parts. |
| **Low** | Failure is inconvenient but not operationally significant | Schedule at convenience. Log in upcoming work list. |

## Alert System

Alerts are generated based on due dates relative to the current date:

- **Overdue**: Past due date. Critical equipment generates an immediate recommendation to cease operations until maintenance is completed. All overdue items appear in the daily check
- **Due within 7 days**: Approaching due date. Added to the next port call work list. Verify parts are available
- **Due within 30 days**: Upcoming maintenance. Include in maintenance planning. Order parts with sufficient lead time

Alert frequency is configured in `plugin.json`:
- Daily check: overdue items and items due within 7 days
- Weekly report: full maintenance status summary
- Monthly report: schedule review, budget tracking, and annual planning update

## Maintenance Logging Workflow

When logging a completed task:

1. User runs `maintenance log ENG-001 "Oil and filter change" "Replaced oil filter FF5320, added 10 gal 15W-40. Old oil was dark but no metal particles visible."`
2. Plugin identifies the equipment entry in `knowledge/maintenance-schedule.json`
3. Updates `lastCompleted` to current date and `lastCompletedHours` to current engine hours
4. Calculates `nextDueHours` and `nextDueDate` based on the interval
5. Writes the updated entry back to `knowledge/maintenance-schedule.json`
6. Creates a typed memory entry in `cocapn/memory/memories.json` with the maintenance details, parts used, cost, and any observations
7. Returns confirmation with the updated next-due information

## Integration with Other Plugins

- **Quota Tracker**: Trip duration and fishing plans affect maintenance scheduling. Long trips may need to account for hour-based intervals
- **Crew Scheduler**: Engineering crew availability determines who can perform maintenance. Tasks are assigned based on the current watch schedule

## Budget Tracking

The plugin maintains an annual maintenance budget estimate in `knowledge/maintenance-schedule.json`. Each maintenance task includes an estimated cost. The monthly report compares actual spending against the budget estimate, tracking:

- Total spent on maintenance year-to-date
- Budget remaining
- Cost by system (engine, hydraulic, refrigeration, deck, safety)
- Projected year-end spending based on current rate

## Limitations

- Does not connect to parts supplier databases. Parts must be ordered manually based on the parts required list
- Hour-based intervals rely on accurate engine hour logging. If hours are not updated, due dates may be inaccurate
- Does not track actual parts costs -- uses estimated costs for budget projections
- Safety equipment maintenance may have legal reporting requirements beyond this plugin's scope. Always verify with USCG and classification society requirements.
