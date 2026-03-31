# Energy Monitoring

Guide to setting up and optimizing energy monitoring in your smart home. Covers hardware, configuration, analysis, and savings strategies.

## Why Monitor Energy

Understanding your home's energy consumption is the foundation of automation savings. Without measurement, you cannot optimize. Energy monitoring helps you:

- Identify the highest-consuming devices in your home
- Detect malfunctioning appliances (a degrading HVAC can draw 20-40% more power)
- Schedule high-draw activities during off-peak hours
- Validate that automations are actually saving money
- Set baselines for anomaly detection (unexpected spikes indicate problems)
- Track ROI of smart home investments over time

## Hardware Setup

### Whole-Home Monitoring

For accurate whole-home monitoring, install a circuit-level monitor:

| Solution | Installation | Accuracy | Cost | Notes |
|----------|-------------|----------|------|-------|
| Emporia Vue Gen 2 | Breaker panel (CT clamps) | Per-circuit | ~$100 | Best value, 16 circuits |
| Sense Energy Monitor | Breaker panel (CT clamps) | ML-based device detection | ~$300 | Learns devices over time |
| IotaWatt | Breaker panel (CT clamps) | Per-circuit, open source | ~$150 | Best for DIY/data nerds |
| Shelly EM | Single circuit | High accuracy | ~$30 | Per-circuit, great for individual loads |

### Plug-Level Monitoring

For individual devices, smart plugs with power monitoring provide device-level granularity:

- **Shelly Plug S** — Best accuracy (+/- 1W), reports every second
- **TP-Link Kasa KP125M** — Good accuracy, Matter support
- **Sonoff S31** — Affordable, flashable for local control

### Hub Integration

If using Home Assistant:
1. Install the Emporia Vue or Sense integration via HACS
2. For Shelly devices, use the native Shelly integration
3. For TP-Link, use the TP-Link integration
4. Enable the Energy dashboard in Settings > Dashboards > Energy
5. Configure utility meters for daily/weekly/monthly tracking

## Configuration

### Setting Up Rate Schedules

Update `config.yml` with your utility's rate structure:

```yaml
energy:
  monitoringEnabled: true
  sampleInterval: 60          # Sample every 60 seconds
  reportInterval: 3600        # Hourly reports
  tariffAware: true
  currency: USD
  rates:
    offPeak: 0.08             # $/kWh
    midPeak: 0.14
    peak: 0.22
  schedule:
    offPeak: "20:00-14:00"    # 8 PM to 2 PM
    midPeak: "14:00-17:00"    # 2 PM to 5 PM
    peak: "17:00-20:00"       # 5 PM to 8 PM
```

### Setting Baselines

After running monitoring for 2 weeks, establish baselines:

1. Record average daily consumption per device category
2. Note seasonal variations (HVAC will dominate summer/winter)
3. Calculate cost per device using your rate schedule
4. Set anomaly thresholds at 20% above baseline

### Alerts Configuration

```yaml
energy:
  alerts:
    dailyBudgetExceeded: true    # Alert if daily cost exceeds $X
    deviceAnomaly: true          # Alert if device exceeds baseline by 20%
    peakUsageWarning: true       # Alert 15 min before peak rates start
    monthlyReport: true          # Email/notify monthly summary
```

## Analysis Strategies

### Top Consumers Method

1. Sort devices by monthly kWh consumption
2. Focus optimization efforts on the top 5 consumers (typically 80% of total usage)
3. Common top consumers: HVAC (40-50%), water heater (15-20%), dryer (10-15%), refrigerator (5-8%)

### Phantom Power Audit

1. Turn off all lights and put home in "sleep" mode
2. Check total power draw — this is your baseline idle consumption
3. A typical home should idle at 100-300W (fridge, router, hub, clocks)
4. Anything above 300W indicates phantom loads worth investigating
5. Use smart plugs to measure individual idle devices

### Seasonal Comparison

Track consumption month-over-month and year-over-year:
- Compare HVAC runtime hours across similar temperature months
- Track whether automations reduce peak-hour consumption
- Measure the impact of any insulation or efficiency upgrades

### Cost Attribution

Calculate the monthly cost of each device:
```
Device monthly cost = (Avg Watts x Hours/day x 30 days) / 1000 x Rate per kWh
```
Example: A 150W TV running 5 hours/day at $0.12/kWh:
```
(150 x 5 x 30) / 1000 x 0.12 = $2.70/month
```

## Optimization Strategies

### HVAC Optimization (Biggest Savings)
- Pre-cool/heat during off-peak hours (shift load to cheaper rates)
- Use room sensors to only condition occupied rooms
- Close blinds on sun-facing windows during summer peak
- Set setback temperatures when away (62F heat / 80F cool)
- Clean/replace filters monthly — dirty filters increase energy use by 5-15%
- Consider a smart thermostat with learning capabilities

### Water Heater Optimization
- Set temperature to 120F (140F wastes energy, risk of scalding)
- Use a timer to turn off during away hours
- Consider a heat pump water heater for 2-3x efficiency improvement
- Insulate hot water pipes to reduce standby losses

### Laundry Optimization
- Run dryer during off-peak hours (evenings after 8 PM)
- Use cold water for washing (saves water heating cost)
- Clean lint trap before every load (improves airflow, reduces runtime)
- Consider air drying for partial loads

### Lighting Optimization
- Replace remaining incandescent/halogen bulbs with LED (save 75-80%)
- Use motion sensors in low-traffic areas (closets, garage, pantry)
- Dim lights to 80% — imperceptible difference, 20% energy savings
- Turn off outdoor lights during daylight with photocell or automation

### Standby Power Optimization
- Use smart plugs on entertainment centers to cut phantom power
- A typical entertainment center draws 30-60W in standby
- Put TVs, game consoles, soundbars on a single smart plug
- Schedule the plug off during sleep and away hours

## Monthly Report Template

Track these metrics monthly to measure improvement:

| Metric | This Month | Last Month | Change |
|--------|-----------|------------|--------|
| Total kWh | — | — | — |
| Total Cost | — | — | — |
| Peak kWh | — | — | — |
| Off-Peak kWh | — | — | — |
| HVAC kWh | — | — | — |
| HVAC Cost | — | — | — |
| Idle Power (avg W) | — | — | — |
| Top Consumer | — | — | — |
| Automations Active | — | — | — |
| Estimated Savings | — | — | — |

## Troubleshooting

### Readings Seem Too High
- Verify CT clamp orientation (arrows pointing toward load)
- Check for double-counting (device on monitored plug AND monitored circuit)
- Confirm voltage calibration matches your utility (120V vs 240V)

### Readings Seem Too Low
- Ensure all circuits are monitored (missing circuits = missing data)
- Check that CT clamps are fully closed around the wire
- Verify sample interval is not too long (60 seconds recommended minimum)

### Device Not Detected
- Sense: device detection takes 1-4 weeks of machine learning
- Smart plugs: ensure the integration is connected and reporting
- Check device firmware is up to date
