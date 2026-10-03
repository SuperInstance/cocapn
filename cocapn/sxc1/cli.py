"""cocapn.sxc1.cli — the sxc1 mirror CLI (SPEC §2, §4).

    python3 -m cocapn.sxc1 ingest <file>
        Read an sxc1 envelope JSON file, verify it fail-closed (then mirror-
        gate its spec seal). Success prints "COMPILED <id>"; refusal prints
        "INDETERMINATE <code> at=<seq>" on stderr and exits 1 (C2: refusals
        are named and localized; C1: nothing invalid is answered COMPILED).

    python3 -m cocapn.sxc1 verdict <file> --verdict COMPILED|INDETERMINATE --codes C1,C2
        Verify the target envelope, then seal and write a verdict envelope
        (kind validator, repo cocapn, cocapn's own spec_sha) to
        for-fleet/sxc1/<target-id-first-16>.verdict.json. The verdict chains
        onto the target: seq = target.seq + 1, prev = target seal id. If the
        target fails verification the command refuses, writes nothing, and
        exits 1.

Exit codes: 0 accepted/sealed, 1 refused. All refusals carry the named code.
"""
import argparse
import json
import sys
from pathlib import Path

from .envelope import verify_envelope
from .gate import SPEC_SHA_PATH, check_spec_seal
from .verdict import make_verdict

__all__ = ["main"]


def _refuse(code: str, at, note: str = "") -> int:
    detail = f" ({note})" if note else ""
    print(f"INDETERMINATE {code} at={at}{detail}", file=sys.stderr)
    return 1


def _load_envelope(path: str):
    """Read + parse an envelope file. Returns (env, error_code)."""
    try:
        raw = Path(path).read_text(encoding="utf-8")
    except OSError as exc:
        return None, f"unreadable: {exc}"
    try:
        return json.loads(raw), None
    except ValueError as exc:
        return None, f"unparseable JSON: {exc}"


def _intake(env) -> dict:
    """Full mirror intake: envelope verify, then the spec_sha mirror gate.

    Returns the verify result on acceptance (with the envelope attached),
    else a refusal dict {"ok": False, "code": ..., "at": ...}.
    """
    result = verify_envelope(env)
    if not result.get("ok"):
        return result
    gate = check_spec_seal(env)
    if not gate.get("ok"):
        return {"ok": False, "code": gate["code"], "at": env.get("seq") if isinstance(env, dict) else None}
    result["env"] = env
    return result


def cmd_ingest(args) -> int:
    env, load_err = _load_envelope(args.file)
    if env is None:
        return _refuse("E_SXC_FIELD", None, load_err)
    result = _intake(env)
    if not result.get("ok"):
        return _refuse(result["code"], result.get("at"))
    print(f"COMPILED {result['id']}")
    return 0


def _cocapn_spec_sha():
    """cocapn's own spec_sha (C3: verdicts carry it). Returns (sha, error_code)."""
    try:
        local = json.loads(SPEC_SHA_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None, "E_SPEC_SHA_MISSING"
    spec_sha = local.get("spec_sha") if isinstance(local, dict) else None
    if not isinstance(spec_sha, str) or not spec_sha:
        return None, "E_SPEC_SHA_MISSING"
    return spec_sha, None


def cmd_verdict(args) -> int:
    env, load_err = _load_envelope(args.file)
    if env is None:
        return _refuse("E_SXC_FIELD", None, load_err)
    result = _intake(env)
    if not result.get("ok"):
        return _refuse(result["code"], result.get("at"))
    target = result["env"]
    spec_sha, spec_err = _cocapn_spec_sha()
    if spec_sha is None:
        return _refuse(spec_err, target.get("seq"), "cocapn's own spec seal unavailable")
    codes = [c for c in (args.codes.split(",") if args.codes else []) if c]
    try:
        verdict_env = make_verdict(
            seq=target["seq"] + 1,
            prev=target["seal"]["id"],
            target_env=target,
            verdict=args.verdict,
            codes=codes,
            spec_sha=spec_sha,
        )
    except ValueError as exc:
        return _refuse(str(exc).split(":")[0], target.get("seq"), str(exc))
    out_dir = Path("for-fleet") / "sxc1"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{target['seal']['id'][:16]}.verdict.json"
    out_path.write_text(
        json.dumps(verdict_env, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"TARGET COMPILED {result['id']}")
    print(f"SEALED {verdict_env['seal']['id']} {out_path}")
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        prog="python3 -m cocapn.sxc1",
        description="cocapn sxc1 validator mirror — ingest fleet envelopes, emit sealed verdicts",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_ingest = sub.add_parser("ingest", help="verify an sxc1 envelope file (fail-closed)")
    p_ingest.add_argument("file", help="path to an sxc1 envelope JSON file")
    p_ingest.set_defaults(func=cmd_ingest)

    p_verdict = sub.add_parser("verdict", help="verify a target envelope, seal a verdict envelope")
    p_verdict.add_argument("file", help="path to the target sxc1 envelope JSON file")
    p_verdict.add_argument(
        "--verdict", required=True,
        help="verdict word: COMPILED or INDETERMINATE (fail-closed vocabulary)",
    )
    p_verdict.add_argument(
        "--codes", default="",
        help="comma-separated named codes carried in the verdict body",
    )
    p_verdict.set_defaults(func=cmd_verdict)

    args = parser.parse_args(argv)
    return args.func(args)
