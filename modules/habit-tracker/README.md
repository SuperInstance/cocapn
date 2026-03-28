# habit-tracker

Daily habit tracking agent for Cocapn. Tracks habits in `wiki/habits.md` and stores data in `modules/habit-tracker/habits.json`.

## Tools

| Tool | Description |
|---|---|
| `add_habit(name, freq)` | Add a habit (`daily` or `weekly`) |
| `log_habit(name, done)` | Mark today's habit done/skipped |
| `list_habits()` | Show today's status + streaks |
| `remove_habit(name)` | Remove a habit |
| `streak(name)` | Get current streak count |

## Usage in chat

```
Add a new habit: meditate
Log habit: meditate done
How's my habit streak for exercise?
```

## Install

```bash
cocapn-bridge module add https://github.com/cocapn/habit-tracker
```
