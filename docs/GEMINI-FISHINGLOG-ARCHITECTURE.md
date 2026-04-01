# Gemini 2.5 Pro — FishingLog Edge AI Architecture

Excellent. As a marine technologist and AI researcher, this is precisely the kind of challenge I relish. We're building a "central nervous system" for a fishing vessel, constrained by power, compute, and connectivity. Every design choice must balance performance with efficiency.

Here is the complete architecture for **FishingLog.ai**.

---

### **System Core Philosophy**

*   **Edge-First, Cloud-Second:** The vessel must operate 100% autonomously without internet. The cloud is for fleet-level learning, data backup, and remote management, not real-time operation.
*   **Asynchronous & Modular:** The system will be a collection of loosely coupled services communicating over a lightweight message bus (like ZeroMQ or MQTT) running locally. The Node.js core acts as the orchestrator, but high-performance tasks are delegated to optimized C++/Python processes.
*   **Resource-Awareness:** The Jetson Orin Nano's 8GB of shared RAM/VRAM is our primary constraint. Every pipeline will have a strict memory and compute budget.

---

### **1. Real-Time Underwater Pipeline (The "Eyes")**

This is the most demanding real-time task. The goal is to process a 1080p underwater camera stream at 15fps.

**Model Selection & Optimization:**

*   **Model:** **YOLOv8n-seg**. We'll use the nano-sized segmentation model. Why segmentation over detection? It gives us a pixel mask of the fish, which is invaluable for accurate size estimation, and the performance cost is minimal with TensorRT.
*   **Optimization:** This is non-negotiable. The PyTorch model will be converted to ONNX and then optimized using **NVIDIA TensorRT** with **INT8 quantization**. This will provide a 3-5x speedup and reduce the memory footprint by ~75% compared to the base FP32 model.
    *   *Expected Latency:* A TensorRT-optimized YOLOv8n-seg model on the Orin Nano should achieve **~25-30ms per frame** (~33-40fps), well within our 15fps (66ms) budget.
    *   *Code Pattern:*
        ```typescript
        // Node.js orchestrator
        const visionProcess = child_process.spawn('python', ['vision_pipeline.py']);

        visionProcess.stdout.on('data', (data) => {
          const detections = JSON.parse(data.toString());
          // { timestamp, gps, detections: [{ species, confidence, size_cm, mask }] }
          messageBus.publish('vision/detections', detections);
        });
        ```

**Frame Preprocessing Pipeline (GStreamer):**

To avoid costly memory copies between CPU and GPU, we'll use a GStreamer pipeline directly.

*   `v4l2src device=/dev/video0 -> nvvidconv -> video/x-raw(memory:NVMM),width=640,height=480 -> appsink`
*   This pipeline captures from the USB camera, uses the Jetson's hardware converter (`nvvidconv`) to resize and place the frame directly into GPU-accessible NVMM memory, and makes it available to our application (`appsink`) with zero-copy.

**Fish Detection, Classification, and Size Estimation:**

1.  **Detection & Classification:** The single YOLOv8n-seg model will be trained on a custom dataset to perform both detection and species classification simultaneously. The output is a bounding box, a class ID (e.g., `cod`, `pollock`, `mackerel`), a confidence score, and a segmentation mask.
2.  **Size Estimation:** This is a classic monocular vision challenge. We will implement a **laser scaler**.
    *   **Hardware:** Two parallel, fixed-distance green laser pointers are mounted next to the camera, projecting two dots into the camera's field of view. The distance between the lasers (`D_lasers_mm`) is known.
    *   **Algorithm:**
        1.  In each frame, detect the two green laser dots.
        2.  Calculate the pixel distance between them (`d_pixels`).
        3.  Calculate the millimeters-per-pixel ratio for that depth: `mm_per_pixel = D_lasers_mm / d_pixels`.
        4.  For each detected fish mask, measure its length in pixels (`L_fish_pixels`).
        5.  Estimated Fish Size: `L_fish_mm = L_fish_pixels * mm_per_pixel`.
    *   This method is robust to distance and provides accurate, real-time measurements.

**Memory Management (GPU VRAM Budget):**

*   **Total Shared Memory:** 8GB
*   **OS & System:** 1.5 GB
*   **Node.js Core & Other Services:** 0.5 GB
*   **Available for AI/Vision:** ~6.0 GB
*   **Budget Allocation:**
    *   TensorRT Model (YOLOv8n-seg INT8): **~0.8 GB**
    *   GStreamer Frame Buffers (NVMM): **~0.5 GB**
    *   Intermediate Tensors & Activations: **~1.5 GB**
    *   **Total Vision Pipeline Usage:** **~2.8 GB**
    *   *Remaining Headroom:* ~3.2 GB. This is a safe margin.

---

### **2. Depth Sounder Integration (The "Ears")**

The Deeper Pro+ uses Wi-Fi to transmit sonar data. We'll connect the Jetson to its Wi-Fi network and parse the proprietary protocol.

