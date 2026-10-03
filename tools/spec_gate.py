#!/usr/bin/env python3
"""tools/spec_gate.py — self-defending compiler gate (wave-69).
Refuses compilation when the specification is missing, unsealed, or tampered.
Named fail-closed codes: E_SPEC_MISSING, E_SPEC_SHA_MISSING, E_SPEC_SHA_MALFORMED,
E_SPEC_DIALECT, E_SPEC_TAMPERED. Exit 0 => gate open."""
import hashlib, json, sys
from pathlib import Path

def die(code: str, msg: str):
    print(f"SPEC_GATE {code}: {msg}", file=sys.stderr)
    sys.exit(1)

spec = Path("spec/SPEC.md")
sealp = Path("spec/spec_sha.json")
if not spec.exists():
    die("E_SPEC_MISSING", "spec/SPEC.md not found — specification-first layout is required before code generation")
if not sealp.exists():
    die("E_SPEC_SHA_MISSING", "spec/spec_sha.json not found — pre-registration required (run: python3 tools/spec_seal.py)")
try:
    seal = json.loads(sealp.read_text())
except Exception:
    die("E_SPEC_SHA_MALFORMED", "spec/spec_sha.json is not valid JSON")
if seal.get("dialect") != "spec-sha-v1":
    die("E_SPEC_DIALECT", f"unknown seal dialect {seal.get('dialect')!r} — expected \"spec-sha-v1\"")
live = hashlib.sha256(spec.read_bytes()).hexdigest()
if seal.get("spec_sha") != live:
    die("E_SPEC_TAMPERED", f"spec seal mismatch: recorded {str(seal.get('spec_sha'))[:16]}… live {live[:16]}… — if intentional and documented, re-seal via: python3 tools/spec_seal.py")
print(f"SPEC_GATE OK {live[:16]}…")
