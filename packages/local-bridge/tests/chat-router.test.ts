import { describe, it, expect } from "vitest";
import { ChatRouter } from "../src/ws/chat-router.js";
import type { RoutingRule } from "../src/ws/chat-router.js";

describe("ChatRouter.parse", () => {
  it("routes /claude to claude agent", () => {
    const router = new ChatRouter();
    const result = router.parse("/claude explain this");
    expect(result.agentId).toBe("claude");
    expect(result.badge).toBe("Claude");
  });

  it("routes /pi to pi agent", () => {
    const router = new ChatRouter();
    const result = router.parse("/pi what is the capital of France?");
    expect(result.agentId).toBe("pi");
    expect(result.badge).toBe("Pi");
  });

  it("routes /copilot to copilot agent", () => {
    const router = new ChatRouter();
    const result = router.parse("/copilot complete this function");
    expect(result.agentId).toBe("copilot");
    expect(result.badge).toBe("Copilot");
  });

  it("strips the command prefix from content", () => {
    const router = new ChatRouter();
    const result = router.parse("/claude  refactor this module");
    expect(result.content).toBe("refactor this module");
    expect(result.content).not.toMatch(/^\/claude/);
  });

  it("routes 'analyze this code' to claude (implicit)", () => {
    const router = new ChatRouter();
    const result = router.parse("analyze this code");
    expect(result.agentId).toBe("claude");
  });

  it("routes 'what time is it?' to pi (implicit)", () => {
    const router = new ChatRouter();
    const result = router.parse("what time is it?");
    expect(result.agentId).toBe("pi");
  });

  it("applies config rules before heuristic", () => {
    const rules: RoutingRule[] = [
      { match: "weather", agent: "copilot" },
    ];
    const router = new ChatRouter(rules);
    // "what is the weather?" would go to pi via heuristic, but the rule overrides it
    const result = router.parse("what is the weather today?");
    expect(result.agentId).toBe("copilot");
  });
});
