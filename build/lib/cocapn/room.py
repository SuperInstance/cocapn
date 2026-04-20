"""Rooms — self-training collections of tiles. The room IS the intelligence."""

import json
import os
import re
from typing import Optional
from .tile import Tile, TileStore


def _normalize(text: str) -> set:
    """Split text into lowercase words, stripped of punctuation."""
    return set(re.sub(r'[^a-z0-9 ]', '', text.lower()).split())


class Room:
    """A room trains on its tiles and gets smarter over time."""
    
    def __init__(self, name: str, description: str = "", store: TileStore = None):
        self.name = name
        self.description = description
        self.store = store or TileStore()
        self.tiles: list[Tile] = []
        self.sentiment: float = 0.5  # 0=hostile, 1=ecstatic
        self._load_tiles()
    
    def _load_tiles(self):
        """Load tiles belonging to this room from the store."""
        self.tiles = [t for t in self.store.all_tiles() if t.domain == self.name]
    
    def feed(self, question: str, answer: str, confidence: float = 0.5, 
             source: str = "agent", tags: list = None) -> Tile:
        """Feed knowledge into the room."""
        tile = Tile(
            question=question,
            answer=answer,
            domain=self.name,
            confidence=confidence,
            source=source,
            tags=tags or []
        )
        self.store.add(tile)
        self._load_tiles()
        self._update_sentiment(confidence)
        return tile
    
    def _update_sentiment(self, confidence: float):
        """Room sentiment shifts based on what it absorbs."""
        alpha = 0.1  # learning rate
        self.sentiment = self.sentiment * (1 - alpha) + confidence * alpha
    
    def query(self, question: str) -> Optional[Tile]:
        """Find the best matching tile in this room."""
        if not self.tiles:
            return None
        
        best = None
        best_score = 0
        
        q_words = _normalize(question)
        for tile in self.tiles:
            t_words = _normalize(tile.question) | _normalize(tile.answer)
            overlap = len(q_words & t_words) / max(len(q_words), 1)
            score = overlap * tile.priority
            if score > best_score:
                best_score = score
                best = tile
        
        if best:
            best.record_use(best_score > 0.1)
            self.store.add(best)  # update usage counts
        return best
    
    def context_for_agent(self, limit: int = 10) -> str:
        """Generate context string for injecting into agent prompts."""
        if not self.tiles:
            return f"[Room: {self.name}] No tiles yet."
        
        top = sorted(self.tiles, key=lambda t: t.priority, reverse=True)[:limit]
        lines = [f"[Room: {self.name} | {len(self.tiles)} tiles | sentiment: {self.sentiment:.2f}]"]
        for t in top:
            lines.append(f"  Q: {t.question}")
            lines.append(f"  A: {t.answer} (confidence: {t.confidence:.2f}, used: {t.usage_count})")
        return "\n".join(lines)
    
    @property
    def stats(self) -> dict:
        return {
            "name": self.name,
            "tiles": len(self.tiles),
            "sentiment": round(self.sentiment, 2),
            "avg_confidence": sum(t.confidence for t in self.tiles) / max(len(self.tiles), 1)
        }
