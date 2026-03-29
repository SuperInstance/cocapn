/**
 * Fleet Manager
 *
 * Manages fleet lifecycle, task distribution, and leader election.
 */

import type {
  Fleet,
  FleetAgent,
  FleetTask,
  FleetRole,
  Subtask,
  DecompositionStrategy,
  TaskSplitResult,
  FleetConfig,
} from './types.js';
import { FleetRegistry } from './fleet-registry.js';
import { TaskSplitter, taskSplitter } from './task-splitter.js';
import { DEFAULT_FLEET_CONFIG } from './types.js';

// ---------------------------------------------------------------------------
// Fleet Manager Class
// ---------------------------------------------------------------------------

export class FleetManager {
  private registry: FleetRegistry;
  private splitter: TaskSplitter;
  private config: FleetConfig;

  constructor(
    registry?: FleetRegistry,
    splitter?: TaskSplitter,
    config: Partial<FleetConfig> = {}
  ) {
    this.registry = registry || new FleetRegistry(config);
    this.splitter = splitter || taskSplitter;
    this.config = { ...DEFAULT_FLEET_CONFIG, ...config };
  }

  // ---------------------------------------------------------------------------
  // Fleet Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Create a new fleet
   */
  createFleet(
    name: string,
    initialLeaderId: string,
    topology: Fleet['topology'] = 'star'
  ): Fleet {
    const fleet = this.registry.createFleet(name, initialLeaderId, topology);

    // Register the leader as the first agent
    this.registry.registerAgent(
      initialLeaderId,
      { name: `${name}-leader`, url: '' },
      { skills: [], modules: [], leadershipPriority: 100 },
      fleet.id,
      'leader'
    );

    return fleet;
  }

  /**
   * Join an existing fleet
   */
  joinFleet(
    fleetId: string,
    agentInfo: {
      id: string;
      name: string;
      url: string;
      skills: string[];
      leadershipPriority?: number;
    },
    preferredRole: FleetRole = 'worker'
  ): FleetAgent {
    const fleet = this.registry.getFleet(fleetId);
    if (!fleet) {
      throw new Error(`Fleet not found: ${fleetId}`);
    }

    const result = this.registry.registerAgent(
      agentInfo.id,
      { name: agentInfo.name, url: agentInfo.url },
      {
        skills: agentInfo.skills,
        modules: [],
        ...(agentInfo.leadershipPriority !== undefined && { leadershipPriority: agentInfo.leadershipPriority }),
      },
      fleetId,
      preferredRole
    );

    // Get the agent from the fleet
    const agent = fleet.agents.find(a => a.id === agentInfo.id);
    if (!agent) {
      throw new Error(`Failed to add agent to fleet: ${agentInfo.id}`);
    }

    return agent;
  }

  /**
   * Leave a fleet
   */
  leaveFleet(agentId: string): boolean {
    return this.registry.unregisterAgent(agentId);
  }

  /**
   * Get fleet by ID
   */
  getFleet(fleetId: string): Fleet | undefined {
    return this.registry.getFleet(fleetId);
  }

  /**
   * Get all fleets
   */
  getAllFleets(): Fleet[] {
    return this.registry.getAllFleets();
  }

  // ---------------------------------------------------------------------------
  // Task Distribution
  // ---------------------------------------------------------------------------

