<div align="center">

# ⚡ flux Runtime

**Deterministic bytecode runtime for agentic logic.**

[![Python](https://img.shields.io/badge/python-3.10+-blue)](https://python.org)
[![ISA](https://img.shields.io/badge/ISA-v2.1-7c3aed)](src/flux/bytecode/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

*Part of [Cocapn](https://github.com/cocapn) — Agent Infrastructure for Intelligence.*

</div>

---

## What is flux?

A secure, deterministic bytecode ISA and virtual machine for executing agentic logic. Think of it as the "engine room" — a programmable runtime where agent behaviors are compiled to bytecode, assembled, and executed safely.

```python
from flux.pipeline.e2e import compile_and_run

result = compile_and_run("""
    LOAD r0, 42
    LOAD r1, 8
    ADD r0, r0, r1
    EMIT r0
""")
# result: 50
```

## ISA v2.1 — 16 Opcodes

| Opcode | Operation | Description |
|--------|-----------|-------------|
| `LOAD` | `rD, imm` | Load immediate value |
| `ADD` | `rD, rA, rB` | Add registers |
| `SUB` | `rD, rA, rB` | Subtract registers |
| `MUL` | `rD, rA, rB` | Multiply registers |
| `JMP` | `addr` | Unconditional jump |
| `JZ` | `rA, addr` | Jump if zero |
| `JNZ` | `rA, addr` | Jump if not zero |
| `CMP` | `rA, rB` | Compare registers |
| `EMIT` | `rA` | Output value |
| `HALT` | — | Stop execution |
| `CALL` | `addr` | Call subroutine |
| `RET` | — | Return from subroutine |
| `PUSH` | `rA` | Push to stack |
| `POP` | `rD` | Pop from stack |
| `AND` | `rD, rA, rB` | Bitwise AND |
| `OR` | `rD, rA, rB` | Bitwise OR |

## Pipeline

```
Source Code → Frontend → FIR → Bytecode → VM Execution
                │          │       │          │
             (C/Python)  (IR)  (Encoder)  (Interpreter)
```

## Implementations

- **flux-runtime** (Python) — Full pipeline with compiler, assembler, debugger
- **flux-runtime-c** (C) — Native implementation for edge deployment
- **flux-os** (C) — Pure C OS with flux as the native runtime

## For Agents

```yaml
flux_runtime_v2:
  type: deterministic_agent_vm
  isa_version: "2.1"
  opcodes: 16
  pipeline: [frontend, fir_builder, bytecode_encoder, vm_interpreter]
  implementations: [python, c]
```

## License

MIT
