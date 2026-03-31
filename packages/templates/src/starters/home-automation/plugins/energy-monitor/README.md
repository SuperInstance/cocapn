# Energy Monitor Plugin

Tracks real-time and historical energy consumption across all monitored devices in your smart home.

## Features

- **Real-time power monitoring** — See current wattage for every monitored device
- **Historical reporting** — Daily, weekly, and monthly consumption reports in kWh and cost
- **Anomaly detection** — Alerts when a device exceeds its normal power draw by 20%+
- **Peak rate awareness** — Warns before peak electricity rates begin, suggests load shifting
- **Budget tracking** — Set a daily energy budget and get alerts when approaching or exceeding it
- **Top consumers** — Identify your highest-draw devices ranked by consumption
- **Carbon tracking** — Estimate carbon footprint based on consumption and grid intensity
- **Monthly reports** — Automated monthly summary with trends and recommendations

## Commands

| Command | Description |
|---------|-------------|
| `energy status` | Current whole-home power draw and daily total |
| `energy report today` | Today's consumption breakdown by device |
| `energy report week` | Weekly summary with daily averages |
| `energy report month` | Monthly report with cost and trends |
| `energy top 5` | Top 5 consuming devices right now |
| `energy cost living-room-light` | Cost breakdown for a specific device |
| `energy anomaly` | List any devices with anomalous power draw |
| `energy budget set 8.00` | Set daily energy budget to $8.00 |
| `energy budget status` | Check budget usage for today |

## Configuration

Edit `plugin.json` to customize:

- `sampleInterval` — How often to read power meters (seconds, default: 60)
- `anomalyThreshold` — Percentage above baseline to trigger anomaly alert (default: 0.20 = 20%)
- `dailyBudgetLimit` — Daily cost threshold for alerts (default: $10.00)
- `peakWarningMinutes` — Minutes before peak rates to send warning (default: 15)

## Data Provided

The plugin exposes these data points for other plugins and routines:

- `energy.current.watts` — Current whole-home power draw
- `energy.daily.kwh` — Today's total kWh consumption
- `energy.daily.cost` — Today's estimated cost
- `energy.monthly.kwh` — This month's total kWh consumption
- `energy.monthly.cost` — This month's estimated cost
- `energy.device.<id>.watts` — Current draw for a specific device
- `energy.device.<id>.daily_kwh` — Today's consumption for a specific device

## Requirements

- At least one device with power monitoring capability (smart plug or circuit monitor)
- Rate schedule configured in `config.yml` under `energy.rates`
- Devices registered in the device registry with power monitoring enabled

## Example Usage

```
You: How much power are we using right now?
Plugin: Current power draw: 2,340W across 47 devices.
  Top consumers:
  1. HVAC — 1,800W (77%)
  2. Water heater — 320W (14%)
  3. Refrigerator — 145W (6%)
  Today's total: 18.4 kWh ($2.76)
  Budget: $2.76 / $10.00 (28%)
```