  /**
   * Assign task to best-fit agent in fleet
   */
  assignTask(fleetId: string, task: Omit<FleetTask, 'id' | 'createdAt' | 'retryCount' | 'maxRetries'>): FleetTask {
    const fleet = this.registry.getFleet(fleetId);
    if (!fleet) {
      throw new Error(`Fleet not found: ${fleetId}`);
    }

    // Get available agents (exclude offline and degraded)
    const availableAgents = fleet.agents.filter(
      a => a.status !== 'offline' && a.status !== 'degraded'
    );

    if (availableAgents.length === 0) {
      throw new Error('No available agents in fleet');
    }

    // Find best-fit agent based on task requirements
    const subtask: Subtask = {
      id: 'temp',
      description: task.payload?.description || '',
      input: task.payload?.input || {
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: '' }],
      },
      requiredSkills: task.payload?.requiredSkills as string[] | undefined,
      timeout: task.timeout,
      priority: task.priority,
    };

    const scores = this.splitter.determineAgentFit(subtask, availableAgents);

    if (scores.length === 0) {
      throw new Error('No suitable agents found for task');
    }

    const bestAgentId = scores[0]?.agentId;

    if (!bestAgentId) {
      throw new Error('No suitable agents found for task');
    }

    // Create task with assigned agent
    const newTask = this.registry.createTask({
      ...task,
      assignedTo: bestAgentId,
      status: 'assigned',
    });

    // Update agent status
    const agent = fleet.agents.find(a => a.id === bestAgentId);
    if (agent) {
      agent.currentTask = newTask.id;
      agent.status = 'busy';
    }

    return newTask;
  }

  /**
   * Split complex task into subtasks and assign them
   */
  splitAndAssign(
    fleetId: string,
    description: string,
    strategy: DecompositionStrategy,
    input: any,
    priority = 5
  ): {
    parentTask: FleetTask;
    subtasks: FleetTask[];
  } {
    const fleet = this.registry.getFleet(fleetId);
    if (!fleet) {
      throw new Error(`Fleet not found: ${fleetId}`);
    }

    // Split the task
    const splitResult = this.splitter.splitTask(description, strategy, input);

    // Create parent task
    const parentTask = this.registry.createTask({
      fleetId,
      type: 'parent',
      payload: { description, strategy },
      priority,
      status: 'running',
      timeout: this.config.defaultTaskTimeout,
      onTimeout: 'abort',
      maxRetries: this.config.taskRetryLimit,
    });

    // Assign subtasks
    const subtasks: FleetTask[] = [];
    for (const subtask of splitResult.subtasks) {
      const fleetTask = this.assignTask(fleetId, {
        fleetId,
        parentId: parentTask.id,
        type: strategy.type,
        payload: subtask,
        priority,
        status: 'pending',
        timeout: subtask.timeout,
        onTimeout: 'retry',
      });
      subtasks.push(fleetTask);
    }

    return { parentTask, subtasks };
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId: string): FleetTask | undefined {
    return this.registry.getTask(taskId);
  }

  /**
   * Update task status
   */
  updateTaskStatus(
    taskId: string,
    status: FleetTask['status'],
    result?: any
  ): FleetTask | undefined {
    const updates: Partial<FleetTask> = { status };

    if (status === 'completed') {
      updates.completedAt = Date.now();
      updates.result = result;

      // Clear agent's current task
      const task = this.registry.getTask(taskId);
      if (task?.assignedTo) {
        const agent = this.registry.getAgent(task.assignedTo);
        if (agent) {
          delete agent.currentTask;
          agent.status = 'idle';
        }
      }
    }

    return this.registry.updateTask(taskId, updates);
  }

  /**
   * Redistribute tasks from dead/offline agents
   */
  redistributeTasks(fleetId: string): number {
    const fleet = this.registry.getFleet(fleetId);
    if (!fleet) {
      throw new Error(`Fleet not found: ${fleetId}`);
    }

    // Get tasks from offline agents
    const tasksToRedistribute = this.registry.getFleetTasks(fleetId).filter(
      t => t.assignedTo && fleet.agents.find(a => a.id === t.assignedTo && a.status === 'offline')
    );

    let redistributed = 0;

    for (const task of tasksToRedistribute) {
      try {
        // Reassign task - create a new task object without the excluded fields
        const { id, createdAt, retryCount, assignedTo, ...taskData } = task;
        const newTask = this.assignTask(fleetId, {
          ...taskData,
          assignedTo: '' as string, // Temporary, will be reassigned
          status: 'pending',
        });

        // Update original task
        const newAssignedTo = newTask.assignedTo;
        this.registry.updateTask(task.id, {
          ...(newAssignedTo !== undefined && { assignedTo: newAssignedTo }),
          status: newAssignedTo !== undefined ? 'assigned' : 'pending',
        });

        redistributed++;
      } catch (error) {
        // No available agents for this task
        console.error(`Failed to redistribute task ${task.id}:`, error);
      }
    }

    return redistributed;
  }

  // ---------------------------------------------------------------------------
  // Leader Election
  // ---------------------------------------------------------------------------

  /**
   * Elect new leader for fleet
   */
  leaderElection(fleetId: string): FleetAgent | undefined {
    const fleet = this.registry.getFleet(fleetId);
    if (!fleet) {
      throw new Error(`Fleet not found: ${fleetId}`);
    }

    // Get candidates (active agents)
    const candidates = fleet.agents.filter(
      a => a.status !== 'offline' && a.status !== 'degraded'
    );

    if (candidates.length === 0) {
      throw new Error('No candidates for leader election');
    }

    // Sort by leadership priority, then load, then uptime
    candidates.sort((a, b) => {
      // Check leadership priority (from registration)
      const aReg = this.registry.getAgent(a.id);
      const bReg = this.registry.getAgent(b.id);

      // Prioritize idle agents over busy ones
      if (a.status === 'idle' && b.status === 'busy') return -1;
      if (a.status === 'busy' && b.status === 'idle') return 1;

      // Then by load (lower is better)
      if (a.load !== b.load) return a.load - b.load;

      // Then by uptime (longer is better)
      return b.uptime - a.uptime;
    });

    const newLeader = candidates[0];

    if (!newLeader) {
      throw new Error('No candidates for leader election');
    }

    // Update fleet
    this.registry.updateFleet(fleetId, { leaderId: newLeader.id });

    // Update agent roles
    for (const agent of fleet.agents) {
      if (agent.id === newLeader.id) {
        agent.role = 'leader';
      } else if (agent.role === 'leader') {
        agent.role = 'worker'; // Demote old leader to worker
      }
    }

    return newLeader;
  }

  /**
   * Handle leader failure (elect new leader)
   */
  handleLeaderFailure(fleetId: string): FleetAgent | undefined {
    const fleet = this.registry.getFleet(fleetId);
    if (!fleet) {
      throw new Error(`Fleet not found: ${fleetId}`);
    }

    const currentLeader = fleet.agents.find(a => a.id === fleet.leaderId);

    // Check if leader is actually offline
    if (currentLeader && currentLeader.status !== 'offline') {
      return currentLeader; // Leader is still alive
    }

    // Elect new leader
    return this.leaderElection(fleetId);
  }

  // ---------------------------------------------------------------------------
  // Agent Management
  // ---------------------------------------------------------------------------

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): FleetAgent | undefined {
    return this.registry.getAgent(agentId);
  }

  /**
   * Get all agents in fleet
   */
  getFleetAgents(fleetId: string): FleetAgent[] {
    return this.registry.getFleetAgents(fleetId);
  }

  /**
   * Update agent heartbeat
   */
  updateHeartbeat(
    agentId: string,
    status: FleetAgent['status'],
    currentTaskId?: string,
    load = 0
  ): boolean {
    return this.registry.updateHeartbeat(agentId, status, currentTaskId, load);
  }

  // ---------------------------------------------------------------------------
  // Task Results
  // ---------------------------------------------------------------------------

  /**
   * Merge subtask results
   */
  mergeSubtaskResults(
    parentTaskId: string,
    results: Array<{ subtaskId: string; result: any }>,
    mergeStrategy: 'concat' | 'vote' | 'quorum' | 'custom'
  ): { success: boolean; result?: any; errors: string[] } {
    const mergeResult = this.splitter.mergeResults(results, mergeStrategy);

    // Update parent task
    if (mergeResult.success) {
      this.registry.updateTask(parentTaskId, {
        result: mergeResult.result,
        status: 'completed',
        completedAt: Date.now(),
      });
    } else {
      this.registry.updateTask(parentTaskId, {
        status: 'failed',
      });
    }

    return mergeResult;
  }

  // ---------------------------------------------------------------------------
  // Registry Access
  // ---------------------------------------------------------------------------

  /**
   * Get underlying registry
   */
  getRegistry(): FleetRegistry {
    return this.registry;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.registry.destroy();
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

export const fleetManager = new FleetManager();
