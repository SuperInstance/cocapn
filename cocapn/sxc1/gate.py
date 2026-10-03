"""cocapn.sxc1.gate — the spec_sha mirror gate (SPEC §2, invariant C1).

Cross-repo rule, documented so no future lane "fixes" it into equality:
cocapn does NOT require a foreign envelope's seal.spec_sha to EQUAL its own
spec_sha. Repos in the fleet carry different specs (exoj's spec is not
cocapn's spec), so equality would refuse every honest cross-repo envelope.
What must hold instead:

  1. the envelope carries a WELL-FORMED spec_sha (present, 64 lowercase
     hex) — else E_SXC_SPEC (an envelope-side fault);
  2. cocapn's OWN spec seal exists locally (spec/spec_sha.json, resolved
     relative to this package file) — else E_SPEC_SHA_MISSING (a self-side
     fault: cocapn cannot host a mirror while itself unsealed);
  3. the local seal is well-formed — else E_SPEC_SHA_MALFORMED.

Equality with the foreign spec_sha is deliberately never checked.
"""
import json
import re
from pathlib import Path

__all__ = ["SPEC_SHA_PATH", "check_spec_seal"]

HEX64 = re.compile(r"^[0-9a-f]{64}$")
# gate.py -> sxc1 -> cocapn -> repo root / spec / spec_sha.json
SPEC_SHA_PATH = Path(__file__).resolve().parents[2] / "spec" / "spec_sha.json"


def check_spec_seal(env) -> dict:
    """Mirror-gate an envelope's seal.spec_sha (presence + hex shape) and
    require cocapn's own spec seal to exist locally. Never compares the
    foreign spec_sha to cocapn's own (cross-repo rule — see module docstring).
    """
    seal = env.get("seal") if isinstance(env, dict) else None
    spec_sha = seal.get("spec_sha") if isinstance(seal, dict) else None
    if not isinstance(spec_sha, str) or not HEX64.match(spec_sha):
        return {"ok": False, "code": "E_SXC_SPEC"}
    if not SPEC_SHA_PATH.exists():
        return {"ok": False, "code": "E_SPEC_SHA_MISSING"}
    try:
        local = json.loads(SPEC_SHA_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"ok": False, "code": "E_SPEC_SHA_MALFORMED"}
    if not isinstance(local, dict) or not isinstance(local.get("spec_sha"), str) \
            or not HEX64.match(local["spec_sha"]):
        return {"ok": False, "code": "E_SPEC_SHA_MALFORMED"}
    return {"ok": True}
