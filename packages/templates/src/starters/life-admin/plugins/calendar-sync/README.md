# Calendar Sync Plugin

Manages your schedule so you never double-book, miss an appointment, or wonder
what is coming next. Integrates with your daily briefing and weekly review.

## What It Does

- **Event Management** — Create, update, and delete calendar events through
  conversation. "Schedule a dentist appointment for Emma next Tuesday at 11am"
  creates the event with all relevant context.
- **Conflict Detection** — Automatically flags scheduling overlaps with a
  configurable buffer (default: 15 minutes between events). Alerts you before
  you commit to a conflict.
- **Recurring Events** — Handles weekly standups, monthly bill dates, annual
  birthdays, and custom recurrence patterns.
- **Smart Reminders** — Tiered reminders at configurable intervals (default:
  24 hours, 1 hour, and 15 minutes before events). Critical events like
  medical appointments get additional early reminders.
- **Daily Agenda** — Morning briefing includes today's events, travel time
  between locations, and any preparation needed.
- **Working Hours Protection** — Flags events scheduled outside your defined
  working hours and suggests alternatives when possible.

## Configuration

Edit the plugin config in `plugin.json`:

```json
{
  "workingHours": {
    "start": "09:00",
    "end": "17:30",
    "days": ["monday", "tuesday", "wednesday", "thursday", "friday"]
  },
  "conflictBufferMinutes": 15,
  "reminderAdvanceMinutes": [1440, 60, 15]
}
```

- `workingHours` — Your standard schedule. Events outside these hours trigger
  a gentle confirmation.
- `conflictBufferMinutes` — Minimum gap between events. Set to 0 for back-to-back
  scheduling, 30 for breathing room.
- `reminderAdvanceMinutes` — When to send reminders, in minutes before the event.
  Default: 1440 (24h), 60 (1h), 15 (15min).

## Integrations

### iCal (Built-in)

Subscribe to external calendars via iCal feeds. Great for sharing family
calendars or syncing work schedules.

```bash
You: "Subscribe to Sarah's calendar: https://calendar.google.com/..."
Life Admin: "Connected Sarah's calendar. I can see:
  - Soccer carpool (Thursdays 3-4pm)
  - Book club (2nd Wednesday, 7-9pm)
  Want me to watch for conflicts with your schedule?"
```

### Google Calendar (Requires MCP)

Enable by installing the Google Calendar MCP server and adding it to your
`config.yml` MCP configuration. Provides two-way sync.

### Outlook Calendar (Requires MCP)

Enable by installing the Outlook MCP server. Same two-way sync capabilities.

## Event Categories

Events are color-coded by category using theme variables:

- **Work** (`--color-cat-work`) — Meetings, deadlines, reviews
- **Personal** (`--color-cat-personal`) — Appointments, errands, self-care
- **Health** (`--color-cat-health`) — Doctor, dentist, therapy, fitness
- **Family** (`--color-cat-personal`) — School events, kids' activities, family time
- **Social** (`--color-cat-social`) — Dinners, gatherings, date nights
- **Travel** (`--color-cat-travel`) — Flights, hotel check-ins, road trips

## Conversation Examples

```
You: "I have a project review with the team next Friday at 2pm.
     Sarah will be there too."

Life Admin: "Got it. Project review added for Friday April 4 at 2pm.
     I tagged it as Work and noted Sarah as an attendee.
     Your afternoon is clear, so no conflicts.
     Want me to remind you Thursday to prep the status report?"
```

```
You: "When's Emma's next dentist appointment?"

Life Admin: "Emma has a dentist appointment this Wednesday at 11:00am.
     That conflicts with your 11:30 project sync — there's only
     a 30-minute gap and the dentist is 20 minutes away.
     Want to reschedule the sync to noon, or ask Sarah to take Emma?"
```

## Data Storage

Calendar data is stored in `cocapn/memory/calendar.json` within your private
brain repo. All data stays local and is committed to Git for history and backup.
