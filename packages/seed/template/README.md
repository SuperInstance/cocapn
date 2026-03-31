# cocapn seed

The repo IS the agent.

## Quick Start

```bash
# 1. Add these 3 files to any repo
cp -r template/ your-repo/

# 2. Set your API key
export DEEPSEEK_API_KEY=your-key

# 3. Run
cd your-repo && npx cocapn

# 4. Or start web chat
npx cocapn --web
```

## The 3 Files

- `soul.md` — personality and self-perception rules
- `cocapn.json` — config (model, port, name)
- `.cocapn/` — auto-created memory store

## What Happens

1. Reads soul.md → builds system prompt
2. Scans git log + file tree → "I am [name], born [date], I have [n] files..."
3. Starts chat → user message → context → DeepSeek → response → save memory
4. Remembers everything across sessions in .cocapn/memory.json
