#!/usr/bin/env python3
"""Fleet communication — send and receive bottles via PLATO rooms.

Bottles are the inter-agent messaging protocol. In Cocapn, rooms serve as
shared message channels. Agents write to rooms, other agents query them.

Usage:
    python3 fleet_communication.py
"""

from cocapn import Flywheel, Room, TileStore

# --- Agent 1: Oracle1 sends a bottle ---
oracle_fw = Flywheel(data_dir="data/oracle1")

# Record fleet intelligence as a tile in the "fleet-broadcast" room
bottle = oracle_fw.record_exchange(
    question="Fleet status update 2026-04-27",
    answer="All vessels operational. FM shipped plato-kernel v0.3. JC1 edge node healthy. New scout deployed.",
    room="fleet-broadcast",
    confidence=0.85,
    tags=["status", "fleet"]
)
print(f"Oracle1 sent bottle: {bottle.id}")
print(f"  Room: fleet-broadcast")
print(f"  Confidence: {bottle.confidence}")

oracle_fw.save("data/oracle1")

# --- Agent 2: CCC reads fleet broadcasts ---
ccc_fw = Flywheel(data_dir="data/ccc")

# Query for fleet status — gets relevant tiles from fleet-broadcast room
context = ccc_fw.get_context("fleet status update", rooms=["fleet-broadcast"])
print(f"\nCCC received context:\n{context}")

# CCC responds with its own intelligence
ccc_fw.record_exchange(
    question="CCC analysis of fleet status",
    answer="Fleet is green. Recommend scheduling plato-kernel integration testing this week.",
    room="fleet-broadcast",
    confidence=0.8,
    tags=["analysis", "recommendation"]
)
ccc_fw.save("data/ccc")

# --- Broadcast room stats ---
store = TileStore(path="data/oracle1/tiles.jsonl")
broadcast_room = Room(name="fleet-broadcast", description="Fleet-wide broadcasts", store=store)
print(f"\nBroadcast room: {broadcast_room.stats}")

# --- Multi-room context ---
# An agent can pull context from multiple rooms at once
oracle_fw.record_exchange(
    question="How to handle degraded disk on VPS?",
    answer="Check SMART stats, backup critical data, migrate to new volume, alert fleet.",
    room="ops",
    confidence=0.9,
    tags=["ops", "infrastructure"]
)

# Get context from both ops and fleet-broadcast rooms
full_context = oracle_fw.get_context("disk issue on VPS", rooms=["ops", "fleet-broadcast"])
print(f"\nMulti-room context:\n{full_context}")
