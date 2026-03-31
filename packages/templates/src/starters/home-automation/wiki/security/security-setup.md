# Security Setup

Complete guide to configuring home security with your smart home automation system. Covers sensor placement, camera configuration, alert rules, and emergency procedures.

## Security Philosophy

Smart home security should be layered and graduated:

1. **Deterrence** — Visible cameras, motion lights, alarm signage
2. **Detection** — Sensors that detect intrusion, fire, water, CO
3. **Alerting** — Immediate notification to your phone, with escalation
4. **Response** — Automated lights, sirens, lock-down, emergency contacts
5. **Recovery** — Recorded footage, event logs, incident reports

## Sensor Placement Guide

### Entry Points (Priority 1)
Every exterior door and ground-floor window should have a sensor:

| Location | Sensor Type | Notes |
|----------|-------------|-------|
| Front door | Door sensor + smart lock | Most used entry, requires both detection and control |
| Back door | Door sensor + smart lock | Second most common forced entry point |
| Garage door | Door/tilt sensor | Often overlooked, separate from main house |
| Side door | Door sensor | Common for attached garages and basements |
| Ground-floor windows | Window sensors | Focus on accessible windows, skip second floor |
| Sliding glass doors | Door sensor + bar sensor | Vulnerable entry point, consider dual sensors |

### Perimeter Detection (Priority 2)

| Location | Sensor Type | Notes |
|----------|-------------|-------|
| Front yard | Outdoor motion sensor / camera | Early warning zone |
| Back yard | Outdoor motion sensor / camera | Detect before they reach the house |
| Driveway | Vehicle detection sensor | Distinguish cars from people |
| Side yards | Motion sensor | Often dark and accessible, add lighting too |

### Interior Detection (Priority 3)

| Location | Sensor Type | Notes |
|----------|-------------|-------|
| Hallway | Motion sensor | Chokepoint — covers multiple rooms |
| Living room | Motion sensor | Main living space, detect unexpected presence |
| Stairway | Motion sensor | Covers floor-to-floor movement |
| Basement | Motion sensor + water sensor | Early intrusion + flooding detection |

### Environmental Sensors (Always Active)

| Location | Sensor Type | Why |
|----------|-------------|-----|
| Kitchen | Smoke detector + CO detector | Cooking fire risk, gas appliances |
| Near HVAC | CO detector | Furnace malfunction risk |
| Utility room | Water leak sensor | Water heater, washing machine failures |
| Under kitchen sink | Water leak sensor | Slow leaks cause major damage |
| Near sump pump | Water leak sensor | Pump failure = flood |

## Camera Configuration

### Placement Strategy
- **Front door** — Cover the porch, entry path, and packages. Height: 7-8 feet.
- **Backyard** — Cover the rear entry and yard. Height: 8-10 feet, avoid trees.
- **Garage** — Cover the driveway and garage door. Height: 8 feet.
- **Side yards** — Cover narrow passages between homes. Height: 7 feet.

### Recording Settings
```yaml
cameras:
  recording:
    mode: motion              # Record on motion (saves storage)
    preRoll: 5                # 5 seconds before motion starts
    postRoll: 30              # 30 seconds after motion stops
    quality: 1080p            # Balance quality and storage
    nightVision: auto         # Auto-switch to IR at night
  retention:
    normal: 168               # 7 days for normal clips
    alert: 720                # 30 days for security alerts
    manual: 1440              # 60 days for manually saved clips
  privacy:
    zones:                    # Mask areas to avoid recording
      - neighbor_yard
      - public_sidewalk
    disableIndoor: true       # Never record indoors unless explicitly enabled
```

### Object Detection
If your cameras support AI object detection:
- Enable: person, vehicle, animal, package
- Disable: shadow, light change, insect (reduces false alerts)
- Set minimum object size to filter out small animals
- Configure zone-based detection (only trigger for specific areas)

## Alert Rules

### Notification Tiers

| Tier | Trigger | Response | Cooldown |
|------|---------|----------|----------|
| Critical | Smoke/CO detected, confirmed intruder | Push + SMS + Call | None |
| High | Door opened while armed, motion in restricted zone | Push + SMS | 5 minutes |
| Medium | Unexpected motion (armed mode), package delivered | Push notification | 15 minutes |
| Low | Battery low, device offline, routine activity | Log only, daily digest | 1 hour |
| Info | Routine arm/disarm, door open/close (disarmed) | Log only | N/A |

