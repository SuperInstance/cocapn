"""CocapnAgent — an intelligence that improves every exchange.

The agent is the brain. Cocapn is the shell that makes it smarter.
Every exchange: the system captures what worked, injects it next time,
and the agent produces better gold. The flywheel compounds.
"""

import json
import os
import urllib.request
import yaml
from typing import Optional
from .deadband import Deadband
from .flywheel import Flywheel


SYSTEM_PROMPT = """You are an intelligent agent. You learn from every exchange.

Behind you, a system captures your best answers and feeds them back as context
when relevant questions come up. You don't need to manage this — just be your
best self. If you see "Relevant knowledge from previous exchanges" below, USE IT.
That's your own past wisdom coming back to help.

Be concise. Have opinions. Be genuinely helpful."""


class CocapnAgent:
    """
    An agent that gets smarter with every exchange.
    
    The agent reasons. The system remembers. The flywheel compounds.
    """
    
    def __init__(self, api_key: str = None, model: str = None,
                 base_url: str = None, data_dir: str = "data",
                 config_path: str = None):
        
        # Load config if available
        cfg = self._load_config(config_path)
        
        self.api_key = (
            api_key
            or os.environ.get("MOONSHOT_API_KEY", "")
            or os.environ.get("DEEPSEEK_API_KEY", "")
            or os.environ.get("GROQ_API_KEY", "")
            or cfg.get("agent", {}).get("api_key", "")
        )
        self.model = model or cfg.get("agent", {}).get("model", "kimi-k2.5")
        self.base_url = (
            base_url
            or cfg.get("agent", {}).get("base_url", "https://api.moonshot.ai/v1")
        )
        
        self.deadband = Deadband()
        self.flywheel = Flywheel(data_dir=data_dir)
        self.conversation: list[dict] = []
        self.system_prompt = SYSTEM_PROMPT
        self._exchange_count = 0
        self.name = cfg.get("agent", {}).get("name", "cocapn")
    
    def _load_config(self, path: str = None) -> dict:
        if path and os.path.exists(path):
            with open(path) as f:
                return yaml.safe_load(f) or {}
        # Try config.yaml in current dir
        for p in ["config.yaml", "cocapn/config.yaml"]:
            if os.path.exists(p):
                with open(p) as f:
                    return yaml.safe_load(f) or {}
        return {}
    
    def _build_messages(self, user_input: str) -> list[dict]:
        messages = [{"role": "system", "content": self.system_prompt}]
        
        # The system injects the agent's own past wisdom
        context = self.flywheel.get_context(user_input, limit=8)
        if context:
            messages.append({"role": "system", "content": context})
        
        # Recent conversation
        messages.extend(self.conversation[-20:])
        messages.append({"role": "user", "content": user_input})
        return messages
    
    def _call_api(self, messages: list[dict]) -> tuple[str, str]:
        body = json.dumps({
            "model": self.model,
            "messages": messages,
            "temperature": 1.0,
            "max_tokens": 4000,
        }).encode()
        
        req = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=body,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            }
        )
        
        resp = urllib.request.urlopen(req, timeout=180)
        data = json.loads(resp.read())
        msg = data["choices"][0]["message"]
        return msg.get("content", ""), msg.get("reasoning_content", "")
    
    def chat(self, user_input: str, room: str = "general") -> str:
        """
        Talk to the agent. The system captures the exchange.
        Next time, the agent remembers. The flywheel compounds.
        """
        # Deadband gates
        check = self.deadband.check(user_input)
        if not check.passed:
            return f"[DEADBAND] Unsafe input blocked: {check.violations}"
        
        # Build context (the system's job — inject past wisdom)
        messages = self._build_messages(user_input)
        
        # The agent reasons
        content, reasoning = self._call_api(messages)
        response = content if content else reasoning
        response = self.deadband.filter_response(response)
        
        # Record conversation
        self.conversation.append({"role": "user", "content": user_input})
        self.conversation.append({"role": "assistant", "content": response})
        
        # The system captures the gold
        self._exchange_count += 1
        confidence = 0.5 + 0.05 * min(self._exchange_count / 10, 0.4)
        self.flywheel.record_exchange(
            question=user_input,
            answer=response[:600],
            room=room,
            confidence=confidence,
            tags=[check.safe_channel],
        )
        
        return response
    
    def teach(self, question: str, answer: str, room: str = "general",
              confidence: float = 0.9):
        """Inject knowledge directly. High-confidence tile."""
        self.flywheel.record_exchange(
            question=question, answer=answer,
            room=room, confidence=confidence, tags=["taught"]
        )
        return f"Learned. {self.flywheel.store.count} tiles total."
    
    def status(self) -> str:
        stats = self.flywheel.stats()
        lines = [
            f"🧠 {self.name}",
            f"   Exchanges: {self._exchange_count}",
            f"   Tiles: {stats['total_tiles']}",
        ]
        for name, rs in stats["rooms"].items():
            lines.append(f"   {name}: {rs['tiles']} tiles, sentiment {rs['sentiment']}")
        return "\n".join(lines)
    
    def save(self):
        self.flywheel.save()
