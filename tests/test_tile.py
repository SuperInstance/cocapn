"""Tests for cocapn.tile — Tile and TileStore."""
import json
import os
import tempfile
import time

from cocapn.tile import Tile, TileStore


# ── Tile ──────────────────────────────────────────────────────────────────────

class TestTile:
    def test_auto_id_generated(self):
        t = Tile(question="q", answer="a")
        assert t.id != ""
        assert len(t.id) == 12

    def test_auto_timestamp(self):
        before = time.time()
        t = Tile(question="q", answer="a")
        after = time.time()
        assert before <= t.timestamp <= after

    def test_deterministic_id(self):
        t1 = Tile(question="q", answer="a", domain="d")
        t2 = Tile(question="q", answer="a", domain="d")
        assert t1.id == t2.id

    def test_custom_id_preserved(self):
        t = Tile(question="q", answer="a", id="custom123")
        assert t.id == "custom123"

    def test_custom_timestamp_preserved(self):
        t = Tile(question="q", answer="a", timestamp=1000.0)
        assert t.timestamp == 1000.0

    def test_default_fields(self):
        t = Tile(question="q", answer="a")
        assert t.domain == "general"
        assert t.confidence == 0.5
        assert t.source == "agent"
        assert t.tags == []
        assert t.usage_count == 0
        assert t.success_count == 0
        assert t.version == 1

    def test_record_use_success(self):
        t = Tile(question="q", answer="a")
        t.record_use(True)
        assert t.usage_count == 1
        assert t.success_count == 1
        t.record_use(True)
        assert t.usage_count == 2
        assert t.success_count == 2

    def test_record_use_failure(self):
        t = Tile(question="q", answer="a")
        t.record_use(False)
        assert t.usage_count == 1
        assert t.success_count == 0

    def test_record_use_mixed(self):
        t = Tile(question="q", answer="a")
        t.record_use(True)
        t.record_use(True)
        t.record_use(False)
        assert t.usage_count == 3
        assert t.success_count == 2

    def test_success_rate_no_uses(self):
        t = Tile(question="q", answer="a")
        # max(usage_count, 1) → 0/1 = 0.0
        assert t.success_rate == 0.0

    def test_success_rate_perfect(self):
        t = Tile(question="q", answer="a")
        for _ in range(5):
            t.record_use(True)
        assert t.success_rate == 1.0

    def test_success_rate_partial(self):
        t = Tile(question="q", answer="a")
        t.record_use(True)
        t.record_use(False)
        assert t.success_rate == 0.5

    def test_priority_floor(self):
        t = Tile(question="q", answer="a", confidence=1.0)
        # priority = log(0+1)+0.5 * 1.0 * max(0.0, 0.5) = 0.5 * 1.0 * 0.5 = 0.25
        assert t.priority > 0

    def test_priority_increases_with_use(self):
        t = Tile(question="q", answer="a", confidence=0.9)
        p0 = t.priority
        for _ in range(20):
            t.record_use(True)
        assert t.priority > p0

    def test_to_dict(self):
        t = Tile(question="q", answer="a", domain="test", confidence=0.7, tags=["x"])
        d = t.to_dict()
        assert d["question"] == "q"
        assert d["answer"] == "a"
        assert d["domain"] == "test"
        assert d["confidence"] == 0.7
        assert d["tags"] == ["x"]
        assert "id" in d
        assert "timestamp" in d

    def test_from_dict_roundtrip(self):
        t1 = Tile(question="q", answer="a", domain="d", confidence=0.8, tags=["a", "b"])
        t1.record_use(True)
        d = t1.to_dict()
        t2 = Tile.from_dict(d)
        assert t2.question == t1.question
        assert t2.answer == t1.answer
        assert t2.domain == t1.domain
        assert t2.confidence == t1.confidence
        assert t2.id == t1.id
        assert t2.usage_count == t1.usage_count

    def test_from_dict_ignores_unknown_keys(self):
        d = {"question": "q", "answer": "a", "extra_key": "ignored"}
        t = Tile.from_dict(d)
        assert t.question == "q"


