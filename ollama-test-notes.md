# Ollama Local LLM Test Results — Jetson Orin Nano 8GB

## Models Tested

### deepseek-r1:1.5b ✅ WORKS (slow)
- **Size**: 1.1GB
- **Response time**: 32-204 seconds per query
- **Quality**: Poor for personality tasks. Confused identity (said "I'm Casey" instead of being Cody). Hallucinated details.
- **Streaming**: Works but slow (47-601s for joke)
- **Memory recall**: Failed — didn't recall facts from system prompt
- **Verdict**: Too small for soul/personality injection. Works for basic Q&A only.
- **Note**: Jetson memory pressure — 8GB shared CPU/GPU, other processes running

### qwen3.5:2b ❌ OOM
- **Size**: 2.7GB
- **Error**: fetch failed (likely OOM loading model)
- **Verdict**: Too large for Jetson with other processes

### nemotron-3-nano:4b ❌ OOM  
- **Size**: 2.8GB
- **Error**: fetch failed (OOM)
- **Verdict**: Too large for Jetson with other processes

## Key Findings

1. **1.5B models lack personality depth** — soul prompts don't stick well
2. **Jetson 8GB is tight** — only smallest models fit alongside other processes
3. **Latency is high** — 30-200s per query makes interactive use painful
4. **Good for**: Batch processing, background tasks, offline fallback
5. **Bad for**: Real-time chat, personality-heavy interactions

## Recommendations

1. **Default to DeepSeek API** for production (instant, high quality)
2. **Ollama as fallback** for air-gapped/enterprise deployments
3. **Need 7B+ model** for personality quality (requires 16GB+ RAM)
4. **Docker sandbox** should support both modes: API-primary with Ollama fallback
5. **For Jetson specifically**: Consider quantized 3B models or dedicated inference container

## cocapn local-llm provider already supports Ollama
The existing `packages/local-bridge/src/llm/local/provider.ts` handles Ollama integration.
