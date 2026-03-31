# Progress Tracker Plugin

Monitors your study progress across all subjects, identifies weak areas, and generates weekly reports with actionable recommendations. Celebrates milestones to keep you motivated.

## What It Does

- Tracks accuracy, speed, and consistency across all subjects and topics
- Detects weak areas automatically based on quiz results and flashcard performance
- Generates weekly progress reports with comparisons to previous weeks
- Awards milestones for achievements like streaks, score improvements, and topic mastery
- Recommends specific study actions based on your current data
- Logs all study activity for historical review

## Usage

### Checking Progress

Get an overview of how you are doing:

```
You: How am I doing?

Study Buddy: Here's your study progress overview:

Overall Accuracy: 82% (+3% from last week)
Study Streak: 5 days
Topics Studied This Week: 12
Total Study Time: 4 hours 20 minutes

By Subject:
  AP Calculus:   78% accuracy | 6 sessions | trending up
  AP Biology:    85% accuracy | 4 sessions | stable
  AP US History: 88% accuracy | 3 sessions | trending up
  Physics:       72% accuracy | 2 sessions | needs attention

Your strongest topic: Cell biology (94%)
Your weakest topic: Integration by parts (58%)
```

### Identifying Weak Areas

See where you need to focus:

```
You: What should I work on?

Study Buddy: Priority weak areas (sorted by urgency):

1. Integration by parts — 58% accuracy over 12 attempts
   Issue: Choosing u and dv (LIATE rule application)
   Recommendation: 15-minute focused practice + 5 new flashcards

2. Document-based questions — 65% accuracy over 8 attempts
   Issue: HIPP analysis on 2/6 documents consistently
   Recommendation: Practice with 2 more DBQs focusing on POV analysis

3. Organic chemistry functional groups — 68% accuracy over 10 attempts
   Issue: Confusing aldehydes and ketones
   Recommendation: Visual comparison chart + 10-minute review

Would you like to start with #1?
```

### Milestones

Celebrate your achievements:

```
You: Show me my milestones

Study Buddy: Your achievements:

Earned:
  - First Steps: Completed your first study session (Mar 10)
  - Quick Learner: Got 90%+ on a quiz for the first time (Mar 14)
  - Streak Starter: 3-day study streak (Mar 12)
  - Week Warrior: 7-day study streak (Mar 17)
  - Topic Master: Mastered "Cell Biology" at 94% accuracy (Mar 20)
  - Century Club: Completed 100 flashcard reviews (Mar 22)

Up next:
  - Two-Week Streak: 7 more days to go
  - 500 Reviews: 373 completed, 127 to go
  - Calculus Conqueror: Get 85%+ on a full calculus quiz
```

### Weekly Report

Get a detailed summary every Sunday:

```
You: Give me my weekly report

Study Buddy: Weekly Study Report — March 22-28

SUMMARY
  Sessions: 9 (up from 6 last week)
  Accuracy: 82% (up from 79%)
  New cards learned: 34
  Cards reviewed: 127
  Quizzes completed: 4
  Total study time: 4h 20m

HIGHLIGHTS
  - Improved AP Calculus accuracy from 71% to 78%
  - Mastered "Cell Biology" topic (94% accuracy)
  - 5-day study streak (personal best!)
  - First 90%+ score on a history quiz

AREAS FOR IMPROVEMENT
  - Integration by parts remains weak (58%)
  - Physics sessions dropped to 2 (from 4 last week)
  - Morning sessions have 12% higher accuracy than evening

RECOMMENDATIONS FOR NEXT WEEK
  1. Schedule 3 physics sessions (aim for 4)
  2. Daily 15-min integration by parts practice
  3. Try morning study sessions — your data shows they work better
  4. Review functional groups flashcards (3 are overdue)

Great week! Your consistency is paying off.
```

## Metrics Tracked

| Metric | What It Measures |
|--------|----------------|
| **Accuracy** | Percentage of correct answers per topic and subject |
| **Speed** | Average time per question or problem |
| **Consistency** | How regularly you study (streak tracking) |
| **Study time** | Total time spent in study sessions |
| **Weak areas** | Topics below the 65% accuracy threshold |
| **Improvement rate** | Week-over-week change in accuracy |

## Milestone System

Milestones are awarded for specific achievements:

- **First Steps** — Complete your first study session
- **Quick Learner** — Score 90%+ on a quiz
- **Streak Starter** — 3-day study streak
- **Week Warrior** — 7-day study streak
- **Fortnight Fighter** — 14-day study streak
- **Monthly Master** — 30-day study streak
- **Topic Master** — Reach 90%+ accuracy on a topic
- **Century Club** — Complete 100 flashcard reviews
- **500 Club** — Complete 500 flashcard reviews
- **Subject Scholar** — Master all topics in a subject

## Weak Area Detection

The plugin automatically flags topics where your accuracy falls below 65% after at least 5 attempts within the past 30 days. When a weak area is detected, it can:

1. Auto-generate targeted flashcards for the topic
2. Prioritize the topic in quick quizzes
3. Include it in weekly recommendations
4. Increase the topic's frequency in spaced repetition reviews

## Configuration

Settings in `config.yml` under `features.progressTracking`:

```yaml
features:
  progressTracking:
    enabled: true
    metrics:
      - accuracy
      - speed
      - consistency
      - weakAreas
    reports: weekly
```
