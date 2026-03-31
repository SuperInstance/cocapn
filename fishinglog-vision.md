# **FishingLog.ai - System Architecture**
*A Co-Captain AI for Commercial Fishing Vessels*

## **1. SYSTEM OVERVIEW**
**Core Philosophy**: "AI as First Mate" - always assists, never autonomously decides. All critical decisions remain with captain.

**Hardware Stack**:
- **Primary**: Jetson Orin Nano 8GB (Edge AI)
- **Sensors**: 2x IP67 4K fisheye cameras (deck + catch area), waterproof headset microphone, GPS/NMEA 2000 interface
- **Connectivity**: Dual SIM 4G router + Starlink RV (failover), local WiFi for tablets
- **Storage**: 1TB NVMe SSD for local data, 30-day rolling buffer

---

## **2. COMPONENT ARCHITECTURES**

### **2.1 Vision Pipeline**
```
[Camera Stream] → (Jetson: Frame Selection @ 2Hz)
                  → Local YOLOv8-nano (FP16) → [Detections]
                  → Async Upload → Cloud → Megadetector-L → [Validated Labels]
```

**Data Structures**:
```python
class VisionFrame:
    frame_id: UUID
    timestamp: datetime
    vessel_id: str
    camera_position: enum{DECK, CATCH, PROCESSING}
    raw_image: CompressedJPEG  # 720p, 80% quality
    local_detections: List[Detection]  # [{bbox, confidence, class, track_id}]
    cloud_validations: List[Validation]  # Sync on reconnect
    gps_coordinates: (lat, lon)
    sea_state: int  # Beaufort scale from vessel sensors
    
class Detection:
    species: str  # "unknown_fish_123" for unclassified
    confidence: float
    length_pixels: int  # For size estimation
    bbox: [x1, y1, x2, y2]
    tracking_id: int  # Simple IOU tracker
```

**Failure Modes**:
- **Salt occlusion**: Camera wash system + daily calibration check
- **Low light**: IR illuminators trigger automatically
- **Edge model drift**: Weekly cloud validation compares edge/cloud discrepancies
- **Mitigation**: Triple-redundant frame storage; if vision fails, fallback to manual voice logging

### **2.2 Captain Voice Interface**
```
[Headset Mic] → Noise Suppression (RNNoise) → Wake Word Detector → Command Classifier
               → Local Intent Recognition → Action Execution
               → Always-listening buffer (30s rolling) for incident capture
```

**Data Structures**:
```python
class VoiceCommand:
    command_id: UUID
    raw_audio: bytes  # 16kHz PCM, 5s max
    transcribed_text: str  # Local Whisper-tiny
    intent: enum{LOG_CATCH, IDENTIFY_FISH, REPORT_ISSUE, TRAIN_AI, QUERY}
    parameters: Dict  # {"species": "tuna", "count": 15}
    confidence: float
    executed_actions: List[Action]
    
class ConversationContext:
    recent_commands: Deque[VoiceCommand]  # Last 10 commands
    fishing_context: Dict  # Current gear, location, target species
    active_dialogue: Optional[TrainingSession]
```

**Failure Modes**:
- **Background noise**: Directional headset mic + adaptive noise cancellation
- **Dialect/accent issues**: Incremental training with captain's voice samples
- **False triggers**: Two-tier wake word ("Hey Cap" + "Log this")
- **Mitigation**: Physical button override for all voice functions

### **2.3 Real-time Species Classification**
**Dual-Model Architecture**:
```
Edge (Always available):
  EfficientNet-B0 (quantized) → 25 common species @ 15 FPS
  Confidence threshold: 0.7
  
Cloud (When connected):
  Ensemble(ResNet50, ViT-small) → 300+ species @ 2 FPS async
  Returns: species, IUCN status, regulations, market price
```

**Data Structures**:
```python
class SpeciesPrediction:
    timestamp: datetime
    edge_prediction: {
        species: str,
        confidence: float,
        inference_time: ms
    }
    cloud_prediction: Optional[{
        species: str,
        scientific_name: str,
        confidence: float,
        regulations: List[Regulation],  # Size limits, quotas
        market_data: {price_per_kg: float, demand: enum}
    }]
    discrepancy_flag: bool  # Edge/cloud mismatch
    captain_override: Optional[str]  # Manual correction
```

