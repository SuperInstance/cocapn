/**
 * Tests for api/status.ts — Status Dashboard API
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  StatusAPI,
  type StatusDependencies,
} from "../../src/api/status.js";
import type { Brain } from "../../src/brain/index.js";
import type { TokenTracker } from "../../src/metrics/token-tracker.js";
import type { BridgeConfig } from "../../src/config/types.js";
import { DEFAULT_CONFIG } from "../../src/config/types.js";
import type { FleetAgent } from "../../src/fleet/agent.js";
import type { IncomingMessage, ServerResponse } from "http";

// ─── Mock helpers ────────────────────────────────────────────────────────────

function makeBrain(overrides: Partial<Brain> = {}): Brain {
  return {
    getFact: vi.fn().mockReturnValue(undefined),
    getAllFacts: vi.fn().mockReturnValue({}),
    getMemories: vi.fn().mockReturnValue([]),
    listWikiPages: vi.fn().mockReturnValue([]),
    setMode: vi.fn(),
    getMode: vi.fn().mockReturnValue("private"),
    memoryManager: null,
    ...overrides,
  } as unknown as Brain;
}

function makeTokenTracker(overrides: Partial<TokenTracker> = {}): TokenTracker {
  return {
    record: vi.fn().mockReturnValue("id"),
    getStats: vi.fn().mockReturnValue({
      totalTokensIn: 1000,
      totalTokensOut: 2000,
      totalTokens: 3000,
      avgTokensPerTask: 500,
      tasksCompleted: 5,
      tasksFailed: 1,
      tokensByModule: {},
      tokensBySkill: {},
      tokensByTask: {},
      efficiency: 600,
      topWasters: [],
      period: { start: "2026-03-30T00:00:00Z", end: "2026-03-30T10:00:00Z" },
    }),
    ...overrides,
  } as unknown as TokenTracker;
}

function makeConfig(overrides: Partial<BridgeConfig> = {}): BridgeConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<StatusDependencies> = {}): StatusDependencies {
  return {
    brain: undefined,
    tokenTracker: undefined,
    config: makeConfig(),
    repoRoot: "/tmp/test-repo",
    fleetAgent: undefined,
    startTime: Date.now() - 3600_000, // 1 hour ago
    ...overrides,
  };
}

function makeMockReq(url: string, method = "GET"): IncomingMessage {
  return {
    url,
    method,
    headers: {},
  } as IncomingMessage;
}

function makeMockRes(): { res: ServerResponse; getChunks: () => Buffer[]; getStatusCode: () => number; getHeaders: () => Record<string, string> } {
  const chunks: Buffer[] = [];
  let statusCode = 0;
  const headers: Record<string, string> = {};

  const res = {
    writeHead: vi.fn((code: number, h?: Record<string, string>) => {
      statusCode = code;
      Object.assign(headers, h ?? {});
    }),
    end: vi.fn((chunk?: unknown) => {
      if (typeof chunk === "string") chunks.push(Buffer.from(chunk));
      else if (Buffer.isBuffer(chunk)) chunks.push(chunk);
    }),
  } as unknown as ServerResponse;

  return {
    res,
    getChunks: () => chunks,
    getStatusCode: () => statusCode,
    getHeaders: () => headers,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("StatusAPI", () => {
  let deps: StatusDependencies;
  let api: StatusAPI;

  beforeEach(() => {
    deps = makeDeps();
    api = new StatusAPI(deps);
  });

  describe("handleRequest", () => {
    it("returns false for unknown routes", async () => {
      const req = makeMockReq("/api/unknown");
      const { res } = makeMockRes();
      const handled = await api.handleRequest(req, res);
      expect(handled).toBe(false);
      expect(res.writeHead).not.toHaveBeenCalled();
    });

    it("returns false for wrong HTTP method", async () => {
      const req = makeMockReq("/api/status", "POST");
      const { res } = makeMockRes();
      const handled = await api.handleRequest(req, res);
      expect(handled).toBe(false);
      expect(res.writeHead).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/status", () => {
    it("returns 200 with full status response", async () => {
      const req = makeMockReq("/api/status");
      const mockRes = makeMockRes();

      const handled = await api.handleRequest(req, mockRes.res);
      expect(handled).toBe(true);
      expect(mockRes.getStatusCode()).toBe(200);

      const body = JSON.parse(Buffer.concat(mockRes.getChunks()).toString());
      expect(body).toHaveProperty("agent");
      expect(body).toHaveProperty("brain");
      expect(body).toHaveProperty("llm");
      expect(body).toHaveProperty("fleet");
      expect(body).toHaveProperty("system");
    });

    it("includes correct agent info", async () => {
      const brain = makeBrain({
        getFact: vi.fn((key: string) => {
          if (key === "agent.name") return "Fishing Buddy";
          return undefined;
        }),
      });
      deps.brain = brain;
      deps.config = makeConfig({ config: { ...DEFAULT_CONFIG.config, mode: "local" } });
      api = new StatusAPI(deps);

      const status = api.buildStatusResponse();
      expect(status.agent.name).toBe("Fishing Buddy");
      expect(status.agent.version).toBe("0.2.0");
      expect(status.agent.mode).toBe("local");
      expect(status.agent.uptime).toBeGreaterThanOrEqual(3599);
      expect(status.agent.uptime).toBeLessThanOrEqual(3601);
      expect(status.agent.repoRoot).toBe("/tmp/test-repo");
    });

    it("defaults agent name when brain has no agent.name fact", () => {
      const status = api.getAgentStatus();
      expect(status.name).toBe("Cocapn Agent");
    });
  });

  describe("brain status", () => {
    it("returns zeros when brain is undefined", () => {
      deps.brain = undefined;
      api = new StatusAPI(deps);

      const brain = api.getBrainStatus();
      expect(brain.facts).toBe(0);
      expect(brain.memories).toBe(0);
      expect(brain.wikiPages).toBe(0);
      expect(brain.knowledgeEntries).toBe(0);
    });

    it("counts facts, memories, wiki pages, and knowledge entries", () => {
      const brain = makeBrain({
        getAllFacts: vi.fn().mockReturnValue({
          "user.name": "Alice",
          "private.apiKey": "secret",
          "knowledge.species.1": "salmon",
          "knowledge.species.2": "bass",
          "knowledge.regulation.1": "limit-5",
        }),
        getMemories: vi.fn().mockReturnValue([
          { id: "1", createdAt: "2026-03-30T10:00:00Z" },
          { id: "2", createdAt: "2026-03-29T10:00:00Z" },
        ]),
        listWikiPages: vi.fn().mockReturnValue([
          { file: "getting-started.md", title: "Getting Started", excerpt: "" },
          { file: "fishing-tips.md", title: "Fishing Tips", excerpt: "" },
        ]),
        getFact: vi.fn((key: string) => {
          if (key === "system.lastSync") return "2026-03-30T10:00:00Z";
          return undefined;
        }),
      });
      deps.brain = brain;
      api = new StatusAPI(deps);

      const brainStatus = api.getBrainStatus();
      expect(brainStatus.facts).toBe(5);
      expect(brainStatus.memories).toBe(2);
      expect(brainStatus.wikiPages).toBe(2);
      expect(brainStatus.knowledgeEntries).toBe(3);
      expect(brainStatus.lastSync).toBe("2026-03-30T10:00:00Z");
    });
  });

  describe("LLM status", () => {
    it("returns zeros when no token tracker", () => {
      deps.tokenTracker = undefined;
      deps.config = makeConfig();
      api = new StatusAPI(deps);

      const llm = api.getLLMStatus();
      expect(llm.provider).toBe("none");
      expect(llm.model).toBe("none");
      expect(llm.requestsToday).toBe(0);
      expect(llm.tokensToday).toBe(0);
      expect(llm.avgLatency).toBe(0);
    });

    it("returns token tracker stats", () => {
      const tracker = makeTokenTracker();
      deps.tokenTracker = tracker;
      deps.config = makeConfig({
        llm: {
          defaultModel: "deepseek-chat",
          providers: {
            deepseek: { apiKey: "test-key" },
          },
        },
      });
      api = new StatusAPI(deps);

      const llm = api.getLLMStatus();
      expect(llm.provider).toBe("deepseek");
      expect(llm.model).toBe("deepseek-chat");
      expect(llm.requestsToday).toBe(6); // 5 completed + 1 failed
      expect(llm.tokensToday).toBe(3000);
      expect(llm.avgLatency).toBe(600); // 3000 / 5
    });
  });

  describe("fleet status", () => {
    it("returns zeros when no fleet agent", () => {
      deps.fleetAgent = undefined;
      api = new StatusAPI(deps);

      const fleet = api.getFleetStatus();
      expect(fleet.peers).toBe(0);
      expect(fleet.messagesSent).toBe(0);
      expect(fleet.messagesReceived).toBe(0);
    });

    it("returns fleet detail with no peers for non-leader", async () => {
      const fleetAgent = {
        getRole: vi.fn().mockReturnValue("worker"),
        getFleetId: vi.fn().mockReturnValue("fleet-123"),
        listAgents: vi.fn().mockResolvedValue([]),
      } as unknown as FleetAgent;
      deps.fleetAgent = fleetAgent;
      api = new StatusAPI(deps);

      const detail = await api.buildFleetDetail();
      expect(detail.connectedPeers).toEqual([]);
      expect(detail.role).toBe("worker");
      expect(detail.fleetId).toBe("fleet-123");
    });

    it("returns fleet detail with connected peers for leader", async () => {
      const fleetAgent = {
        getRole: vi.fn().mockReturnValue("leader"),
        getFleetId: vi.fn().mockReturnValue("fleet-456"),
        listAgents: vi.fn().mockResolvedValue([
          {
            id: "worker-1",
            name: "Worker One",
            status: "idle",
            lastHeartbeat: Date.now() - 5000,
            skills: ["chat", "code"],
          },
          {
            id: "worker-2",
            name: "Worker Two",
            status: "busy",
            lastHeartbeat: Date.now() - 1000,
            skills: ["search"],
          },
        ]),
      } as unknown as FleetAgent;
      deps.fleetAgent = fleetAgent;
      api = new StatusAPI(deps);

      const detail = await api.buildFleetDetail();
      expect(detail.connectedPeers).toHaveLength(2);
      expect(detail.connectedPeers[0].agentId).toBe("worker-1");
      expect(detail.connectedPeers[0].skills).toEqual(["chat", "code"]);
      expect(detail.connectedPeers[1].status).toBe("busy");
      expect(detail.role).toBe("leader");
      expect(detail.fleetId).toBe("fleet-456");
    });
  });

  describe("system status", () => {
    it("returns system metrics", () => {
      const system = api.getSystemStatus();
      expect(system.memoryUsage).toBeTruthy();
      expect(typeof system.cpuPercent).toBe("number");
      expect(system.cpuPercent).toBeGreaterThanOrEqual(0);
      expect(system.cpuPercent).toBeLessThanOrEqual(100);
      expect(system.diskUsage).toBeTruthy();
    });
  });

  describe("GET /api/status/memory", () => {
    it("returns 200 with detailed memory stats", async () => {
      const req = makeMockReq("/api/status/memory");
      const mockRes = makeMockRes();

      const handled = await api.handleRequest(req, mockRes.res);
      expect(handled).toBe(true);
      expect(mockRes.getStatusCode()).toBe(200);

      const body = JSON.parse(Buffer.concat(mockRes.getChunks()).toString());
      expect(body).toHaveProperty("factsByCategory");
      expect(body).toHaveProperty("memoryTimeline");
      expect(body).toHaveProperty("wikiPages");
      expect(body).toHaveProperty("knowledgeByType");
      expect(body).toHaveProperty("memoryStats");
    });

    it("categorizes facts by prefix", () => {
      const brain = makeBrain({
        getAllFacts: vi.fn().mockReturnValue({
          "user.name": "Alice",
          "user.email": "alice@example.com",
          "private.apiKey": "secret",
          "system.lastSync": "2026-03-30T10:00:00Z",
          "knowledge.species.1": "salmon",
        }),
        getMemories: vi.fn().mockReturnValue([]),
        listWikiPages: vi.fn().mockReturnValue([]),
      });
      deps.brain = brain;
      api = new StatusAPI(deps);

      const detail = api.buildMemoryDetail();
      expect(detail.factsByCategory.user).toBe(2);
      expect(detail.factsByCategory.private).toBe(1);
      expect(detail.factsByCategory.system).toBe(1);
      expect(detail.factsByCategory.knowledge).toBe(1);
    });

    it("builds memory timeline for last 7 days", () => {
      const now = new Date();
      const memories = [
        { id: "1", createdAt: new Date(now.getTime() - 86400000).toISOString() },
        { id: "2", createdAt: new Date(now.getTime() - 172800000).toISOString() },
        { id: "3", createdAt: new Date(now.getTime() - 172800000).toISOString() },
      ];

      const brain = makeBrain({
        getAllFacts: vi.fn().mockReturnValue({}),
        getMemories: vi.fn().mockReturnValue(memories),
        listWikiPages: vi.fn().mockReturnValue([]),
      });
      deps.brain = brain;
      api = new StatusAPI(deps);

      const detail = api.buildMemoryDetail();
      expect(detail.memoryTimeline).toHaveLength(7);

      // Today should have 0 added (memories are from past days)
      // Yesterday should have 1, day before should have 2
      const today = detail.memoryTimeline[6];
      expect(today.added).toBe(0);
    });

    it("returns wiki pages list", () => {
      const brain = makeBrain({
        getAllFacts: vi.fn().mockReturnValue({}),
        getMemories: vi.fn().mockReturnValue([]),
        listWikiPages: vi.fn().mockReturnValue([
          { file: "guide.md", title: "User Guide", excerpt: "..." },
          { file: "faq.md", title: "FAQ", excerpt: "..." },
        ]),
      });
      deps.brain = brain;
      api = new StatusAPI(deps);

      const detail = api.buildMemoryDetail();
      expect(detail.wikiPages).toHaveLength(2);
      expect(detail.wikiPages[0].file).toBe("guide.md");
      expect(detail.wikiPages[0].title).toBe("User Guide");
    });

    it("groups knowledge entries by type", () => {
      const brain = makeBrain({
        getAllFacts: vi.fn().mockReturnValue({
          "knowledge.species.1": "salmon",
          "knowledge.species.2": "bass",
          "knowledge.regulation.1": "limit-5",
          "knowledge.technique.1": "trolling",
          "user.name": "Alice",
        }),
        getMemories: vi.fn().mockReturnValue([]),
        listWikiPages: vi.fn().mockReturnValue([]),
      });
      deps.brain = brain;
      api = new StatusAPI(deps);

      const detail = api.buildMemoryDetail();
      expect(detail.knowledgeByType.species).toBe(2);
      expect(detail.knowledgeByType.regulation).toBe(1);
      expect(detail.knowledgeByType.technique).toBe(1);
    });

    it("includes memory manager stats when available", () => {
      const brain = makeBrain({
        getAllFacts: vi.fn().mockReturnValue({}),
        getMemories: vi.fn().mockReturnValue([]),
        listWikiPages: vi.fn().mockReturnValue([]),
        memoryManager: {
          stats: vi.fn().mockReturnValue({
            total: 42,
            autoGenerated: 30,
            avgConfidence: 0.75,
            types: { explicit: 12, implicit: 20, preference: 10 },
          }),
        },
      });
      deps.brain = brain;
      api = new StatusAPI(deps);

      const detail = api.buildMemoryDetail();
      expect(detail.memoryStats).not.toBeNull();
      expect(detail.memoryStats!.total).toBe(42);
      expect(detail.memoryStats!.autoGenerated).toBe(30);
      expect(detail.memoryStats!.types.explicit).toBe(12);
    });

    it("returns null memory stats when no memory manager", () => {
      const brain = makeBrain({
        getAllFacts: vi.fn().mockReturnValue({}),
        getMemories: vi.fn().mockReturnValue([]),
        listWikiPages: vi.fn().mockReturnValue([]),
        memoryManager: null,
      });
      deps.brain = brain;
      api = new StatusAPI(deps);

      const detail = api.buildMemoryDetail();
      expect(detail.memoryStats).toBeNull();
    });
  });

  describe("GET /api/status/fleet", () => {
    it("returns 200 with fleet detail", async () => {
      const req = makeMockReq("/api/status/fleet");
      const mockRes = makeMockRes();

      const handled = await api.handleRequest(req, mockRes.res);
      expect(handled).toBe(true);
      expect(mockRes.getStatusCode()).toBe(200);

      const body = JSON.parse(Buffer.concat(mockRes.getChunks()).toString());
      expect(body).toHaveProperty("connectedPeers");
      expect(body).toHaveProperty("pendingMessages");
      expect(body).toHaveProperty("role");
      expect(body).toHaveProperty("fleetId");
    });

    it("returns null role and fleetId when no fleet agent", async () => {
      deps.fleetAgent = undefined;
      api = new StatusAPI(deps);

      const detail = await api.buildFleetDetail();
      expect(detail.role).toBeNull();
      expect(detail.fleetId).toBeNull();
    });

    it("handles listAgents errors gracefully", async () => {
      const fleetAgent = {
        getRole: vi.fn().mockReturnValue("worker"),
        getFleetId: vi.fn().mockReturnValue("fleet-abc"),
        listAgents: vi.fn().mockRejectedValue(new Error("Not a leader")),
      } as unknown as FleetAgent;
      deps.fleetAgent = fleetAgent;
      api = new StatusAPI(deps);

      const detail = await api.buildFleetDetail();
      expect(detail.connectedPeers).toEqual([]);
      expect(detail.role).toBe("worker");
    });
  });

  describe("buildStatusResponse integration", () => {
    it("returns a complete status with all subsystems", () => {
      const brain = makeBrain({
        getAllFacts: vi.fn().mockReturnValue({ "user.name": "Alice" }),
        getMemories: vi.fn().mockReturnValue([{ id: "1", createdAt: "2026-03-30T10:00:00Z" }]),
        listWikiPages: vi.fn().mockReturnValue([{ file: "test.md", title: "Test", excerpt: "" }]),
        getFact: vi.fn().mockReturnValue(undefined),
      });
      const tracker = makeTokenTracker();

      deps.brain = brain;
      deps.tokenTracker = tracker;
      deps.config = makeConfig({
        config: { ...DEFAULT_CONFIG.config, mode: "hybrid" },
        llm: {
          defaultModel: "gpt-4o",
          providers: { openai: { apiKey: "sk-test" } },
        },
      });
      api = new StatusAPI(deps);

      const status = api.buildStatusResponse();

      expect(status.agent.mode).toBe("hybrid");
      expect(status.brain.facts).toBe(1);
      expect(status.brain.memories).toBe(1);
      expect(status.brain.wikiPages).toBe(1);
      expect(status.llm.provider).toBe("openai");
      expect(status.llm.model).toBe("gpt-4o");
      expect(status.llm.requestsToday).toBe(6);
      expect(status.fleet.peers).toBe(0);
      expect(status.system.memoryUsage).toMatch(/\d+(\.\d+)?(KB|MB|GB|B)/);
    });
  });
});
