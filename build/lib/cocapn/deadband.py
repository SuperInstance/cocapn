"""Deadband Protocol — the lighthouse tells you where NOT to go."""

import re


class DeadbandCheck:
    def __init__(self, passed: bool, violations: list, safe_channel: str = None):
        self.passed = passed
        self.violations = violations
        self.safe_channel = safe_channel


class Deadband:
    """P0: block danger. P1: find safe channel. P2: optimize within channel."""
    
    DANGEROUS = [
        r"rm\s+-rf", r"DROP\s+TABLE", r"DELETE\s+FROM",
        r"chmod\s+777", r"eval\s*\(", r"sudo\s+rm",
        r"__import__\(", r"os\.system\(", r"subprocess\.call\(",
        r">\s*/dev/sda", r"mkfs\.", r"dd\s+if=",
    ]
    
    SAFE_CHANNELS = {
        "math": 0.9, "search": 0.85, "analysis": 0.85,
        "safety": 0.95, "code": 0.7, "explain": 0.8,
        "navigate": 0.8, "general": 0.6,
    }
    
    def check(self, text: str) -> DeadbandCheck:
        """P0: scan for dangerous patterns."""
        violations = []
        for pattern in self.DANGEROUS:
            if re.search(pattern, text, re.IGNORECASE):
                violations.append(pattern)
        
        if violations:
            return DeadbandCheck(passed=False, violations=violations)
        
        # P1: identify safe channel
        text_lower = text.lower()
        channel = "general"
        best_score = 0
        for ch, score in self.SAFE_CHANNELS.items():
            if ch in text_lower and score > best_score:
                best_score = score
                channel = ch
        
        return DeadbandCheck(passed=True, violations=[], safe_channel=channel)
    
    def filter_response(self, response: str) -> str:
        """Remove any dangerous content from model output."""
        for pattern in self.DANGEROUS:
            response = re.sub(pattern, "[BLOCKED_BY_DEADBAND]", response, flags=re.IGNORECASE)
        return response
