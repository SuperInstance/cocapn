export * as MCP from "./mcp/index.js";
export * as A2A from "./a2a/index.js";

// Re-export commonly used types at the top level for convenience
export type {
  MCPTransport,
  MessageHandler,
  ErrorHandler,
  CloseHandler,
} from "./mcp/transport.js";

export type {
  A2AAgentCard,
  A2ACapabilities,
  A2ASkill,
  Task,
  TaskMessage,
  TaskPart,
  TaskState,
  TaskStatus,
  SendTaskParams,
} from "./a2a/types.js";
