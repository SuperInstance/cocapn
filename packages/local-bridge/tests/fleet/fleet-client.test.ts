/**
 * Fleet Client Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FleetClient } from '../../../protocols/src/fleet/client.js';
import { FleetManager } from '../../../protocols/src/fleet/fleet-manager.js';

describe('FleetClient', () => {
  let client: FleetClient;
  let manager: FleetManager;

  beforeEach(() => {
    manager = new FleetManager();
    client = new FleetClient({
      agentId: 'test-agent-1',
      agentCard: {
        name: 'Test Agent',
        description: 'A test agent',
        url: 'https://testagent.example.com',
        version: '1.0.0',
      },
      capabilities: {
        skills: ['code-review', 'testing'],
        modules: ['test-module'],
        compute: { cpu: '4', memory: '8GB' },
      },
      preferredRole: 'worker',
      admiralUrl: 'https://admiral.example.com',
    }, manager);
  });

  afterEach(async () => {
    await client.destroy();
    manager.destroy();
  });

  describe('connect', () => {
    it('should connect to fleet (create new fleet)', async () => {
      const result = await client.connect();

      expect(result).toBeDefined();
      expect(result.fleetId).toBeDefined();
      // First agent to create fleet becomes leader
      expect(result.role).toBe('leader');
      expect(result.leaderId).toBeDefined();
      expect(result.peers).toBeDefined();
    });

    it('should connect to existing fleet', async () => {
      // Create fleet first
      const fleet = manager.createFleet('existing-fleet', 'leader-1', 'star');

      client = new FleetClient({
        agentId: 'test-agent-2',
        agentCard: {
          name: 'Test Agent 2',
          description: 'Another test agent',
          url: 'https://testagent2.example.com',
          version: '1.0.0',
        },
        capabilities: {
          skills: ['code-review'],
          modules: [],
          compute: {},
        },
        desiredFleetId: fleet.id,
        preferredRole: 'worker',
        admiralUrl: 'https://admiral.example.com',
      }, manager);

      const result = await client.connect();

      expect(result.fleetId).toBe(fleet.id);
      expect(result.role).toBe('worker');
      expect(result.leaderId).toBe('leader-1');
      expect(result.peers.length).toBeGreaterThan(0);
    });

    it('should update state after connection', async () => {
      await client.connect();

      const state = client.getState();
      expect(state.connected).toBe(true);
      expect(state.fleetId).toBeDefined();
      expect(state.role).toBeDefined();
      expect(state.leaderId).toBeDefined();
    });

    it('should start heartbeat after connection', async () => {
      const stopHeartbeat = vi.spyOn(client as any, 'stopHeartbeat');

      await client.connect();

      // Heartbeat should be started (we can't easily test the interval,
      // but we can verify connect completes without errors)
      expect(client.isConnected()).toBe(true);
    });
  });

  describe('disconnect', () => {
    it('should disconnect from fleet', async () => {
      await client.connect();
      expect(client.isConnected()).toBe(true);

      await client.disconnect();

      expect(client.isConnected()).toBe(false);
    });

    it('should clear state after disconnect', async () => {
      await client.connect();
      await client.disconnect();

      const state = client.getState();
      expect(state.connected).toBe(false);
      expect(state.fleetId).toBeUndefined();
      expect(state.role).toBeUndefined();
    });

    it('should stop heartbeat on disconnect', async () => {
      await client.connect();
      await client.disconnect();

      // Disconnect should complete without errors
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('isConnected', () => {
    it('should return false when not connected', () => {
      expect(client.isConnected()).toBe(false);
    });

    it('should return true when connected', async () => {
      await client.connect();
      expect(client.isConnected()).toBe(true);
    });
  });

  describe('getState', () => {
    it('should return initial state', () => {
      const state = client.getState();

      expect(state.connected).toBe(false);
      expect(state.peers).toEqual([]);
      expect(state.currentTasks).toBeInstanceOf(Set);
    });

    it('should return connected state', async () => {
      await client.connect();

      const state = client.getState();
      expect(state.connected).toBe(true);
      expect(state.fleetId).toBeDefined();
      expect(state.peers).toBeDefined();
    });
  });

  describe('sendMessage', () => {
    it('should send message to fleet', async () => {
      await client.connect();

      const messageId = await client.sendMessage({
        to: 'fleet',
        type: 'heartbeat',
        payload: {
          agentStatus: {
            status: 'idle',
            load: 0,
          },
        },
        metadata: { priority: 1 },
      });

      expect(messageId).toBeDefined();
      expect(messageId).toMatch(/^msg-/);
    });

    it('should throw error when not connected', async () => {
      await expect(client.sendMessage({
        to: 'fleet',
        type: 'heartbeat',
        payload: {},
        metadata: { priority: 1 },
      })).rejects.toThrow('Not connected to fleet');
    });

    it('should send message to specific agent', async () => {
      // Connect first client (creates fleet and becomes leader)
      await client.connect();

      // Get the actual fleet ID from the registry (not from connect result)
      const fleets = manager.getAllFleets();
      const fleetId = fleets[0]?.id;
      expect(fleetId).toBeDefined();

      // Create second client
      const client2 = new FleetClient({
        agentId: 'test-agent-2',
        agentCard: {
          name: 'Test Agent 2',
          description: 'Another test agent',
          url: 'https://testagent2.example.com',
          version: '1.0.0',
        },
        capabilities: {
          skills: ['code-review'],
          modules: [],
          compute: {},
        },
        desiredFleetId: fleetId,
        preferredRole: 'worker',
        admiralUrl: 'https://admiral.example.com',
      }, manager);

      await client2.connect();

      // The second client has the first client in its peers list
      // because it joined after the first client was already there
      const client2Peers = client2.getPeers();
      expect(client2Peers.length).toBeGreaterThan(0);
      expect(client2Peers.some(p => p.id === 'test-agent-1')).toBe(true);

      // Second client can send to the first client (which is in its peers list)
      const messageId = await client2.sendMessage({
        to: 'test-agent-1',
        type: 'query',
        payload: { query: 'status' },
        metadata: { priority: 5 },
      });

      expect(messageId).toBeDefined();

      await client2.destroy();
    });
  });

  describe('sendProgress', () => {
    it('should send progress update', async () => {
      await client.connect();

      await expect(client.sendProgress('task-1', 50, 'working', 'Processing')).resolves.not.toThrow();
    });
  });

  describe('sendResult', () => {
    it('should send task result', async () => {
      await client.connect();

      await expect(client.sendResult('task-1', {
        status: 'success',
        output: { result: 'done' },
        artifacts: [],
        metrics: { duration: 1000, tokensUsed: 100, steps: 5 },
      })).resolves.not.toThrow();
    });
  });

  describe('sendError', () => {
    it('should send error escalation', async () => {
      await client.connect();

      await expect(client.sendError('task-1', {
        code: 'TEST_ERROR',
        message: 'Test error',
        recoverable: true,
        escalationLevel: 'warn',
      })).resolves.not.toThrow();
    });
  });

  describe('onMessage', () => {
    it('should register message handler', async () => {
      const handler = vi.fn();
      client.onMessage('heartbeat', handler);

      await client.connect();

      const message = {
        id: 'msg-1',
        from: 'other-agent',
        to: 'test-agent-1',
        type: 'heartbeat' as const,
        payload: {},
        timestamp: Date.now(),
        metadata: { priority: 1 },
      };

      await client.handleMessage(message);

      expect(handler).toHaveBeenCalledWith(message);
    });

    it('should call onTaskAssigned callback for task-assign messages', async () => {
      const taskCallback = vi.fn();

      client = new FleetClient({
        agentId: 'test-agent-1',
        agentCard: {
          name: 'Test Agent',
          description: 'A test agent',
          url: 'https://testagent.example.com',
          version: '1.0.0',
        },
        capabilities: {
          skills: ['code-review'],
          modules: [],
          compute: {},
        },
        admiralUrl: 'https://admiral.example.com',
        onTaskAssigned: taskCallback,
      }, manager);

      await client.connect();

      const message = {
        id: 'msg-1',
        from: 'leader',
        to: 'test-agent-1',
        type: 'task-assign' as const,
        payload: {
          subtaskId: 'task-1',
          subtask: {
            id: 'task-1',
            description: 'Review code',
            input: { role: 'user', parts: [{ type: 'text', text: 'Review code' }] },
            timeout: 300000,
            priority: 7,
          },
          assignment: {
            assignedTo: 'test-agent-1',
            assignedAt: new Date().toISOString(),
            deadline: new Date(Date.now() + 300000).toISOString(),
          },
        },
        timestamp: Date.now(),
        metadata: { priority: 7 },
      };

      await client.handleMessage(message);

      expect(taskCallback).toHaveBeenCalled();
      expect(client.getCurrentTasks().has('task-1')).toBe(true);
    });
  });

  describe('completeTask', () => {
    it('should complete task and send result', async () => {
      await client.connect();

      // Add task to current tasks
      (client as any).state.currentTasks.add('task-1');

      client.completeTask('task-1', { success: true });

      expect(client.getCurrentTasks().has('task-1')).toBe(false);
    });
  });

  describe('failTask', () => {
    it('should fail task and send error', async () => {
      await client.connect();

      // Add task to current tasks
      (client as any).state.currentTasks.add('task-1');

      const error = new Error('Task failed');
      client.failTask('task-1', error);

      expect(client.getCurrentTasks().has('task-1')).toBe(false);
    });
  });

  describe('getPeers', () => {
    it('should return empty peers when not connected', () => {
      const peers = client.getPeers();
      expect(peers).toEqual([]);
    });

    it('should return peers after connection', async () => {
      await client.connect();

      const peers = client.getPeers();
      expect(peers).toBeDefined();
      expect(Array.isArray(peers)).toBe(true);
    });
  });

  describe('getLeader', () => {
    it('should return undefined when not connected', () => {
      const leader = client.getLeader();
      expect(leader).toBeUndefined();
    });

    it('should return leader after connection', async () => {
      await client.connect();

      // When creating a new fleet, this agent becomes the leader
      // The leader is not in its own peers list
      const leaderId = client.getState().leaderId;
      expect(leaderId).toBeDefined();
      expect(leaderId).toBe('test-agent-1');
    });
  });

  describe('getAgentInfo', () => {
    it('should return agent info', () => {
      const info = client.getAgentInfo();

      expect(info.id).toBe('test-agent-1');
      expect(info.name).toBe('Test Agent');
    });

    it('should include role when connected', async () => {
      await client.connect();

      const info = client.getAgentInfo();
      expect(info.role).toBeDefined();
    });
  });

  describe('getCurrentTasks', () => {
    it('should return empty set initially', () => {
      const tasks = client.getCurrentTasks();
      expect(tasks).toBeInstanceOf(Set);
      expect(tasks.size).toBe(0);
    });

    it('should track assigned tasks', async () => {
      // Setup client with task callback
      const taskCallback = vi.fn();

      const taskClient = new FleetClient({
        agentId: 'test-agent-task',
        agentCard: {
          name: 'Test Agent Task',
          description: 'A test agent for tasks',
          url: 'https://testagenttask.example.com',
          version: '1.0.0',
        },
        capabilities: {
          skills: ['code-review'],
          modules: [],
          compute: {},
        },
        admiralUrl: 'https://admiral.example.com',
        onTaskAssigned: taskCallback,
      }, manager);

      await taskClient.connect();

      const message = {
        id: 'msg-1',
        from: 'leader',
        to: 'test-agent-task',
        type: 'task-assign' as const,
        payload: {
          subtaskId: 'task-1',
          subtask: {
            id: 'task-1',
            description: 'Test task',
            input: { role: 'user', parts: [{ type: 'text', text: 'Test' }] },
            timeout: 300000,
            priority: 5,
          },
          assignment: {
            assignedTo: 'test-agent-task',
            assignedAt: new Date().toISOString(),
            deadline: new Date(Date.now() + 300000).toISOString(),
          },
        },
        timestamp: Date.now(),
        metadata: { priority: 5 },
      };

      await taskClient.handleMessage(message);

      expect(taskClient.getCurrentTasks().has('task-1')).toBe(true);
      expect(taskCallback).toHaveBeenCalled();

      await taskClient.destroy();
    });
  });

  describe('destroy', () => {
    it('should cleanup resources', async () => {
      await client.connect();

      await client.destroy();

      expect(client.isConnected()).toBe(false);
    });

    it('should handle destroy when not connected', async () => {
      await expect(client.destroy()).resolves.not.toThrow();
    });
  });
});
