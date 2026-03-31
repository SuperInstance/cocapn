# Life Admin — Personal Operations Starter

```
  _      _             ___         _
 | |    (_)           / __)       | |
 | |     _  ___  ___| |__   ___ | |_
 | |    | |/ _ \/ __|  __) / _ \|  _\
 | |____| | (_) \__ \ |__ | (_) | |_
 |______|_|\___/|___/_____) \___/ \__)
          ___       _
         / __)     | |
        | |__ ___ | | _____  _ _
        |  __/ _ \| || ___ \| '_|
        | | | (_) | || ____/| |
        |_|  \___/ \_)_____)|_|
```

A warm, proactive personal assistant that manages your calendars, tasks, habits,
finances, travel, and household logistics. Built on the Cocapn framework — your
life admin lives in a Git repo, remembers everything, and gets smarter over time.

---

## What It Does

Life Admin is your personal operations center. It runs locally, keeps your data
private, and handles the mental overhead of modern life so you can focus on what
matters.

- **Morning Briefing** — Wake up to today's calendar, top priorities, habit
  check-in, weather, and anything urgent. No decision fatigue before coffee.
- **Calendar Management** — Appointments, deadlines, recurring events, conflict
  detection. Never double-book again.
- **Task & Project Tracking** — GTD-inspired task management. Capture everything,
  organize naturally, break big goals into next actions.
- **Habit Tracking** — Morning routines, exercise, hydration, reading, meditation.
  Gentle check-ins, streak tracking, and celebration when you show up.
- **Bill & Subscription Management** — Due dates, renewal reminders, budget
  tracking. Alerts 7 days before anything is due.
- **Travel Planning** — Packing lists by destination and season, itinerary
  management, document checklists, booking reminders.
- **Weekly Review** — Every Sunday (configurable): habit stats, budget summary,
  goal progress, and next week planning. Close the loop.
- **Relationship Reminders** — Birthdays, anniversaries, gift ideas, follow-up
  nudges. Never forget the people who matter.
- **Document Tracker** — Passport expiration, vehicle registration, insurance
  renewals, certifications. Never let one lapse.
- **Evening Wind-Down** — Review accomplishments, preview tomorrow, gratitude
  prompt. End the day with clarity.

---

## Quick Start

### Prerequisites

- Node.js 18+
- A DeepSeek API key (or swap in OpenAI / Anthropic / local model)

### Setup

```bash
# 1. Use this template to create your private brain repo
npx create-cocapn --template life-admin

# 2. Enter your new brain repo
cd my-life-admin

# 3. Add your API key (stored in OS keychain, never in git)
cocapn secret set DEEPSEEK_API_KEY

# 4. Start the bridge
cocapn start
```

### First Conversation

Open the web UI at `http://localhost:8787` and tell Life Admin about yourself:

```
Hi! I'm starting fresh. Let me tell you about my life:

- I live in Portland, Oregon (Pacific Time)
- I work Monday through Friday, 9am to 5:30pm
- I have two kids: Emma (8) and Jack (5)
- I'm training for a half marathon in October
- I want to get better about meal planning
- My biggest stress right now is keeping track of bills
```

Life Admin will remember all of this and start building your personalized system.

---

## Use Cases

### The Morning Rush

You wake up, grab coffee, and Life Admin has your briefing ready:

```
Good morning! Here's your day:

  9:30am  Standup meeting (15 min)
  11:00am Dentist - Emma (don't forget the insurance card)
  2:00pm  Project review with Sarah
  5:30pm  Pickup Jack from soccer

Habits: You drank 6/8 glasses of water yesterday.
        3-day streak on morning meditation!

Bills:  Credit card payment due in 3 days ($847.20).

Focus:  The project review is the big one today.
        Want me to pull together the status report?
```

### Bill Season

```bash
You: "What bills are coming up this month?"

Life Admin: "Here's what's on deck for March:

  Mar 05  Electric bill        ~$120   (auto-pay set)
  Mar 10  Car insurance        $189    (needs manual pay)
  Mar 15  Internet             $79     (auto-pay set)
  Mar 20  Credit card          ???     (statement drops Mar 12)
  Mar 25  Gym membership       $45     (auto-pay set)
  Mar 31  Rent               $1,800   (auto-pay set)

  Total estimated: ~$2,233
  Needs action: Car insurance (Mar 10)

  Want me to remind you about the car insurance on the 8th?"
```

