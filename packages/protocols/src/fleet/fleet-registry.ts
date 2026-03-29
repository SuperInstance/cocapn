/**
 * Fleet Registry
 *
 * Manages fleet registration, agent discovery, and heartbeat tracking.
 * This is an in-memory implementation; production should use AdmiralDO.
 */

import type {
  Fleet,
  FleetAgent,
  FleetRegistration,
  FleetTask,
  AgentStatus,
  FleetRole,
  AuditLog,
  TaskDedup,
  FleetConfig,
  FleetTopology,
} from './types.js';
import { DEFAULT_FLEET_CONFIG } from './types.js';

// ---------------------------------------------------------------------------
// Registry Storage
// ---------------------------------------------------------------------------

interface RegistryStorage {
  fleets: Map<string, Fleet>;
  registrations: Map<string, FleetRegistration>; // agentId -> registration
  agents: Map<string, FleetAgent>; // agentId -> agent
  tasks: Map<string, FleetTask>; // taskId -> task
  taskDedup: Map<string, TaskDedup>; // fingerprint -> dedup info
  auditLogs: AuditLog[];
}

// ---------------------------------------------------------------------------
// Fleet Registry Class
// ---------------------------------------------------------------------------

export class FleetRegistry {
  private storage: RegistryStorage;
  private config: FleetConfig;
  private heartbeatTimers: Map<string, NodeJS.Timeout>;
  private deadAgentTimers: Map<string, NodeJS.Timeout>;

  constructor(config: Partial<FleetConfig> = {}) {
    this.storage = {
      fleets: new Map(),
      registrations: new Map(),
      agents: new Map(),
      tasks: new Map(),
      taskDedup: new Map(),
      auditLogs: [],
    };
    this.config = { ...DEFAULT_FLEET_CONFIG, ...config };
    this.heartbeatTimers = new Map();
    this.deadAgentTimers = new Map();
  }

  // ---------------------------------------------------------------------------
  // Fleet CRUD
  // ---------------------------------------------------------------------------

  /**
   * Create a new fleet
   */
  createFleet(name: string, leaderId: string, topology: Fleet['topology'] = 'star'): Fleet {
    const fleetId = this.generateId('fleet');
    const now = Date.now();

    const fleet: Fleet = {
      id: fleetId,
      name,
      leaderId,
      agents: [],
      tasks: [],
      topology,
      createdAt: now,
    };

    this.storage.fleets.set(fleetId, fleet);

    this.addAuditLog({
      id: this.generateId('audit'),
      fleetId,
      timestamp: now,
      actor: 'system',
      action: 'fleet.created',
      target: fleetId,
      details: { name, leaderId, topology },
    });

    return fleet;
  }

  /**
   * Get fleet by ID
   */
  getFleet(fleetId: string): Fleet | undefined {
    return this.storage.fleets.get(fleetId);
  }

  /**
   * Get all fleets
   */
  getAllFleets(): Fleet[] {
    return Array.from(this.storage.fleets.values());
  }

  /**
   * Update fleet
   */
  updateFleet(fleetId: string, updates: Partial<Fleet>): Fleet | undefined {
    const fleet = this.storage.fleets.get(fleetId);
    if (!fleet) return undefined;

    const updated = { ...fleet, ...updates };
    this.storage.fleets.set(fleetId, updated);

    this.addAuditLog({
      id: this.generateId('audit'),
      fleetId,
      timestamp: Date.now(),
      actor: 'system',
      action: 'fleet.updated',
      target: fleetId,
      details: updates,
    });

    return updated;
  }

  /**
   * Delete fleet
   */
  deleteFleet(fleetId: string): boolean {
    const fleet = this.storage.fleets.get(fleetId);
    if (!fleet) return false;

    // Remove all agents from fleet
    for (const agent of fleet.agents) {
      this.storage.registrations.delete(agent.id);
    }

    this.storage.fleets.delete(fleetId);

    this.addAuditLog({
      id: this.generateId('audit'),
      fleetId,
      timestamp: Date.now(),
      actor: 'system',
      action: 'fleet.deleted',
      target: fleetId,
      details: {},
    });

    return true;
  }

  // ---------------------------------------------------------------------------
  // Agent Registration
  // ---------------------------------------------------------------------------

