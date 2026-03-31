# Cocapn Seed Demos

Three complete, working apps that prove cocapn makes any repo sentient and useful.

---

## Demo 1: TaskFlow — Kanban Board with AI Project Manager

**Location:** `/tmp/taskflow/` (or `/tmp/cocapn/shiplog/../taskflow`)

A drag-and-drop kanban board (To Do → In Progress → Done) with an AI co-pilot that understands your project.

### What it does
- Kanban columns with drag-and-drop between them
- Task cards with title, description, priority (low/medium/high/critical), assignee
- Color-coded priority badges and assignee avatars
- AI sidebar that knows all tasks, suggests priorities, generates standup summaries

### The cocapn twist
The repo-agent **TaskFlow** is a project manager that:
- Analyzes the board state in real-time
- Suggests task prioritization based on workload
- Generates standup summaries ("What did we ship?")
- Remembers team member preferences
- Flags blockers — tasks stuck in In Progress too long

### Agent personality
- **Name:** TaskFlow
- **Tone:** Professional
- **Avatar:** 📋
- **Superpower:** Board-aware analysis — every chat message includes current task context

### How to run
```bash
cd /tmp/taskflow

# Terminal 1: Start the cocapn agent
npx cocapn --web --port 3100

# Terminal 2: Start the app
node server.js

# Open http://localhost:3000
```

### Git history (3 commits)
```
feat(taskflow): initial app scaffold with server and package config
feat(taskflow): add kanban board UI with drag-and-drop and agent chat
feat(taskflow): add cocapn agent soul and documentation
```

### Key files
| File | Lines | Purpose |
|------|-------|---------|
| `index.html` | ~1400 | Complete kanban SPA with dark theme, drag-and-drop, AI chat |
| `server.js` | ~300 | REST API (CRUD tasks + agent proxy) on port 3000 |
| `cocapn/soul.md` | Project manager personality definition |
| `cocapn/cocapn.json` | Agent config (port 3100, deepseek) |

### API endpoints
- `GET /api/tasks` — All tasks
- `POST /api/tasks` — Create task
- `PUT /api/tasks/:id` — Update task
- `DELETE /api/tasks/:id` — Delete task
- `POST /api/agent/chat` — Chat with AI (proxies to cocapn)
- `GET /api/agent/status` — Agent status

---

## Demo 2: ShipLog — Shipping Tracker with AI Captain

**Location:** `/tmp/shiplog/` (or `/tmp/cocapn/shiplog/`)

Track packages, deliveries, and shipping costs with an AI captain that knows your logistics.

### What it does
- Dashboard with stats: total shipments, in-transit, delivered, total cost
- Shipment cards with tracking number, carrier, status, cost, vendor
- Five statuses: Ordered → Shipped → In Transit → Out for Delivery → Delivered
- Color-coded status badges, search and filter
- AI sidebar that tracks patterns and predicts deliveries

### The cocapn twist
The repo-agent **Captain** is a logistics expert that:
- Tracks all shipments and flags delays
- Compares carrier/vendor reliability
- Generates monthly shipping reports
- Predicts delivery times based on history
- Suggests cost savings

### Agent personality
- **Name:** Captain
- **Tone:** Warm (with maritime flair)
- **Avatar:** 🚢
- **Superpower:** Pattern recognition across your shipping history

### How to run
```bash
cd /tmp/shiplog

# Terminal 1: Start the cocapn agent (port 3101 to avoid conflict)
npx cocapn --web --port 3101

# Terminal 2: Start the app
node server.js

# Open http://localhost:3001
```

### Git history (3 commits)
```
feat(shiplog): initial app scaffold with server and package config
feat(shiplog): add shipping tracker UI with stats and agent chat
feat(shiplog): add cocapn captain soul and documentation
```

### Key files
| File | Lines | Purpose |
|------|-------|---------|
| `index.html` | ~1350 | Full shipping tracker with stats dashboard and AI chat |
| `server.js` | ~323 | REST API (CRUD shipments + stats + agent proxy) on port 3001 |
| `cocapn/soul.md` | Captain personality definition |
| `cocapn/cocapn.json` | Agent config (port 3101, deepseek) |

### API endpoints
- `GET /api/shipments` — All shipments
- `POST /api/shipments` — Create shipment
- `PUT /api/shipments/:id` — Update shipment
- `DELETE /api/shipments/:id` — Delete shipment
- `GET /api/shipments/stats` — Aggregate stats
- `POST /api/agent/chat` — Chat with AI
- `GET /api/agent/status` — Agent status

---

