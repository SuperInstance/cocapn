/**
 * Fleet Client
 *
 * Client for bridge integration with fleet protocol.
 * Handles fleet connection, messaging, and task execution.
 */

import type {
  FleetAgent,
  FleetTask,
  FleetMessage,
  FleetClientConfig,
  FleetClientState,
  AgentStatus,
  FleetJWTPayload,
  Subtask,
} from './types.js';
import { FleetManager } from './fleet-manager.js';

// ---------------------------------------------------------------------------
// Fleet Client Class
// ---------------------------------------------------------------------------

export class FleetClient {
  private config: FleetClientConfig;
  private manager: FleetManager;
  private state: FleetClientState;
  private heartbeatInterval?: NodeJS.Timeout | undefined;
  private messageHandlers: Map<string, (message: FleetMessage) => void>;

  constructor(config: FleetClientConfig, manager?: FleetManager) {
    this.config = config;
    this.manager = manager || new FleetManager();
    this.state = {
      peers: [],
      connected: false,
      currentTasks: new Set(),
    };
    this.messageHandlers = new Map();
  }

  // ---------------------------------------------------------------------------
  // Connection Management
  // ---------------------------------------------------------------------------

  /**
   * Connect to fleet (create new or join existing)
   */
  async connect(): Promise<{
    fleetId: string;
    role: string;
    leaderId: string;
    peers: FleetAgent[];
  }> {
    try {
      const result = this.manager.getRegistry().registerAgent(
        this.config.agentId,
        {
          name: this.config.agentCard.name,
          url: this.config.agentCard.url,
        },
        {
          skills: this.config.capabilities.skills,
          modules: this.config.capabilities.modules || [],
          compute: this.config.capabilities.compute || {},
          ...(this.config.capabilities.leadershipPriority !== undefined && { leadershipPriority: this.config.capabilities.leadershipPriority }),
        },
        this.config.desiredFleetId,
        this.config.preferredRole
      );

      // Update state
      this.state.fleetId = result.fleetId;
      this.state.role = result.role;
      this.state.leaderId = result.leaderId;
      this.state.peers = result.peers;
      this.state.connected = true;

      // Start heartbeat loop
      this.startHeartbeat();

      return result;
    } catch (error) {
      throw new Error(`Failed to connect to fleet: ${error}`);
    }
  }

  /**
   * Disconnect from fleet
   */
  async disconnect(): Promise<void> {
    // Stop heartbeat
    this.stopHeartbeat();

    // Unregister from fleet
    if (this.state.fleetId) {
      this.manager.leaveFleet(this.config.agentId);
    }

    // Clear state
    this.state = {
      peers: [],
      connected: false,
      currentTasks: new Set(),
    };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state.connected;
  }

  /**
   * Get current state
   */
  getState(): FleetClientState {
    return {
      ...this.state,
      currentTasks: new Set(this.state.currentTasks),
    };
  }

  // ---------------------------------------------------------------------------
  // Messaging
  // ---------------------------------------------------------------------------

  /**
   * Send message to fleet or specific agent
   */
  async sendMessage(message: Omit<FleetMessage, 'id' | 'from' | 'timestamp'>): Promise<string> {
    if (!this.state.connected) {
      throw new Error('Not connected to fleet');
    }

    const fullMessage: FleetMessage = {
      ...message,
      id: this.generateMessageId(),
      from: this.config.agentId,
      timestamp: Date.now(),
      metadata: {
        ...message.metadata,
        priority: message.metadata?.priority || 5,
      },
    };

    // Route message
    if (message.to === 'fleet') {
      await this.broadcastToPeers(fullMessage);
    } else {
      await this.sendToAgent(fullMessage);
    }

    return fullMessage.id;
  }

  /**
   * Send task progress update
   */
  async sendProgress(
    taskId: string,
    progress: number,
    status: 'working' | 'blocked' | 'complete' | 'failed',
    message?: string
  ): Promise<void> {
    await this.sendMessage({
      to: 'fleet',
      type: 'task-progress',
      payload: {
        subtaskId: taskId,
        progress,
        status,
        message,
      },
      metadata: { priority: 5 },
    });
  }

  /**
   * Send task result
   */
  async sendResult(
    taskId: string,
    result: {
      status: 'success' | 'failure' | 'partial';
      output: any;
      artifacts: any[];
      metrics: {
        duration: number;
        tokensUsed: number;
        steps: number;
      };
    }
  ): Promise<void> {
    await this.sendMessage({
      to: 'fleet',
      type: 'task-result',
      payload: {
        subtaskId: taskId,
        result,
      },
      metadata: { priority: 7 },
    });
  }

  /**
   * Send error escalation
   */
  async sendError(
    taskId: string,
    error: {
      code: string;
      message: string;
      stack?: string;
      recoverable: boolean;
      escalationLevel: 'warn' | 'retry' | 'escalate' | 'abort';
    }
  ): Promise<void> {
    await this.sendMessage({
      to: 'fleet',
      type: 'task-error',
      payload: {
        subtaskId: taskId,
        error,
      },
      metadata: { priority: 9 },
    });
  }

  /**
   * Register message handler
   */
  onMessage(type: string, handler: (message: FleetMessage) => void): void {
    this.messageHandlers.set(type, handler);
  }

