"""Tests for cocapn.sxc1 — the fleet's sxc1 validator mirror (wave-69).

Covers: seal/verify round-trip, canonical JSON byte-form pin, the tamper
matrix, pinned order-of-checks, no-mutating intake, verdict vocabulary and
verdict round-trips, the spec_sha mirror gate, and the CLI (ingest/verdict).
The fixture of record is from-fleet/sxc1/fixture-genesis.json (a cocapn-sealed
generator-kind genesis envelope whose spec_sha is cocapn's own spec seal).
"""
import copy
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from cocapn.sxc1 import (
    GENESIS_PREV,
    VERDICT_VOCABULARY,
    assert_no_floats,
    canonical_json,
    check_spec_seal,
    make_verdict,
    seal_envelope,
    verify_envelope,
)
from cocapn.sxc1 import gate as sxc1_gate
from cocapn.sxc1.envelope import envelope_id


def reseal(env):
    """Recompute seal.id over the CURRENT material (simulates a re-sealed
    tampered envelope, so checks AFTER the id check can be reached)."""
    env["seal"].pop("id", None)
    env["seal"]["id"] = envelope_id(env["seq"], env["seal"]["prev"], env["cell"],
                                    env["body"], env["seal"])
    return env

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "from-fleet" / "sxc1" / "fixture-genesis.json"
SPEC_SHA = json.loads((ROOT / "spec" / "spec_sha.json").read_text())["spec_sha"]

CELL = {"id": "cell-01", "kind": "generator", "repo": "exoj",
        "topology": "fleet-cell-exchange"}


def make_env(seq=1, prev=GENESIS_PREV, cell=None, body=None, spec_sha=SPEC_SHA):
    return seal_envelope(seq, prev, cell or dict(CELL),
                         body if body is not None else {"wave": 69}, spec_sha)


@pytest.fixture()
def fixture_env():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


class TestCanonicalJson:
    def test_regression_pin_nested_object(self):
        """Pin the exact byte form: recursive key-sort, no whitespace, raw unicode."""
        obj = {"b": 1, "a": {"d": [1, 2, {"c": "x"}], "c": "é—"}}
        assert canonical_json(obj) == '{"a":{"c":"é—","d":[1,2,{"c":"x"}]},"b":1}'

    def test_separators_and_key_order(self):
        assert canonical_json({"z": 1, "a": 2}) == '{"a":2,"z":1}'
        assert canonical_json({}) == "{}"
        assert canonical_json([]) == "[]"

    def test_matches_dialect_formula_on_fixture(self, fixture_env):
        """The stored id must equal the sha256 of the dialect formula."""
        import hashlib
        seal_wo = {k: v for k, v in fixture_env["seal"].items() if k != "id"}
        material = ("sxc1:" + str(fixture_env["seq"]) + ":" + fixture_env["seal"]["prev"]
                    + ":" + canonical_json(
                        {"cell": fixture_env["cell"], "body": fixture_env["body"],
                         "seal": seal_wo}))
        assert hashlib.sha256(material.encode("utf-8")).hexdigest() \
            == fixture_env["seal"]["id"]


class TestNoFloats:
    def test_ints_and_bools_pass(self):
        assert_no_floats({"a": 1, "b": [True, False, -3], "c": {"d": 0}})

    def test_float_raises_named_code(self):
        with pytest.raises(ValueError, match="E_SXC_FIELD"):
            assert_no_floats({"a": [1, 2.5]})

    def test_nan_and_inf_raise(self):
        for bad in (float("nan"), float("inf")):
            with pytest.raises(ValueError, match="E_SXC_FIELD"):
                assert_no_floats({"x": bad})


class TestSealVerifyRoundTrip:
    def test_round_trip_ok(self):
        env = make_env()
        result = verify_envelope(env)
        assert result["ok"] is True
        assert result["id"] == env["seal"]["id"]
        assert len(result["id"]) == 64

    def test_fixture_is_valid_genesis(self, fixture_env):
        assert fixture_env["seq"] == 1
        assert fixture_env["seal"]["prev"] == GENESIS_PREV
        assert fixture_env["cell"]["kind"] == "generator"
        assert fixture_env["cell"]["repo"] == "exoj"
        assert verify_envelope(fixture_env)["ok"] is True
        assert check_spec_seal(fixture_env) == {"ok": True}

    def test_fixture_sealed_with_cocapn_own_spec(self, fixture_env):
        assert fixture_env["seal"]["spec_sha"] == SPEC_SHA

    def test_optional_die_seed_round_trips(self):
        die_seed = "ab" * 32
        env = seal_envelope(2, GENESIS_PREV, dict(CELL), {"wave": 69}, SPEC_SHA,
                            die_seed=die_seed)
        assert env["seal"]["die_seed"] == die_seed
        assert verify_envelope(env)["ok"] is True

    def test_omitted_die_seed_stays_absent(self):
        env = make_env()
        assert "die_seed" not in env["seal"]
        assert verify_envelope(env)["ok"] is True


