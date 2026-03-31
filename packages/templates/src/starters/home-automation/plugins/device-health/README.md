# Device Health Monitor Plugin

Continuously monitors the health and status of all registered IoT devices in your smart home.

## Features

- **Connectivity monitoring** — Track which devices are online, offline, or intermittently disconnecting
- **Battery tracking** — Monitor battery levels for all wireless devices, alert when low or critical
- **Signal strength** — Monitor wireless signal quality (Zigbee, Z-Wave, Wi-Fi) and identify weak links
- **Firmware tracking** — Know which devices have updates available, track current firmware versions
- **Uptime reporting** — Track device reliability over time, identify chronic problem devices
- **Daily digest** — Automated morning summary of device health status
- **Trend analysis** — Spot degrading signal, draining batteries faster than expected, or increasing disconnections

## Commands

| Command | Description |
|---------|-------------|
| `devices status` | Overview of all devices: online/offline counts |
| `devices offline` | List all currently offline devices with last-seen time |
| `devices battery` | Battery levels for all battery-powered devices |
| `devices battery low` | Only devices below 20% battery |
| `devices firmware` | Firmware status and available updates |
| `devices signal` | Signal strength for all wireless devices |
| `devices health living-room-light` | Detailed health report for a specific device |
| `devices digest` | Generate a daily health digest on demand |

## Configuration

Edit `plugin.json` to customize:

- `healthCheckInterval` — Seconds between health checks (default: 60)
- `offlineThreshold` — Seconds before a device is considered offline (default: 300 = 5 min)
- `batteryLowThreshold` — Battery percentage for low alert (default: 20%)
- `batteryCriticalThreshold` — Battery percentage for critical alert (default: 10%)
- `signalWeakThreshold` — Signal strength in dBm for weak alert (default: -85)
- `firmwareCheckInterval` — How often to check for firmware updates (default: 86400 = daily)

## Data Provided

The plugin exposes these data points for other plugins and routines:

- `health.total_devices` — Total number of registered devices
- `health.online_devices` — Currently online count
- `health.offline_devices` — Currently offline count
- `health.low_battery_devices` — Devices below 20% battery
- `health.outdated_firmware` — Devices with firmware updates available
- `health.device.<id>.status` — online/offline for a specific device
- `health.device.<id>.battery` — Battery percentage (if battery-powered)
- `health.device.<id>.signal` — Signal strength in dBm
- `health.device.<id>.firmware` — Current firmware version

## Health Check Logic

The plugin evaluates device health using these criteria:

1. **Connectivity** — Device has communicated within the offline threshold
2. **Battery** — Battery-powered devices above the low threshold
3. **Signal** — Wireless signal above the weak threshold
4. **Firmware** — Running the latest available firmware version
5. **Uptime** — Device has been online for >99% of the last 7 days

A device is "healthy" if it passes all five checks. Any failure triggers an appropriate notification.

## Example Usage

```
You: How are my devices doing?
Plugin: Device health summary (47 devices):
  Online: 45 | Offline: 2 | Low battery: 1
  Offline:
  - bedroom-3-sensor (last seen 2 hours ago) — Zigbee signal was degrading
  - garage-camera (last seen 45 min ago) — Wi-Fi intermittent
  Low battery:
  - hallway-motion-sensor: 14% (CR2032) — estimated 2 weeks remaining
  Firmware updates available: 3 devices
  Run "devices firmware" for details.
```
