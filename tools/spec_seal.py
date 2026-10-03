#!/usr/bin/env python3
"""tools/spec_seal.py — (re)seal spec/SPEC.md: record its sha256 in spec/spec_sha.json.
Re-sealing after a spec change is a documented, intentional act."""
import hashlib, json, sys
from datetime import datetime, timezone
from pathlib import Path

spec = Path("spec/SPEC.md")
if not spec.exists():
    print("E_SPEC_MISSING: spec/SPEC.md not found", file=sys.stderr)
    sys.exit(1)
spec_sha = hashlib.sha256(spec.read_bytes()).hexdigest()
sealp = Path("spec/spec_sha.json")
prior = json.loads(sealp.read_text()) if sealp.exists() else None
seal = {
    "dialect": "spec-sha-v1",
    "repo": "cocapn",
    "spec_sha": spec_sha,
    "resealed_from": prior["spec_sha"] if prior else None,
    "note": "re-seal: intentional documented spec change" if prior else "initial seal",
    "sealed_at": datetime.now(timezone.utc).isoformat(),
}
sealp.write_text(json.dumps(seal, indent=2) + "\n")
print(f"SEALED {spec_sha[:16]}… (prior: {prior['spec_sha'][:16] + '…' if prior else 'none'})")
