"""Tests for cocapn.room — Room."""
import os
import tempfile

from cocapn.tile import TileStore
from cocapn.room import Room, _normalize


class TestNormalize:
    def test_basic(self):
        assert _normalize("Hello World") == {"hello", "world"}

    def test_strips_punctuation(self):
        assert _normalize("it's a test!") == {"its", "a", "test"}

    def test_lowercase(self):
        assert _normalize("PYTHON") == {"python"}

    def test_empty(self):
        assert _normalize("") == set()

    def test_numbers(self):
        assert _normalize("python3") == {"python3"}


class TestRoom:
    def test_create_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = TileStore(path=os.path.join(tmp, "t.jsonl"))
            room = Room(name="test", store=store)
            assert room.name == "test"
            assert room.tiles == []
            assert room.sentiment == 0.5

    def test_feed_and_query(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = TileStore(path=os.path.join(tmp, "t.jsonl"))
            room = Room(name="code", store=store)
            tile = room.feed("How to read a file?", "with open()", confidence=0.9)
            assert tile.domain == "code"
            assert len(room.tiles) == 1

    def test_query_returns_best_match(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = TileStore(path=os.path.join(tmp, "t.jsonl"))
            room = Room(name="code", store=store)
            room.feed("How to read a file in Python?", "with open()", confidence=0.9)
            room.feed("How to sort a list?", "sorted()", confidence=0.5)
            result = room.query("read file Python")
            assert result is not None
            assert "open" in result.answer

    def test_query_no_tiles(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = TileStore(path=os.path.join(tmp, "t.jsonl"))
            room = Room(name="empty", store=store)
            assert room.query("anything") is None

    def test_sentiment_shifts_up(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = TileStore(path=os.path.join(tmp, "t.jsonl"))
            room = Room(name="test", store=store)
            assert room.sentiment == 0.5
            room.feed("q", "a", confidence=0.9)
            assert room.sentiment > 0.5

    def test_sentiment_shifts_down(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = TileStore(path=os.path.join(tmp, "t.jsonl"))
            room = Room(name="test", store=store)
            room.feed("q", "a", confidence=0.1)
            assert room.sentiment < 0.5

    def test_sentiment_converges(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = TileStore(path=os.path.join(tmp, "t.jsonl"))
            room = Room(name="test", store=store)
            for _ in range(50):
                room.feed("q", "a", confidence=0.9)
            # Should converge toward 0.9 (alpha=0.1)
            assert room.sentiment > 0.85

    def test_feed_stores_in_domain(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = TileStore(path=os.path.join(tmp, "t.jsonl"))
            room = Room(name="myroom", store=store)
            tile = room.feed("q", "a")
            assert tile.domain == "myroom"
            # Room loads tiles matching its name
            assert len(room.tiles) == 1

    def test_context_for_agent_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = TileStore(path=os.path.join(tmp, "t.jsonl"))
            room = Room(name="empty", store=store)
            ctx = room.context_for_agent()
            assert "No tiles yet" in ctx
            assert "empty" in ctx

    def test_context_for_agent_with_tiles(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = TileStore(path=os.path.join(tmp, "t.jsonl"))
            room = Room(name="code", store=store)
            room.feed("How to read a file?", "with open()", confidence=0.9)
            ctx = room.context_for_agent()
            assert "Room: code" in ctx
            assert "1 tiles" in ctx
            assert "open" in ctx

    def test_context_for_agent_limit(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = TileStore(path=os.path.join(tmp, "t.jsonl"))
            room = Room(name="test", store=store)
            for i in range(20):
                room.feed(f"q{i}", f"a{i}", confidence=0.5)
            ctx = room.context_for_agent(limit=5)
            # Count Q: lines
            assert ctx.count("Q: ") <= 5

    def test_stats_property(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = TileStore(path=os.path.join(tmp, "t.jsonl"))
            room = Room(name="test", store=store)
            room.feed("q1", "a1", confidence=0.8)
            room.feed("q2", "a2", confidence=0.6)
            s = room.stats
            assert s["name"] == "test"
            assert s["tiles"] == 2
            assert 0.5 < s["sentiment"] < 1.0
            assert 0.6 < s["avg_confidence"] < 0.8

    def test_query_records_usage(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = TileStore(path=os.path.join(tmp, "t.jsonl"))
            room = Room(name="test", store=store)
            room.feed("python read file", "open()", confidence=0.9)
            result = room.query("python file read")
            assert result is not None
            assert result.usage_count >= 1

    def test_default_store(self):
        """Room creates its own store if none given."""
        room = Room(name="test")
        assert room.store is not None