**NMEA Parsing & Data Extraction:**

*   A dedicated Node.js service will connect to the Deeper's TCP socket. It will parse the binary data stream, which contains:
    *   Depth pings (depth value).
    *   Bottom hardness (a value from 0-100).
    *   Fish arches (depth and size indicators).
*   This service will publish structured JSON messages to the message bus, e.g., `{ timestamp, gps, depth: 45.2, hardness: 78, fish_arches: [{depth: 25.1, size: 'medium'}] }`.

**Seabed Composition Classification:**

*   We'll use a small, pre-trained **1D Convolutional Neural Network (CNN)** or a **Gradient Boosting model (LightGBM)**.
*   **Features:** A sliding window of the last 50 sonar returns, including `(depth, hardness)`.
*   **Labels:** `sand`, `rock`, `kelp`, `mud`. This requires an initial manual labeling phase where the operator tags the seabed type based on visual confirmation or anchor feel.
*   **Inference:** The model runs on the CPU. It's very lightweight and takes <5ms per prediction. The output is a classification for the current location.

**3D Bathymetric Map Reconstruction:**

*   All `(timestamp, lat, lon, depth, seabed_type)` data points are stored locally in a **GeoPackage or SpatiaLite database**.
*   A background process runs an interpolation algorithm like **Inverse Distance Weighting (IDW)** to generate a raster grid (a GeoTIFF file) of the surveyed area.
*   This map can be served via a local web server on the vessel and displayed on a tablet, showing the vessel's position on its own high-resolution bathymetric chart.

---

### **3. Drone Pipeline (The "Hawk Eye")**

The DJI Mini provides invaluable aerial context. We'll use the DJI Mobile SDK (or a Python wrapper) to control the drone and access its video stream.

**Camera Calibration & Bird's Eye View Synthesis:**

*   The drone's camera intrinsics will be pre-calibrated.
*   For a real-time Bird's Eye View (BEV), we will perform a **perspective transform (homography)** on the video stream. The transform matrix is calculated using the drone's altitude and camera gimbal pitch, which are available from the SDK. This avoids the heavy computation of full stitching for real-time views.
*   For high-quality survey maps, an offline stitching process using **OpenCV's stitcher module** will be run when the drone returns, creating a high-resolution orthomosaic of the surveyed area.

**Radar Overlay:**

*   The Simrad GO radar outputs NMEA 0183/2000 data with target information (`TLL` - Target Lat/Lon, or `TTM` - Target Tracked Message).
*   A service parses this data.
*   The radar targets (with their lat/lon) are projected onto the georeferenced BEV or orthomosaic map, providing a fused sensor view of vessels, buoys, and hazards.

**Vessel Tracking & Flight Planning:**

*   A lightweight object detection model (e.g., a fine-tuned **MobileNetV3-SSD**) runs on the drone's video stream to detect other vessels.
*   **Tracking:** A simple Kalman filter-based tracker (`SORT` algorithm) is used to maintain a consistent ID for each vessel and predict its trajectory.
*   **Flight Path:** The system will generate automated survey patterns (e.g., "expanding square search" or "lawnmower pattern") to efficiently map an area of interest, like a suspected reef or school of fish.

---

### **4. Catch Prediction ML (The "Brain")**

This module predicts the probability of a successful catch at a given location and time.

**Features:**

*   **Geospatial:** `latitude`, `longitude`, `seabed_type` (from sonar ML), `bathymetric_slope` (derived from our map).
*   **Environmental:** `water_depth` (sonar), `sea_surface_temp` (from an online service, updated when in port), `solar_azimuth`, `solar_altitude`.
*   **Temporal:** `time_of_day` (as sin/cos transform), `day_of_year` (sin/cos), `tidal_phase` (from a predictive model), `moon_phase`.
*   **Historical:** `catch_count_last_hour`, `catch_count_same_location_history`.

**Model & Training:**

*   **Model:** **LightGBM (Light Gradient Boosting Machine)**. It's extremely fast for inference, memory-efficient, and excellent for tabular data. A neural network is overkill and harder to train on the edge.
*   **On-Vessel Training:**
    1.  All catch events (logged by the operator via a simple tablet UI) are stored in the local database, linked to all the features at that point in time.
    2.  A **Docker container** with the training script is pre-loaded on the system.
    3.  A `cron` job triggers the training process once a week (or manually) during periods of low system load (e.g., at night in the marina).
    4.  The script pulls the latest data, retrains the LightGBM model, runs a validation check, and if the new model is better, it replaces the old one. This is a continuous, on-vessel learning loop.

**Prediction:**

*   The system continuously feeds the current feature vector into the loaded LightGBM model.
*   **Output:** A real-time "Fishability Score" from 0 to 100, displayed on the main user interface. This score helps the skipper decide whether to stay in an area or move on.

---

### **5. Autonomous Features (The "Hands")**