  /**
   * Register agent to fleet (creates new fleet or joins existing)
   */
  registerAgent(
    agentId: string,
    agentCard: { name: string; url: string },
    capabilities: { skills: string[]; modules?: string[]; compute?: any; leadershipPriority?: number },
    desiredFleetId?: string,
    preferredRole?: FleetRole
  ): {
    fleetId: string;
    role: FleetRole;
    leaderId: string;
    peers: FleetAgent[];
  } {
    const now = Date.now();
    let fleetId: string;
    let role: FleetRole;

    if (desiredFleetId) {
      // Join existing fleet
      const fleet = this.storage.fleets.get(desiredFleetId);
      if (!fleet) {
        throw new Error(`Fleet not found: ${desiredFleetId}`);
      }

      fleetId = desiredFleetId;
      role = preferredRole || 'worker';

      // Add agent to fleet
      const agent: FleetAgent = {
        id: agentId,
        name: agentCard.name,
        role,
        skills: capabilities.skills,
        status: 'idle' as AgentStatus,
        instanceUrl: agentCard.url,
        lastHeartbeat: now,
        load: 0,
        successRate: 1.0,
        uptime: 0,
      };

      fleet.agents.push(agent);
      this.storage.agents.set(agentId, agent);
      this.storage.registrations.set(agentId, {
        fleetId,
        agentId,
        role,
        capabilities: {
          skills: capabilities.skills,
          modules: capabilities.modules || [],
          compute: capabilities.compute || {},
          ...(capabilities.leadershipPriority !== undefined && { leadershipPriority: capabilities.leadershipPriority }),
        },
        endpoint: agentCard.url,
        lastSeen: now,
        status: 'idle' as AgentStatus,
      });

      // Start heartbeat monitoring
      this.startHeartbeatMonitoring(agentId, fleetId);

      this.addAuditLog({
        id: this.generateId('audit'),
        fleetId,
        timestamp: now,
        actor: agentId,
        action: 'agent.joined',
        target: fleetId,
        details: { role },
      });

      return {
        fleetId,
        role,
        leaderId: fleet.leaderId,
        peers: fleet.agents.filter(a => a.id !== agentId),
      };
    } else {
      // Create new fleet (first agent becomes leader)
      role = 'leader';
      fleetId = this.generateId('fleet');

      const fleet = this.createFleet(`fleet-${agentId}`, agentId, 'star');

      const agent: FleetAgent = {
        id: agentId,
        name: agentCard.name,
        role,
        skills: capabilities.skills,
        status: 'idle' as AgentStatus,
        instanceUrl: agentCard.url,
        lastHeartbeat: now,
        load: 0,
        successRate: 1.0,
        uptime: 0,
      };

      fleet.agents.push(agent);
      this.storage.agents.set(agentId, agent);
      this.storage.registrations.set(agentId, {
        fleetId,
        agentId,
        role,
        capabilities: {
          skills: capabilities.skills,
          modules: capabilities.modules || [],
          compute: capabilities.compute || {},
          ...(capabilities.leadershipPriority !== undefined && { leadershipPriority: capabilities.leadershipPriority }),
        },
        endpoint: agentCard.url,
        lastSeen: now,
        status: 'idle' as AgentStatus,
      });

      // Start heartbeat monitoring
      this.startHeartbeatMonitoring(agentId, fleetId);

      this.addAuditLog({
        id: this.generateId('audit'),
        fleetId,
        timestamp: now,
        actor: agentId,
        action: 'agent.joined',
        target: fleetId,
        details: { role },
      });

      return {
        fleetId,
        role,
        leaderId: agentId,
        peers: [],
      };
    }
  }