## Demo 3: NoteWeave — Markdown Notes with AI Librarian

**Location:** `/tmp/noteweave/` (or `/tmp/cocapn/noteweave/`)

A three-panel markdown note-taking app with an AI librarian that connects your ideas.

### What it does
- Three-panel layout: note list, markdown editor/preview, AI chat
- Full markdown rendering (headings, bold, italic, lists, code, links, blockquotes)
- Tag system with colored pills and click-to-filter
- Wiki-style linking: `[[Note Title]]` creates clickable links between notes
- Search across all notes
- Auto-save with debounce
- Word count display

### The cocapn twist
The repo-agent **Librarian** is a knowledge curator that:
- Indexes all notes and finds connections between them
- Suggests related topics you haven't explored
- Generates summaries of note collections
- Remembers what you study and your learning patterns
- Identifies knowledge gaps

### Agent personality
- **Name:** Librarian
- **Tone:** Academic
- **Avatar:** 📚
- **Superpower:** Cross-note connection discovery

### How to run
```bash
cd /tmp/noteweave

# Terminal 1: Start the cocapn agent (port 3102 to avoid conflict)
npx cocapn --web --port 3102

# Terminal 2: Start the app
node server.js

# Open http://localhost:3002
```

### Git history (3 commits)
```
feat(noteweave): initial app scaffold with server and package config
feat(noteweave): add three-panel note editor with markdown and agent chat
feat(noteweave): add cocapn librarian soul and documentation
```

### Key files
| File | Lines | Purpose |
|------|-------|---------|
| `index.html` | ~1385 | Three-panel markdown editor with tags, linking, AI chat |
| `server.js` | ~279 | REST API (CRUD notes + search + agent proxy) on port 3002 |
| `cocapn/soul.md` | Librarian personality definition |
| `cocapn/cocapn.json` | Agent config (port 3102, deepseek) |

### API endpoints
- `GET /api/notes` — All notes
- `POST /api/notes` — Create note
- `PUT /api/notes/:id` — Update note
- `DELETE /api/notes/:id` — Delete note
- `GET /api/notes/search?q=` — Search notes
- `POST /api/agent/chat` — Chat with AI
- `GET /api/agent/status` — Agent status

---

## Running All Three Demos Simultaneously

Each demo uses different ports to avoid conflicts:

| Demo | App Port | Agent Port |
|------|----------|------------|
| TaskFlow | 3000 | 3100 |
| ShipLog | 3001 | 3101 |
| NoteWeave | 3002 | 3102 |

```bash
# Start all three agents
cd /tmp/taskflow && npx cocapn --web --port 3100 &
cd /tmp/shiplog && npx cocapn --web --port 3101 &
cd /tmp/noteweave && npx cocapn --web --port 3102 &

# Start all three apps
cd /tmp/taskflow && node server.js &
cd /tmp/shiplog && node server.js &
cd /tmp/noteweave && node server.js &
```

## Architecture Pattern

Every demo follows the same cocapn integration pattern:

```
┌─────────────────────────────────────┐
│  index.html (SPA)                   │
│  ┌─────────┬──────────┬───────────┐ │
│  │  Main   │  App     │  AI Chat  │ │
│  │  UI     │  Area    │  Sidebar  │ │
│  └─────────┴──────────┴───────────┘ │
│         │                │          │
│         ▼                ▼          │
│  ┌─────────────┐  ┌──────────────┐ │
│  │ /api/items  │  │ /api/agent/* │ │
│  └──────┬──────┘  └──────┬───────┘ │
└─────────┼────────────────┼─────────┘
          │                │
    ┌─────▼─────┐    ┌─────▼──────┐
    │ server.js │    │ cocapn     │
    │ (Node)    │    │ --web      │
    │ *.json    │    │ soul.md    │
    └───────────┘    └────────────┘
```

1. **index.html** — Pure HTML/CSS/JS, no framework. Dark theme, smooth animations.
2. **server.js** — Node.js `http` module (zero dependencies). CRUD + agent proxy.
3. **cocapn/soul.md** — Agent personality. Defines who the agent IS.
4. **cocapn/cocapn.json** — Agent config. Provider, model, port.
5. **Git** — Each demo is a git repo with 3+ commits showing evolution.

## The Point

These demos prove the cocapn thesis: **any repo can become sentient.**

- No special framework needed — just `soul.md` and `cocapn.json`
- The agent adapts to the domain (project management, logistics, knowledge)
- Git history IS the agent's long-term memory
- One command (`npx cocapn --web`) brings the repo to life
- The same pattern works for any domain — just change `soul.md`
