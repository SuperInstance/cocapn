# cocapn SPEC — Wave-69: multi-model cell-exchange contracts (sxc1 mirror)

Dialect: `cocapn-spec/w69` · Seal: `spec/spec_sha.json` · Gate: `tools/spec_gate.py`
Status: PRE-REGISTERED before implementation.

## 0. Role in the fleet

cocapn is the ensign: the fleet's duty-keeping agent with for-fleet/ and
from-fleet/ exchange directories. Wave-69 makes it the fleet's **validator
mirror**: every sxc1 cell-exchange envelope produced anywhere (exoj Track A,
quilt-dba Track B) can be received here, re-verified from first principles,
and answered with a verdict — or refused, loudly and named.

## 1. Cognitive heterogeneity (the fleet's two cell kinds)

- **generator cells** (e.g. exoj Cell 01): high-prefill, low-latency, concise
  payloads. cocapn does NOT try to regenerate their content — it checks the
  seal and the shape, in that order, and moves on. A generator's envelope is
  treated as a claim, never as evidence.
- **validator cells** (e.g. exoj Cell 02, cocapn itself): specification-first,
  meticulous. A validator re-derives every hash, re-reads the spec seal, and
  answers only in the verdict vocabulary (`COMPILED | INDETERMINATE`).
- Anti-homogenisation: a validator must never weaken a check to accept a
  generator's output; a generator must never embed its own verdict. The only
  channel between the kinds is the envelope and the verdict.

## 2. Module layout (structural contract)

- `cocapn/sxc1/envelope.py` — the sxc1 envelope reader/verifier:
  canonical JSON (sorted keys), id = sha256("sxc1:" + seq + ":" + prev + ":"
  + canonicalJSON), genesis prev = 64×"0"; fail-closed named codes.
- `cocapn/sxc1/gate.py` — the spec_sha mirror gate: refuses an envelope whose
  seal.spec_sha does not match THIS repo's sealed spec family (cross-repo
  seals are compared by presence + hex shape, not equality — repos may have
  different specs; what must match is that a seal EXISTS and is well-formed).
- `for-fleet/sxc1/` — outgoing verdicts (cocapn → fleet): verdict envelopes
  in the same sxc1 dialect, kind "validator".
- `from-fleet/sxc1/` — incoming envelopes (fleet → cocapn); a file dropped
  here is processed by `python3 -m cocapn.sxc1.cli ingest from-fleet/sxc1/<file>`.
- `tests/test_sxc1.py` — the verification battery.

## 3. Invariants

- **C1 Fail-closed intake** — unknown field ⇒ E_SXC_FIELD; seq gap/replay ⇒
  E_SXC_SEQ; prev mismatch ⇒ E_SXC_PREV; hash mismatch ⇒ E_SXC_HASH;
  missing/tampered spec seal ⇒ E_SXC_SPEC; nothing invalid is ever written
  to memory/JOURNAL.md or answered COMPILED.
- **C2 Verdict vocabulary** — the only accept verdict is `COMPILED`; every
  refusal is `INDETERMINATE` + named code + the at-seq localization.
- **C3 Verdict envelopes are sealed** — outgoing for-fleet verdicts carry
  cocapn's own spec_sha and chain prev; they are themselves verifiable.
- **C4 No silent muting** — CI runs pytest WITHOUT failure masks; the gate
  runs before tests in every workflow (specification-first).

## 4. State-exchange pathway

exoj (emit) → from-fleet/sxc1/ (intake) → envelope.verify() → verdict
(for-fleet/sxc1/) ; quilt-dba (persistent stitch) receives the same envelopes
and keeps the chain. cocapn never mutates another repo's state; it answers.

## 5. Fail-closed vocabulary

`E_SPEC_MISSING · E_SPEC_SHA_MISSING · E_SPEC_SHA_MALFORMED · E_SPEC_DIALECT ·
E_SPEC_TAMPERED · E_SXC_FIELD · E_SXC_SEQ · E_SXC_PREV · E_SXC_HASH ·
E_SXC_SPEC · E_VERDICT_UNSEALED`