# ── TileStore ─────────────────────────────────────────────────────────────────

class TestTileStore:
    def test_add_and_get(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = TileStore(path=os.path.join(tmp, "t.jsonl"))
            t = store.add(Tile(question="q1", answer="a1"))
            assert store.count == 1
            got = store.get(t.id)
            assert got is not None
            assert got.question == "q1"

    def test_get_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = TileStore(path=os.path.join(tmp, "t.jsonl"))
            assert store.get("nonexistent") is None

    def test_add_duplicate_same_content(self):
        """Same question+answer+domain = same ID → merged."""
        with tempfile.TemporaryDirectory() as tmp:
            store = TileStore(path=os.path.join(tmp, "t.jsonl"))
            t1 = store.add(Tile(question="q", answer="a", confidence=0.5))
            assert store.count == 1
            t2 = store.add(Tile(question="q", answer="a", confidence=0.9, tags=["new"]))
            assert store.count == 1  # same ID, merged
            assert t2.confidence >= 0.5
            assert "new" in t2.tags

    def test_add_different_answer_different_id(self):
        """Different answer = different hash = new tile."""
        with tempfile.TemporaryDirectory() as tmp:
            store = TileStore(path=os.path.join(tmp, "t.jsonl"))
            store.add(Tile(question="q", answer="a1", confidence=0.5))
            store.add(Tile(question="q", answer="a2", confidence=0.9))
            assert store.count == 2

    def test_add_duplicate_keeps_higher_confidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = TileStore(path=os.path.join(tmp, "t.jsonl"))
            store.add(Tile(question="q", answer="a", confidence=0.9))
            t2 = store.add(Tile(question="q", answer="a", confidence=0.3))
            assert t2.confidence == 0.9

    def test_add_duplicate_merges_tags(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = TileStore(path=os.path.join(tmp, "t.jsonl"))
            store.add(Tile(question="q", answer="a", tags=["t1"]))
            t2 = store.add(Tile(question="q", answer="a", tags=["t2"]))
            assert set(t2.tags) == {"t1", "t2"}

    def test_persistence(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "t.jsonl")
            store = TileStore(path=path)
            store.add(Tile(question="q", answer="a"))
            store2 = TileStore(path=path)
            assert store2.count == 1

    def test_all_tiles(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = TileStore(path=os.path.join(tmp, "t.jsonl"))
            store.add(Tile(question="q1", answer="a1"))
            store.add(Tile(question="q2", answer="a2"))
            assert len(store.all_tiles()) == 2

    def test_search_basic(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = TileStore(path=os.path.join(tmp, "t.jsonl"))
            store.add(Tile(question="python file read", answer="use open()", confidence=0.9))
            store.add(Tile(question="rust ownership", answer="borrow checker", confidence=0.8))
            results = store.search("python read")
            assert len(results) >= 1
            assert "python" in results[0].question

    def test_search_with_domain_filter(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = TileStore(path=os.path.join(tmp, "t.jsonl"))
            store.add(Tile(question="test q", answer="test a", domain="code"))
            store.add(Tile(question="test q", answer="test a", domain="math"))
            results = store.search("test", domain="code")
            assert all(t.domain == "code" for t in results)

    def test_search_limit(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = TileStore(path=os.path.join(tmp, "t.jsonl"))
            for i in range(10):
                store.add(Tile(question=f"test q {i}", answer=f"test a {i}"))
            results = store.search("test", limit=3)
            assert len(results) <= 3

    def test_search_no_results(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = TileStore(path=os.path.join(tmp, "t.jsonl"))
            store.add(Tile(question="hello", answer="world"))
            results = store.search("xyzzy")
            assert len(results) == 0

    def test_loads_corrupt_lines_gracefully(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "t.jsonl")
            with open(path, "w") as f:
                f.write("not json\n")
                f.write(json.dumps({"question": "q", "answer": "a"}) + "\n")
                f.write("\n")
            store = TileStore(path=path)
            assert store.count == 1

    def test_empty_store(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = TileStore(path=os.path.join(tmp, "t.jsonl"))
            assert store.count == 0
            assert store.all_tiles() == []