  /**
   * Handle incoming message
   */
  async handleMessage(message: FleetMessage): Promise<void> {
    // Call config callback if set
    if (this.config.onMessage) {
      this.config.onMessage(message);
    }

    // Call type-specific handler
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      handler(message);
    }

    // Handle task assignment
    if (message.type === 'task-assign' && this.config.onTaskAssigned) {
      const payload = message.payload as TaskAssignmentMessage['payload'];
      const task: FleetTask = {
        id: payload.subtaskId,
        fleetId: this.state.fleetId || '',
        type: 'subtask',
        payload: payload.subtask,
        assignedTo: this.config.agentId,
        status: 'assigned',
        priority: payload.subtask.priority,
        timeout: payload.subtask.timeout,
        onTimeout: payload.subtask.onTimeout || 'retry',
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now(),
      };

      this.state.currentTasks.add(task.id);
      await this.config.onTaskAssigned(task);
    }
  }

  // ---------------------------------------------------------------------------
  // Heartbeat
  // ---------------------------------------------------------------------------

  /**
   * Start heartbeat loop
   */
  private startHeartbeat(): void {
    const interval = 30000; // 30 seconds

    this.heartbeatInterval = setInterval(async () => {
      await this.sendHeartbeat();
    }, interval);

    // Send initial heartbeat
    this.sendHeartbeat();
  }

  /**
   * Stop heartbeat loop
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  /**
   * Send heartbeat to fleet
   */
  private async sendHeartbeat(): Promise<void> {
    if (!this.state.connected) return;

    const status: AgentStatus = this.state.currentTasks.size > 0 ? 'busy' : 'idle';

    // Update in registry
    this.manager.updateHeartbeat(
      this.config.agentId,
      status,
      this.state.currentTasks.size > 0 ? Array.from(this.state.currentTasks)[0] : undefined,
      this.state.currentTasks.size / 10 // Assume max 10 concurrent tasks
    );

    // Send heartbeat message
    await this.sendMessage({
      to: 'fleet',
      type: 'heartbeat',
      payload: {
        agentStatus: {
          status,
          currentTaskId: this.state.currentTasks.size > 0 ? Array.from(this.state.currentTasks)[0] : undefined,
          load: this.state.currentTasks.size / 10,
        },
      },
      metadata: { priority: 1 },
    });
  }

  // ---------------------------------------------------------------------------
  // Task Execution
  // ---------------------------------------------------------------------------

  /**
   * Complete task and remove from tracking
   */
  completeTask(taskId: string, result?: any): void {
    this.state.currentTasks.delete(taskId);

    // Send result to fleet
    this.sendResult(taskId, {
      status: 'success',
      output: result || {},
      artifacts: [],
      metrics: {
        duration: 0,
        tokensUsed: 0,
        steps: 0,
      },
    });
  }

  /**
   * Fail task and remove from tracking
   */
  failTask(taskId: string, error: Error): void {
    this.state.currentTasks.delete(taskId);

    // Send error to fleet
    this.sendError(taskId, {
      code: 'TASK_FAILED',
      message: error.message,
      ...(error.stack && { stack: error.stack }),
      recoverable: false,
      escalationLevel: 'abort',
    });
  }

  /**
   * Get current tasks
   */
  getCurrentTasks(): Set<string> {
    return new Set(this.state.currentTasks);
  }

  // ---------------------------------------------------------------------------
  // Fleet Operations
  // ---------------------------------------------------------------------------

  /**
   * Get fleet peers
   */
  getPeers(): FleetAgent[] {
    return this.state.peers;
  }

  /**
   * Get fleet leader
   */
  getLeader(): FleetAgent | undefined {
    return this.state.peers.find(p => p.id === this.state.leaderId);
  }

  /**
   * Get agent info
   */
  getAgentInfo(): { id: string; name: string; role: string | undefined } {
    return {
      id: this.config.agentId,
      name: this.config.agentCard.name,
      role: this.state.role,
    };
  }

  // ---------------------------------------------------------------------------
  // Utility Methods
  // ---------------------------------------------------------------------------

  /**
   * Broadcast message to all peers
   */
  private async broadcastToPeers(message: FleetMessage): Promise<void> {
    // In a real implementation, this would send via A2A protocol
    // For now, just call local handlers
    for (const peer of this.state.peers) {
      // Simulate peer receiving message
      if (peer.id !== this.config.agentId) {
        // In real implementation: await this.a2aClient.send(peer.instanceUrl, message);
      }
    }
  }

  /**
   * Send message to specific agent
   */
  private async sendToAgent(message: FleetMessage): Promise<void> {
    const peer = this.state.peers.find(p => p.id === message.to);
    if (!peer) {
      throw new Error(`Peer not found: ${message.to}`);
    }

    // In a real implementation, this would send via A2A protocol
    // For now: await this.a2aClient.send(peer.instanceUrl, message);
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    await this.disconnect();
    this.messageHandlers.clear();
  }
}

// ---------------------------------------------------------------------------
// Type export for task assignment payload
// ---------------------------------------------------------------------------

interface TaskAssignmentMessage {
  type: 'task-assign';
  payload: {
    subtaskId: string;
    subtask: Subtask;
    assignment: {
      assignedTo: string;
      assignedAt: string;
      deadline: string;
    };
  };
}
