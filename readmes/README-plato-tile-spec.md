<div align="center">

# 🧱 PLATO Tile Spec

**One tile format for the entire fleet.**

[![Rust](https://img.shields.io/badge/rust-1.70+-orange)](https://rust-lang.org)
[![Tests](https://img.shields.io/badge/tests-31_passing-green)](tests/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

*Part of [Cocapn](https://github.com/cocapn) — Agent Infrastructure for Intelligence.*

</div>

---

## What is a Tile?

A tile is the **atomic unit of knowledge** in the PLATO system. Every agent interaction, every insight, every learned pattern becomes a tile. Tiles flow through rooms, get distilled into ensigns, and compound into instincts.

```rust
pub struct Tile {
    pub id: Uuid,
    pub question: String,
    pub answer: String,
    pub domain: TileDomain,      // 14 domain types
    pub confidence: f32,
    pub source_agent: String,
    pub room: String,
    pub tags: Vec<String>,
    pub temporal_validity: TemporalValidity,
    pub created_at: DateTime<Utc>,
}
```

## 14 Tile Domains

| Domain | Description |
|--------|-------------|
| `Knowledge` | Factual knowledge tiles |
| `Procedural` | How-to and process tiles |
| `Diagnostic` | Problem-solving tiles |
| `Safety` | Safety-critical tiles (P0) |
| `NegativeSpace` | Where NOT to go (10x weight) |
| `Behavioral` | Behavioral pattern tiles |
| `Social` | Multi-agent interaction tiles |
| `Creative` | Generative and exploratory tiles |
| `MetaLearning` | Learning-how-to-learn tiles |
| `Navigation` | Wayfinding and routing tiles |
| `Temporal` | Time-aware pattern tiles |
| `Spatial` | Location-aware tiles |
| `Causal` | Cause-and-effect tiles |
| `Adaptive` | Self-modifying tiles |

## Temporal Validity

Tiles can have time-bounded relevance:

```rust
pub enum TemporalValidity {
    Permanent,
    ExpiresAt(DateTime<Utc>),
    DecayFunction { half_life: Duration },
    SessionScoped { session_id: String },
}
```

## Why a Unified Spec?

The fleet has 3 vessels (cloud, edge, GPU) running Rust, Python, C, and CUDA. One tile format means:
- Agents on any vessel can read any tile
- Training rooms on Oracle1 produce tiles JC1 can use on Jetson
- The holodeck MUD generates tiles the ensign pipeline can distill

## For Agents

```yaml
plato_tile_spec_v2:
  type: unified_knowledge_format
  domains: 14
  fields: [id, question, answer, domain, confidence, source_agent, room, tags, temporal_validity]
  negative_space_weight: 10x
  format: JSON (serde) / protobuf (planned)
```

## License

MIT
