"""cocapn.sxc1.canonical — canonical JSON for sxc1 hashing.

Byte-compatible with the exoj core.mjs canonicalJSON (recursive key-sorted,
no whitespace): cocapn and exoj derive IDENTICAL sha256 ids from identical
envelopes. Non-ASCII characters are emitted raw (ensure_ascii=False), exactly
as JS JSON.stringify does.

Floats are FORBIDDEN in sealed material. JS (JSON.stringify) and Python
(json.dumps) format floats differently (1e21 -> "1e+21" in Python vs "1e21"
in JS; 0.1 reprs diverge across engines), so a float anywhere the seal covers
would make the cross-language dialect non-byte-compatible. The dialect bans
floats in sealed positions; `assert_no_floats` enforces it with the named
fail-closed code E_SXC_FIELD (SPEC.md §3 C1, §5).
"""
import json

__all__ = ["canonical_json", "assert_no_floats"]


def canonical_json(obj) -> str:
    """Serialize `obj` to the sxc1 canonical JSON string.

    Matches exoj core.mjs canonicalJSON: recursive key-sorting
    (json.dumps sort_keys applies at every nesting level), no whitespace
    (separators ',' and ':'), ensure_ascii=False (non-ASCII emitted raw).
    """
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def assert_no_floats(obj, _path: str = "$") -> None:
    """Walk `obj` and raise ValueError('E_SXC_FIELD ...') on any float.

    int passes; bool is an int subclass but not a float, so it passes too;
    any float (including NaN/Infinity produced by parsing JSON) is refused.
    `_path` localizes the offending field for the refusal message.
    """
    if isinstance(obj, float):
        raise ValueError(
            f"E_SXC_FIELD float at {_path} — floats are banned in sealed material "
            "(JS/Python float formatting diverges; the dialect would not be byte-compatible)"
        )
    if isinstance(obj, dict):
        for key, val in obj.items():
            assert_no_floats(val, f"{_path}.{key}")
    elif isinstance(obj, (list, tuple)):
        for idx, val in enumerate(obj):
            assert_no_floats(val, f"{_path}[{idx}]")