  /**
   * Unregister agent from fleet
   */
  unregisterAgent(agentId: string): boolean {
    const registration = this.storage.registrations.get(agentId);
    if (!registration) return false;

    const fleet = this.storage.fleets.get(registration.fleetId);
    if (!fleet) return false;

    // Remove from fleet's agent list
    fleet.agents = fleet.agents.filter(a => a.id !== agentId);

    // Clear timers
    const heartbeatTimer = this.heartbeatTimers.get(agentId);
    if (heartbeatTimer) {
      clearTimeout(heartbeatTimer);
      this.heartbeatTimers.delete(agentId);
    }

    const deadAgentTimer = this.deadAgentTimers.get(agentId);
    if (deadAgentTimer) {
      clearTimeout(deadAgentTimer);
      this.deadAgentTimers.delete(agentId);
    }

    // Remove from storage
    this.storage.registrations.delete(agentId);
    this.storage.agents.delete(agentId);

    this.addAuditLog({
      id: this.generateId('audit'),
      fleetId: registration.fleetId,
      timestamp: Date.now(),
      actor: agentId,
      action: 'agent.left',
      target: registration.fleetId,
      details: {},
    });

    return true;
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): FleetAgent | undefined {
    return this.storage.agents.get(agentId);
  }

  /**
   * Get all agents in fleet
   */
  getFleetAgents(fleetId: string): FleetAgent[] {
    const fleet = this.storage.fleets.get(fleetId);
    return fleet?.agents || [];
  }

  // ---------------------------------------------------------------------------
  // Heartbeat Tracking
  // ---------------------------------------------------------------------------

  /**
   * Update agent heartbeat
   */
  updateHeartbeat(
    agentId: string,
    status: AgentStatus,
    currentTaskId?: string,
    load = 0
  ): boolean {
    const agent = this.storage.agents.get(agentId);
    if (!agent) return false;

    const now = Date.now();
    agent.lastHeartbeat = now;
    agent.status = status;
    if (currentTaskId !== undefined) {
      agent.currentTask = currentTaskId;
    }
    agent.load = load;
    agent.uptime = Math.floor((now - (agent.lastHeartbeat - agent.uptime * 1000)) / 1000);

    const registration = this.storage.registrations.get(agentId);
    if (registration) {
      registration.lastSeen = now;
      registration.status = status;
    }

    // Reset timers
    this.resetHeartbeatTimers(agentId, agent);

    return true;
  }

  /**
   * Start heartbeat monitoring for agent
   */
  private startHeartbeatMonitoring(agentId: string, fleetId: string): void {
    const config = this.config;

    // Heartbeat timeout timer (degraded)
    const heartbeatTimer = setTimeout(() => {
      this.handleHeartbeatTimeout(agentId, fleetId, 'degraded');
    }, config.heartbeatTimeout);

    this.heartbeatTimers.set(agentId, heartbeatTimer);

    // Dead agent timer (offline)
    const deadAgentTimer = setTimeout(() => {
      this.handleDeadAgent(agentId, fleetId);
    }, config.deadAgentTimeout);

    this.deadAgentTimers.set(agentId, deadAgentTimer);
  }

  /**
   * Reset heartbeat timers after successful heartbeat
   */
  private resetHeartbeatTimers(agentId: string, agent: FleetAgent): void {
    const config = this.config;

    // Clear existing timers
    const heartbeatTimer = this.heartbeatTimers.get(agentId);
    if (heartbeatTimer) {
      clearTimeout(heartbeatTimer);
    }

    const deadAgentTimer = this.deadAgentTimers.get(agentId);
    if (deadAgentTimer) {
      clearTimeout(deadAgentTimer);
    }

    // Get fleet ID
    const registration = this.storage.registrations.get(agentId);
    if (!registration) return;

    // Restart timers
    this.startHeartbeatMonitoring(agentId, registration.fleetId);
  }

  /**
   * Handle heartbeat timeout (mark agent as degraded)
   */
  private handleHeartbeatTimeout(agentId: string, fleetId: string, level: 'degraded'): void {
    const agent = this.storage.agents.get(agentId);
    if (!agent) return;

    agent.status = level;

    this.addAuditLog({
      id: this.generateId('audit'),
      fleetId,
      timestamp: Date.now(),
      actor: 'system',
      action: 'agent.degraded',
      target: agentId,
      details: { lastHeartbeat: agent.lastHeartbeat },
    });
  }

