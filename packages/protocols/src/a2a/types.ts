/**
 * A2A (Agent-to-Agent) protocol types.
 *
 * Based on the Google A2A specification and the a2a-agent-card.schema.json
 * defined in /schemas. These types are environment-agnostic.
 */

// ---------------------------------------------------------------------------
// Agent Card — the "business card" an agent publishes at /.well-known/agent.json
// ---------------------------------------------------------------------------

export interface A2ACapabilities {
  streaming?: boolean;
  pushNotifications?: boolean;
  stateTransitionHistory?: boolean;
  multimodal?: boolean;
  [key: string]: boolean | undefined;
}

export interface A2ASkill {
  id: string;
  name: string;
  tags?: string[];
  examples?: string[];
}

export interface A2AAgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: A2ACapabilities;
  skills: A2ASkill[];
}

// ---------------------------------------------------------------------------
// Task — the unit of work passed between agents
// ---------------------------------------------------------------------------

export type TaskState =
  | "submitted"
  | "working"
  | "input-required"
  | "completed"
  | "failed"
  | "canceled";

export interface TaskMessage {
  role: "user" | "agent";
  parts: TaskPart[];
  metadata?: Record<string, unknown>;
}

export type TaskPart = TextPart | FilePart | DataPart;

export interface TextPart {
  type: "text";
  text: string;
}

export interface FilePart {
  type: "file";
  file: {
    name?: string;
    mimeType?: string;
    bytes?: string;
    uri?: string;
  };
}

export interface DataPart {
  type: "data";
  data: Record<string, unknown>;
}

export interface TaskStatus {
  state: TaskState;
  message?: TaskMessage;
  timestamp?: string;
}

export interface TaskArtifact {
  name?: string;
  description?: string;
  index: number;
  append?: boolean;
  lastChunk?: boolean;
  parts: TaskPart[];
  metadata?: Record<string, unknown>;
}

export interface Task {
  id: string;
  sessionId?: string;
  status: TaskStatus;
  artifacts?: TaskArtifact[];
  history?: TaskMessage[];
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// A2A Request / Response envelopes
// ---------------------------------------------------------------------------

export interface SendTaskParams {
  id: string;
  sessionId?: string;
  message: TaskMessage;
  acceptedOutputModes?: string[];
  pushNotification?: PushNotificationConfig;
  historyLength?: number;
  metadata?: Record<string, unknown>;
}

export interface GetTaskParams {
  id: string;
  historyLength?: number;
}

export interface CancelTaskParams {
  id: string;
}

export interface SetTaskPushNotificationParams {
  id: string;
  pushNotificationConfig: PushNotificationConfig;
}

export interface PushNotificationConfig {
  url: string;
  token?: string;
  authentication?: {
    schemes: string[];
    credentials?: string;
  };
}

export interface SendTaskResponse {
  id: string;
  result?: Task;
  error?: A2AError;
}

export interface GetTaskResponse {
  id: string;
  result?: Task;
  error?: A2AError;
}

export interface A2AError {
  code: number;
  message: string;
  data?: unknown;
}

// Standard A2A error codes
export const A2AErrorCode = {
  TaskNotFound: -32001,
  TaskNotCancelable: -32002,
  PushNotificationNotSupported: -32003,
  UnsupportedOperation: -32004,
  IncompatibleContentTypes: -32005,
} as const;

// ---------------------------------------------------------------------------
// Streaming event types
// ---------------------------------------------------------------------------

export interface TaskStatusUpdateEvent {
  id: string;
  status: TaskStatus;
  final: boolean;
  metadata?: Record<string, unknown>;
}

export interface TaskArtifactUpdateEvent {
  id: string;
  artifact: TaskArtifact;
  metadata?: Record<string, unknown>;
}

export type TaskStreamEvent = TaskStatusUpdateEvent | TaskArtifactUpdateEvent;
