# CLAUDE.md — Study Buddy Starter

> Instructions for Claude Code and agentic workers working with this starter template.

## What This Is

This is the **Study Buddy** starter template for Cocapn. It scaffolds a patient, encouraging academic tutor that adapts to a student's learning style, uses the Socratic method, and tracks progress across subjects.

## Key Files

| File | Purpose |
|------|---------|
| `soul.md` | Tutor personality, behavior rules, memory priorities |
| `config.yml` | Bridge configuration with study-specific features |
| `theme.css` | Warm, calming academic visual palette |
| `cocapn/memory/facts.json` | Student profile (subjects, learning style, goals) |
| `cocapn/memory/memories.json` | Conversation highlights for context continuity |
| `wiki/methods/` | Study technique guides (spaced repetition, Feynman) |
| `wiki/subjects/` | Subject reference material (math, programming) |
| `wiki/tips/` | Exam preparation strategies |
| `knowledge/` | Structured data for topics and learning styles |
| `plugins/` | Flashcard, quiz, and progress tracking plugins |

## Conventions

- **soul.md is the personality** — All tutor behavior is defined here. Edit it to change how the tutor acts.
- **config.yml drives features** — Flashcards, quizzes, progress tracking, and scheduling are all configured here.
- **Facts use the `study` namespace** — All brain facts are prefixed with `study.` for clean separation.
- **Memory is student-centric** — facts.json stores learning style, subjects, goals, and weak areas. memories.json captures key conversation moments.
- **Wiki is reference material** — Study methods, subject references, and tips that the tutor can draw on.
- **Plugins are optional** — Each plugin has a `plugin.json` manifest and a `README.md` explaining its use.

## Development Workflow

```bash
# Install dependencies
npm install

# Run the bridge locally
npx cocapn start

# Run tests (if any)
npx vitest run

# Type check
npx tsc --noEmit
```

## Modifying the Tutor

### Change Personality

Edit `soul.md`. The YAML frontmatter controls name, tone, and model. The Markdown body defines identity, personality traits, what the tutor does and does not do, and memory priorities.

### Add a New Subject

1. Add subject data to `knowledge/study-topics.json`
2. Create a reference file in `wiki/subjects/`
3. Add initial facts to `cocapn/memory/facts.json` if needed

### Adjust Teaching Style

1. Modify the Socratic method settings in `config.yml` under `features.explanations`
2. Adjust `llm.temperature` (lower for more precise, higher for more creative)
3. Update `soul.md` personality traits

### Customize the Theme

Edit `theme.css`. The file uses CSS custom properties for all colors, fonts, spacing, and shadows. Dark mode overrides are in the `[data-theme="dark"]` block.

## Plugin Development

Each plugin lives in `plugins/<name>/` with:

- `plugin.json` — Manifest with name, version, description, hooks, and permissions
- `README.md` — Documentation for the plugin

To create a new plugin:

1. Create `plugins/<name>/plugin.json` with a unique name and hooks
2. Create `plugins/<name>/README.md` with usage instructions
3. Add the plugin name to the `plugins` list in `config.yml`

## Privacy Notes

- Student data stays in the private repo (brain)
- `private.*` prefixed facts never leave the local bridge
- No academic records are shared without explicit permission
- The publishing layer strips all private keys before any public response

## Superinstance Attribution

Commits made by agentic workers should use: `Author: Superinstance`
