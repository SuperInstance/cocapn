# Flashcard Maker Plugin

Automatically generates and manages spaced-repetition flashcard decks from your study material. Uses the SM-2 algorithm to schedule reviews at optimal intervals for long-term retention.

## What It Does

- Creates flashcard decks from any subject or topic you are studying
- Schedules reviews using the SM-2 spaced repetition algorithm
- Tracks your accuracy and adjusts card difficulty over time
- Supports multiple card formats: basic (front/back), reverse, and cloze deletion
- Generates cards from wiki content, knowledge base data, or conversation context
- Exports decks to CSV or JSON for use in other flashcard apps

## Usage

### Creating a Deck

Ask Study Buddy to create flashcards naturally:

```
You: Make me a flashcard deck for AP Biology chapter 5 — cell membrane transport.

Study Buddy: I created a deck called "Cell Membrane Transport" with 15 cards covering:
- Passive transport (diffusion, osmosis, facilitated diffusion)
- Active transport (sodium-potassium pump, endocytosis, exocytosis)
- Membrane structure and the fluid mosaic model

Want to review 5 of them now?
```

### Reviewing Cards

Start a review session any time:

```
You: Review my flashcards

Study Buddy: You have 12 cards due today:
- 5 new cards from "Cell Membrane Transport"
- 4 review cards from "Quadratic Equations" (accuracy: 80%)
- 3 review cards from "AP US History" (accuracy: 92%)

Which deck would you like to start with?
```

### Checking Stats

See how you are doing across all decks:

```
You: Show me my flashcard stats

Study Buddy: Here's your flashcard overview:
- Total cards: 147 across 6 decks
- Cards mastered: 89 (61%)
- Cards learning: 42 (29%)
- Cards new: 16 (11%)
- Overall accuracy: 84%
- Current streak: 5 days
- Weakest deck: "Integration Techniques" (68% accuracy)
```

## Scheduling Algorithm

The plugin uses SM-2 (SuperMemo 2) scheduling:

1. New cards start with 1-day and 10-minute learning steps
2. After graduating, cards enter the review queue with increasing intervals
3. Easy cards get longer intervals; difficult cards get shorter ones
4. The ease factor adjusts based on your self-rated recall quality
5. Failed cards return to the learning queue

Default settings:
- New cards per day: 10
- Reviews per day: 50
- Graduating interval: 1 day
- Maximum interval: 365 days

## Card Formats

### Basic (Front/Back)
```
Front: What is the powerhouse of the cell?
Back: The mitochondria — it produces ATP through cellular respiration.
```

### Reverse (Bidirectional)
```
Front: Mitochondria
Back: Organelle that produces ATP through cellular respiration (the powerhouse of the cell)
```

### Cloze Deletion
```
Text: The mitochondria is the {{powerhouse}} of the cell and produces {{ATP}}.
```

## Configuration

Settings in `config.yml` under `features.flashcards`:

```yaml
features:
  flashcards:
    enabled: true
    spacedRepetition: true
    algorithm: sm2
    dailyLimit: 50
    decks: auto
```

## Export

Export decks for use in Anki, Quizlet, or other apps:

```
You: Export my "Quadratic Equations" deck as CSV

Study Buddy: Done! I exported 24 cards to quadratic-equations.csv with columns:
front, back, subject, topic, difficulty, next_review, ease_factor
```
