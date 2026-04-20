"""Cocapn — the shell that makes agents smarter. Tiles capture, rooms train, flywheel compounds."""

__version__ = "0.1.0"

from .agent import CocapnAgent
from .tile import Tile, TileStore
from .room import Room
from .flywheel import Flywheel

__all__ = ["CocapnAgent", "Tile", "TileStore", "Room", "Flywheel"]
