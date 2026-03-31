# Quiz Generator Plugin

Creates adaptive quizzes that adjust to your knowledge level, testing understanding and identifying weak areas. Supports multiple question formats and timed exam simulation.

## What It Does

- Generates quizzes in four formats: multiple choice, fill-in-the-blank, short answer, and true/false
- Adapts difficulty based on your performance — gets harder as you improve
- Targets weak areas automatically based on past quiz results and brain facts
- Simulates real exam conditions with timed mock exams
- Tracks scores over time to measure improvement
- Creates plausible distractors for multiple choice that test real understanding

## Usage

### Quick Quiz

Get a fast 5-question quiz focused on your weakest areas:

```
You: Give me a quick quiz

Study Buddy: Quick Quiz — 5 questions on your weakest areas:
1. [Calculus] What is the integral of 1/x? (fill-in-the-blank)
2. [Biology] Which organelle is responsible for protein synthesis? (multiple choice)
3. [History] The Monroe Doctrine was primarily about... (short answer)
4. [Calculus] True or False: The derivative of a constant is zero. (true/false)
5. [Biology] What is the role of RNA polymerase? (short answer)

Ready to start? I'll time each question at 60 seconds.
```

### Subject-Specific Quiz

Quiz yourself on a specific subject:

```
You: Quiz me on AP Calculus — integration techniques, 10 questions

Study Buddy: Starting quiz: Integration Techniques (10 questions)
Difficulty will adapt as you go. Let's begin!

Q1: Which integration technique is best for ∫x·e^x dx?
a) u-substitution
b) Integration by parts
c) Partial fractions
d) Trigonometric substitution
```

### Timed Mock Exam

Simulate real exam conditions:

```
You: Run a mock AP Calculus AB exam

Study Buddy: Mock AP Calculus AB Exam
- Duration: 90 minutes
- Format: 15 multiple choice + 3 free response
- Scoring: AP scale (1-5)
- Timer starts when you say "begin"

This will cover limits, derivatives, integration, and applications.
Ready to start?
```

### Reviewing Results

After a quiz, get detailed feedback:

```
You: Show me my quiz results

Study Buddy: Quiz Results — Integration Techniques
Score: 7/10 (70%)
Time: 8 minutes 32 seconds

Breakdown:
- Correct: u-substitution, basic integrals, power rule, chain rule review,
  fundamental theorem, area problems, definite integrals
- Incorrect: integration by parts (chose wrong u), partial fractions
  (setup error), trig substitution (did not recognize pattern)

Weak area identified: Integration technique selection
Recommendation: Review the LIATE rule and practice identifying which
technique to use before solving.
```

## Question Formats

### Multiple Choice
Four options with plausible distractors generated from common misconceptions and related concepts. The wrong answers are not random — they represent real mistakes students make.

### Fill-in-the-Blank
Tests precise recall. Accepts reasonable alternative phrasings. Not case-sensitive by default.

### Short Answer
Requires producing an explanation in your own words. Graded on key concept coverage, not exact wording.

### True/False
Balanced between true and false statements. Avoids double negatives. Tests nuanced understanding — many statements are "mostly true but with one wrong detail."

## Adaptive Difficulty

The quiz adjusts in real time:

- **Start at medium** difficulty for most questions
- **Answer correctly** — next question gets harder
- **Answer incorrectly** — next question gets easier
- **Points scale** with difficulty: easy (0.5x), medium (1x), hard (1.5x)

This ensures the quiz is never boringly easy or frustratingly hard.

## Configuration

Settings in `config.yml` under `features.quizzes`:

```yaml
features:
  quizzes:
    enabled: true
    adaptive: true
    formats:
      - multiple-choice
      - fill-in-blank
      - short-answer
      - true-false
    difficultyScaling: true
```

## Weekly Auto-Quiz

The plugin automatically suggests a weekly review quiz on Sundays, targeting your weakest areas from the past week of study. You can disable this in the scheduler config.
