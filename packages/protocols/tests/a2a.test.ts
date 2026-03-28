/**
 * Tests for A2A protocol serialization/deserialization and server routing.
 *
 * The A2AServer uses the Fetch API so tests construct Request objects directly.
 */

import { describe, it, expect, vi } from "vitest";
import { A2AServer, A2AClient } from "../src/a2a/index.js";
import type {
  A2AAgentCard,
  SendTaskParams,
  Task,
  TaskMessage,
} from "../src/a2a/index.js";
import { A2AErrorCode } from "../src/a2a/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_AGENT_CARD: A2AAgentCard = {
  name: "test-agent",
  description: "A test agent for unit tests",
  url: "https://agent.example.com",
  version: "1.0.0",
  capabilities: {
    streaming: false,
    pushNotifications: false,
  },
  skills: [
    {
      id: "echo",
      name: "Echo",
      tags: ["test"],
      examples: ["echo hello"],
    },
  ],
};

function makeTask(id: string): Task {
  return A2AServer.makeTask(id, { state: "completed" });
}

function makeUserMessage(text: string): TaskMessage {
  return { role: "user", parts: [{ type: "text", text }] };
}

function makeSendParams(id: string, text = "hello"): SendTaskParams {
  return { id, message: makeUserMessage(text) };
}

// ---------------------------------------------------------------------------
// A2A type serialization
// ---------------------------------------------------------------------------

describe("A2A type serialization", () => {
  it("round-trips an AgentCard", () => {
    const json = JSON.stringify(TEST_AGENT_CARD);
    const parsed = JSON.parse(json) as A2AAgentCard;
    expect(parsed).toEqual(TEST_AGENT_CARD);
  });

  it("round-trips a Task", () => {
    const task: Task = {
      id: "task-001",
      sessionId: "session-abc",
      status: { state: "completed", timestamp: "2026-03-27T00:00:00Z" },
      artifacts: [
        {
          index: 0,
          parts: [{ type: "text", text: "result" }],
          lastChunk: true,
        },
      ],
      history: [makeUserMessage("hello")],
      metadata: { source: "test" },
    };
    expect(JSON.parse(JSON.stringify(task))).toEqual(task);
  });

  it("round-trips all task states", () => {
    const states = [
      "submitted",
      "working",
      "input-required",
      "completed",
      "failed",
      "canceled",
    ] as const;
    for (const state of states) {
      const task = makeTask("t1");
      task.status.state = state;
      expect(JSON.parse(JSON.stringify(task)).status.state).toBe(state);
    }
  });

  it("round-trips all TaskPart types", () => {
    const parts = [
      { type: "text" as const, text: "hello" },
      {
        type: "file" as const,
        file: { name: "test.png", mimeType: "image/png", bytes: "base64==" },
      },
      { type: "data" as const, data: { key: "value" } },
    ];
    for (const part of parts) {
      expect(JSON.parse(JSON.stringify(part))).toEqual(part);
    }
  });

  it("serializes A2AErrorCode values correctly", () => {
    expect(A2AErrorCode.TaskNotFound).toBe(-32001);
    expect(A2AErrorCode.TaskNotCancelable).toBe(-32002);
    expect(A2AErrorCode.PushNotificationNotSupported).toBe(-32003);
    expect(A2AErrorCode.UnsupportedOperation).toBe(-32004);
    expect(A2AErrorCode.IncompatibleContentTypes).toBe(-32005);
  });
});

// ---------------------------------------------------------------------------
// A2AServer request handling
// ---------------------------------------------------------------------------