class TestTamperMatrix:
    def test_body_value_flip_is_E_SXC_HASH(self, fixture_env):
        env = copy.deepcopy(fixture_env)
        env["body"]["wave"] = 70
        assert verify_envelope(env) == {"ok": False, "code": "E_SXC_HASH", "at": 1}

    def test_wrong_seq_is_E_SXC_SEQ(self):
        env = make_env(seq=5)
        assert verify_envelope(env, expected_seq=6)["code"] == "E_SXC_SEQ"

    def test_seq_zero_negative_bool_float(self):
        for bad in (0, -1, True, 3.0):
            env = make_env(seq=1)
            env["seq"] = bad
            assert verify_envelope(env)["code"] == "E_SXC_SEQ"

    def test_wrong_prev_is_E_SXC_PREV(self):
        env = make_env()
        assert verify_envelope(env, expected_prev="f" * 64)["code"] == "E_SXC_PREV"

    def test_garbage_prev_is_E_SXC_PREV_even_without_expectation(self):
        env = make_env()
        env["seal"]["prev"] = "not-hex"
        assert verify_envelope(env)["code"] == "E_SXC_PREV"

    def test_unknown_top_level_field_is_E_SXC_FIELD(self, fixture_env):
        env = copy.deepcopy(fixture_env)
        env["extra"] = "nope"
        assert verify_envelope(env)["code"] == "E_SXC_FIELD"

    def test_missing_top_level_field_is_E_SXC_FIELD(self, fixture_env):
        env = copy.deepcopy(fixture_env)
        del env["body"]
        assert verify_envelope(env)["code"] == "E_SXC_FIELD"

    def test_unknown_cell_field_is_E_SXC_FIELD(self, fixture_env):
        env = copy.deepcopy(fixture_env)
        env["cell"]["alias"] = "x"
        assert verify_envelope(env)["code"] == "E_SXC_FIELD"

    def test_bad_kind_is_E_SXC_FIELD(self, fixture_env):
        env = copy.deepcopy(fixture_env)  # emit side refuses bad kinds, so tamper post-seal
        env["cell"]["kind"] = "oracle"
        assert verify_envelope(env)["code"] == "E_SXC_FIELD"

    def test_wrong_v_is_E_SXC_FIELD(self, fixture_env):
        env = copy.deepcopy(fixture_env)
        env["v"] = "sxc2"
        assert verify_envelope(env)["code"] == "E_SXC_FIELD"

    def test_non_dict_body_is_E_SXC_FIELD(self, fixture_env):
        env = copy.deepcopy(fixture_env)
        env["body"] = [1, 2]
        assert verify_envelope(env)["code"] == "E_SXC_FIELD"

    def test_float_in_body_is_E_SXC_FIELD(self, fixture_env):
        env = copy.deepcopy(fixture_env)
        env["body"]["wave"] = 69.0
        assert verify_envelope(env)["code"] == "E_SXC_FIELD"

    def test_float_in_seal_is_E_SXC_FIELD(self, fixture_env):
        env = copy.deepcopy(fixture_env)
        env["seal"]["die_seed"] = 1.5
        assert verify_envelope(env)["code"] == "E_SXC_FIELD"

    def test_missing_id_is_E_SXC_HASH(self, fixture_env):
        env = copy.deepcopy(fixture_env)
        del env["seal"]["id"]
        assert verify_envelope(env)["code"] == "E_SXC_HASH"

    def test_spec_sha_xyz_is_E_SXC_SPEC(self, fixture_env):
        env = copy.deepcopy(fixture_env)
        env["seal"]["spec_sha"] = "xyz"
        reseal(env)  # naive tamper dies as E_SXC_HASH (order 4); re-seal to reach step 5
        assert verify_envelope(env)["code"] == "E_SXC_SPEC"

    def test_spec_sha_missing_is_E_SXC_SPEC(self, fixture_env):
        env = copy.deepcopy(fixture_env)
        del env["seal"]["spec_sha"]
        reseal(env)
        assert verify_envelope(env)["code"] == "E_SXC_SPEC"

    def test_naive_spec_sha_tamper_is_E_SXC_HASH(self, fixture_env):
        """A spec_sha flip without resealing is caught EARLIER, as E_SXC_HASH."""
        env = copy.deepcopy(fixture_env)
        env["seal"]["spec_sha"] = "xyz"
        assert verify_envelope(env)["code"] == "E_SXC_HASH"

    def test_non_dict_envelope_is_E_SXC_FIELD(self):
        assert verify_envelope([1, 2])["code"] == "E_SXC_FIELD"
        assert verify_envelope("sxc1")["code"] == "E_SXC_FIELD"


