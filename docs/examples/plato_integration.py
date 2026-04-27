#!/usr/bin/env python3
"""PLATO integration — submit tiles and query rooms directly.

Shows how to use the core Tile/Room/Flywheel primitives for building
custom knowledge systems. Works standalone or alongside a PLATO server.

Usage:
    python3 plato_integration.py
"""

import json
from cocapn import Tile, TileStore, Room, Flywheel

# === 1. Create and manage tiles directly ===

tile = Tile(
    question="What is the deadband protocol?",
    answer="P0: block danger. P1: find safe channels. P2: optimize within channel.",
    domain="safety",
    confidence=0.95,
    source="taught",
    tags=["safety", "protocol", "core"]
)
print(f"Created tile: {tile.id}")
print(f"  Priority: {tile.priority:.3f}")
print(f"  Version: {tile.version}")

# Record usage — priority increases with successful uses
for _ in range(5):
    tile.record_use(success=True)
print(f"  After 5 uses — priority: {tile.priority:.3f}, success_rate: {tile.success_rate:.2f}")

# === 2. TileStore — persistent storage ===

store = TileStore(path="data/plato/tiles.jsonl")

# Add multiple tiles
for q, a, domain in [
    ("What is a vessel?", "The repo that IS the agent. Self-contained, git-portable.", "architecture"),
    ("What is a room?", "Self-training collection of tiles. Has sentiment that shifts with content.", "architecture"),
    ("What is the flywheel?", "Tiles→rooms→context→better responses→better tiles. Compounds.", "architecture"),
    ("How does confidence work?", "0.0-1.0 scale. Higher = more reliable. Affects tile priority.", "usage"),
]:
    store.add(Tile(question=q, answer=a, domain=domain, confidence=0.85))

print(f"\nStore: {store.count} tiles")

# Search the store
results = store.search("what is a room", limit=3)
for r in results:
    print(f"  [{r.domain}] {r.question} → {r.answer[:60]}...")

# === 3. Rooms — self-training knowledge collections ===

room = Room(name="architecture", description="System architecture knowledge", store=store)

# Feed more knowledge
room.feed(
    question="What is bottle protocol?",
    answer="Git-native agent communication. Messages as files in outbox/inbox directories.",
    confidence=0.9,
    tags=["communication", "protocol"]
)

print(f"\nRoom '{room.name}': {room.stats}")

# Query the room
match = room.query("how do agents communicate")
if match:
    print(f"  Best match: {match.question} → {match.answer}")

# Generate agent context — inject this into your LLM prompt
context = room.context_for_agent(limit=5)
print(f"\nAgent context:\n{context}")

# === 4. Flywheel — the compounder ===

fw = Flywheel(data_dir="data/plato")

# Record exchanges across rooms
fw.record_exchange("Deploy checklist?", "1. Build 2. Test 3. Tag 4. Push 5. Announce", room="ops", confidence=0.9)
fw.record_exchange("Rollback procedure?", "git revert, rebuild, redeploy, verify health", room="ops", confidence=0.85)
fw.record_exchange("What makes a good agent?", "Captures knowledge, compounds over time, has opinions", room="philosophy", confidence=0.7)

# Get context for a new query — searches all rooms
ctx = fw.get_context("how to deploy safely")
print(f"\nFlywheel context for 'how to deploy safely':\n{ctx}")

# Stats
print(f"\nFlywheel stats: {json.dumps(fw.stats(), indent=2)}")

# Save everything
fw.save("data/plato")
print("Saved. Knowledge persists.")

# === 5. PLATO Server integration (optional) ===
# If a PLATO server is running (e.g., localhost:8847), you can sync tiles:
#
# import urllib.request
# import json
#
# # Submit a tile to PLATO
# tile_data = tile.to_dict()
# req = urllib.request.Request(
#     "http://localhost:8847/tile",
#     data=json.dumps(tile_data).encode(),
#     headers={"Content-Type": "application/json"}
# )
# resp = urllib.request.urlopen(req)
#
# # Query a PLATO room
# resp = urllib.request.urlopen("http://localhost:8847/room/architecture")
# room_data = json.loads(resp.read())
