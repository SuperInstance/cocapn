# Security Alert System Plugin

Manages home security modes, monitors all security sensors, processes alerts with graduated escalation, and coordinates emergency responses.

## Features

- **Security modes** — Five modes with distinct sensor activation rules: disarmed, home-day, home-night, away, vacation
- **Graduated alerts** — Four-tier escalation from push notification to emergency dispatch
- **False positive reduction** — Dual-trigger requirement, camera AI verification, pet immunity
- **Camera management** — Recording schedules, retention policies, privacy zones
- **Emergency response** — Automated light activation, door lock/unlock, siren, and emergency contacts
- **Event logging** — Complete audit trail of all security events with timestamps and sensor data
- **Tamper detection** — Alert if any security device is physically tampered with
- **Package detection** — Notify when a package is delivered to the front door

## Commands

| Command | Description |
|---------|-------------|
| `security status` | Current mode, active sensors, recent events |
| `security arm away` | Arm all sensors in away mode |
| `security arm home-night` | Arm perimeter + interior motion (sleeping) |
| `security arm home-day` | Arm perimeter only (home during day) |
| `security arm vacation` | Arm away mode + random lights + continuous recording |
| `security disarm` | Disarm all sensors |
| `security history today` | All security events for today |
| `security history week` | Security events for the past 7 days |
| `security cameras` | Camera status and recent clips |
| `security alerts` | Active and unresolved alerts |
| `security test` | Test all sensors and notification channels |
| `security contacts` | View and manage emergency contacts |

## Configuration

Edit `plugin.json` to customize:

- `alertCooldown` — Seconds between repeated alerts for the same sensor (default: 300 = 5 min)
- `escalationTiers` — Configure timeouts and actions for each escalation tier
- `cameraRetention` — Days to keep recordings (normal: 7, alert: 30, manual: 60)
- `falsePositiveReduction` — Enable dual-trigger, pet immunity, camera verification
- `emergencyContacts` — Phone numbers for escalation tiers 2-4

## Security Modes Explained

### Disarmed
All sensors log activity but no alerts are sent. Cameras record on motion. Use when you are home and active.

### Home (Day)
Perimeter sensors (doors, windows, outdoor motion) are active with alerts. Interior motion is ignored. Cameras: outdoor active, indoor disabled. Doors auto-lock after 5 minutes.

### Home (Night)
Perimeter + interior motion sensors active. All cameras active outdoors. All doors lock immediately. Hallway night lights enabled. Use when sleeping.

### Away
All sensors active. All cameras recording on motion. No interior motion expected. Auto-lock all doors. This is the full security mode.

### Vacation
Same as Away, plus: continuous camera recording, random light simulation (6-10 PM), scheduled blinds, daily check-in notification.

## Alert Tiers

| Tier | Action | Timeout | When |
|------|--------|---------|------|
| 1 | Push notification | 2 min | Door/motion while armed |
| 2 | SMS to user | 5 min | No response to Tier 1 |
| 3 | Phone call to user + emergency contact | 10 min | No response to Tier 2 |
| 4 | Emergency services dispatch | Immediate | Fire/CO confirmed, or user confirms intrusion |

Tier 4 requires user confirmation for intrusion events. Fire and CO events bypass confirmation.

## Emergency Responses

### Fire/Smoke
- All lights to 100% (illuminate exits)
- HVAC shutdown (prevent smoke spread)
- All smart locks unlock (emergency exit)
- Tier 4 escalation (no confirmation needed)
- Continuous camera recording

### Carbon Monoxide
- All lights to 100%
- HVAC shutdown
- All smart locks unlock
- Tier 4 escalation (no confirmation needed)

### Intrusion
- All lights to 100%
- All smart locks lock (containment)
- Siren activation (if available)
- Continuous camera recording
- Tier 1-3 escalation, Tier 4 with user confirmation

### Water Leak
- Push notification with location
- Smart water valve close (if installed)
- Log event (no lights or lock changes)

## Example Usage

```
You: Arm the house, we're going out.
Plugin: Arming security in away mode.
  Checking all zones...
  - All doors: closed and locked
  - All windows: closed
  - 3 cameras: active
  - 12 sensors: armed
  - Motion recording: enabled
  Mode: AWAY. All sensors active. Stay safe!
```
