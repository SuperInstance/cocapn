# ADR-002: Proposal: bind the governing spec into sxc1 envelope ids

**Status**: Proposed  
**Date**: 2026-11-02  

---

## Context

sxc1 envelope ids currently derive from seq, prev and the canonical body. The governing algorithm's identity (spec id, hash, version) is not bound into the entry — a known gap (LANE-C #3). An entry therefore cannot be verified against the exact spec version that governed it.

## Proposal

Extend the sxc1 id derivation to include the spec seal, so an entry is verifiable against the exact spec version that governed it.

## Status

Proposed (from the cybernetic-architecture design record, 2026-11-02). No code change in this document.
