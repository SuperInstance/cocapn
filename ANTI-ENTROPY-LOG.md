# ANTI-ENTROPY LOG — cocapn

Append-only. Every directory/type/layout fault found in this repo is recorded
here when found and again when fixed. Faults are never silently repaired:
the log IS the repair receipt. (Wave-69 standing rule: anti-entropy logging.)

## F1 — committed build artifacts (found wave-69)

- Fault: `build/` (6 files) and `cocapn.egg-info/` (6 files) — Python build
  outputs — were tracked in git. Build output in version control is a
  directory type fault: it rots, it shadows source during grep, it can
  diverge from the source that produced it.
- Fix: `git rm -r --cached build cocapn.egg-info`, `.gitignore` gains
  `build/` and `*.egg-info/`. History preserved (no rewrite); the files
  leave the tree forward-only.

## F2 — CI failure mask (found wave-69)

- Fault: `.github/workflows/ci.yml` ran `pytest || true` — CI could never
  go red. A fleet that "cannot go red" is a fleet that cannot self-defend.
- Fix: mask removed; CI runs the spec gate, then bare `pytest`. Also
  widened to all branches + pull_request, dropped the duplicate
  ci-python.yml matrix down to one honest workflow.

## F3 — no specification-first layout (found wave-69)

- Fault: no spec/, no pre-registered invariants; code and tests existed
  without a sealed contract to violate.
- Fix: `spec/SPEC.md` (sxc1 mirror contracts) pre-registered and sealed
  (`spec/spec_sha.json`); `tools/spec_gate.py` wired as the first CI step —
  refuse compilation entirely when the spec is missing or tampered.