class TestOrderOfChecks:
    def test_field_before_seq(self, fixture_env):
        """Unknown top-level field AND bad seq -> E_SXC_FIELD is reported first."""
        env = copy.deepcopy(fixture_env)
        env["extra"] = "nope"
        env["seq"] = 0
        assert verify_envelope(env)["code"] == "E_SXC_FIELD"

    def test_seq_before_prev(self):
        """Bad seq AND bad prev -> E_SXC_SEQ is reported first."""
        env = make_env()
        env["seq"] = 0
        env["seal"]["prev"] = "zz"
        assert verify_envelope(env, expected_prev=GENESIS_PREV)["code"] == "E_SXC_SEQ"

    def test_prev_before_hash(self):
        """Bad prev AND tampered id -> E_SXC_PREV is reported first."""
        env = make_env()
        env["seal"]["prev"] = "f" * 64
        env["seal"]["id"] = "0" * 64
        assert verify_envelope(env, expected_prev=GENESIS_PREV)["code"] == "E_SXC_PREV"

    def test_hash_before_spec(self, fixture_env):
        """Tampered id AND malformed spec_sha -> E_SXC_HASH is reported first."""
        env = copy.deepcopy(fixture_env)
        env["body"]["wave"] = 70
        env["seal"]["spec_sha"] = "xyz"
        assert verify_envelope(env)["code"] == "E_SXC_HASH"


class TestNoMutatingIntake:
    def test_verify_never_mutates_input(self, fixture_env):
        before = copy.deepcopy(fixture_env)
        assert verify_envelope(fixture_env)["ok"] is True
        assert fixture_env == before

    def test_verify_never_mutates_refused_input(self, fixture_env):
        env = copy.deepcopy(fixture_env)
        env["body"]["wave"] = 70  # tampered -> refused
        before = copy.deepcopy(env)
        assert verify_envelope(env)["ok"] is False
        assert env == before


class TestVerdicts:
    def test_vocabulary_is_exact_pair(self):
        assert VERDICT_VOCABULARY == ("COMPILED", "INDETERMINATE")

    @pytest.mark.parametrize("bad", ["ACCEPTED", "REFUSED", "compiled", "", "COMPILED "])
    def test_vocabulary_enforcement(self, bad, fixture_env):
        with pytest.raises(ValueError, match="E_VERDICT_VOCABULARY"):
            make_verdict(2, fixture_env["seal"]["id"], fixture_env, bad, [], SPEC_SHA)

    def test_verdict_round_trip_verifies(self, fixture_env):
        verdict = make_verdict(2, fixture_env["seal"]["id"], fixture_env,
                               "COMPILED", ["WAVE69-MIRROR-OK"], SPEC_SHA)
        result = verify_envelope(verdict)
        assert result["ok"] is True
        assert result["id"] == verdict["seal"]["id"]

    def test_verdict_body_and_cell(self, fixture_env):
        verdict = make_verdict(2, fixture_env["seal"]["id"], fixture_env,
                               "INDETERMINATE", ["E_SXC_HASH"], SPEC_SHA)
        assert verdict["cell"]["kind"] == "validator"
        assert verdict["cell"]["repo"] == "cocapn"
        assert verdict["body"] == {"target": fixture_env["seal"]["id"],
                                   "verdict": "INDETERMINATE",
                                   "codes": ["E_SXC_HASH"]}
        assert verdict["seal"]["prev"] == fixture_env["seal"]["id"]

    def test_verdict_carries_cocapn_spec_sha(self, fixture_env):
        verdict = make_verdict(2, fixture_env["seal"]["id"], fixture_env,
                               "COMPILED", [], SPEC_SHA)
        assert verdict["seal"]["spec_sha"] == SPEC_SHA

    def test_verdict_refuses_float_codes(self, fixture_env):
        with pytest.raises(ValueError, match="E_SXC_FIELD"):
            make_verdict(2, fixture_env["seal"]["id"], fixture_env,
                         "COMPILED", [1.5], SPEC_SHA)

    def test_verdict_refuses_unsealed_target(self):
        with pytest.raises(ValueError, match="E_SXC_HASH"):
            make_verdict(2, GENESIS_PREV, {"v": "sxc1"}, "COMPILED", [], SPEC_SHA)


