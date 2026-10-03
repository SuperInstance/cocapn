"""cocapn.sxc1.verdict — verdict envelopes (SPEC §1, invariants C2 + C3).

cocapn is a validator cell: it answers only in the verdict vocabulary
(COMPILED | INDETERMINATE). The verdict envelope is itself a normal sxc1
envelope — cell.kind="validator", cell.repo="cocapn" — sealed exactly like
any other envelope (C3), so it re-verifies through the same verify_envelope()
and chains onto the fleet with its own seq/prev.

body = {"target": <target seal id>, "verdict": <word>, "codes": [<str|int>…]}
Strings/ints only in codes — floats are banned sealed material (canonical.py).
"""
from .envelope import HEX64, seal_envelope

__all__ = ["VERDICT_VOCABULARY", "make_verdict"]

VERDICT_VOCABULARY = ("COMPILED", "INDETERMINATE")


def make_verdict(seq, prev, target_env, verdict, codes, spec_sha,
                 cell_id="cocapn", topology="fleet-cell-exchange") -> dict:
    """Build a sealed validator verdict envelope targeting `target_env`.

    Raises ValueError('E_VERDICT_VOCABULARY') for any word outside
    COMPILED|INDETERMINATE (exact case — the vocabulary is fail-closed),
    ValueError('E_SXC_HASH') when the target carries no sealed id (a verdict
    can only target a sealed envelope), and ValueError('E_SXC_FIELD') when
    codes are not strings/ints.
    """
    if verdict not in VERDICT_VOCABULARY:
        raise ValueError("E_VERDICT_VOCABULARY")
    seal = target_env.get("seal") if isinstance(target_env, dict) else None
    target_id = seal.get("id") if isinstance(seal, dict) else None
    if not isinstance(target_id, str) or not HEX64.match(target_id):
        raise ValueError("E_SXC_HASH: a verdict can only target a sealed envelope id")
    if not isinstance(codes, (list, tuple)) or any(
        isinstance(c, bool) or isinstance(c, float) or not isinstance(c, (str, int))
        for c in codes
    ):
        raise ValueError("E_SXC_FIELD: codes must be strings/ints only — no floats")
    body = {"target": target_id, "verdict": verdict, "codes": list(codes)}
    cell = {"id": cell_id, "kind": "validator", "repo": "cocapn", "topology": topology}
    return seal_envelope(seq, prev, cell, body, spec_sha)
