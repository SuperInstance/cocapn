"""python3 -m cocapn.sxc1 — entrypoint for the sxc1 validator mirror CLI."""
import sys

from .cli import main

if __name__ == "__main__":
    sys.exit(main())
