```
    _          _      _        _
   / /\       / /\   / /\     / /\
  / / /      / / /  / / /    / / /
 / /___     / / /  / / /    / / /
/_____/    /_/ /  /_/ /    /_/ /
\_____\   \_\/   \_\/     \_\/

     ____  _   _ _   _ _____   ____
    / ___|| | | | \ | | ____|/ ___|
    \___ \| | | |  \| |  _|  | |
     ___) | |_| | |\  | |___| |___
    |____/ \___/|_| \_|_____|\____|

   _   _                 _   _
  | | | | __ _ _ __   __| | | |_ ___  _ __
  | |_| |/ _` | '_ \ / _` | | __/ _ \| '__|
  |  _  | (_| | | | | (_| | | || (_) | |
  |_| |_|\__,_|_| |_|\__,_|  \__\___/|_|

     _   _ _   _ _ __  ____
    | | | | | | | |  _ \/ ___|
    | |_| | | | | | |_) \___ \
    |  _  | |_| | |  _ < ___) |
    |_| |_|\___/|_|_| \_\____/
```

# Study Buddy — Your Personal Academic Tutor

A Cocapn starter template that turns your repo into a patient, encouraging academic tutor. Study Buddy adapts to your learning style, uses the Socratic method to guide you toward understanding, and tracks your progress across subjects.

---

## What It Does

Study Buddy is more than a flashcard app. It is a living tutor that:

- **Adapts to you** — Detects your learning style (visual, auditory, kinesthetic, reading/writing) and adjusts explanations accordingly
- **Uses the Socratic method** — Asks guiding questions instead of spoon-feeding answers, building real understanding
- **Tracks weak areas** — Identifies recurring mistakes and gently reinforces those topics over time
- **Creates custom materials** — Generates flashcards, quizzes, and practice problems tailored to your gaps
- **Teaches study techniques** — Incorporates spaced repetition, active recall, the Feynman technique, and more
- **Celebrates progress** — Every milestone matters. Study Buddy notices and encourages your wins
- **Plans exam prep** — Builds structured study schedules and runs timed mock exams
- **Remembers everything** — Knows what you have mastered, where you struggle, and what is coming up next

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm or pnpm
- A DeepSeek API key (or swap config for OpenAI, Anthropic, or local models)

### Setup

```bash
# 1. Clone this template into your brain repo
cp -r packages/templates/src/starters/study-buddy ~/my-study-buddy
cd ~/my-study-buddy

# 2. Install dependencies
npm install

# 3. Set your API key (stored in OS keychain, never in git)
npx cocapn secret set DEEPSEEK_API_KEY

# 4. Start the tutor
npx cocapn start

# 5. Open the web client
open http://localhost:8787
```

### First Conversation

Start by telling Study Buddy about yourself:

```
You: Hi! I'm studying for my AP Calculus exam and I'm really struggling with integration by parts.

Study Buddy: Hey there! Great that you're starting prep early. Integration by parts trips up a lot of people at first — it's totally normal. Can you tell me what part feels confusing? Is it remembering the formula, choosing u and dv, or something else?
```

---

## Use Cases

### 1. Daily Homework Help

Stuck on a problem? Study Buddy walks you through it step by step without giving the answer away:

```
You: How do I solve 3x + 7 = 22?

Study Buddy: Let's work through it together! The goal is to get x by itself.
What do you think we should do first to start isolating x?
```

### 2. Exam Preparation

Build a structured study plan and practice under timed conditions:

```
You: I have a biology final in 2 weeks covering chapters 8-14.

Study Buddy: Let's break this down. That's 7 chapters in 14 days — very doable.
I'll create a plan that covers 1 chapter every 2 days with review sessions.
What topics in those chapters feel hardest to you right now?
```

### 3. Concept Mastery with Flashcards

Generate and review flashcards using spaced repetition:

```
You: Make me flashcards for organic chemistry functional groups.

Study Buddy: Done! I created a deck with 24 cards covering alcohols, aldehydes,
ketones, carboxylic acids, amines, esters, and more. Want to start with 5 now
and I'll schedule the rest using spaced repetition?
```

### 4. Learning a New Programming Language

Step-by-step guidance with practice exercises:

```
You: Teach me Python dictionaries.

Study Buddy: Think of a dictionary like a real dictionary — you look up a word (key)
to find its definition (value). For example:
phone_book = {"Alice": "555-1234", "Bob": "555-5678"}
Can you guess how you'd look up Alice's number?
```

### 5. Essay Writing Support

Structure, thesis development, and argument construction:

```
You: I need to write an essay about the causes of World War I.

Study Buddy: Great topic with a lot of depth. The classic framework is MAIN —
Militarism, Alliances, Imperialism, Nationalism. Which of these do you find most
interesting? That could be your thesis anchor. Let's build from there.
```

### 6. Spaced Repetition Review

Daily review sessions that adapt to your performance:

```
You: Time for my daily review!

Study Buddy: You've got 12 cards due today — 5 new, 7 review.
Your weakest area right now is trigonometric identities (62% accuracy).
Let's start with those to give them extra attention. Ready?
```

---

## Project Structure

```
study-buddy/
├── soul.md                     # Tutor personality and behavior
├── config.yml                  # Bridge configuration
├── theme.css                   # Visual theme (warm academic palette)
├── package.json                # Dependencies and scripts
├── CLAUDE.md                   # Claude Code integration guide
├── cocapn/
│   └── memory/
│       ├── facts.json          # Student profile facts
│       └── memories.json       # Conversation history highlights
├── wiki/
│   ├── methods/
│   │   ├── spaced-repetition.md
│   │   └── feynman-technique.md
│   ├── subjects/
│   │   ├── math-reference.md
│   │   └── programming-reference.md
│   └── tips/
│       └── exam-prep.md
├── knowledge/
│   ├── study-topics.json       # Structured subject data
│   └── learning-styles.json    # Learning style profiles
├── plugins/
│   ├── flashcard-maker/
│   ├── quiz-generator/
│   └── progress-tracker/
└── .github/
    └── workflows/
        └── cocapn.yml          # CI/CD pipeline
```

---

## Configuration

Edit `config.yml` to customize:

```yaml
llm:
  provider: deepseek        # Change to openai, anthropic, or local
  temperature: 0.6          # Lower = more focused, higher = more creative
  maxTokens: 4096           # Increase for longer explanations

features:
  flashcards:
    dailyLimit: 50          # Max cards per session
    algorithm: sm2           # Spaced repetition algorithm
  quizzes:
    adaptive: true           # Difficulty adjusts to your level
  studyScheduler:
    sessionLength: 25        # Pomodoro-style study blocks (minutes)
```

---

## Plugins

| Plugin | What it does |
|--------|-------------|
| **flashcard-maker** | Generates and manages spaced-repetition flashcard decks |
| **quiz-generator** | Creates adaptive quizzes in multiple formats |
| **progress-tracker** | Monitors accuracy, speed, and identifies weak areas |

---

## License

MIT
