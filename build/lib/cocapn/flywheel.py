"""Flywheel — the system that makes every exchange improve the next."""

import json
import os
from .tile import Tile, TileStore
from .room import Room


class Flywheel:
    """Tiles → Rooms → Context → Better responses → Better tiles. Compounds."""
    
    def __init__(self, data_dir: str = "data"):
        self.store = TileStore(path=os.path.join(data_dir, "tiles.jsonl"))
        self.rooms: dict[str, Room] = {}
        self.history: list[dict] = []
        self._load_rooms(os.path.join(data_dir, "rooms.json"))
    
    def _load_rooms(self, path: str):
        if os.path.exists(path):
            with open(path) as f:
                room_defs = json.load(f)
            for rd in room_defs:
                name = rd["name"]
                self.rooms[name] = Room(
                    name=name,
                    description=rd.get("description", ""),
                    store=self.store
                )
    
    def ensure_room(self, name: str, description: str = "") -> Room:
        if name not in self.rooms:
            self.rooms[name] = Room(name=name, description=description, store=self.store)
        return self.rooms[name]
    
    def record_exchange(self, question: str, answer: str, room: str = "general",
                       confidence: float = 0.5, tags: list = None):
        """Record an exchange as a tile. The flywheel starts here."""
        r = self.ensure_room(room)
        tile = r.feed(question=question, answer=answer, 
                     confidence=confidence, tags=tags)
        
        self.history.append({
            "question": question,
            "answer": answer,
            "room": room,
            "tile_id": tile.id,
            "confidence": confidence,
        })
        return tile
    
    def get_context(self, question: str, rooms: list = None, limit: int = 10) -> str:
        """Get relevant context from rooms for agent injection."""
        contexts = []
        target_rooms = rooms or list(self.rooms.keys())
        
        for name in target_rooms:
            if name in self.rooms:
                room = self.rooms[name]
                match = room.query(question)
                if match:
                    contexts.append(match)
        
        # Sort by priority
        contexts.sort(key=lambda t: t.priority, reverse=True)
        top = contexts[:limit]
        
        if not top:
            return ""
        
        lines = ["[Relevant knowledge from previous exchanges:]"]
        for t in top:
            lines.append(f"  Q: {t.question}")
            lines.append(f"  A: {t.answer} (confidence: {t.confidence:.2f})")
        return "\n".join(lines)
    
    def stats(self) -> dict:
        return {
            "total_tiles": self.store.count,
            "rooms": {name: room.stats for name, room in self.rooms.items()},
            "exchanges": len(self.history),
        }
    
    def save(self, data_dir: str = "data"):
        """Persist everything."""
        self.store._save()
        room_defs = [{"name": r.name, "description": r.description} 
                     for r in self.rooms.values()]
        os.makedirs(data_dir, exist_ok=True)
        with open(os.path.join(data_dir, "rooms.json"), "w") as f:
            json.dump(room_defs, f, indent=2)
