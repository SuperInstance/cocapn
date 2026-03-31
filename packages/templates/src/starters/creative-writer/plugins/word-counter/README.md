# Word Counter Plugin

Track your writing output with precision and encouragement. Set goals, run sprints, build streaks, and watch your daily word count grow over time. Designed for writers who want honest metrics without punitive pressure.

## Features

### Goal Tracking

Set goals at four levels:
- **Daily** -- Words per day (default: 1,000)
- **Weekly** -- Words per week (default: 6,000)
- **Monthly** -- Words per month (default: 25,000)
- **Project** -- Total manuscript target (e.g., 85,000 for a novel)

Progress is shown as a percentage with a simple visual bar. At 25%, 50%, 75%, and 100% of your daily goal, the agent offers brief encouragement -- never cheerleading, just acknowledgment.

### Writing Sprints

The Pomodoro-style sprint system for writers:

1. **Start a sprint** -- `words:sprint:start 25` begins a 25-minute writing sprint
2. **Write** -- The agent stays quiet during the sprint (unless you ask for help)
3. **End the sprint** -- `words:sprint:end 680` logs your word count and starts an optional rest period
4. **Rest** -- A 5-minute break before the next sprint (configurable)

Sprint history is tracked so you can see:
- Your average words per sprint
- Your most productive sprint times
- Your personal best sprint

### Streak Tracking

A writing streak is the number of consecutive days you logged any word count. The plugin tracks:
- Current streak
- Longest streak
- Days since last write (if the streak is broken)

There is no judgment for breaking a streak. The streak is a neutral metric. Some writers find it motivating; others find it stressful. Use it if it helps.

### History and Trends

`words:history week` or `words:history month` shows your output over time:
- Daily word counts for the period
- Average daily output
- Total for the period
- Comparison to the previous period (up or down, with no editorial comment)

`words:best` shows your personal records:
- Highest single-day word count
- Highest single-sprint word count
- Longest writing streak
- Most productive day of the week

### Project-Level Tracking

For manuscript-length projects, the plugin tracks:
- Current total word count
- Target word count
- Estimated completion date (based on your average daily output)
- Percentage complete
- Words remaining

Update your project word count with `words:project` to get an at-a-glance progress report.

## Commands

| Command | What it does |
|---------|-------------|
| `words:goal <type> <count>` | Set a goal (daily, weekly, monthly, project) |
| `words:log <count> [project]` | Log words written in a session |
| `words:today` | Today's count and daily goal progress |
| `words:week` | This week's count and weekly goal progress |
| `words:project [name]` | Project-level progress toward manuscript goal |
| `words:sprint:start [minutes]` | Start a writing sprint timer |
| `words:sprint:end <wordCount>` | End sprint and log word count |
| `words:streak` | Current and best writing streak |
| `words:history <period>` | Word count history (week or month) |
| `words:best` | Personal best records |

## Data Storage

Word count data is stored in the brain's facts store under the `words` namespace:
- `words.goals.daily` -- Daily word count target
- `words.goals.weekly` -- Weekly word count target
- `words.goals.project` -- Project manuscript target
- `words.log.<date>` -- Word count logged for a specific date
- `words.sprints.<date>` -- Sprint records for a specific date
- `words.streak.current` -- Current consecutive-day streak
- `words.streak.best` -- All-time longest streak
- `words.project.<name>.current` -- Current manuscript word count

## Example Workflow

```
1. words:goal daily 1200
2. words:goal project 85000
3. words:sprint:start 25
   ... 25 minutes of writing ...
4. words:sprint:end 680
5. words:sprint:start 25
   ... 25 minutes of writing ...
6. words:sprint:end 660
7. words:log 1340 "The Cartographer's Ink"
8. words:today
9. words:streak
10. words:best
```
