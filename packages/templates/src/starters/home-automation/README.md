# Home Automation Starter

```
           _______________________
          /                       \
         /    _   _   _   _   _   \
        /    | | | | | | | | | |   \
       /     |_| |_| |_| |_| |_|    \
      |      _   _   _   _   _      |
      |     | | | | | | | | | |     |
      |     |_| |_| |_| |_| |_|     |
      |                               |
      |     ____         ____         |
      |    |    |       |    |        |
      |    | O  |       | O  |       |
      |    |____|       |____|        |
      |                               |
      |    ___________                |
      |   |           |    []  []     |
      |   |   ~~~~    |    []  []     |
      |   |___________|               |
      |                               |
      |_______________________________|
            |     |     |     |
         -----------------------------------
         |  LIVING | KITCHEN | BED | OFFICE |
         |  [ON]   |  [OFF]  |[DIM]|  [ON]  |
         -----------------------------------
              SMART HOME — MANAGED
```

## What It Does

This starter gives you a fully configured smart home management agent powered by Cocapn. It handles your entire IoT ecosystem from a single brain:

- **Device Management** — Track every device, room by room. Know what is online, what needs updates, and what is draining batteries.
- **Automation Routines** — Morning wake-up, away mode, movie night, bedtime. Create complex routines with triggers, conditions, and delays.
- **Energy Monitoring** — Real-time and historical power consumption. Spot waste, optimize HVAC, and reduce your electricity bill.
- **Security Monitoring** — Motion, cameras, door sensors, smoke detectors. Get alerted when it matters, not when the cat walks by.
- **Scene Control** — Lighting, climate, blinds, and audio grouped into one-command scenes.
- **Anomaly Detection** — Notice when a device draws more power than usual, goes offline at odd times, or behaves unexpectedly.
- **Weather Integration** — Adjust HVAC, blinds, and irrigation based on forecasts and conditions.
- **Guest Access** — Temporary, scoped access for visitors without exposing your full setup.

## Quick Start

```bash
# Create your home automation repo
npm create cocapn -- --template home-automation

# Enter your private brain repo
cd my-home/cocapn

# Set your API key (stored in OS keychain, never in git)
cocapn secret set DEEPSEEK_API_KEY

# Start the bridge
cocapn start

# Talk to your home
# "What devices are offline?"
# "Set movie night scene in the living room"
# "How much energy did we use yesterday?"
# "Arm security in away mode"
```

### First-Time Setup

1. Edit `soul.md` to match your home — rooms, devices, preferences
2. Update `cocapn/memory/facts.json` with your home details
3. Add your devices to `knowledge/device-registry.json`
4. Review and customize `wiki/routines/example-routines.md`
5. Configure energy monitoring thresholds in `config.yml`

## Use Cases

### Daily Automation
```
You: "Good morning"
Agent: Good morning! Running your wake-up routine:
  - Bedroom lights rising to 60% over 10 minutes
  - Thermostat set to 72F (currently 68F)
  - Kitchen coffee maker started
  - blinds opening in living room and kitchen
  - Weather: Partly cloudy, high of 74F today
```

### Energy Optimization
```
You: "Why is our electric bill so high?"
Agent: Looking at the last 30 days of data:
  Top consumers:
  1. HVAC — 42% ($87) — running 2.3hrs more than last month
  2. Water heater — 18% ($37)
  3. Dryer — 12% ($25) — 23 cycles this month
  Recommendation: HVAC is cycling frequently. The living room
  sensor reads 3F higher than the thermostat. Check for blocked
  vents or consider a sensor recalibration.
```

### Security Monitoring
```
You: "Anything happen while we were out?"
Agent: Security summary for today (6:00 AM - 5:30 PM):
  - Front door: opened at 8:12 AM (package delivery), 2:45 PM
  - Back door: no activity
  - Garage: opened at 9:00 AM, closed at 9:05 AM (you)
  - Motion: backyard camera at 11:32 AM (squirrel — below threshold)
  - All zones disarmed at 6:00 AM as scheduled
  All clear. No anomalies detected.
```

### Device Troubleshooting
```
You: "The bedroom light keeps disconnecting"
Agent: Diagnosing bedroom overhead light (Zigbee, Hue A19):
  Signal strength: -82 dBm (weak, threshold is -70 dBm)
  Last 7 disconnections correlate with microwave usage.
  Diagnosis: Likely 2.4GHz interference from kitchen microwave.
  Fix options:
  1. Add a Zigbee repeater between kitchen and bedroom
  2. Move hub closer to the bedroom
  3. Replace with a Wi-Fi or Thread device
  Want me to log this and remind you to get a repeater?
```

### Scene Control
```
You: "Movie night"
Agent: Activating Movie Night scene:
  - Living room lights: dim to 10%
  - TV and soundbar: power on, input HDMI 1
  - Blinds: close
  - Thermostat: set to 70F
  - Front door: lock
  Scene active. Enjoy the movie!
```

## File Structure

```
home-automation/
├── soul.md                          # Agent personality and behavior
├── config.yml                       # Home automation configuration
├── theme.css                        # Smart home UI theme
├── CLAUDE.md                        # Claude Code integration
├── package.json                     # Package metadata
├── cocapn/
│   └── memory/
│       ├── facts.json               # Home facts and properties
│       └── memories.json            # Conversation memories
├── wiki/
│   ├── devices/supported-devices.md # Compatible hardware guide
│   ├── routines/example-routines.md # Automation recipes
│   ├── energy/monitoring.md         # Energy optimization guide
│   └── security/security-setup.md   # Security configuration
├── knowledge/
│   └── device-registry.json         # IoT device database
├── plugins/
│   ├── energy-monitor/              # Energy tracking plugin
│   ├── device-health/               # Device health monitoring
│   └── security-alert/              # Security alert system
└── .github/
    └── workflows/cocapn.yml         # CI/CD workflow
```

## Extending

- Add new devices in `knowledge/device-registry.json`
- Create new routines in `wiki/routines/`
- Add plugins to `plugins/` and register in `config.yml`
- Customize the theme in `theme.css`
- Tune energy thresholds in `config.yml` under `energy:`
- Update security rules in `wiki/security/`

## Requirements

- Node.js 18+
- A compatible smart home hub (Home Assistant recommended)
- At least one IoT device to manage
- DeepSeek API key (or change `config.yml` to use OpenAI/Anthropic)
