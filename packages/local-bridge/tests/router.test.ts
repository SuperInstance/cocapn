/**
 * Tests for AgentRouter — routing rules and strategies.
 * resolve() now returns RouteResult { definition, source } | undefined.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentRouter } from "../src/agents/router.js";
import { AgentRegistry } from "../src/agents/registry.js";
import { AgentSpawner } from "../src/agents/spawner.js";
import type { AgentDefinition } from "../src/agents/spawner.js";

function makeDefinition(
  id: string,
  cost: AgentDefinition["cost"] = "medium"
): AgentDefinition {
  return {
    id,
    type: "local",
    command: "echo",
    args: [],
    env: {},
    capabilities: ["text"],
    cost,
  };
}

describe("AgentRouter", () => {
  let registry: AgentRegistry;
  let spawner: AgentSpawner;

  beforeEach(() => {
    registry = new AgentRegistry();
    spawner = new AgentSpawner();
    registry.register(makeDefinition("claude", "high"));
    registry.register(makeDefinition("pi", "low"));
    registry.register(makeDefinition("copilot", "medium"));
  });

  it("first-match strategy returns first matching rule", () => {
    const router = new AgentRouter(
      {
        rules: [
          { match: "code", agent: "claude" },
          { match: "code", agent: "copilot" },
        ],
        strategy: "first-match",
        defaultAgent: undefined,
        fallbackAgent: undefined,
      },
      registry,
      spawner
    );
    const result = router.resolve("write some code for me");
    expect(result?.definition.id).toBe("claude");
    expect(result?.source).toBe("local");
  });

  it("highest-priority strategy picks the highest priority rule", () => {
    const router = new AgentRouter(
      {
        rules: [
          { match: "code", agent: "pi", priority: 1 },
          { match: "code", agent: "claude", priority: 10 },
          { match: "code", agent: "copilot", priority: 5 },
        ],
        strategy: "highest-priority",
        defaultAgent: undefined,
        fallbackAgent: undefined,
      },
      registry,
      spawner
    );
    const result = router.resolve("write some code");
    expect(result?.definition.id).toBe("claude");
  });

  it("cost-optimized strategy picks the lowest-cost agent", () => {
    const router = new AgentRouter(
      {
        rules: [
          { match: "search", agent: "claude" },
          { match: "search", agent: "pi" },
          { match: "search", agent: "copilot" },
        ],
        strategy: "cost-optimized",
        defaultAgent: undefined,
        fallbackAgent: undefined,
      },
      registry,
      spawner
    );
    const result = router.resolve("search for something");
    expect(result?.definition.id).toBe("pi"); // pi is "low" cost
  });

  it("falls back to defaultAgent when no rules match", () => {
    const router = new AgentRouter(
      {
        rules: [{ match: "code", agent: "claude" }],
        strategy: "first-match",
        defaultAgent: "pi",
        fallbackAgent: undefined,
      },
      registry,
      spawner
    );
    const result = router.resolve("what is the weather?");
    expect(result?.definition.id).toBe("pi");
  });

  it("falls back to fallbackAgent when default is also absent", () => {
    const router = new AgentRouter(
      {
        rules: [],
        strategy: "first-match",
        defaultAgent: "nonexistent",
        fallbackAgent: "copilot",
      },
      registry,
      spawner
    );
    const result = router.resolve("anything");
    expect(result?.definition.id).toBe("copilot");
  });

  it("returns undefined when no agent can be found", () => {
    const router = new AgentRouter(
      {
        rules: [],
        strategy: "first-match",
        defaultAgent: undefined,
        fallbackAgent: undefined,
      },
      registry,
      spawner
    );
    expect(router.resolve("something")).toBeUndefined();
  });

  it("match is case-insensitive", () => {
    const router = new AgentRouter(
      {
        rules: [{ match: "CODE", agent: "claude" }],
        strategy: "first-match",
        defaultAgent: undefined,
        fallbackAgent: undefined,
      },
      registry,
      spawner
    );
    expect(router.resolve("write some code please")?.definition.id).toBe("claude");
  });

  it("cloud stub registered by attachCloud is resolved as source=cloud", () => {
    // Simulate a CloudAdapterRegistry with a single "gemini" agent
    const fakeCloud = {
      get: (id: string) =>
        id === "gemini"
          ? { getAgentId: () => "gemini", getWorkerUrl: () => "https://gemini.workers.dev" }
          : undefined,
      getAll: () => [
        { getAgentId: () => "gemini", getWorkerUrl: () => "https://gemini.workers.dev" },
      ],
      reachableAgents: async () => ["gemini"],
      setGitHubToken: () => {},
    } as unknown as import("../src/CloudAdapter.js").CloudAdapterRegistry;

    registry.attachCloud(fakeCloud);

    const router = new AgentRouter(
      {
        rules: [{ match: "generate", agent: "gemini" }],
        strategy: "first-match",
        defaultAgent: undefined,
        fallbackAgent: undefined,
      },
      registry,
      spawner,
      fakeCloud
    );

    const result = router.resolve("generate an image");
    expect(result?.definition.id).toBe("gemini");
    expect(result?.source).toBe("cloud");
  });
});
