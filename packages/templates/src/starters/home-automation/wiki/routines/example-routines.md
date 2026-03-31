# Example Routines

Automation recipes for common smart home scenarios. Each routine includes triggers, conditions, actions, and notes.

## Daily Routines

### Good Morning
```
Trigger: Time — 6:30 AM (weekdays), 8:00 AM (weekends)
Conditions:
  - User is home (phone connected to Wi-Fi)
Actions:
  1. Bedroom lights: fade from 0% to 60% warm white over 15 minutes (2200K)
  2. Blinds: open living room and kitchen
  3. Thermostat: set to 72F (heating) or 74F (cooling) based on season
  4. Kitchen smart plug: turn on coffee maker
  5. Bathroom light: turn on at 50%
  6. Speaker: announce weather forecast
  7. Front porch light: turn off
Notes: Gradual light fade simulates sunrise. Coffee maker must be pre-loaded.
```

### Leaving Home (Away Mode)
```
Trigger: Manual or geofence (phone leaves 200m radius)
Conditions:
  - No other household members home
Actions:
  1. All lights: turn off
  2. Thermostat: set to eco mode (62F heat / 80F cool)
  3. All blinds: close
  4. All door locks: lock
  5. Security: arm in away mode
  6. Cameras: enable motion recording
  7. Smart plugs: turn off non-essential (TV, speakers)
  8. Random light simulation: disable
Notes: Geofence trigger requires phone location services. 30-second delay before arming to allow exit.
```

### Welcome Home
```
Trigger: Geofence (phone enters 100m radius) or front door unlocked
Conditions:
  - Was in away mode
Actions:
  1. Security: disarm
  2. Front porch light: turn on if after sunset
  3. Thermostat: resume normal schedule
  4. Living room lights: turn on at 70% warm white
  5. Blinds: open if before sunset
Notes: Disarm happens before entry to avoid alarm. Uses presence detection for reliability.
```

### Goodnight
```
Trigger: Manual ("Goodnight") or time — 11:00 PM
Conditions:
  - User is home
Actions:
  1. All lights: turn off (fade over 30 seconds)
  2. All blinds: close
  3. All doors: lock
  4. Thermostat: set to 66F
  5. Security: arm in home mode (perimeter only)
  6. Night lights: hallway at 1% amber (1800K)
  7. Bedroom fan: turn on if temp > 72F
  8. All TVs: turn off
  9. All smart speakers: do not disturb mode
Notes: Hallway night lights stay on until 6:00 AM. Perimeter mode allows interior motion.
```

## Scene Routines

### Movie Night
```
Trigger: Manual ("Movie night") or Apple TV/Roku power on during evening
Actions:
  1. Living room lights: dim to 10% warm white (2200K)
  2. TV backlight: set to bias lighting mode (6500K at 40%)
  3. Blinds: close
  4. Soundbar: power on, set to movie mode
  5. Thermostat: set to 70F
  6. Kitchen: turn off non-essential lights
  7. Front door: lock
Notes: Scene deactivates when TV is turned off, restoring previous light state.
```

### Dinner Time
```
Trigger: Manual or time — 6:00 PM (weekdays), 7:00 PM (weekends)
Actions:
  1. Dining area: warm white at 80% (2700K)
  2. Kitchen: bright white at 100% (4000K) for cooking, then dim to 40% when motion stops
  3. Living room: dim to 40% warm white
  4. Speaker: play dinner playlist at low volume
Notes: Kitchen light timer delays dimming by 10 minutes after last motion to avoid cutting light while cooking.
```

### Focus / Work Mode
```
Trigger: Manual ("Focus mode") or office door closed (magnetic sensor)
Actions:
  1. Office light: cool white at 100% (4000K)
  2. Office blinds: open fully
  3. Smart speaker: do not disturb
  4. Doorbell: mute chime (phone notification only)
  5. Thermostat: ensure office is at 72F
Notes: Mode lasts until manually cancelled or office door opens after 30+ minutes.
```

## Seasonal Routines

### Winter Heating Optimization
```
Trigger: Outdoor temp drops below 40F
Actions:
  1. Blinds: close at sunset (insulation)
  2. Thermostat: lower setpoint by 2F when away
  3. Bathroom heat lamp: enable for morning schedule
  4. Garage heater: turn on if temp below 35F
Notes: Closing blinds provides R-1 insulation boost. Away setback saves approximately 8% on heating.
```

### Summer Cooling Strategy
```
Trigger: Outdoor temp exceeds 80F
Actions:
  1. Blinds: close on sun-facing windows during peak hours (11 AM - 4 PM)
  2. Ceiling fans: turn on in occupied rooms
  3. Thermostat: pre-cool to 70F during off-peak hours (before 2 PM)
  4. Attic fan: activate if attic temp exceeds 100F
  5. Irrigation: shift to early morning (5:00 AM) to reduce evaporation
Notes: Pre-cooling during off-peak electricity saves approximately 15% on cooling costs.
```

## Security Routines

### Vacation Mode
```
Trigger: Manual ("Vacation mode") with return date
Actions:
  1. Security: arm in away mode continuously
  2. Random lights: simulate occupancy 6-10 PM (living room, bedroom, bathroom)
  3. Blinds: open at 8 AM, close at sunset
  4. Thermostat: set to 55F (winter) or 85F (summer) to protect pipes/HVAC
  5. Mail hold: remind user to request USPS hold
  6. Cameras: continuous recording with motion alerts enabled
  7. All smart plugs: turn off except fridge and freezer
Notes: Light simulation uses recorded patterns from previous weeks. Randomize by +/- 30 minutes daily.
```

### Unexpected Motion Alert
```
Trigger: Motion detected while security is armed (away or night mode)
Conditions:
  - Motion is not a known pet (weight/height sensor or camera AI)
Actions:
  1. Send push notification with camera snapshot
  2. Log event with timestamp, camera clip, and sensor data
  3. If no user response in 5 minutes: escalate (call/text emergency contact)
  4. If confirmed intruder: activate all lights, sound alarm, call authorities
Notes: Pet detection requires camera with AI or dual-tech (PIR + microwave) sensors.
```

## Energy-Saving Routines

### Peak Hours Load Shedding
```
Trigger: Time — 2:00 PM (peak electricity rate starts)
Actions:
  1. Thermostat: raise cooling setpoint by 3F (or lower heating by 3F)
  2. Water heater: reduce to energy-saving mode
  3. EV charger: pause charging (resumes at 8 PM off-peak)
  4. Pool pump: pause if running
  5. Non-essential appliances: defer via smart plug scheduling
Notes: Resume normal operation at 8:00 PM when off-peak rates begin. Pre-cool before peak to minimize discomfort.
```

### Phantom Power Elimination
```
Trigger: Device enters standby for more than 2 hours
Conditions:
  - Device is connected via smart plug with power monitoring
  - Device is not on the whitelist (fridge, freezer, router, hub)
Actions:
  1. Check power draw — if below 5W, likely in proper standby
  2. If between 5-50W, flag as phantom power and cut plug
  3. Log energy savings in monthly report
Notes: Whitelist critical devices to avoid cutting power to routers, hubs, or servers.
```

## Creating Custom Routines

When building your own routines, follow this structure:

1. **Trigger** — What starts the routine (time, event, manual, geofence, sensor)
2. **Conditions** — What must be true for the routine to execute (presence, mode, season, state)
3. **Actions** — What happens, in order (device commands, delays, notifications)
4. **Recovery** — What happens when the routine ends or is interrupted
5. **Notes** — Edge cases, dependencies, and manual overrides

Always test new routines during the day while home before enabling them for unattended operation.
