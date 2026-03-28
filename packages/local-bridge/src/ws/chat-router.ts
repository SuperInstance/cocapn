/**
 * ChatRouter — parses incoming chat messages and selects the target agent.
 *
 * Two routing modes:
 *
 * 1. Explicit command prefix:
 *      /claude <content>    → route to "claude" agent
 *      /copilot <content>   → route to "copilot" agent
 *      /pi <content>        → route to "pi" agent
 *
 * 2. Implicit heuristic (when no prefix):
 *      Contains "deep", "analyze", "refactor", "explain", "debug",
 *      "review", "architect", "rewrite" → Claude Code (complex task)
 *      Everything else → Pi (fast / cheap)
 *
 * Config overrides are loaded from cocapn/config.json (if present) under
 * the key "routing.rules": [{ match: "...", agent: "..." }].
 *
 * Note: this class parses the message and returns an agent *name hint*.
 * The actual AgentRouter in agents/router.ts resolves the hint to a running
 * instance. If the named agent isn't registered, the AgentRouter falls back
 * to its default.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedMessage {
  /** Raw content with command prefix stripped */
  content: string;
  /**
   * Agent id hint, or undefined when the caller should use AgentRouter's
   * default routing (e.g. agentId was passed explicitly via the message).
   */
  agentId: string | undefined;
  /** Short display label for the UI badge (e.g. "Claude", "Pi", "Copilot") */
  badge: string;
}

export interface RoutingRule {
  match: string;
  agent: string;
}

// ─── ChatRouter ───────────────────────────────────────────────────────────────

export class ChatRouter {
  private rules: RoutingRule[];

  constructor(rules: RoutingRule[] = []) {
    this.rules = rules;
  }

  /**
   * Update routing rules (called when config changes at runtime).
   */
  setRules(rules: RoutingRule[]): void {
    this.rules = rules;
  }

  /**
   * Parse a raw message string and return the resolved agent + stripped content.
   */
  parse(raw: string): ParsedMessage {
    const trimmed = raw.trim();

    // ── 1. Explicit command prefix (/agent ...) ──────────────────────────────
    const prefixMatch = trimmed.match(/^\/([a-zA-Z0-9_-]+)\s*([\s\S]*)$/);
    if (prefixMatch) {
      const cmd     = prefixMatch[1]!.toLowerCase();
      const content = prefixMatch[2]?.trim() ?? "";
      const { agentId, badge } = resolveCommand(cmd);
      return { content: content || trimmed, agentId, badge };
    }

    // ── 2. Config-supplied rules (substring match) ───────────────────────────
    if (this.rules.length > 0) {
      const lower = trimmed.toLowerCase();
      for (const rule of this.rules) {
        if (lower.includes(rule.match.toLowerCase())) {
          return {
            content: trimmed,
            agentId: rule.agent,
            badge:   capitalize(rule.agent),
          };
        }
      }
    }

    // ── 3. Implicit heuristic ────────────────────────────────────────────────
    const agentId = inferAgent(trimmed);
    const badge   = agentId === "claude" ? "Claude" : agentId === "copilot" ? "Copilot" : "Pi";
    return { content: trimmed, agentId, badge };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Map command alias → agent id + badge */
function resolveCommand(cmd: string): { agentId: string; badge: string } {
  switch (cmd) {
    case "claude":
    case "cc":
    case "claude-code":
      return { agentId: "claude", badge: "Claude" };

    case "copilot":
    case "cp":
      return { agentId: "copilot", badge: "Copilot" };

    case "pi":
    case "perplexity":
      return { agentId: "pi", badge: "Pi" };

    default:
      // Unknown prefix — treat as the agent id itself
      return { agentId: cmd, badge: capitalize(cmd) };
  }
}

const COMPLEX_KEYWORDS = new Set([
  "deep", "analyze", "analyse", "refactor", "rewrite", "review",
  "explain", "debug", "architect", "design", "implement", "compare",
  "summarize", "summarise", "trace", "profile",
]);

/**
 * Heuristic: if the message contains any complex-task keyword, route to Claude.
 * Everything else goes to Pi (fast / cheap).
 */
function inferAgent(content: string): string {
  const words = content.toLowerCase().split(/\W+/);
  for (const word of words) {
    if (COMPLEX_KEYWORDS.has(word)) return "claude";
  }
  return "pi";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