**Failure Modes**:
- **Offline degradation**: Edge model continues with reduced accuracy
- **Uncommon species**: Stores as "unknown_fish_hash" with images for later training
- **Model staleness**: Weekly OTA updates of edge model (delta patches only)
- **Mitigation**: "Uncertain" trigger requests captain confirmation via voice

### **2.4 Conversational Training System**
```
Captain: "This is actually a yellowtail rockfish, not vermilion"
→ System captures correction frame + audio
→ Creates training triplet: (image, wrong_label, correct_label)
→ Offline queue for cloud retraining
→ Next OTA update improves edge model
```

**Data Structures**:
```python
class TrainingExample:
    image_hash: str  # SHA256 of original image
    original_prediction: str
    corrected_label: str
    captain_audio: bytes  # "That's a young halibut, see the curved lateral line"
    context: {
        location: (lat, lon),
        depth: meters,
        water_temp: float,
        gear_type: str
    }
    validated: bool = False  # Cloud validation flag
    
class ModelUpdate:
    version: semver
    delta_size: MB
    species_added: List[str]
    accuracy_improvement: Dict[str, float]  # per-species
    captain_feedback_included: List[TrainingExample]
```

**Failure Modes**:
- **Incorrect corrections**: Cloud-side human-in-loop validation for first 3 instances
- **Storage bloat**: Maximum 100 pending examples per vessel, auto-upload priority
- **Captain frustration**: "Show me why you thought that" - visual explanation of model decision

### **2.5 Alert System**
**Priority Levels**:
1. **CRITICAL**: Bycatch of protected species, gear failure detection
2. **OPERATIONAL**: Quota approaching, weather change, equipment maintenance
3. **INFORMATIONAL**: Species price change, new fishing grounds nearby

```
Alert Engine:
  Inputs: [Vision, Sensors, Regulations, Market Data]
  → Rule-based + ML anomaly detection
  → Priority queue
  → Delivery: Voice announcement + tablet visual + Starlink SMS backup
```

**Data Structures**:
```python
class Alert:
    alert_id: UUID
    priority: enum{CRITICAL, OPERATIONAL, INFORMATIONAL}
    category: enum{BYCATCH, QUOTA, WEATHER, EQUIPMENT, MARKET}
    message: str  # "Protected sea lion in net - immediate action required"
    required_acknowledgement: bool
    audio_attention: enum{NONE, CHIME, BELL, SIREN}
    actions: List[Action]  # ["Stop winch", "Call fishery officer"]
    expires: datetime
    escalation_path: List  # If unacknowledged for X minutes
    
class AlertLog:
    alerts: List[Alert]
    acknowledgement_times: Dict[UUID, datetime]
    false_positive_feedback: Dict[UUID, bool]
```

**Failure Modes**:
- **Alert fatigue**: Adaptive thresholding based on captain response rate
- **False positives**: Captain can mark "false alert" → improves ML model
- **Missed critical alerts**: Multi-channel delivery (voice, visual, SMS, crew tablets)
- **Mitigation**: Weekly alert review with simplified metrics

### **2.6 Catch Reporting**
**Automated Logbook**:
```
[Vision Detection] + [Voice Confirmation] → Catch Record
→ Local SQLite + JSON backup
→ Auto-sync when connected
→ Regulatory format conversion (NOAA, DFO, etc.)
```

**Data Structures**:
```python
class CatchRecord:
    record_id: UUID
    species: str
    count: int
    estimated_weight: float  # From pixel measurements + species avg
    confidence: float
    location: (lat, lon)
    time: datetime
    gear_type: str
    images: List[ImageHash]  # 3 representative images
    voice_confirmation: Optional[AudioHash]
    captain_notes: str  # From voice transcription
    market_value: Optional[float]
    
class DailyLog:
    date: date
    catches: List[CatchRecord]
    total_weight: Dict[str, float]  # by species
    quota_status: Dict[str, float]  # percentage used
    weather_conditions: Dict
    submitted_to_authorities: bool
```

