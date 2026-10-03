"""cocapn.sxc1.envelope — the sxc1 envelope reader/verifier.

Python-side mirror of the exoj gan/envelope.mjs dialect. Byte-compatible:
same id formula, same canonical JSON, same fail-closed check order.

Dialect (fixed):
    envelope = {"v": "sxc1", "seq": <positive int>,
                "cell": {"id": str, "kind": "generator"|"validator",
                         "repo": str, "topology": str},
                "body": <object>,
                "seal": {"spec_sha": <64 hex>, "die_seed": <64 hex, optional>,
                         "prev": <64 hex>, "id": <64 hex>}}

    id = sha256("sxc1:" + str(seq) + ":" + prev + ":"
                + canonical_json({"cell": cell, "body": body,
                                  "seal": seal_without_id})).hexdigest()

    genesis prev = "0" * 64

verify_envelope() is fail-closed IN THIS FIXED ORDER with NAMED codes:
    (1) structure: top-level keys exactly {v, seq, cell, body, seal}, v ==
        "sxc1", cell keys exactly {id, kind, repo, topology} with string
        values, kind in {generator, validator}, body/seal objects, and no
        float anywhere in cell/body/seal  -> E_SXC_FIELD
        (cell, body and seal are all sealed positions — the id covers them —
        and floats would break cross-language byte-compatibility);
    (2) seq: positive int (bool is NOT an int for this purpose) and equal to
        expected_seq when given                                     -> E_SXC_SEQ
    (3) prev: well-formed 64-hex string (the dialect requires it even when
        no expectation is supplied) and equal to expected_prev when given
                                                                    -> E_SXC_PREV
    (4) recomputed id mismatch (or missing/unstringable seal.id)   -> E_SXC_HASH
    (5) spec_sha missing or not 64-hex                             -> E_SXC_SPEC

die_seed is hash-covered but not independently shape-checked at verify time;
the emit side (seal_envelope) only ever writes 64-hex die_seed values.

Return shapes: {"ok": True, "id": ...} on acceptance, else
{"ok": False, "code": <named code>, "at": <seq as found, else None>}.
verify_envelope NEVER mutates its input (C1: no silent mutation at intake).
"""
import hashlib
import re

from .canonical import assert_no_floats, canonical_json

__all__ = ["GENESIS_PREV", "HEX64", "verify_envelope", "seal_envelope", "envelope_id"]

GENESIS_PREV = "0" * 64
HEX64 = re.compile(r"^[0-9a-f]{64}$")
TOP_LEVEL_KEYS = {"v", "seq", "cell", "body", "seal"}
CELL_KEYS = {"id", "kind", "repo", "topology"}
CELL_KINDS = ("generator", "validator")


def envelope_id(seq, prev, cell, body, seal_without_id) -> str:
    """Recompute the sxc1 envelope id from its sealed material."""
    material = (
        "sxc1:" + str(seq) + ":" + str(prev) + ":"
        + canonical_json({"cell": cell, "body": body, "seal": seal_without_id})
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def verify_envelope(env, expected_seq=None, expected_prev=None) -> dict:
    """Verify an sxc1 envelope fail-closed in the fixed order above."""
    at = env.get("seq") if isinstance(env, dict) else None

    def refuse(code: str) -> dict:
        return {"ok": False, "code": code, "at": at}

    # (1) structure / vocabulary / sealed-position floats -> E_SXC_FIELD
    if not isinstance(env, dict):
        return refuse("E_SXC_FIELD")
    if set(env.keys()) != TOP_LEVEL_KEYS:
        return refuse("E_SXC_FIELD")
    if env.get("v") != "sxc1":
        return refuse("E_SXC_FIELD")
    cell, body, seal = env.get("cell"), env.get("body"), env.get("seal")
    if not isinstance(cell, dict) or set(cell.keys()) != CELL_KEYS:
        return refuse("E_SXC_FIELD")
    if not all(isinstance(cell[k], str) and cell[k] for k in ("id", "repo", "topology")):
        return refuse("E_SXC_FIELD")
    if cell.get("kind") not in CELL_KINDS:
        return refuse("E_SXC_FIELD")
    if not isinstance(body, dict) or not isinstance(seal, dict):
        return refuse("E_SXC_FIELD")
    try:
        assert_no_floats(cell)
        assert_no_floats(body)
        assert_no_floats(seal)
    except ValueError:
        return refuse("E_SXC_FIELD")

    # (2) seq -> E_SXC_SEQ
    seq = env.get("seq")
    if not isinstance(seq, int) or isinstance(seq, bool) or seq <= 0:
        return refuse("E_SXC_SEQ")
    if expected_seq is not None and seq != expected_seq:
        return refuse("E_SXC_SEQ")

    # (3) prev -> E_SXC_PREV
    prev = seal.get("prev")
    if not isinstance(prev, str) or not HEX64.match(prev):
        return refuse("E_SXC_PREV")
    if expected_prev is not None and prev != expected_prev:
        return refuse("E_SXC_PREV")

    # (4) id -> E_SXC_HASH
    seal_without_id = {k: v for k, v in seal.items() if k != "id"}
    recomputed = envelope_id(seq, prev, cell, body, seal_without_id)
    stored_id = seal.get("id")
    if not isinstance(stored_id, str) or stored_id != recomputed:
        return refuse("E_SXC_HASH")

    # (5) spec_sha -> E_SXC_SPEC
    spec_sha = seal.get("spec_sha")
    if not isinstance(spec_sha, str) or not HEX64.match(spec_sha):
        return refuse("E_SXC_SPEC")

    return {"ok": True, "id": stored_id}


def seal_envelope(seq, prev, cell, body, spec_sha, die_seed=None) -> dict:
    """Emit side: build a correctly sealed sxc1 envelope (C1 — never emit garbage).

    Raises ValueError with the named code on any malformed input, so tests
    and the CLI can generate fixtures without importing the JS lane.
    """
    if not isinstance(seq, int) or isinstance(seq, bool) or seq <= 0:
        raise ValueError("E_SXC_SEQ: seq must be a positive int (bool is not an int here)")
    if not isinstance(prev, str) or not HEX64.match(prev):
        raise ValueError("E_SXC_PREV: prev must be a 64-hex chain link")
    if not isinstance(cell, dict) or set(cell.keys()) != CELL_KEYS:
        raise ValueError("E_SXC_FIELD: cell keys must be exactly id/kind/repo/topology")
    if not all(isinstance(cell[k], str) and cell[k] for k in ("id", "repo", "topology")):
        raise ValueError("E_SXC_FIELD: cell id/repo/topology must be non-empty strings")
    if cell.get("kind") not in CELL_KINDS:
        raise ValueError("E_SXC_FIELD: cell.kind must be generator|validator")
    if not isinstance(body, dict):
        raise ValueError("E_SXC_FIELD: body must be an object")
    try:
        assert_no_floats(cell)
        assert_no_floats(body)
    except ValueError as exc:
        raise ValueError(str(exc)) from None
    if not isinstance(spec_sha, str) or not HEX64.match(spec_sha):
        raise ValueError("E_SXC_SPEC: spec_sha must be a 64-hex spec seal")
    if die_seed is not None and (not isinstance(die_seed, str) or not HEX64.match(die_seed)):
        raise ValueError("E_SXC_SPEC: die_seed must be a 64-hex value when present")

    seal = {"spec_sha": spec_sha, "prev": prev}
    if die_seed is not None:
        seal["die_seed"] = die_seed
    seal["id"] = envelope_id(seq, prev, cell, body, seal)
    return {"v": "sxc1", "seq": seq, "cell": cell, "body": body, "seal": seal}