  /**
   * Handle dead agent (mark as offline and reassign tasks)
   */
  private handleDeadAgent(agentId: string, fleetId: string): void {
    const agent = this.storage.agents.get(agentId);
    if (!agent) return;

    agent.status = 'offline';

    this.addAuditLog({
      id: this.generateId('audit'),
      fleetId,
      timestamp: Date.now(),
      actor: 'system',
      action: 'agent.offline',
      target: agentId,
      details: { lastHeartbeat: agent.lastHeartbeat },
    });

    // Get agent's active tasks
    const activeTasks = Array.from(this.storage.tasks.values()).filter(
      t => t.assignedTo === agentId && t.status !== 'completed'
    );

    // Mark tasks for reassignment
    for (const task of activeTasks) {
      task.status = 'pending';
      delete task.assignedTo;

      this.addAuditLog({
        id: this.generateId('audit'),
        fleetId,
        timestamp: Date.now(),
        actor: 'system',
        action: 'task.reassigned',
        target: task.id,
        details: { fromAgent: agentId, reason: 'agent-offline' },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Task Management
  // ---------------------------------------------------------------------------

  /**
   * Create task
   */
  createTask(task: Omit<FleetTask, 'id' | 'createdAt' | 'retryCount'>): FleetTask {
    const taskId = this.generateId('task');
    const now = Date.now();

    const newTask: FleetTask = {
      ...task,
      id: taskId,
      createdAt: now,
      retryCount: 0,
    };

    this.storage.tasks.set(taskId, newTask);

    // Add to fleet
    const fleet = this.storage.fleets.get(task.fleetId);
    if (fleet) {
      fleet.tasks.push(newTask);
    }

    return newTask;
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): FleetTask | undefined {
    return this.storage.tasks.get(taskId);
  }

  /**
   * Update task
   */
  updateTask(taskId: string, updates: Partial<FleetTask>): FleetTask | undefined {
    const task = this.storage.tasks.get(taskId);
    if (!task) return undefined;

    const updated = { ...task, ...updates };
    this.storage.tasks.set(taskId, updated);

    return updated;
  }

  /**
   * Get tasks for agent
   */
  getAgentTasks(agentId: string): FleetTask[] {
    return Array.from(this.storage.tasks.values()).filter(
      t => t.assignedTo === agentId && t.status !== 'completed'
    );
  }

  /**
   * Get all tasks for fleet
   */
  getFleetTasks(fleetId: string): FleetTask[] {
    return Array.from(this.storage.tasks.values()).filter(t => t.fleetId === fleetId);
  }

  // ---------------------------------------------------------------------------
  // Task Deduplication
  // ---------------------------------------------------------------------------

  /**
   * Check for duplicate task
   */
  checkDuplicate(fingerprint: string): boolean {
    const existing = this.storage.taskDedup.get(fingerprint);
    return existing?.status === 'pending';
  }

  /**
   * Register task fingerprint
   */
  registerTaskFingerprint(fingerprint: string, agentId: string): void {
    const existing = this.storage.taskDedup.get(fingerprint);

    if (existing) {
      existing.assignedTo.push(agentId);
    } else {
      this.storage.taskDedup.set(fingerprint, {
        fingerprint,
        assignedTo: [agentId],
        status: 'pending',
      });
    }
  }

  /**
   * Mark task fingerprint as complete
   */
  completeTaskFingerprint(fingerprint: string): void {
    const dedup = this.storage.taskDedup.get(fingerprint);
    if (dedup) {
      dedup.status = 'complete';
    }
  }

  // ---------------------------------------------------------------------------
  // Audit Logging
  // ---------------------------------------------------------------------------

  /**
   * Add audit log entry
   */
  addAuditLog(log: AuditLog): void {
    this.storage.auditLogs.push(log);

    // Prune old logs based on retention policy
    const cutoff = Date.now() - this.config.auditLogRetention;
    this.storage.auditLogs = this.storage.auditLogs.filter(log => log.timestamp > cutoff);
  }

  /**
   * Get audit logs for fleet
   */
  getAuditLogs(fleetId: string, limit = 100): AuditLog[] {
    return this.storage.auditLogs
      .filter(log => log.fleetId === fleetId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  // ---------------------------------------------------------------------------
  // Utility Methods
  // ---------------------------------------------------------------------------

  /**
   * Generate unique ID
   */
  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    // Clear all timers
    for (const timer of this.heartbeatTimers.values()) {
      clearTimeout(timer);
    }
    for (const timer of this.deadAgentTimers.values()) {
      clearTimeout(timer);
    }

    this.heartbeatTimers.clear();
    this.deadAgentTimers.clear();
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

export const fleetRegistry = new FleetRegistry();