**Failure Modes**:
- **Regulatory changes**: Cloud-side format updates, pushed to vessels monthly
- **Connectivity loss**: Stores locally for 30 days, auto-submits when connected
- **Estimation errors**: Captain can override all measurements via voice
- **Mitigation**: Paper backup QR code generation daily (summary page)

### **2.7 Multi-Vessel A2A (Air-to-Air)**
**Peer-to-Peer Mesh**:
```
VHF Data Exchange (when in range):
  - Fishing hotspots (anonymized)
  - Weather observations
  - Hazard warnings
  
Cloud-Synced Fleet Features:
  - Fleet-wide species sightings
  - Collective bargaining price data
  - Search patterns for lost gear
```

**Data Structures**:
```python
class VesselBroadcast:
    vessel_id: str  # Anonymous hash
    timestamp: datetime
    position: (lat, lon)
    species_caught: List[str]  # Last 6 hours
    weather_observed: {
        wind_speed: knots,
        wave_height: m,
        water_temp: C
    }
    hazards: List[Hazard]  # ["log debris at 48.123,-123.456"]
    
class FleetIntelligence:
    heatmap_data: Grid  # 1km squares, 24h aggregation
    price_index: Dict[str, float]  # Species → $/kg
    alert_propagation: List[Alert]  # Critical alerts shared fleet-wide
```

**Failure Modes**:
- **Bandwidth limits**: Only essential data via VHF (position, critical alerts)
- **Data privacy**: Captain controls sharing level (none/anonymous/full)
- **False reports**: Reputation system + cloud validation
- **Mitigation**: All shared data is timestamped and source-tracked

---

## **3. SYSTEM INTEGRATION ARCHITECTURE**

### **3.1 Data Flow**
```
Local (Jetson):
  SQLite + Redis Edge Cache
  → 30-day rolling storage
  → Async upload queue
  
Cloud (AWS/GCP):
  S3/Cloud Storage: Raw images, audio
  RDS/Cloud SQL: Processed data
  SageMaker/Vertex AI: Model training
  
Sync Protocol:
  - Differential sync (only changes)
  - Resume broken transfers
  - Priority: Alerts > Corrections > Catch data > Images
```

### **3.2 Failure Resilience**
**Single Point of Failure Mitigation**:
1. **Power loss**: UPS + graceful shutdown trigger
2. **Jetson failure**: Tablet can operate basic logging via 4G direct
3. **Network loss**: All critical functions remain operational offline
4. **Storage corruption**: Dual SQLite + CSV logging, cloud restore

**Recovery Procedures**:
- Daily automatic backup to encrypted USB
- "Reset to known good" physical button
- 24/7 maritime support hotline (satellite phone fallback)

### **3.3 Captain UX Principles**
1. **Voice-first, not voice-only**: Physical buttons for critical functions
2. **Confirm, don't assume**: Always seek confirmation for uncertain classifications
3. **Progressive disclosure**: Advanced features unlock as captain gains confidence
4. **Maritime idioms**: Uses fishing terminology, not AI jargon
5. **Glove-compatible**: Large touch targets, high contrast displays

---

## **4. DEPLOYMENT & SCALING**

### **Initial Rollout**:
- 10-vessel pilot (Pacific Northwest salmon troll)
- Weekly model updates based on collected data
- Captain feedback loop: Weekly 15-min voice check-ins

### **Scaling Considerations**:
- Regional model variants (NE Atlantic vs Pacific NW)
- Gear-specific configurations (longline vs trawl vs pot)
- Regulatory domain adaptation (EU vs US vs Canada)

### **Success Metrics**:
1. **Captain adoption**: >80% daily active use
2. **Time saving**: >30min/day on logbook reporting
3. **Accuracy**: >95% species classification (with captain correction)
4. **Reliability**: <1 unplanned downtime per quarter

---

## **5. REGULATORY & COMPLIANCE**

- **Data ownership**: Captain owns all data, can delete at any time
- **Privacy**: Crew faces automatically blurred in cloud processing
- **Legal**: Catch records cryptographically signed, immutable audit trail
- **Export controls**: No data crosses jurisdictions without explicit permission

**FishingLog.ai** - Because the best AI is the one that earns its sea legs alongside you.