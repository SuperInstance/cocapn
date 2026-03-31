# Creative Writer

```
                        ,/
                      .'/\
                     / / /
                    / / /
                   / / /
                  / / /
       .--------'  '--------.
      /    _             _    \
     |    / \           / \    |
     |    \_/           \_/    |
     |     ,             ,     |
     |    /               \    |
     |   /                 \   |
     '--'                   '--'
      /                       \
     |    Creative Writer      |
     |    A Writing Companion  |
      \_______________________/
```

A **Cocapn starter** for writers. Your literary companion lives in your repo, remembers your characters, tracks your word count, and helps you build stories that hold together from first draft to final polish.

---

## What It Does

**Creative Writer** is a writing coach, story architect, and revision partner rolled into one agent. It runs locally, keeps your work private, and builds institutional memory about your writing projects over time.

- **Story structure** -- Break your narrative into acts, beats, and scenes. See where the sag is. Fix it.
- **Character development** -- Build character bibles with arcs, motivations, contradictions, and growth. Track consistency across chapters.
- **Worldbuilding** -- Create internally consistent worlds with histories, cultures, rules, and maps. Never contradict your own lore.
- **Dialogue coaching** -- Write dialogue that sounds like people, not exposition delivery systems. Handle subtext, voice, and dialect.
- **Revision guidance** -- Get structured feedback on drafts: scene-level diagnosis, pacing issues, and specific rewrite suggestions.
- **Word count tracking** -- Set goals, run sprints, and watch your daily output grow. The word-counter plugin keeps score.
- **Brainstorming mode** -- Throw ideas at the wall. Get back plot hooks, character concepts, "what if" scenarios, and thematic angles.
- **Persistent memory** -- Your agent remembers your projects, characters, preferences, and recurring craft issues across every session.

---

## Quick Start

### Prerequisites

- Node.js 18+
- A DeepSeek API key (or swap in OpenAI / Anthropic in `config.yml`)

### Setup

```bash
# Clone this starter into your private brain repo
git clone <your-brain-repo> my-brain
cd my-brain

# Copy the creative-writer starter files in
cp -r /path/to/creative-writer/* .

# Set your API key (stored in OS keychain, never in git)
cocapn secret set DEEPSEEK_API_KEY

# Start the bridge
cocapn start --public ../my-public-face
```

### First Conversation

```
You: I'm starting a new novel. It's about a cartographer who
     discovers that the maps she's been drawing for years have
     been altering the landscape itself.

Creative Writer: That's a wonderful premise -- the idea that
representation reshapes reality has deep roots. Let me ask a few
questions before we start building...

  1. What's the cartographer's emotional relationship to her work
     before she discovers this power? Does she love it, resent it,
     or feel trapped by it?
  2. How does she discover the maps are changing things? A specific
     incident, or a slow realization?
  3. What genre are you drawn toward -- literary fantasy, magical
     realism, or something that leans more thriller?

Let's figure out who she is before we figure out what happens to her.
```

---

## Use Cases

### Long-Form Novel Writing

Track chapters, character arcs, subplots, and word counts across a 80,000+ word manuscript. The character-bible plugin keeps every character's details consistent from page 1 to the epilogue.

### Short Story Development

Brainstorm, draft, and revise short fiction with craft-focused feedback on pacing, voice, and thematic resonance. Perfect for workshop preparation or submission-ready polishing.

### Worldbuilding Projects

Build out a setting before you write a single scene. The wiki system stores histories, cultures, magic systems, technology trees, and political structures. Your agent remembers every detail so you don't have to.

### Writing Groups and Collaboration

Run the bridge as a shared resource for a writing group. Each member gets their own brain namespace. Compare notes, share worldbuilding, and get personalized feedback.

### Daily Writing Practice

Use the daily prompt generator and writing sprint timer to establish a consistent habit. Track your streak, word counts, and progress over time.

### Revision and Editing

Import an existing draft and get structured revision notes: scene-by-scene diagnosis, pacing analysis, dialogue cleanup, and consistency checks. The agent tracks what you've revised and what still needs attention.

---

## Project Structure

```
creative-writer/
├── soul.md                    # Agent personality and literary identity
├── config.yml                 # Bridge configuration
├── theme.css                  # Literary color palette and typography
├── package.json               # Package metadata
├── cocapn/
│   └── memory/
│       ├── facts.json         # Writer preferences and project state
│       └── memories.json      # Session memories and craft notes
├── wiki/
│   ├── craft/
│   │   ├── story-structure.md
│   │   ├── character-development.md
│   │   ├── worldbuilding.md
│   │   └── dialogue-tips.md
│   └── genres/
│       └── scifi-tropes.md
├── knowledge/
│   └── plot-structures.json   # Plot templates and frameworks
├── plugins/
│   ├── story-planner/         # Story planning and beat sheets
│   ├── character-bible/       # Character tracking and consistency
│   └── word-counter/          # Word count goals and sprint tracking
└── .github/
    └── workflows/
        └── cocapn.yml         # CI/CD pipeline
```

---

## Plugins

| Plugin | What it does |
|--------|-------------|
| **story-planner** | Beat sheets, scene lists, act breakdowns, and plot structure templates |
| **character-bible** | Character profiles, relationship maps, arc tracking, and consistency checking |
| **word-counter** | Daily/weekly/monthly word count goals, sprint timer, and progress visualization |

---

## Configuration

Edit `config.yml` to customize your writing environment:

- **LLM provider** -- Switch between DeepSeek, OpenAI, Anthropic, or local models
- **Temperature** -- Lower for analytical feedback (0.5), higher for brainstorming (0.9)
- **Word count goals** -- Daily, weekly, and project-level targets
- **Auto-save** -- Automatically commit drafts at configurable intervals
- **Export formats** -- Markdown, plain text, or HTML

---

## License

MIT
