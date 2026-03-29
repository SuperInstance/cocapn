/**
 * Fleet Manager Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FleetManager } from '../../../protocols/src/fleet/fleet-manager.js';
import type { Fleet, DecompositionStrategy } from '../../../protocols/src/fleet/types.js';

describe('FleetManager', () => {
  let manager: FleetManager;

  beforeEach(() => {
    manager = new FleetManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('createFleet', () => {
    it('should create a new fleet with star topology', () => {
      const fleet = manager.createFleet('test-fleet', 'leader-1', 'star');

      expect(fleet).toBeDefined();
      expect(fleet.id).toBeDefined();
      expect(fleet.name).toBe('test-fleet');
      expect(fleet.leaderId).toBe('leader-1');
      expect(fleet.topology).toBe('star');
      expect(fleet.agents).toHaveLength(1);
      expect(fleet.agents[0].id).toBe('leader-1');
      expect(fleet.agents[0].role).toBe('leader');
    });

    it('should create a new fleet with mesh topology', () => {
      const fleet = manager.createFleet('mesh-fleet', 'leader-2', 'mesh');

      expect(fleet.topology).toBe('mesh');
    });

    it('should create a new fleet with hierarchical topology', () => {
      const fleet = manager.createFleet('hierarchy-fleet', 'leader-3', 'hierarchical');

      expect(fleet.topology).toBe('hierarchical');
    });
  });

  describe('joinFleet', () => {
    it('should add an agent to existing fleet', () => {
      const fleet = manager.createFleet('test-fleet', 'leader-1', 'star');

      const agent = manager.joinFleet(fleet.id, {
        id: 'worker-1',
        name: 'Worker 1',
        url: 'https://worker1.example.com',
        skills: ['code-review', 'testing'],
      });

      expect(agent).toBeDefined();
      expect(agent.id).toBe('worker-1');
      expect(agent.role).toBe('worker');

      const updatedFleet = manager.getFleet(fleet.id);
      expect(updatedFleet?.agents).toHaveLength(2);
    });

    it('should throw error for non-existent fleet', () => {
      expect(() => {
        manager.joinFleet('non-existent', {
          id: 'worker-1',
          name: 'Worker 1',
          url: 'https://worker1.example.com',
          skills: [],
        });
      }).toThrow('Fleet not found');
    });

    it('should join with preferred role', () => {
      const fleet = manager.createFleet('test-fleet', 'leader-1', 'star');

      const agent = manager.joinFleet(fleet.id, {
        id: 'specialist-1',
        name: 'Specialist 1',
        url: 'https://specialist1.example.com',
        skills: ['security-audit'],
      }, 'specialist');

      expect(agent.role).toBe('specialist');
    });
  });

  describe('leaveFleet', () => {
    it('should remove agent from fleet', () => {
      const fleet = manager.createFleet('test-fleet', 'leader-1', 'star');

      manager.joinFleet(fleet.id, {
        id: 'worker-1',
        name: 'Worker 1',
        url: 'https://worker1.example.com',
        skills: [],
      });

      const left = manager.leaveFleet('worker-1');
      expect(left).toBe(true);

      const updatedFleet = manager.getFleet(fleet.id);
      expect(updatedFleet?.agents).toHaveLength(1);
    });

    it('should return false for non-existent agent', () => {
      const left = manager.leaveFleet('non-existent');
      expect(left).toBe(false);
    });
  });

  describe('assignTask', () => {
    it('should assign task to best-fit agent', () => {
      const fleet = manager.createFleet('test-fleet', 'leader-1', 'star');

      manager.joinFleet(fleet.id, {
        id: 'worker-1',
        name: 'Worker 1',
        url: 'https://worker1.example.com',
        skills: ['code-review'],
      });

      manager.joinFleet(fleet.id, {
        id: 'worker-2',
        name: 'Worker 2',
        url: 'https://worker2.example.com',
        skills: ['code-review', 'security-audit'],
      });

      const task = manager.assignTask(fleet.id, {
        fleetId: fleet.id,
        type: 'code-review',
        payload: {
          description: 'Review auth.ts',
          requiredSkills: ['code-review', 'security-audit'],
        },
        priority: 7,
        status: 'pending',
        timeout: 300000,
        onTimeout: 'retry',
        retryCount: 0,
        maxRetries: 3,
      });

      expect(task).toBeDefined();
      expect(task.assignedTo).toBeDefined();
      // Worker 2 should be assigned (has both required skills)
      expect(task.assignedTo).toBe('worker-2');
    });

    it('should assign task to leader when no workers available', () => {
      const fleet = manager.createFleet('test-fleet', 'leader-1', 'star');

      const task = manager.assignTask(fleet.id, {
        fleetId: fleet.id,
        type: 'test',
        payload: {},
        priority: 5,
        status: 'pending',
        timeout: 300000,
        onTimeout: 'retry',
        retryCount: 0,
        maxRetries: 3,
      });

      // The leader is available, so task should be assigned to them
      expect(task).toBeDefined();
      expect(task.assignedTo).toBe('leader-1');
    });
  });

  describe('splitAndAssign', () => {
    it('should split and assign parallel tasks', () => {
      const fleet = manager.createFleet('test-fleet', 'leader-1', 'star');

      // Add workers
      for (let i = 1; i <= 3; i++) {
        manager.joinFleet(fleet.id, {
          id: `worker-${i}`,
          name: `Worker ${i}`,
          url: `https://worker${i}.example.com`,
          skills: ['code-review'],
        });
      }

      const strategy: DecompositionStrategy = {
        type: 'parallel',
        subtasks: [
          {
            id: 'subtask-1',
            description: 'Review auth.ts',
            input: { role: 'user', parts: [{ type: 'text', text: 'Review auth.ts' }] },
            requiredSkills: ['code-review'],
            timeout: 300000,
            priority: 7,
          },
          {
            id: 'subtask-2',
            description: 'Review user.ts',
            input: { role: 'user', parts: [{ type: 'text', text: 'Review user.ts' }] },
            requiredSkills: ['code-review'],
            timeout: 300000,
            priority: 7,
          },
        ],
        mergeStrategy: 'concat',
      };

      const result = manager.splitAndAssign(
        fleet.id,
        'Review the auth system',
        strategy,
        {},
        7
      );

      expect(result.parentTask).toBeDefined();
      expect(result.subtasks).toHaveLength(2);
      expect(result.subtasks[0].assignedTo).toBeDefined();
      expect(result.subtasks[1].assignedTo).toBeDefined();
    });
  });

  describe('getTaskStatus', () => {
    it('should return task status', () => {
      const fleet = manager.createFleet('test-fleet', 'leader-1', 'star');

      manager.joinFleet(fleet.id, {
        id: 'worker-1',
        name: 'Worker 1',
        url: 'https://worker1.example.com',
        skills: [],
      });

      const task = manager.assignTask(fleet.id, {
        fleetId: fleet.id,
        type: 'test',
        payload: {},
        priority: 5,
        status: 'pending',
        timeout: 300000,
        onTimeout: 'retry',
        retryCount: 0,
        maxRetries: 3,
      });

      const status = manager.getTaskStatus(task.id);
      expect(status).toBeDefined();
      expect(status?.id).toBe(task.id);
      expect(status?.status).toBe('assigned');
    });

    it('should return undefined for non-existent task', () => {
      const status = manager.getTaskStatus('non-existent');
      expect(status).toBeUndefined();
    });
  });

  describe('updateTaskStatus', () => {
    it('should update task status to completed', () => {
      const fleet = manager.createFleet('test-fleet', 'leader-1', 'star');

      manager.joinFleet(fleet.id, {
        id: 'worker-1',
        name: 'Worker 1',
        url: 'https://worker1.example.com',
        skills: [],
      });

      const task = manager.assignTask(fleet.id, {
        fleetId: fleet.id,
        type: 'test',
        payload: {},
        priority: 5,
        status: 'pending',
        timeout: 300000,
        onTimeout: 'retry',
        retryCount: 0,
        maxRetries: 3,
      });

      const updated = manager.updateTaskStatus(task.id, 'completed', { success: true });
      expect(updated?.status).toBe('completed');
      expect(updated?.result).toEqual({ success: true });
      expect(updated?.completedAt).toBeDefined();
    });
  });

  describe('redistributeTasks', () => {
    it('should redistribute tasks from offline agents', () => {
      const fleet = manager.createFleet('test-fleet', 'leader-1', 'star');

      manager.joinFleet(fleet.id, {
        id: 'worker-1',
        name: 'Worker 1',
        url: 'https://worker1.example.com',
        skills: ['code-review'],
      });

      manager.joinFleet(fleet.id, {
        id: 'worker-2',
        name: 'Worker 2',
        url: 'https://worker2.example.com',
        skills: ['code-review'],
      });

      // Assign task - it will be assigned to one of the available agents
      // (could be leader-1, worker-1, or worker-2 based on scoring)
      const task = manager.assignTask(fleet.id, {
        fleetId: fleet.id,
        type: 'test',
        payload: {},
        priority: 5,
        status: 'pending',
        timeout: 300000,
        onTimeout: 'retry',
        retryCount: 0,
        maxRetries: 3,
      });

      const originalAssignee = task.assignedTo;
      expect(originalAssignee).toBeDefined();

      // Mark the assigned agent as offline
      manager.updateHeartbeat(originalAssignee, 'offline');
      const agent = manager.getAgent(originalAssignee);
      expect(agent?.status).toBe('offline');

      // Redistribute tasks
      const count = manager.redistributeTasks(fleet.id);
      expect(count).toBeGreaterThan(0);

      // Check that task was reassigned to a different agent
      const updatedTask = manager.getTaskStatus(task.id);
      expect(updatedTask?.assignedTo).not.toBe(originalAssignee);
    });
  });

  describe('leaderElection', () => {
    it('should elect new leader when current leader fails', () => {
      const fleet = manager.createFleet('test-fleet', 'leader-1', 'star');

      manager.joinFleet(fleet.id, {
        id: 'worker-1',
        name: 'Worker 1',
        url: 'https://worker1.example.com',
        skills: [],
        leadershipPriority: 50,
      });

      manager.joinFleet(fleet.id, {
        id: 'worker-2',
        name: 'Worker 2',
        url: 'https://worker2.example.com',
        skills: [],
        leadershipPriority: 75,
      });

      // Mark current leader as offline
      manager.updateHeartbeat('leader-1', 'offline');

      // Elect new leader
      const newLeader = manager.leaderElection(fleet.id);
      expect(newLeader).toBeDefined();
      expect(newLeader.id).not.toBe('leader-1');
      expect(newLeader.role).toBe('leader');

      const updatedFleet = manager.getFleet(fleet.id);
      expect(updatedFleet?.leaderId).toBe(newLeader.id);
    });

    it('should throw error when no candidates available', () => {
      const fleet = manager.createFleet('test-fleet', 'leader-1', 'star');

      // Mark all agents as offline
      manager.updateHeartbeat('leader-1', 'offline');

      expect(() => {
        manager.leaderElection(fleet.id);
      }).toThrow('No candidates for leader election');
    });
  });

  describe('handleLeaderFailure', () => {
    it('should elect new leader when current leader is offline', () => {
      const fleet = manager.createFleet('test-fleet', 'leader-1', 'star');

      manager.joinFleet(fleet.id, {
        id: 'worker-1',
        name: 'Worker 1',
        url: 'https://worker1.example.com',
        skills: [],
      });

      // Mark leader as offline
      manager.updateHeartbeat('leader-1', 'offline');

      const newLeader = manager.handleLeaderFailure(fleet.id);
      expect(newLeader).toBeDefined();
      expect(newLeader.id).not.toBe('leader-1');
    });

    it('should return current leader if still alive', () => {
      const fleet = manager.createFleet('test-fleet', 'leader-1', 'star');

      const leader = manager.handleLeaderFailure(fleet.id);
      expect(leader?.id).toBe('leader-1');
    });
  });

  describe('getFleetAgents', () => {
    it('should return all agents in fleet', () => {
      const fleet = manager.createFleet('test-fleet', 'leader-1', 'star');

      manager.joinFleet(fleet.id, {
        id: 'worker-1',
        name: 'Worker 1',
        url: 'https://worker1.example.com',
        skills: [],
      });

      manager.joinFleet(fleet.id, {
        id: 'worker-2',
        name: 'Worker 2',
        url: 'https://worker2.example.com',
        skills: [],
      });

      const agents = manager.getFleetAgents(fleet.id);
      expect(agents).toHaveLength(3);
    });
  });

  describe('mergeSubtaskResults', () => {
    it('should merge results with concat strategy', () => {
      const fleet = manager.createFleet('test-fleet', 'leader-1', 'star');

      const parentTask = manager.assignTask(fleet.id, {
        fleetId: fleet.id,
        type: 'parent',
        payload: {},
        priority: 5,
        status: 'pending',
        timeout: 300000,
        onTimeout: 'retry',
        retryCount: 0,
        maxRetries: 3,
      });

      const results = [
        { subtaskId: 'sub-1', result: 'Result 1' },
        { subtaskId: 'sub-2', result: 'Result 2' },
      ];

      const merged = manager.mergeSubtaskResults(parentTask.id, results, 'concat');

      expect(merged.success).toBe(true);
      expect(merged.result).toContain('Result 1');
      expect(merged.result).toContain('Result 2');
    });

    it('should merge results with vote strategy', () => {
      const fleet = manager.createFleet('test-fleet', 'leader-1', 'star');

      const parentTask = manager.assignTask(fleet.id, {
        fleetId: fleet.id,
        type: 'parent',
        payload: {},
        priority: 5,
        status: 'pending',
        timeout: 300000,
        onTimeout: 'retry',
        retryCount: 0,
        maxRetries: 3,
      });

      const results = [
        { subtaskId: 'sub-1', result: 'Option A' },
        { subtaskId: 'sub-2', result: 'Option A' },
        { subtaskId: 'sub-3', result: 'Option B' },
      ];

      const merged = manager.mergeSubtaskResults(parentTask.id, results, 'vote');

      expect(merged.success).toBe(true);
      expect(merged.result).toBe('Option A');
    });
  });
});
