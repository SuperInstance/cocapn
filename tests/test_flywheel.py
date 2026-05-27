"""Tests for cocapn.flywheel — Flywheel."""
import json
import os
import tempfile

from cocapn.flywheel import Flywheel


class TestFlywheel:
    def test_record_exchange(self):
        with tempfile.TemporaryDirectory() as tmp:
            fw = Flywheel(data_dir=tmp)
            tile = fw.record_exchange("q", "a", room="test", confidence=0.8)
            assert tile is not None
            assert tile.question == "q"
            assert fw.store.count == 1
            assert len(fw.history) == 1

    def test_record_exchange_auto_creates_room(self):
        with tempfile.TemporaryDirectory() as tmp:
            fw = Flywheel(data_dir=tmp)
            fw.record_exchange("q", "a", room="newroom")
            assert "newroom" in fw.rooms

    def test_ensure_room(self):
        with tempfile.TemporaryDirectory() as tmp:
            fw = Flywheel(data_dir=tmp)
            r = fw.ensure_room("custom", description="Custom room")
            assert r.name == "custom"
            assert r.description == "Custom room"

    def test_ensure_room_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            fw = Flywheel(data_dir=tmp)
            r1 = fw.ensure_room("x", description="first")
            r2 = fw.ensure_room("x", description="second")
            assert r1 is r2  # same object

    def test_get_context_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            fw = Flywheel(data_dir=tmp)
            ctx = fw.get_context("anything")
            assert ctx == ""

    def test_get_context_with_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            fw = Flywheel(data_dir=tmp)
            fw.record_exchange("What is Rust?", "A systems language", room="code", confidence=0.9)
            ctx = fw.get_context("Tell me about Rust")
            assert "Rust" in ctx
            assert "Relevant knowledge" in ctx

    def test_get_context_limit(self):
        with tempfile.TemporaryDirectory() as tmp:
            fw = Flywheel(data_dir=tmp)
            for i in range(20):
                fw.record_exchange(f"q{i}", f"a{i}", room="test", confidence=0.8)
            ctx = fw.get_context("q", limit=3)
            # Count tile entries (Q: lines)
            assert ctx.count("Q: ") <= 3

    def test_get_context_specific_rooms(self):
        with tempfile.TemporaryDirectory() as tmp:
            fw = Flywheel(data_dir=tmp)
            fw.record_exchange("Rust question", "Rust answer", room="code", confidence=0.9)
            fw.record_exchange("Math question", "Math answer", room="math", confidence=0.9)
            ctx = fw.get_context("question", rooms=["code"])
            assert "Rust" in ctx
            assert "Math" not in ctx

    def test_stats(self):
        with tempfile.TemporaryDirectory() as tmp:
            fw = Flywheel(data_dir=tmp)
            fw.record_exchange("q1", "a1", room="r1", confidence=0.8)
            fw.record_exchange("q2", "a2", room="r2", confidence=0.7)
            s = fw.stats()
            assert s["total_tiles"] == 2
            assert s["exchanges"] == 2
            assert "r1" in s["rooms"]
            assert "r2" in s["rooms"]

    def test_save_and_reload(self):
        with tempfile.TemporaryDirectory() as tmp:
            fw = Flywheel(data_dir=tmp)
            fw.record_exchange("persist q", "persist a", room="test", confidence=0.9)
            fw.save()

            # Tiles persist via TileStore
            fw2 = Flywheel(data_dir=tmp)
            assert fw2.stats()["total_tiles"] == 1

    def test_history_tracking(self):
        with tempfile.TemporaryDirectory() as tmp:
            fw = Flywheel(data_dir=tmp)
            fw.record_exchange("q1", "a1", room="r1", confidence=0.8)
            fw.record_exchange("q2", "a2", room="r2", confidence=0.7)
            assert len(fw.history) == 2
            assert fw.history[0]["question"] == "q1"
            assert fw.history[1]["room"] == "r2"

    def test_loads_existing_rooms(self):
        with tempfile.TemporaryDirectory() as tmp:
            # Pre-create rooms.json
            rooms_path = os.path.join(tmp, "rooms.json")
            with open(rooms_path, "w") as f:
                json.dump([{"name": "preloaded", "description": "A preloaded room"}], f)

            fw = Flywheel(data_dir=tmp)
            assert "preloaded" in fw.rooms
            assert fw.rooms["preloaded"].description == "A preloaded room"