describe("A2AServer.handleRequest", () => {
  const server = new A2AServer({
    agentCard: TEST_AGENT_CARD,
    onSendTask: async (params) => makeTask(params.id),
    onGetTask: async (id) => (id === "exists" ? makeTask(id) : null),
    onCancelTask: async (id) => (id === "cancelable" ? makeTask(id) : null),
  });

  it("serves agent card at /.well-known/agent.json", async () => {
    const req = new Request("https://agent.example.com/.well-known/agent.json");
    const res = await server.handleRequest(req);
    expect(res.status).toBe(200);
    const body = await res.json() as A2AAgentCard;
    expect(body.name).toBe("test-agent");
    expect(body.skills).toHaveLength(1);
  });

  it("returns 405 for non-POST requests", async () => {
    const req = new Request("https://agent.example.com", { method: "GET" });
    const res = await server.handleRequest(req);
    expect(res.status).toBe(405);
  });

  it("handles tasks/send", async () => {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "tasks/send",
      params: makeSendParams("task-001"),
    };
    const req = new Request("https://agent.example.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const res = await server.handleRequest(req);
    const json = await res.json() as { result: Task };
    expect(json.result.id).toBe("task-001");
    expect(json.result.status.state).toBe("completed");
  });

  it("handles tasks/get for existing task", async () => {
    const body = {
      jsonrpc: "2.0",
      id: 2,
      method: "tasks/get",
      params: { id: "exists" },
    };
    const req = new Request("https://agent.example.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const res = await server.handleRequest(req);
    const json = await res.json() as { result: Task };
    expect(json.result.id).toBe("exists");
  });

  it("returns TaskNotFound for unknown tasks/get", async () => {
    const body = {
      jsonrpc: "2.0",
      id: 3,
      method: "tasks/get",
      params: { id: "missing" },
    };
    const req = new Request("https://agent.example.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const res = await server.handleRequest(req);
    const json = await res.json() as { error: { code: number } };
    expect(json.error.code).toBe(A2AErrorCode.TaskNotFound);
  });

  it("handles tasks/cancel for cancelable task", async () => {
    const body = {
      jsonrpc: "2.0",
      id: 4,
      method: "tasks/cancel",
      params: { id: "cancelable" },
    };
    const req = new Request("https://agent.example.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const res = await server.handleRequest(req);
    const json = await res.json() as { result: Task };
    expect(json.result.id).toBe("cancelable");
  });

  it("returns TaskNotCancelable for non-cancelable tasks", async () => {
    const body = {
      jsonrpc: "2.0",
      id: 5,
      method: "tasks/cancel",
      params: { id: "not-cancelable" },
    };
    const req = new Request("https://agent.example.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const res = await server.handleRequest(req);
    const json = await res.json() as { error: { code: number } };
    expect(json.error.code).toBe(A2AErrorCode.TaskNotCancelable);
  });

  it("returns method not found for unknown methods", async () => {
    const body = { jsonrpc: "2.0", id: 6, method: "tasks/unknown", params: {} };
    const req = new Request("https://agent.example.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const res = await server.handleRequest(req);
    const json = await res.json() as { error: { code: number } };
    expect(json.error.code).toBe(-32601);
  });

  it("returns parse error for invalid JSON", async () => {
    const req = new Request("https://agent.example.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json {{{",
    });
    const res = await server.handleRequest(req);
    const json = await res.json() as { error: { code: number } };
    expect(json.error.code).toBe(-32700);
  });
});

// ---------------------------------------------------------------------------
// A2AClient (mocked fetch)
// ---------------------------------------------------------------------------

describe("A2AClient", () => {
  it("fetches agent card", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(TEST_AGENT_CARD), {
        headers: { "Content-Type": "application/json" },
      })
    );

    const client = new A2AClient({
      baseUrl: "https://agent.example.com",
      fetch: mockFetch,
    });

    const card = await client.getAgentCard();
    expect(card.name).toBe("test-agent");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://agent.example.com/.well-known/agent.json",
      expect.objectContaining({ headers: {} })
    );
  });

  it("sends a task and returns result", async () => {
    const expectedTask = makeTask("task-abc");
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: expectedTask }), {
        headers: { "Content-Type": "application/json" },
      })
    );

    const client = new A2AClient({
      baseUrl: "https://agent.example.com",
      fetch: mockFetch,
    });

    const task = await client.sendTask(makeSendParams("task-abc"));
    expect(task.id).toBe("task-abc");
    expect(task.status.state).toBe("completed");
  });

  it("throws on A2A error responses", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          error: { code: A2AErrorCode.TaskNotFound, message: "Not found" },
        }),
        { headers: { "Content-Type": "application/json" } }
      )
    );

    const client = new A2AClient({
      baseUrl: "https://agent.example.com",
      fetch: mockFetch,
    });

    await expect(client.sendTask(makeSendParams("missing"))).rejects.toThrow(
      "Not found"
    );
  });

  it("includes Authorization header when authToken is set", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(TEST_AGENT_CARD), {
        headers: { "Content-Type": "application/json" },
      })
    );

    const client = new A2AClient({
      baseUrl: "https://agent.example.com",
      authToken: "secret-token",
      fetch: mockFetch,
    });

    await client.getAgentCard();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { Authorization: "Bearer secret-token" },
      })
    );
  });

  it("strips trailing slash from baseUrl", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(TEST_AGENT_CARD), {
        headers: { "Content-Type": "application/json" },
      })
    );

    const client = new A2AClient({
      baseUrl: "https://agent.example.com/",
      fetch: mockFetch,
    });

    await client.getAgentCard();
    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).not.toContain("//.");
    expect(calledUrl).toBe("https://agent.example.com/.well-known/agent.json");
  });
});

// ---------------------------------------------------------------------------
// A2AServer.makeTask helper
// ---------------------------------------------------------------------------

describe("A2AServer.makeTask", () => {
  it("creates a task with correct shape", () => {
    const task = A2AServer.makeTask("t1", { state: "submitted" }, "session-1");
    expect(task.id).toBe("t1");
    expect(task.sessionId).toBe("session-1");
    expect(task.status.state).toBe("submitted");
    expect(task.artifacts).toEqual([]);
    expect(task.history).toEqual([]);
  });

  it("defaults sessionId to undefined when not provided", () => {
    const task = A2AServer.makeTask("t2", { state: "working" });
    expect(task.sessionId).toBeUndefined();
  });
});
