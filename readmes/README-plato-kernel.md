<div align="center">

# ⚙️ PLATO Kernel

**Dual-state engine for deterministic + generative inference.**

[![Rust](https://img.shields.io/badge/rust-1.70+-orange)](https://rust-lang.org)
[![Tests](https://img.shields.io/badge/tests-37_passing-green)](tests/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

*Part of [Cocapn](https://github.com/cocapn) — Agent Infrastructure for Intelligence.*

</div>

---

## What is PLATO Kernel?

The core state engine that powers PLATO room inference. It maintains **two parallel state tracks**:

1. **Deterministic State** — rules, constraints, deadband boundaries. Always correct, never creative.
2. **Generative State** — model outputs, creative exploration, room sentiment. Flexible, sometimes wrong.

The `StateBridge` trait synchronizes both tracks, using **Jaccard coherence** to detect when generative output drifts from safe channels.

```rust
pub trait StateBridge {
    fn deterministic_state(&self) -> &DeterministicState;
    fn generative_state(&self) -> &GenerativeState;
    fn coherence(&self) -> f32; // Jaccard similarity between states
    fn synchronize(&mut self) -> Result<(), DriftError>;
}
```

## Why Dual-State?

Pure determinism can't handle the messy real world. Pure generation can't guarantee safety. The bridge between them IS the intelligence.

- **Deterministic**: Tile validation, deadband P0 checks, confidence scoring
- **Generative**: Room sentiment, creative exploration, knowledge synthesis
- **Bridge**: Coherence detection ensures generation stays within safe channels

## For Agents

```yaml
plato_kernel_v1:
  type: dual_state_engine
  traits: [StateBridge]
  coherence_metric: jaccard
  deterministic: "rules, constraints, deadband"
  generative: "model output, sentiment, synthesis"
```

## License

MIT
