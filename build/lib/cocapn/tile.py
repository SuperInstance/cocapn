"""Tiles — atomic knowledge units that remember everything."""

import json
import hashlib
import time
import os
import math
from dataclasses import dataclass, field, asdict
from typing import Optional


@dataclass
class Tile:
    """A single knowledge tile — the fleet's fundamental unit of intelligence."""
    question: str
    answer: str
    domain: str = "general"
    confidence: float = 0.5
    source: str = "agent"
    tags: list = field(default_factory=list)
    
    # Auto-generated
    id: str = ""
    timestamp: float = 0.0
    usage_count: int = 0
    success_count: int = 0
    version: int = 1
    
    def __post_init__(self):
        if not self.id:
            content = f"{self.question}:{self.answer}:{self.domain}"
            self.id = hashlib.md5(content.encode()).hexdigest()[:12]
        if not self.timestamp:
            self.timestamp = time.time()
    
    def record_use(self, success: bool = True):
        self.usage_count += 1
        if success:
            self.success_count += 1
    
    @property
    def success_rate(self) -> float:
        return self.success_count / max(self.usage_count, 1)
    
    @property
    def priority(self) -> float:
        base = math.log(self.usage_count + 1) + 0.5  # floor at 0.5 so new tiles have weight
        return base * self.confidence * max(self.success_rate, 0.5)
    
    def to_dict(self) -> dict:
        return asdict(self)
    
    @classmethod
    def from_dict(cls, d: dict) -> "Tile":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


class TileStore:
    """Persistent tile storage. Tiles survive restarts."""
    
    def __init__(self, path: str = "data/tiles.jsonl"):
        self.path = path
        self.tiles: dict[str, Tile] = {}
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        self._load()
    
    def _load(self):
        if os.path.exists(self.path):
            with open(self.path) as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            t = Tile.from_dict(json.loads(line))
                            self.tiles[t.id] = t
                        except (json.JSONDecodeError, TypeError):
                            pass
    
    def _save(self):
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        with open(self.path, "w") as f:
            for t in self.tiles.values():
                f.write(json.dumps(t.to_dict()) + "\n")
    
    def add(self, tile: Tile) -> Tile:
        if tile.id in self.tiles:
            existing = self.tiles[tile.id]
            existing.version += 1
            existing.answer = tile.answer
            existing.confidence = max(existing.confidence, tile.confidence)
            if tile.tags:
                existing.tags = list(set(existing.tags + tile.tags))
        else:
            self.tiles[tile.id] = tile
        self._save()
        return self.tiles[tile.id]
    
    def get(self, tile_id: str) -> Optional[Tile]:
        return self.tiles.get(tile_id)
    
    def search(self, query: str, domain: str = None, limit: int = 5) -> list[Tile]:
        query_lower = query.lower()
        scored = []
        for t in self.tiles.values():
            if domain and t.domain != domain:
                continue
            q_overlap = sum(1 for w in query_lower.split() if w in t.question.lower())
            a_overlap = sum(1 for w in query_lower.split() if w in t.answer.lower())
            score = (q_overlap * 2 + a_overlap) * t.priority
            if score > 0:
                scored.append((score, t))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [t for _, t in scored[:limit]]
    
    def all_tiles(self) -> list[Tile]:
        return list(self.tiles.values())
    
    @property
    def count(self) -> int:
        return len(self.tiles)