### Escalation Rules
```yaml
security:
  escalation:
    - tier: 1
      action: push_notification
      timeout: 120           # seconds before escalating
    - tier: 2
      action: sms_alert
      contacts: [user_phone]
      timeout: 300
    - tier: 3
      action: phone_call
      contacts: [user_phone, emergency_contact]
      timeout: 600
    - tier: 4
      action: emergency_services
      contacts: [local_police_non_emergency]
      requireConfirmation: false   # Only for fire/CO
```

### False Positive Reduction
- Require two sensor triggers within 30 seconds for medium alerts
- Use camera AI verification for outdoor motion alerts
- Set pet-immune modes on indoor motion sensors
- Ignore motion sensors during declared pet-alone times
- Use door-open duration > 30 seconds as a secondary indicator

## Security Modes

### Disarmed
- All sensors log but do not alert
- Cameras record on motion but no push notifications
- Smart locks do not auto-lock
- All routines run normally

### Home (Day)
- Perimeter sensors active (doors, windows, outdoor motion)
- Interior motion sensors inactive (you are home)
- Cameras: front and back active, indoor disabled
- Auto-lock doors after 5 minutes

### Home (Night)
- Perimeter sensors active with immediate alerts
- Interior motion sensors active (you should be in bed)
- Cameras: all outdoor active with alerts
- Auto-lock all doors immediately
- Activate night lights (hallway at 1%)

### Away
- All sensors active with immediate alerts
- All cameras active with motion recording and alerts
- Auto-lock all doors immediately
- No interior motion expected — any motion is alert-worthy
- Optional: random light simulation for deterrence

### Vacation
- Same as Away plus:
- Continuous camera recording (not just motion)
- Random light simulation 6-10 PM
- Blinds open/close on schedule
- Daily check-in notification (system still active)
- Neighbor/emergency contact on escalation list

## Smart Lock Best Practices

1. **Auto-lock** — Set doors to lock after 30 seconds when closed
2. **Guest codes** — Time-limited codes that expire after use or set date
3. **Notifications** — Alert on any manual lock/unlock event
4. **Battery monitoring** — Alert at 20%, critical at 10%, replace at 5%
5. **Audit log** — Review lock/unlock history weekly
6. **No common codes** — Avoid 1234, 0000, or birth years
7. **Disable voice unlock** — Prevent unauthorized voice assistant access

## Emergency Procedures

### Fire/Smoke Detected
1. All lights turn on at 100% to illuminate exit paths
2. HVAC shuts down to prevent smoke spread
3. Smart locks unlock all doors for emergency exit
4. Push + SMS + phone call to all contacts
5. If connected to monitoring service: dispatch fire department
6. Cameras record continuously until cleared

### Water Leak Detected
1. Push notification with sensor location
2. If smart water shutoff valve installed: close main water valve
3. Log event with timestamp and sensor data
4. Do NOT turn off lights or unlock doors (not life safety)

### Intrusion Detected
1. All interior and exterior lights turn on at 100%
2. Smart locks lock all doors (containment, not escape)
3. Cameras record continuously
4. Push + SMS + phone call to all contacts
5. If confirmed: dispatch police (requires confirmation from user)
6. Do NOT automatically call police without confirmation (false alarm liability)

## Privacy Considerations

- Indoor cameras should have physical privacy shutter or disable switch
- Camera footage is stored locally, never uploaded to cloud without consent
- Audio recording may require consent depending on jurisdiction
- Disable camera recording when guests are present
- Review and delete footage older than retention period
- Never share camera feeds outside the household
- Security logs are stored in the private repo (git), never the public repo

## Maintenance Checklist

| Task | Frequency | Notes |
|------|-----------|-------|
| Test all door/window sensors | Monthly | Open each, verify alert |
| Test motion sensors | Monthly | Walk through each zone |
| Check camera positioning | Quarterly | Ensure view is clear |
| Replace sensor batteries | Annually or at 20% alert | Don't wait for dead |
| Review alert logs | Weekly | Look for anomalies |
| Update camera firmware | Quarterly | Security patches |
| Test smoke/CO detectors | Monthly | Use test button |
| Review guest access codes | After each guest | Delete expired codes |
| Audit lock history | Monthly | Look for unauthorized access |
| Test escalation chain | Quarterly | Verify contacts are current |