class TestMirrorGate:
    def test_gate_ok_on_fixture(self, fixture_env):
        assert check_spec_seal(fixture_env) == {"ok": True}

    def test_foreign_spec_sha_ok_when_wellformed(self, fixture_env):
        """Cross-repo rule: a DIFFERENT well-formed spec_sha still passes."""
        env = copy.deepcopy(fixture_env)
        foreign = seal_envelope(1, GENESIS_PREV, dict(CELL), {"wave": 69}, "ab" * 32)
        assert check_spec_seal(foreign) == {"ok": True}

    def test_malformed_seal_is_E_SXC_SPEC(self, fixture_env):
        env = copy.deepcopy(fixture_env)
        env["seal"]["spec_sha"] = "xyz"
        reseal(env)
        assert check_spec_seal(env) == {"ok": False, "code": "E_SXC_SPEC"}

    def test_missing_local_seal_is_E_SPEC_SHA_MISSING(self, fixture_env, monkeypatch, tmp_path):
        monkeypatch.setattr(sxc1_gate, "SPEC_SHA_PATH", tmp_path / "nope.json")
        assert check_spec_seal(fixture_env)["code"] == "E_SPEC_SHA_MISSING"

    def test_garbage_local_seal_is_E_SPEC_SHA_MALFORMED(self, fixture_env, monkeypatch, tmp_path):
        bad = tmp_path / "spec_sha.json"
        bad.write_text("not json at all", encoding="utf-8")
        monkeypatch.setattr(sxc1_gate, "SPEC_SHA_PATH", bad)
        assert check_spec_seal(fixture_env)["code"] == "E_SPEC_SHA_MALFORMED"


class TestCli:
    def run_cli(self, args, cwd):
        env = dict(os.environ)
        env["PYTHONPATH"] = str(ROOT) + os.pathsep + env.get("PYTHONPATH", "")
        return subprocess.run(
            [sys.executable, "-m", "cocapn.sxc1", *args],
            capture_output=True, text=True, cwd=str(cwd), env=env,
        )

    def test_ingest_fixture_exits_zero(self, tmp_path):
        proc = self.run_cli(["ingest", str(FIXTURE)], cwd=tmp_path)
        assert proc.returncode == 0, proc.stderr
        assert "COMPILED" in proc.stdout

    def test_ingest_tampered_exits_one_named_code_on_stderr(self, tmp_path):
        env = json.loads(FIXTURE.read_text())
        env["body"]["note"] = "tampered"
        bad = tmp_path / "tampered.json"
        bad.write_text(json.dumps(env), encoding="utf-8")
        proc = self.run_cli(["ingest", str(bad)], cwd=tmp_path)
        assert proc.returncode == 1
        assert "E_SXC_HASH" in proc.stderr

    def test_ingest_unparseable_refuses_named(self, tmp_path):
        bad = tmp_path / "broken.json"
        bad.write_text("{not json", encoding="utf-8")
        proc = self.run_cli(["ingest", str(bad)], cwd=tmp_path)
        assert proc.returncode == 1
        assert "E_SXC_FIELD" in proc.stderr

    def test_verdict_seals_into_for_fleet(self, tmp_path):
        proc = self.run_cli(
            ["verdict", str(FIXTURE), "--verdict", "COMPILED",
             "--codes", "WAVE69-MIRROR-OK,E2E"], cwd=tmp_path)
        assert proc.returncode == 0, proc.stderr
        target_id = json.loads(FIXTURE.read_text())["seal"]["id"]
        out = tmp_path / "for-fleet" / "sxc1" / f"{target_id[:16]}.verdict.json"
        assert out.exists()
        verdict_env = json.loads(out.read_text())
        assert verdict_env["body"]["codes"] == ["WAVE69-MIRROR-OK", "E2E"]
        assert verdict_env["body"]["verdict"] == "COMPILED"
        # the verdict envelope is itself verifiable (C3) — ingest it back
        back = self.run_cli(["ingest", str(out)], cwd=tmp_path)
        assert back.returncode == 0, back.stderr
        assert "COMPILED" in back.stdout

    def test_verdict_refuses_tampered_target_writes_nothing(self, tmp_path):
        env = json.loads(FIXTURE.read_text())
        env["body"]["wave"] = 70
        bad = tmp_path / "tampered.json"
        bad.write_text(json.dumps(env), encoding="utf-8")
        proc = self.run_cli(
            ["verdict", str(bad), "--verdict", "COMPILED", "--codes", ""], cwd=tmp_path)
        assert proc.returncode == 1
        assert "E_SXC_HASH" in proc.stderr
        assert not (tmp_path / "for-fleet").exists()

    def test_verdict_bad_word_refuses_named(self, tmp_path):
        proc = self.run_cli(
            ["verdict", str(FIXTURE), "--verdict", "ACCEPTED", "--codes", ""], cwd=tmp_path)
        assert proc.returncode == 1
        assert "E_VERDICT_VOCABULARY" in proc.stderr
