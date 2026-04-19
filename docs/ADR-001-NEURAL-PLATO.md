# ADR-001: Neural Plato — Multi-Agent Coordination Framework

**Status**: Proposed  
**Date**: 2026-04-19  
**Authors**: Oracle1, Casey Digennaro  
**Supersedes**: None  

---

## Context

The Cocapn fleet needs a runtime that allows agents to perceive, reason, and act in shared environments using minimal compute resources. Our fleet runs on edge hardware (NVIDIA Jetson Orin 8GB, RTX 4050 6GB) with a $0.50/day budget.

We have accumulated:
- 2,300+ PLATO tiles across 14 rooms
- 379 ChatML training pairs
- 26 training room presets
- 38 Rust crates with 594+ tests
- A working PLATO room server, holodeck MUD, and tile specification

## Decision

**Neural Plato is a multi-agent coordination framework for edge devices using sub-7B parameter models.**

Not an OS. Not a monolithic model. A **framework** that:
1. Loads a small base model (Qwen2.5-7B-Q4 or smaller)
2. Hot-swaps LoRA adapters as "rooms" (~50MB each, <2s swap)
3. Uses PLATO tiles as retrieval-augmented context
4. Runs the forward pass AS the scheduler (no separate OS layer)
5. Deploys on any hardware that fits ~4GB of model + adapters

## Key Architecture Choices

### 1. Framework over OS
The "model IS the OS" is a powerful research concept. For developer adoption, "framework" wins. Developers understand frameworks. OS implies kernel drivers, hardware abstraction, and a level of complexity that slows adoption without adding value.

**Framework** means: import it, configure it, run agents. Copy-paste runnable in 5 minutes.

### 2. Sub-7B Models
Kimi K2.5's analysis confirmed: 3× 7B models on 8GB Jetson is fantasy. Our approach:
- **Base model**: Qwen2.5-7B-Q4 (3.5GB) OR smaller (Phi-2 2.8B, Mamba-1.4B)
- **Rooms**: LoRA adapters (~50MB each), 3 cached via LRU
- **Inference**: Weight sharing between agents on same device
- **Edge**: TensorRT/ONNX optimization for Jetson deployment

### 3. Tile-Based Context (Not Fine-Tuning for Everything)
Every interaction produces tiles. Tiles accumulate in rooms. Rooms distill into ensigns. This means:
- The base model stays GENERIC (no domain-specific fine-tuning)
- Domain expertise comes from tile retrieval + LoRA adapters
- Training data compounds automatically through the flywheel

### 4. Deadband-First Safety
The Deadband Protocol is not optional. Every agent decision passes through:
- **P0**: Map negative space (where NOT to go)
- **P1**: Find safe channels
- **P2**: Optimize within bounds

No P2 without P1. No P1 without P0. Always.

### 5. Git-Native Communication
Agents communicate via the Bottle Protocol — markdown files in git repos. No central message broker. No API dependency. Fork → write → push → pull → read.

## Memory Layout (RTX 4050, 6GB)

```
┌─────────────────────────────────────┐
│ Base Model (Qwen2.5-7B-Q4)  3.5GB  │
├─────────────────────────────────────┤
│ Kernel Adapter              100MB   │
├─────────────────────────────────────┤
│ Room Adapter 1 (cached)      50MB   │
│ Room Adapter 2 (cached)      50MB   │
│ Room Adapter 3 (cached)      50MB   │
├─────────────────────────────────────┤
│ Agent Adapter 1              50MB   │
│ Agent Adapter 2              50MB   │
├─────────────────────────────────────┤
│ KV Cache                    1.5GB   │
├─────────────────────────────────────┤
│ TOTAL                       ~5.5GB  │
│ Available on 4050           ~0.5GB  │
└─────────────────────────────────────┘
```

## What This Is NOT

- NOT a general-purpose OS
- NOT a replacement for CUDA/PyTorch
- NOT a chatbot framework
- NOT a fine-tuning service
- NOT competing with LangChain/CrewAI/AutoGen

## Success Metrics

| Metric | T+1 Month | T+3 Months | T+6 Months |
|--------|-----------|------------|------------|
| Agents in 1 room | 3 stable | — | — |
| Rooms active | 1 | 5 | 14 |
| External users | 0 | 1 PR merged | 5+ starred |
| Training pairs | 379 | 2,000+ | 10,000+ |
| Edge inference | Local only | Jetson boots | <200ms/agent |

## Consequences

**Positive:**
- Clear scope for developers
- Fits existing hardware
- Compounding training loop
- Git-native = zero infrastructure dependency

**Negative:**
- "Framework" may undersell the ambition to researchers
- Sub-7B limits complex reasoning
- Hot-swap latency may be noticeable in real-time scenarios
- No external users yet = unvalidated assumptions

**Risks:**
- If base model is too small, agents are useless → mitigated by tile retrieval augmenting context
- If LoRA adapters don't capture room knowledge → mitigated by keeping ensigns as JSON fallback
- If no one forks → mitigated by HN demo that's visual + copy-paste

## References

- [PLATO Tile Spec](https://github.com/cocapn/plato-tile-spec)
- [Deadband Protocol](docs/DEADBAND-PROTOCOL.md)
- [The Second Brain](docs/THE-SECOND-BRAIN.md)
- [Reverse-Actualization](docs/rabbit-trails/trail-44-reverse-actualization.md)
- [Training Casino](research/training-casino-stochastic-generator.md)

---

*"Intelligence is not built. It is inhabited."*
