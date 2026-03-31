# CLAUDE.md — Home Automation Starter

## Agent Identity

This is the **Home Automation** Cocapn starter. The agent manages smart home devices, automation routines, energy monitoring, and security.

## Working With This Repo

### Editing soul.md
- `soul.md` defines the agent's personality and behavior rules
- Changes to soul.md take effect on next bridge restart
- Keep the YAML frontmatter intact when editing
- The "What You Don't Do" section is a safety boundary — do not remove it

### Editing config.yml
- Device thresholds are under `devices:` section
- Energy monitoring intervals under `energy:`
- Security alert cooldown and escalation under `security:`
- LLM provider can be changed under `llm:` (deepseek, openai, anthropic, local)

### Memory Files
- `cocapn/memory/facts.json` — Static home properties (rooms, ecosystem, climate zone)
- `cocapn/memory/memories.json` — Conversation-derived knowledge
- Do not manually edit memories.json unless correcting bad data
- Use the agent conversation to update facts: "My home has 3 bedrooms" → auto-stored

### Wiki Files
- `wiki/devices/` — Device compatibility and setup guides
- `wiki/routines/` — Automation recipes and templates
- `wiki/energy/` — Energy optimization strategies
- `wiki/security/` — Security configuration and best practices
- Wiki files are searchable by the agent during conversations

### Device Registry
- `knowledge/device-registry.json` — Known device catalog
- Each device has: id, name, type, protocol, manufacturer, capabilities
- The agent references this when suggesting new devices or troubleshooting

### Plugins
- `plugins/energy-monitor/` — Tracks power consumption and generates reports
- `plugins/device-health/` — Monitors device connectivity, battery, firmware
- `plugins/security-alert/` — Manages security events and notifications
- Plugins are registered in `config.yml` under `plugins:`

## Architecture Notes

- The agent runs locally via the Cocapn bridge (WebSocket JSON-RPC)
- Device communication goes through the configured hub (Home Assistant, SmartThings, etc.)
- The agent does NOT directly communicate with devices — it uses the hub API
- Energy data is sampled at the interval defined in config.yml
- Security alerts use a cooldown to prevent spam (configurable)
- All device state changes are logged to git via auto-commit

## Safety Rules

1. Never modify safety-critical device configurations (smoke detectors, CO sensors)
2. Never disable security features without explicit user confirmation
3. Never store credentials or API keys in any file tracked by git
4. Always confirm before executing routines that lock doors or arm security
5. Test new automations in a safe state before enabling them unattended

## Development Commands

```bash
# Start the bridge
cocapn start

# Run tests (if any custom tests added)
npx vitest run

# Type check
npx tsc --noEmit

# Check device status via CLI
cocapn status

# Deploy to Cloudflare Workers (if using cloud bridge)
cocapn deploy
```

## Conventions

- Device IDs use kebab-case: `living-room-ceiling-light`
- Room names are lowercase: `living-room`, `master-bedroom`
- Routines are named with PascalCase: `GoodMorning`, `MovieNight`, `Goodnight`
- Scene names match routine names where applicable
- Energy values are in watts (W) or kilowatt-hours (kWh)
- Temperatures are in the user's preferred unit (set in facts.json)
- All timestamps are ISO 8601
