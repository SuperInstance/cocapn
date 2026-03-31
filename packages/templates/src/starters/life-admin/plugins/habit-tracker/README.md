# Habit Tracker Plugin

Builds and maintains daily habits with adaptive check-ins, streak tracking, and
empathetic support. No guilt trips, no shame spirals — just consistent, gentle
accountability.

## What It Does

- **Habit Tracking** — Track daily habits with customizable targets (yes/no,
  count-based, or duration-based). Log via conversation or quick check-in.
- **Streak Tracking** — Counts consecutive days for each habit. Celebrates
  milestones at configurable intervals (3, 7, 14, 21, 30, 60, 100, 365 days).
- **Adaptive Check-ins** — Automatically adjusts reminder frequency and timing
  based on your patterns. Strong habits get fewer check-ins; slipping habits
  get gentle, increased attention.
- **Two-Day Rule** — Monitors the "never miss twice" principle. If you miss
  one day, the next day becomes a priority reminder. Missing two days triggers
  a supportive check-in about what would help.
- **Weekly and Monthly Reports** — Generates consistency stats, identifies
  trends, and highlights correlations between habits.
- **Habit Stacking Suggestions** — Recommends linking new habits to existing
  ones based on your current routine and timing patterns.

## Configuration

Edit the plugin config in `plugin.json`:

```json
{
  "checkInStyle": "adaptive",
  "quietHours": {
    "start": "22:00",
    "end": "07:00"
  },
  "twoDayRule": true,
  "celebrationLevel": "enthusiastic",
  "slipResponse": "empathetic"
}
```

- `checkInStyle` — How Life Admin checks in. Options:
  - `adaptive` (default): Adjusts based on streak strength
  - `scheduled`: Fixed times, same every day
  - `minimal`: Only checks in during morning and evening routines
- `quietHours` — No habit reminders during these hours. Respects your sleep.
- `twoDayRule` — Enables the "never miss twice" monitoring.
- `celebrationLevel` — How enthusiastic the celebrations are:
  - `enthusiastic`: Full cheer with emojis and encouragement
  - `moderate`: Brief acknowledgment and positivity
  - `subtle`: Simple note, understated
- `slipResponse` — How Life Admin responds to missed habits:
  - `empathetic` (default): Understanding, asks what would help
  - `practical`: Skips emotions, focuses on the plan to get back on track
  - `minimal`: Just logs it, no commentary

## Default Habits

The template ships with five starter habits. Customize, add, or remove to match
your actual routine:

| Habit | Target | Timing | Method |
|-------|--------|--------|--------|
| Hydration | 8 glasses/day | Throughout day | Count |
| Meditation | 1 session/day | Morning | Yes/No |
| Exercise | 3 sessions/week | Flexible | Weekly count |
| Reading | 20+ min/day | Evening | Duration |
| Medication | 1 session/day | Morning | Yes/No |

## Adding Custom Habits

Tell Life Admin in conversation:

```
You: "I want to start tracking my practice of writing in my journal
     every night before bed."

Life Admin: "Great habit! Let me set that up:
  - Name: Journal writing
  - Target: 1 session per day
  - Timing: Evening, before bed
  - Stacking: After brushing teeth (like your magnesium)

  I'll check in during your evening wind-down routine.
  Want me to start tracking tonight?"
```

## Check-in Flow

Adaptive check-ins follow this pattern:

1. **Morning check-in** (during Morning Launch routine): Quick status of
   yesterday's habits and intention-setting for today.
2. **Mid-day nudge** (only if a morning habit is unlogged by noon): "Hey, just
   a friendly reminder — did you take your Vitamin D this morning?"
3. **Evening check-in** (during Evening Wind-Down): Log today's habits, reflect
   briefly, set up tomorrow.

## Weekly Report

Every Sunday (during Weekly Review), Life Admin generates a habit report:

```
Habit Report — Week of March 16

  Meditation:   5/7 days (71%)    -- 3 week streak!
  Hydration:    4/7 days (57%)    -- slipped mid-week
  Exercise:     3/3 runs (100%)   -- training on track
  Reading:      6/7 days (86%)    -- strong
  Medication:   7/7 days (100%)   -- automatic

  Overall: 25/29 check-ins (86%)  -- up from 78% last week

  Pattern: You tend to miss hydration on days with late meetings.
           Want to set a 3pm water reminder on meeting-heavy days?
```

## Correlation Detection

Life Admin looks for patterns between habits:

- "You meditate on 90% of days you exercise. Morning movement seems to help."
- "Reading drops on Thursdays — that's your late meeting day. Maybe shift to
  an afternoon reading break instead?"
- "When you meal prep on Sunday, your nutrition habits stay strong all week."

These insights appear in the weekly and monthly reports.

## Data Storage

Habit data is stored in `cocapn/memory/habits.json` within your private brain
repo. All data stays local and is committed to Git for history and backup.
