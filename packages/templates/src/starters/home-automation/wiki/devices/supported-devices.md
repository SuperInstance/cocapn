# Supported Devices

This document catalogs device types and specific models known to work well with this home automation setup. Devices are organized by category and protocol.

## Lighting

### Smart Bulbs
| Device | Protocol | Color Temp | Dimming | Notes |
|--------|----------|------------|---------|-------|
| Philips Hue White Ambiance A19 | Zigbee | 2200K-6500K | 1-100% | Most reliable Zigbee bulb |
| Philips Hue Color A19 | Zigbee | 2000K-6500K + RGB | 1-100% | Full color, entertainment zone support |
| IKEA Tradfri White Spectrum | Zigbee | 2200K-4000K | 5-100% | Budget-friendly, good mesh repeaters |
| Sengled Classic RGB | Zigbee | 2000K-6500K + RGB | 1-100% | Affordable color option |
| LIFX Mini White | Wi-Fi | 2700K-6500K | 1-100% | No hub required, higher power draw |

### Smart Switches and Dimmers
| Device | Protocol | Type | Notes |
|--------|----------|------|-------|
| Lutron Caseta Dimmer | Clear Connect | Dimmer | Best dimming performance, proprietary protocol |
| Inovelli Red Series | Z-Wave | Dimmer + Scene | Scene trigger support, energy monitoring |
| GE Enbrighten Z-Wave Plus | Z-Wave | Switch/Dimmer | Widely available, solid Z-Wave option |
| Shelly 1PM | Wi-Fi | Relay + Power Meter | Compact, fits behind existing switches |
| IKEA Tradfri Remote | Zigbee | Remote/Button | 5-button scene controller |

## Climate Control

### Thermostats
| Device | Protocol | Features | Notes |
|--------|----------|----------|-------|
| Ecobee SmartThermostat | Wi-Fi | Room sensors, occupancy | Best multi-room temperature averaging |
| Nest Learning Thermostat | Wi-Fi | Learning, schedule | Google ecosystem integration |
| Honeywell T6 Pro Z-Wave | Z-Wave | Scheduling, geofencing | Good Z-Wave thermostat option |

### Temperature/Humidity Sensors
| Device | Protocol | Range | Notes |
|--------|----------|-------|-------|
| Sonoff TH Elite | Wi-Fi | Temp + Humidity | Affordable, also controls relays |
| Aeotec Multipurpose Sensor | Z-Wave | Temp, Humidity, Vibration, Light | Multi-sensor in one device |
| Xiaomi Aqara Temp/Humidity | Zigbee | Temp + Humidity + Pressure | Very accurate, small form factor |

## Security

### Cameras
| Device | Protocol | Features | Notes |
|--------|----------|----------|-------|
| Reolink Argus 3 Pro | Wi-Fi | Battery + Solar, 2K, Color Night Vision | Best battery-powered option |
| Amcrest IP8M-T2599EW | Wi-Fi (PoE) | 4K, AI Detection | Best wired option for Home Assistant |
| Ring Stick Up Cam | Wi-Fi | Battery/Wired, Motion, Alexa | Requires Ring subscription for recording |

### Door/Window Sensors
| Device | Protocol | Battery Life | Notes |
|--------|----------|-------------|-------|
| Xiaomi Aqara Door/Window | Zigbee | 2 years | Smallest form factor, reliable |
| Aeotec Door/Window 7 | Z-Wave | 2 years | Best Z-Wave option |
| Sengled Smart Window | Zigbee | 1.5 years | Budget-friendly |

### Motion Sensors
| Device | Protocol | Detection | Notes |
|--------|----------|-----------|-------|
| Philips Hue Motion | Zigbee | PIR + Temp + Light | Also controls lights directly |
| Aeotec Motion Sensor 7 | Z-Wave | PIR + Temp + Light | Best Z-Wave motion sensor |
| Xiaomi Aqara PIR | Zigbee | PIR only | Very small, affordable |

### Smart Locks
| Device | Protocol | Features | Notes |
|--------|----------|----------|-------|
| Yale Assure Lock 2 | Zigbee/Z-Wave/Wi-Fi | Keypad, Auto-lock | Best multi-protocol option |
| August Wi-Fi Smart Lock | Wi-Fi | Auto-unlock, DoorSense | Best retrofit lock |
| Schlage Encode Plus | Wi-Fi | Keypad, Matter | Matter support for future-proofing |

## Sensors

### Leak/Moisture Sensors
| Device | Protocol | Battery Life | Notes |
|--------|----------|-------------|-------|
| Xiaomi Aqara Leak Sensor | Zigbee | 2 years | Affordable, audible alarm |
| Fibaro Flood Sensor | Z-Wave | 2.5 years | Gold-plated probes, tilt detection |

### Smoke/CO Detectors
| Device | Protocol | Features | Notes |
|--------|----------|----------|-------|
| Nest Protect | Wi-Fi | Smoke + CO, Voice alert, Pathlight | Best smart smoke detector |
| First Alert Z-Wave | Z-Wave | Smoke + CO | Z-Wave integration option |

### Air Quality
| Device | Protocol | Measures | Notes |
|--------|----------|----------|-------|
| Awair Element | Wi-Fi | VOC, CO2, PM2.5, Temp, Humidity | Best air quality monitor |
| IKEA Vindstyrka | Zigbee | PM2.5, VOC, Temp, Humidity | Affordable Zigbee option |

## Smart Speakers and Displays
| Device | Protocol | Features | Notes |
|--------|----------|----------|-------|
| Amazon Echo (4th Gen) | Wi-Fi + Zigbee | Voice, Zigbee hub built-in | Best budget hub + speaker combo |
| Google Nest Hub | Wi-Fi | Display, voice, camera | Good for visual dashboards |
| Apple HomePod Mini | Wi-Fi + Thread | Voice, Thread border router | Best for Apple ecosystem |

## Smart Plugs and Power Monitoring
| Device | Protocol | Power Monitoring | Notes |
|--------|----------|-----------------|-------|
| TP-Link Kasa KP125M | Matter | Yes | Matter support, energy monitoring |
| Sonoff S31 | Wi-Fi | Yes | Affordable, ESP-based, flashable |
| Shelly Plug S | Wi-Fi | Yes (accurate) | Best power monitoring accuracy |
| IKEA Tradfri Smart Plug | Zigbee | No | Cheap Zigbee plug, good for simple on/off |

## Protocol Recommendations

- **Zigbee** — Best for large device counts, mesh networking, battery life. Use a dedicated coordinator (e.g., SkyConnect, Sonoff Zigbee 3.0 USB Dongle Plus).
- **Z-Wave** — Good for locks and sensors, reliable mesh, less interference than Zigbee. Requires Z-Wave stick (e.g., Aeotec Z-Stick 7).
- **Wi-Fi** — Use sparingly to avoid network congestion. Best for cameras and high-bandwidth devices.
- **Thread/Matter** — Future-proof choice. Requires a Thread border router. Device ecosystem is growing rapidly.
- **Bluetooth LE** — Proximity-based automation only. Not reliable for whole-home coverage.