### Habit Building

```bash
You: "I keep forgetting to take my vitamins"

Life Admin: "Let's set up a daily check-in. When do you usually have
breakfast? I'll nudge you right after.

Also, I noticed your supplement shelf has:
  - Vitamin D (daily)
  - Omega-3 (daily)
  - Magnesium (before bed)

Want me to split the reminder: vitamins with breakfast,
magnesium at 9pm?"
```

### Travel Prep

```bash
You: "We're going to Hawaii April 12-19"

Life Admin: "Exciting! Let me get organized:

  Pre-trip checklist:
    [ ] Book flights (Hawaiian has a sale ending Friday)
    [ ] Reserve rental car
    [ ] Check passport expiration (yours: expires Aug 2027, OK)
    [ ] Sunscreen (reef-safe for Hawaii)
    [ ] Emma's motion sickness meds for the flight

  Packing list for Hawaii in April:
    - Lightweight clothes, swimwear (2 per person)
    - Light rain jacket (evenings)
    - Hiking shoes + sandals
    - Reef-safe sunscreen SPF 50
    - Snorkel gear (or rent there?)

  Want me to create a shared packing checklist?
  I'll also set a reminder to check in for flights 24hrs before."
```

### Weekly Review

Every Sunday at 10am, Life Admin runs your review:

```
Weekly Review — March 22

HABITS (this week)
  Meditation:    5/7 days  (71%)  -- 3 week streak!
  8 glasses:     4/7 days  (57%)
  Reading:       6/7 days  (86%)
  Exercise:      3/3 runs  (100%) -- training on track!

FINANCES
  Budget used:   $1,847 / $3,200 (58%)
  Bills paid:    4/6
  Upcoming:      Car insurance (Mar 10), CC (Mar 20)

GOALS
  Half marathon:  Week 8 of 16 complete
  Reading goal:   3/12 books (on pace)
  Emergency fund: $4,200 / $10,000 (42%)

ACCOMPLISHMENTS
  - Finished the quarterly report early
  - Meal prepped 3 days in a row
  - Had that hard conversation with mom (proud of you)

NEXT WEEK
  Mon: Project kickoff meeting
  Wed: Emma's parent-teacher conference (3pm)
  Fri: Date night (reservation at 7:30, confirm?)
  Sat: Long run (8 miles, first time at this distance)

  What would you like to focus on this week?
```

---

## File Structure

```
life-admin/
├── soul.md                    # Personality and identity
├── config.yml                 # Bridge configuration
├── theme.css                  # Visual theme
├── cocapn/
│   └── memory/
│       ├── facts.json         # Known facts about your life
│       └── memories.json      # Conversation context
├── wiki/
│   ├── productivity/          # Methods and systems
│   ├── finance/               # Budget and planning
│   ├── health/                # Wellness and habits
│   └── travel/                # Planning resources
├── knowledge/
│   └── routines.json          # Daily/weekly templates
├── plugins/
│   ├── calendar-sync/         # Calendar integration
│   ├── habit-tracker/         # Habit management
│   └── bill-reminder/         # Financial reminders
└── .github/
    └── workflows/
        └── cocapn.yml         # CI/CD pipeline
```

---

## Customization

### Edit soul.md

Change who Life Admin is. More formal? More casual? Add specialization:

```markdown
## What You Know
- I work in healthcare and need HIPAA-aware suggestions
- I use a standing desk and prefer movement reminders every 90 minutes
- I'm learning Spanish — remind me to practice daily
```

### Adjust config.yml

- Change `llm.provider` to `openai`, `anthropic`, or `local` for Ollama
- Set `morningCheckin.time` to match your wake-up
- Toggle features on/off with the `features` block
- Add plugins to the `plugins` list

### Theme

Edit `theme.css` to match your aesthetic. The warm amber palette is designed to
reduce visual stress — but if you prefer cool blues or dark mode, swap the
CSS custom properties.

---

## Privacy

All data stays in your local Git repo. Facts, memories, habits, finances —
everything is in files you control. Nothing is sent anywhere except your LLM
API calls. Secrets live in your OS keychain.

---

## License

MIT
