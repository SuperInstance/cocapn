#!/usr/bin/env python3
"""Basic agent — simplest possible CocapnAgent vessel.

Usage:
    pip install cocapn
    export MOONSHOT_API_KEY=sk-xxx  # or any supported key
    python3 basic_agent.py
"""

from cocapn import CocapnAgent

# Create agent — auto-detects API key from environment
agent = CocapnAgent()

# Teach it some foundational knowledge
agent.teach(
    question="What is Cocapn?",
    answer="An agent framework where the repo IS the agent. Tiles capture knowledge, rooms train, the flywheel compounds.",
    confidence=0.95,
    room="meta"
)

agent.teach(
    question="What is a tile?",
    answer="Atomic knowledge unit: question + answer + domain + confidence. The fleet's fundamental unit of intelligence.",
    confidence=0.9,
    room="meta"
)

# Chat — each exchange is captured and reused next time
print("=== First chat ===")
response = agent.chat("What is Cocapn?")
print(f"Agent: {response}\n")

# Ask something new — the system will reason and capture
print("=== Second chat ===")
response = agent.chat("How do tiles work?")
print(f"Agent: {response}\n")

# The agent remembers past exchanges and injects them as context
print("=== Third chat (uses accumulated knowledge) ===")
response = agent.chat("Explain the whole system to me")
print(f"Agent: {response}\n")

# Check status
print(agent.status())

# Persist to disk
agent.save()
print("\nSaved. Knowledge persists across restarts.")