This integrates FishingLog.ai with the vessel's control systems via NMEA 2000.

*   **Hardware Interface:** A CAN bus to USB/Ethernet adapter (e.g., Actisense NGT-1).
*   **Auto-Pilot Integration:** The system will send `NMEA 2000 PGN 129284` (Navigation Data) and `PGN 127245` (Rudder) commands to the existing autopilot, instructing it to navigate to a specific waypoint or maintain a heading.
*   **Waypoint Fishing:** The UI allows the skipper to draw a polygon over a high-potential area on the map. The system generates an efficient "trolling" or "drifting" pattern of waypoints and executes it via the autopilot.
*   **Return-to-Home:** The system monitors the voltage of the battery bank. If it drops below a critical threshold (e.g., 12.1V), it will alert the skipper and offer a one-click "navigate to home port" option.
*   **Emergency Protocols:**
    *   **Man Overboard (MOB):** A physical or virtual MOB button instantly logs the current GPS position, sets it as the primary navigation target, sounds an alarm, and can automatically task the drone to fly to the MOB coordinates to provide an aerial view for the search.
    *   **Collision Avoidance:** If the fused Radar/Aerial tracker predicts a CPA (Closest Point of Approach) that violates a safety margin, an audible alarm is triggered. In a future version, it could suggest an evasive maneuver to the autopilot.

---

### **6. Data Pipeline (The "Memory")**

**On-Vessel Data Management:**

*   **Raw Data (2TB NVMe):**
    *   Underwater Video: Stored in a ring buffer, keeping the last 24 hours.
    *   Sonar Logs: Kept for 30 days.
*   **Processed Database (SQLite/GeoPackage):**
    *   Detections, catch logs, bathymetric points, seabed classifications, and model predictions are stored indefinitely. This is the vessel's "logbook" and is the most valuable data.

**Cloud Sync (Satellite-Aware):**

*   **What to Sync:** Only the processed database. Never raw video. A typical day's data might be 5-10 MB.
*   **When to Sync:** The system uses a store-and-forward queue. It prioritizes syncing over known Wi-Fi networks (at the marina). Over satellite, it will only sync high-priority data (e.g., regulatory catch logs) or wait for a scheduled, low-cost data window.
*   **Format:** Data is compressed and synced as a batch file (e.g., gzipped JSON or Parquet).

**Fleet Sharing & Federated Learning:**

*   The cloud backend aggregates anonymized `(feature_vector, catch_result)` data from all participating vessels.
*   A global catch prediction model is trained on this massive dataset.
*   Periodically, this improved "fleet model" is pushed back down to the vessels, giving every user the benefit of the entire fleet's experience without sharing specific fishing spots. This is a key value proposition.

**Regulatory Compliance:**

*   The system provides a "one-click" export of the digital catch log in the exact XML or CSV format required by local fisheries management organizations (e.g., NOAA Fisheries). This saves hours of manual paperwork and reduces compliance errors.

---

### **7. Business Model**

**Target Customers:**

1.  **Commercial Fishers (Primary):** The ROI is clearest here.
2.  **Charter Boat Operators (Secondary):** Enhances the customer experience and success rate.
3.  **High-End Recreational Anglers (Tertiary):** The "prosumer" market.

**Return on Investment (ROI):**

*   **Fuel Savings:** Optimized routing to high-probability zones and efficient survey patterns can lead to **5-15% fuel savings**.
*   **Increased Catch Rate:** Less time searching, more time fishing. A **10-20% increase in Catch Per Unit Effort (CPUE)** is a realistic target.
*   **Compliance Automation:** Saves **30-60 minutes of paperwork per day**, reduces fines, and improves data quality for fisheries science.
*   **Safety:** The autonomous safety features provide peace of mind and can reduce insurance premiums.

**Hardware Cost & Pricing:**

*   **Bill of Materials (BOM) Estimate:**
    *   Jetson Orin Nano 8GB Kit: $499
    *   Underwater Camera (e.g., Blue Robotics): $250
    *   Laser Scaler Module: $50
    *   GPS Module + CAN Bus Adapter: $150
    *   2TB NVMe SSD: $100
    *   IP67 Enclosure & Cabling: $200
    *   **Total Estimated BOM:** **~$1,250**
*   **Pricing Model (Hybrid):**
    *   **One-Time Hardware Purchase:** **$3,499**. This includes the FishingLog.ai unit and a perpetual license for all core on-vessel features.
    *   **Subscription (SaaS):**
        *   **Pro Tier ($49/month):** Includes cloud backup, remote diagnostics, and updated regulatory reporting formats.
        *   **Fleet Tier ($99/month):** Includes all Pro features plus access to the federated "fleet model" for catch prediction, and fleet-level analytics dashboard.

This architecture creates a powerful, self-sufficient edge AI system that provides tangible value to fishers through efficiency, data-driven decisions, and automation, all while respecting the harsh realities of the marine environment.