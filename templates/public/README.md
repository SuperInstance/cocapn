# {{domain}} — Cocapn Public UI

This is the GitHub Pages frontend for your Cocapn agent OS instance.

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Start the local bridge (in a separate terminal, pointing at your private repo)
npx cocapn-bridge --repo ../{{username}}-brain

# 3. Start the dev server
npm run dev
```

Open http://localhost:5173 — the status dot in the header will turn green when
the bridge connects.

## How it works

```
Browser (this repo)
  └─ WebSocket → local bridge (port 8787)
                   └─ Git sync  → private repo ({{username}}-brain)
                   └─ Spawner  → Claude Code / Pi / other agents
```

The bridge is a small Node.js process you run locally. It:
- Keeps the private repo in sync with GitHub (30-second pull cycle)
- Spawns and manages AI agents
- Streams their output back to the browser over WebSocket

## Deployment

This repo is pre-configured for GitHub Pages. Every push to `main` triggers
`.github/workflows/deploy.yml`, which builds the Vite app and deploys it.

You need one GitHub Pages setting: **Settings → Pages → Source → GitHub Actions**.

### Custom domain

Edit `CNAME` to match your domain, then add a CNAME DNS record pointing at
`<username>.github.io`.

## Connecting from outside your home network

Run the bridge with `--tunnel` to get a public URL via Cloudflare Tunnel:

```bash
npx cocapn-bridge --repo ../{{username}}-brain --tunnel
```

Copy the printed `wss://...trycloudflare.com` URL, then set it in your deployed
page by adding a `<meta>` tag to `index.html`:

```html
<meta name="bridge-url" content="wss://your-tunnel.trycloudflare.com">
```

Or store it in `sessionStorage` from the browser console:

```js
sessionStorage.setItem("cocapn_bridge_url", "wss://your-tunnel.trycloudflare.com");
```

## Skin customisation

Edit `skin/makerlog/theme.css` to change colours and fonts. The CSS custom
properties map directly to the Tailwind classes used throughout the app:

| Variable | Default | Used for |
|---|---|---|
| `--color-primary` | `#00ff88` | Accent colour, links |
| `--color-bg` | `#0a0a0a` | Page background |
| `--color-surface` | `#111111` | Card / panel backgrounds |
| `--color-border` | `#222222` | Borders, dividers |
| `--color-text` | `#e0e0e0` | Body text |
| `--color-text-muted` | `#666666` | Secondary text |

## Project structure

```
.
├── cocapn.yml              # Public config (skin, modules, agents, orchestrator)
├── index.html              # Entry point — sets data-domain, loads skin CSS
├── skin/
│   └── makerlog/
│       ├── theme.css       # CSS custom properties for this skin
│       └── layout.json     # Panel layout config (sidebar, main, terminal)
├── src/
│   ├── App.tsx             # Root component — reads domain, manages bridge
│   ├── components/
│   │   └── Shell.tsx       # Top-level layout (header, sidebar, main)
│   └── hooks/
│       └── useBridge.ts    # WebSocket hook with exponential-backoff reconnect
└── .github/
    └── workflows/
        └── deploy.yml      # GitHub Pages deploy
```

## Authentication

When the bridge runs with auth enabled (the default), connecting requires a
GitHub Personal Access Token. Click **Connect to local bridge** in the UI and
paste your PAT when prompted, or set it programmatically:

```js
sessionStorage.setItem("cocapn_token", "github_pat_...");
```

The token is validated against `https://api.github.com/user` by the bridge and
is never stored on disk.

## Building for production

```bash
npm run build   # outputs to dist/
npm run preview # preview the production build locally
```
