"""cocapn.sxc1 — the fleet's sxc1 VALIDATOR MIRROR (wave-69).

Python side of the cell-exchange dialect; byte-compatible with the exoj
JS implementation (same canonical JSON, same id formula, same fail-closed
named codes, same check order). See spec/SPEC.md (pre-registered contract).
"""
from .canonical import assert_no_floats, canonical_json
from .envelope import GENESIS_PREV, seal_envelope, verify_envelope
from .gate import check_spec_seal
from .verdict import VERDICT_VOCABULARY, make_verdict

__all__ = [
    "GENESIS_PREV",
    "VERDICT_VOCABULARY",
    "assert_no_floats",
    "canonical_json",
    "check_spec_seal",
    "make_verdict",
    "seal_envelope",
    "verify_envelope",
]
