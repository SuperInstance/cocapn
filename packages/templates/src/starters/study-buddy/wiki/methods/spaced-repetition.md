# Spaced Repetition — The Science of Remembering

Spaced repetition is a learning technique where you review information at increasing intervals over time. Instead of cramming everything into one session, you revisit material just as you are about to forget it. This leverages the psychological concept of the "spacing effect," first described by Hermann Ebbinghaus in 1885.

## How It Works

The core idea is simple: each time you successfully recall a piece of information, the interval before your next review increases. If you fail to recall it, the interval resets and you review it again sooner.

A typical progression might look like:

1. Review after 1 day
2. Review after 3 days
3. Review after 7 days
4. Review after 14 days
5. Review after 30 days
6. Review after 60 days

By the time you reach the longer intervals, the information has moved into long-term memory.

## The Forgetting Curve

Ebbinghaus discovered that we forget information exponentially after learning it. Without review, you lose roughly:

- 50% within 1 hour
- 70% within 24 hours
- 80% within 1 week
- 90% within 1 month

Spaced repetition interrupts this curve at optimal moments, flattening it out so retention stays high.

## The SM-2 Algorithm

The most widely used spaced repetition algorithm is SM-2 (SuperMemo 2), created by Piotr Wozniak in 1987. It assigns each card an easiness factor (EF) that adjusts based on your self-rated recall quality:

- **Grade 5** — Perfect response. Interval increases significantly.
- **Grade 4** — Correct after hesitation. Interval increases normally.
- **Grade 3** — Correct but with serious difficulty. Interval stays the same or increases slightly.
- **Grade 2** — Incorrect but felt easy to recall. Interval resets to a short value.
- **Grade 1** — Incorrect, but the answer felt familiar. Reset interval.
- **Grade 0** — Complete failure. Reset interval.

The formula for updating the interval:

```
I(1) = 1 day
I(2) = 6 days
I(n) = I(n-1) * EF  (for n > 2)
```

Where EF typically starts at 2.5 and adjusts based on performance.

## Practical Implementation

### Flashcard Best Practices

1. **Keep cards atomic** — One concept per card. "What is the derivative of sin(x)?" not "Explain all trig derivatives."
2. **Use both directions** — If learning vocabulary, test forward (term to definition) and backward (definition to term).
3. **Add context clues** — Include a brief context to trigger the right association. "In calculus, what does the chain rule state?"
4. **Review daily** — Consistency beats volume. 15 minutes daily is better than 2 hours once a week.
5. **Be honest with self-grading** — Over-rating your recall defeats the algorithm. If you struggled, grade honestly.

### When to Schedule Reviews

- **Morning** is often best for review when your mind is fresh
- Avoid reviewing right after learning new material — wait at least a few hours
- Never skip more than 2 days in a row or the forgetting curve takes over
- If backlog builds up, prioritize cards with the shortest intervals first

## Combining with Other Techniques

Spaced repetition works best when combined with:

- **Active recall** — Force yourself to produce the answer, not just recognize it
- **Elaborative encoding** — Connect new information to existing knowledge
- **Interleaving** — Mix different topics in a session rather than blocking one subject
- **The Feynman technique** — Explain the concept in simple terms to deepen understanding

## Common Mistakes

- **Creating too many cards at once** — Start small and build up. 5-10 new cards per day is sustainable.
- **Memorizing without understanding** — If you cannot explain why something is true, you are memorizing, not learning.
- **Ignoring the algorithm** — The scheduling is the magic. Do not override it to "review everything today."
- **Only using recognition** — Cover the answer. Force recall. Recognition is not the same as retrieval.
