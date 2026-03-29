/**
 * Fleet Protocol types.
 *
 * Multi-agent coordination on top of A2A protocol.
 * Extends A2A with fleet-specific messages and semantics.
 */

import type { TaskMessage } from '../a2a/types.js';

// ---------------------------------------------------------------------------
// Fleet Configuration
// ---------------------------------------------------------------------------

export interface FleetConfig {
  // Heartbeat settings
  heartbeatInterval: number;  // default: 30s
  heartbeatTimeout: number;   // default: 90s
  deadAgentTimeout: number;   // default: 180s

  // Task settings
  defaultTaskTimeout: number; // default: 300s
  maxConcurrentTasks: number; // default: 10
  taskRetryLimit: number;     // default: 3

  // Leader settings
  autoLeaderElection: boolean; // default: true
  leadershipPriority: number;  // default: 0

  // Security
  requireEncryption: boolean;  // default: false
  jwtTTL: number;             // default: 3600s
  auditLogRetention: number;  // default: 90 days
}

export const DEFAULT_FLEET_CONFIG: FleetConfig = {
  heartbeatInterval: 30000,
  heartbeatTimeout: 90000,
  deadAgentTimeout: 180000,
  defaultTaskTimeout: 300000,
  maxConcurrentTasks: 10,
  taskRetryLimit: 3,
  autoLeaderElection: true,
  leadershipPriority: 0,
  requireEncryption: false,
  jwtTTL: 3600000,
  auditLogRetention: 7776000000, // 90 days in ms
} as const;

// ---------------------------------------------------------------------------
// Agent Role and Status
// ---------------------------------------------------------------------------

export type FleetRole = 'leader' | 'worker' | 'specialist';
export type AgentStatus = 'idle' | 'busy' | 'offline' | 'degraded';

export interface AgentCapabilities {
  skills: string[];
  modules?: string[] | undefined;
  compute?: {
    cpu?: string;
    memory?: string;
  } | undefined;
  leadershipPriority?: number;
}

export interface FleetAgent {
  id: string;
  name: string;
  role: FleetRole;
  skills: string[];
  status: AgentStatus;
  instanceUrl: string;
  lastHeartbeat: number;
  currentTask?: string;
  load: number; // 0-1
  successRate: number; // 0-1
  uptime: number; // seconds
}

// ---------------------------------------------------------------------------
// Task Types
// ---------------------------------------------------------------------------

export type TaskStatus = 'pending' | 'assigned' | 'running' | 'completed' | 'failed';
export type TaskType = string; // 'code-review', 'research', 'deploy', etc.
export type TaskPriority = number; // 0-10, higher = more important

export interface FleetTask {
  id: string;
  parentId?: string;        // parent task (for subtasks)
  fleetId: string;
  assignedTo?: string;      // agent id
  status: TaskStatus;
  type: TaskType;
  payload: any;
  result?: any;
  priority: TaskPriority;
  createdAt: number;
  completedAt?: number;
  startedAt?: number;
  timeout: number;
  retryCount: number;
  maxRetries?: number;
  onTimeout: TimeoutAction;
}

export type TimeoutAction = 'warn' | 'retry' | 'escalate' | 'abort';

// ---------------------------------------------------------------------------
// Decomposition Strategies
// ---------------------------------------------------------------------------

export type DecompositionType = 'parallel' | 'sequential' | 'map-reduce';
export type MergeStrategy = 'concat' | 'vote' | 'quorum' | 'custom';

export interface ParallelStrategy {
  type: 'parallel';
  subtasks: Subtask[];
  mergeStrategy: MergeStrategy;
}

export interface SequentialStage {
  name: string;
  assignedTo?: string; // specific agent or skill
  outputTo: string; // next stage name
}

export interface SequentialStrategy {
  type: 'sequential';
  stages: SequentialStage[];
}

export interface MapReduceStrategy {
  type: 'map-reduce';
  mapper: {
    input: TaskMessage;
    mapFunction: string; // skill or function name
  };
  reducer: {
    reduceFunction: string;
    outputFormat: 'summary' | 'detailed' | 'raw';
  };
}

export type DecompositionStrategy = ParallelStrategy | SequentialStrategy | MapReduceStrategy;

export interface Subtask {
  id: string;
  description: string;
  input: TaskMessage;
  requiredSkills?: string[] | undefined;
  timeout: number;
  priority: TaskPriority;
  onTimeout?: TimeoutAction | undefined;
}

export interface Assignment {
  assignedTo: string;
  assignedAt: string;
  deadline: string;
}

// ---------------------------------------------------------------------------
// Message Types
// ---------------------------------------------------------------------------

export type FleetMessageType =
  | 'task-assign'
  | 'task-progress'
  | 'task-result'
  | 'task-error'
  | 'heartbeat'
  | 'leader-changed'
  | 'agent-joined'
  | 'agent-left'
  | 'query';

