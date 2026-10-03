"""pytest conftest — make `import cocapn` work under bare `pytest` (CI runs
bare pytest, which — unlike `python -m pytest` — does not put the repo root
on sys.path). Prepend the repo root (this file's parent) explicitly.
"""
import sys
from pathlib import Path

ROOT = str(Path(__file__).resolve().parent)
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