export interface FleetMessage {
  id: string;
  from: string;             // agent id
  to: string;               // agent id or 'fleet'
  type: FleetMessageType;
  payload: any;
  timestamp: number;
  metadata: {
    priority: number;
    ttl?: number;
    correlationId?: string;
    [key: string]: unknown;
  };
}

// Task Assignment Message
export interface TaskAssignmentMessage extends FleetMessage {
  type: 'task-assign';
  payload: {
    subtaskId: string;
    subtask: Subtask;
    assignment: Assignment;
  };
}

// Progress Update Message
export interface ProgressUpdateMessage extends FleetMessage {
  type: 'task-progress';
  payload: {
    subtaskId: string;
    progress: number; // 0-100
    status: 'working' | 'blocked' | 'complete' | 'failed';
    message?: string;
    partialResult?: any;
  };
}

// Result Submission Message
export interface ResultSubmissionMessage extends FleetMessage {
  type: 'task-result';
  payload: {
    subtaskId: string;
    result: {
      status: 'success' | 'failure' | 'partial';
      output: TaskMessage;
      artifacts: any[];
      metrics: {
        duration: number;
        tokensUsed: number;
        steps: number;
      };
    };
  };
}

// Heartbeat Message
export interface HeartbeatMessage extends FleetMessage {
  type: 'heartbeat';
  payload: {
    agentStatus: {
      status: AgentStatus;
      currentTaskId?: string;
      load: number;
    };
  };
}

// Error/Escalation Message
export interface ErrorEscalationMessage extends FleetMessage {
  type: 'task-error';
  payload: {
    subtaskId: string;
    error: {
      code: string;
      message: string;
      stack?: string;
      recoverable: boolean;
      escalationLevel: 'warn' | 'retry' | 'escalate' | 'abort';
    };
  };
}

// ---------------------------------------------------------------------------
// Fleet Types
// ---------------------------------------------------------------------------

export type FleetTopology = 'star' | 'mesh' | 'hierarchical';

export interface Fleet {
  id: string;
  name: string;
  leaderId: string;
  agents: FleetAgent[];
  tasks: FleetTask[];
  topology: FleetTopology;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Registry Types
// ---------------------------------------------------------------------------

export interface FleetRegistration {
  fleetId: string;
  agentId: string;
  role: FleetRole;
  capabilities: AgentCapabilities;
  endpoint: string;
  lastSeen: number;
  status: AgentStatus;
}

export interface TaskDedup {
  fingerprint: string;
  assignedTo: string[];
  status: 'pending' | 'complete';
}

// ---------------------------------------------------------------------------
// JWT Types
// ---------------------------------------------------------------------------

export interface FleetJWTPayload {
  sub: string;        // agentId
  iss: string;        // "admiral-do" or fleet id
  aud: string;        // fleetId
  iat: number;
  exp: number;
  fleet: {
    fleetId: string;
    role: FleetRole;
    permissions: string[];
  };
}

// ---------------------------------------------------------------------------
// Audit Log Types
// ---------------------------------------------------------------------------

export interface AuditLog {
  id: string;
  fleetId: string;
  timestamp: number;
  actor: string; // agentId or "admiral-do"
  action: string;
  target: string;
  details: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

export const FleetErrorCode = {
  FleetNotFound: -33001,
  AgentNotInFleet: -33002,
  InvalidRole: -33003,
  TaskNotFound: -33004,
  AssignmentFailed: -33005,
  LeaderElectionFailed: -33006,
  HeartbeatMissed: -33007,
  DeadAgentDetected: -33008,
  InvalidTopology: -33009,
  DuplicateTask: -33010,
  TimeoutExceeded: -33011,
} as const;

export interface FleetError {
  code: keyof typeof FleetErrorCode;
  message: string;
  details?: unknown;
}

// ---------------------------------------------------------------------------
// Client Types
// ---------------------------------------------------------------------------

export interface FleetClientConfig {
  agentId: string;
  agentCard: {
    name: string;
    description: string;
    url: string;
    version: string;
  };
  capabilities: AgentCapabilities;
  desiredFleetId?: string;
  preferredRole?: FleetRole;
  admiralUrl: string;
  onTaskAssigned?: (task: FleetTask) => Promise<void>;
  onMessage?: (message: FleetMessage) => void;
}

export interface FleetClientState {
  fleetId?: string;
  role?: FleetRole;
  leaderId?: string;
  peers: FleetAgent[];
  jwt?: string;
  connected: boolean;
  currentTasks: Set<string>;
}

// ---------------------------------------------------------------------------
// Helper Types
// ---------------------------------------------------------------------------

export interface AgentScore {
  agentId: string;
  score: number;
  reasons: string[];
}

export interface TaskSplitResult {
  subtasks: Subtask[];
  mergeStrategy: MergeStrategy;
  estimatedDuration: number;
}

export interface MergeResult {
  success: boolean;
  result?: any;
  errors: string[];
}
