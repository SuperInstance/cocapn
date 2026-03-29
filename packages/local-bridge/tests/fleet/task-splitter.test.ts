/**
 * Task Splitter Tests
 */

import { describe, it, expect } from 'vitest';
import { TaskSplitter, taskSplitter } from '../../../protocols/src/fleet/task-splitter.js';
import type { FleetAgent, DecompositionStrategy } from '../../../protocols/src/fleet/types.js';

describe('TaskSplitter', () => {
  describe('splitTask - parallel', () => {
    it('should split task into parallel subtasks', () => {
      const splitter = new TaskSplitter();

      const strategy: DecompositionStrategy = {
        type: 'parallel',
        subtasks: [
          {
            id: 'sub-1',
            description: 'Review auth.ts',
            input: { role: 'user', parts: [{ type: 'text', text: 'Review auth.ts' }] },
            timeout: 300000,
            priority: 7,
          },
          {
            id: 'sub-2',
            description: 'Review user.ts',
            input: { role: 'user', parts: [{ type: 'text', text: 'Review user.ts' }] },
            timeout: 300000,
            priority: 7,
          },
        ],
        mergeStrategy: 'concat',
      };

      const result = splitter.splitTask('Review the auth system', strategy, {});

      expect(result.subtasks).toHaveLength(2);
      expect(result.mergeStrategy).toBe('concat');
      expect(result.estimatedDuration).toBe(300000);
    });

    it('should calculate duration based on longest subtask', () => {
      const splitter = new TaskSplitter();

      const strategy: DecompositionStrategy = {
        type: 'parallel',
        subtasks: [
          {
            id: 'sub-1',
            description: 'Quick task',
            input: { role: 'user', parts: [{ type: 'text', text: '' }] },
            timeout: 60000,
            priority: 5,
          },
          {
            id: 'sub-2',
            description: 'Long task',
            input: { role: 'user', parts: [{ type: 'text', text: '' }] },
            timeout: 300000,
            priority: 5,
          },
        ],
        mergeStrategy: 'concat',
      };

      const result = splitter.splitTask('Test', strategy, {});

      expect(result.estimatedDuration).toBe(300000);
    });
  });

  describe('splitTask - sequential', () => {
    it('should split task into sequential stages', () => {
      const splitter = new TaskSplitter();

      const strategy: DecompositionStrategy = {
        type: 'sequential',
        stages: [
          {
            name: 'Stage 1',
            outputTo: 'Stage 2',
          },
          {
            name: 'Stage 2',
            outputTo: 'Stage 3',
          },
          {
            name: 'Stage 3',
            outputTo: '',
          },
        ],
      };

      const result = splitter.splitTask('Process data pipeline', strategy, {});

      expect(result.subtasks).toHaveLength(3);
      expect(result.mergeStrategy).toBe('concat');
      expect(result.estimatedDuration).toBe(900000); // 3 stages * 5 minutes
      expect(result.subtasks[0].description).toContain('Stage 1');
    });
  });

  describe('splitTask - map-reduce', () => {
    it('should split task into map-reduce pattern', () => {
      const splitter = new TaskSplitter();

      const strategy: DecompositionStrategy = {
        type: 'map-reduce',
        mapper: {
          input: { role: 'user', parts: [{ type: 'text', text: 'Research GDPR' }] },
          mapFunction: 'web-research',
        },
        reducer: {
          reduceFunction: 'synthesize-findings',
          outputFormat: 'summary',
        },
      };

      const result = splitter.splitTask('Research GDPR compliance', strategy, {});

      expect(result.subtasks).toHaveLength(1);
      expect(result.subtasks[0].description).toContain('Map: web-research');
      expect(result.mergeStrategy).toBe('custom');
      expect(result.estimatedDuration).toBeGreaterThan(0);
    });
  });

  describe('mergeResults - concat', () => {
    it('should concatenate results', () => {
      const splitter = new TaskSplitter();

      const results = [
        { subtaskId: 'sub-1', result: 'First result' },
        { subtaskId: 'sub-2', result: 'Second result' },
      ];

      const merged = splitter.mergeResults(results, 'concat');

      expect(merged.success).toBe(true);
      expect(merged.result).toBe('First result\n\nSecond result');
      expect(merged.errors).toHaveLength(0);
    });

    it('should handle empty results', () => {
      const splitter = new TaskSplitter();

      const merged = splitter.mergeResults([], 'concat');

      expect(merged.success).toBe(true);
      expect(merged.result).toBe('');
    });
  });

  describe('mergeResults - vote', () => {
    it('should select most common result', () => {
      const splitter = new TaskSplitter();

      const results = [
        { subtaskId: 'sub-1', result: 'Option A' },
        { subtaskId: 'sub-2', result: 'Option A' },
        { subtaskId: 'sub-3', result: 'Option B' },
      ];

      const merged = splitter.mergeResults(results, 'vote');

      expect(merged.success).toBe(true);
      expect(merged.result).toBe('Option A');
    });

    it('should handle tie by selecting first', () => {
      const splitter = new TaskSplitter();

      const results = [
        { subtaskId: 'sub-1', result: 'Option A' },
        { subtaskId: 'sub-2', result: 'Option B' },
      ];

      const merged = splitter.mergeResults(results, 'vote');

      expect(merged.success).toBe(true);
      expect(merged.result).toBeDefined();
    });

    it('should handle empty results', () => {
      const splitter = new TaskSplitter();

      const merged = splitter.mergeResults([], 'vote');

      expect(merged.success).toBe(false);
      expect(merged.errors).toContain('No results to vote on');
    });
  });

  describe('mergeResults - quorum', () => {
    it('should succeed when quorum reached', () => {
      const splitter = new TaskSplitter();

      const results = [
        { subtaskId: 'sub-1', result: { status: 'success' } },
        { subtaskId: 'sub-2', result: { status: 'success' } },
        { subtaskId: 'sub-3', result: { status: 'failure' } },
      ];

      const merged = splitter.mergeResults(results, 'quorum');

      expect(merged.success).toBe(true);
      expect(merged.result?.message).toContain('2/3');
    });

    it('should fail when quorum not reached', () => {
      const splitter = new TaskSplitter();

      const results = [
        { subtaskId: 'sub-1', result: { status: 'success' } },
        { subtaskId: 'sub-2', result: { status: 'failure' } },
        { subtaskId: 'sub-3', result: { status: 'failure' } },
      ];

      const merged = splitter.mergeResults(results, 'quorum');

      expect(merged.success).toBe(false);
      expect(merged.errors[0]).toContain('Quorum not reached');
    });
  });

  describe('mergeResults - custom', () => {
    it('should return all results for custom merge', () => {
      const splitter = new TaskSplitter();

      const results = [
        { subtaskId: 'sub-1', result: { data: 'a' } },
        { subtaskId: 'sub-2', result: { data: 'b' } },
      ];

      const merged = splitter.mergeResults(results, 'custom');

      expect(merged.success).toBe(true);
      expect(merged.result?.results).toBeDefined();
      expect(merged.result?.count).toBe(2);
    });
  });

  describe('determineAgentFit', () => {
    it('should score agents by skill match', () => {
      const splitter = new TaskSplitter();

      const agents: FleetAgent[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'worker',
          skills: ['code-review'],
          status: 'idle',
          instanceUrl: 'https://agent1.example.com',
          lastHeartbeat: Date.now(),
          load: 0,
          successRate: 1.0,
          uptime: 1000,
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          role: 'worker',
          skills: ['code-review', 'security-audit'],
          status: 'idle',
          instanceUrl: 'https://agent2.example.com',
          lastHeartbeat: Date.now(),
          load: 0,
          successRate: 1.0,
          uptime: 1000,
        },
      ];

      const subtask = {
        id: 'task-1',
        description: 'Review auth.ts',
        input: { role: 'user', parts: [{ type: 'text', text: '' }] },
        requiredSkills: ['code-review', 'security-audit'],
        timeout: 300000,
        priority: 7,
      };

      const scores = splitter.determineAgentFit(subtask, agents);

      expect(scores).toHaveLength(2);
      expect(scores[0].agentId).toBe('agent-2'); // Has both skills
      expect(scores[0].score).toBeGreaterThan(scores[1].score);
    });

    it('should score agents by load', () => {
      const splitter = new TaskSplitter();

      const agents: FleetAgent[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'worker',
          skills: ['code-review'],
          status: 'idle',
          instanceUrl: 'https://agent1.example.com',
          lastHeartbeat: Date.now(),
          load: 0.8, // High load
          successRate: 1.0,
          uptime: 1000,
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          role: 'worker',
          skills: ['code-review'],
          status: 'idle',
          instanceUrl: 'https://agent2.example.com',
          lastHeartbeat: Date.now(),
          load: 0.1, // Low load
          successRate: 1.0,
          uptime: 1000,
        },
      ];

      const subtask = {
        id: 'task-1',
        description: 'Review auth.ts',
        input: { role: 'user', parts: [{ type: 'text', text: '' }] },
        requiredSkills: ['code-review'],
        timeout: 300000,
        priority: 7,
      };

      const scores = splitter.determineAgentFit(subtask, agents);

      expect(scores[0].agentId).toBe('agent-2'); // Lower load
    });

    it('should score agents by success rate', () => {
      const splitter = new TaskSplitter();

      const agents: FleetAgent[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'worker',
          skills: ['code-review'],
          status: 'idle',
          instanceUrl: 'https://agent1.example.com',
          lastHeartbeat: Date.now(),
          load: 0,
          successRate: 0.6,
          uptime: 1000,
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          role: 'worker',
          skills: ['code-review'],
          status: 'idle',
          instanceUrl: 'https://agent2.example.com',
          lastHeartbeat: Date.now(),
          load: 0,
          successRate: 0.95,
          uptime: 1000,
        },
      ];

      const subtask = {
        id: 'task-1',
        description: 'Review auth.ts',
        input: { role: 'user', parts: [{ type: 'text', text: '' }] },
        requiredSkills: ['code-review'],
        timeout: 300000,
        priority: 7,
      };

      const scores = splitter.determineAgentFit(subtask, agents);

      expect(scores[0].agentId).toBe('agent-2'); // Higher success rate
    });

    it('should filter out offline agents', () => {
      const splitter = new TaskSplitter();

      const agents: FleetAgent[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'worker',
          skills: ['code-review'],
          status: 'offline',
          instanceUrl: 'https://agent1.example.com',
          lastHeartbeat: Date.now(),
          load: 0,
          successRate: 1.0,
          uptime: 1000,
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          role: 'worker',
          skills: ['code-review'],
          status: 'idle',
          instanceUrl: 'https://agent2.example.com',
          lastHeartbeat: Date.now(),
          load: 0,
          successRate: 1.0,
          uptime: 1000,
        },
      ];

      const subtask = {
        id: 'task-1',
        description: 'Review auth.ts',
        input: { role: 'user', parts: [{ type: 'text', text: '' }] },
        requiredSkills: ['code-review'],
        timeout: 300000,
        priority: 7,
      };

      const scores = splitter.determineAgentFit(subtask, agents);

      expect(scores).toHaveLength(1);
      expect(scores[0].agentId).toBe('agent-2');
    });

    it('should provide score reasons', () => {
      const splitter = new TaskSplitter();

      const agents: FleetAgent[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'worker',
          skills: ['code-review'],
          status: 'idle',
          instanceUrl: 'https://agent1.example.com',
          lastHeartbeat: Date.now(),
          load: 0.2,
          successRate: 0.95,
          uptime: 1000,
        },
      ];

      const subtask = {
        id: 'task-1',
        description: 'Review auth.ts',
        input: { role: 'user', parts: [{ type: 'text', text: '' }] },
        requiredSkills: ['code-review'],
        timeout: 300000,
        priority: 7,
      };

      const scores = splitter.determineAgentFit(subtask, agents);

      expect(scores[0].reasons).toBeDefined();
      expect(scores[0].reasons.length).toBeGreaterThan(0);
    });
  });

  describe('singleton instance', () => {
    it('should export singleton instance', () => {
      expect(taskSplitter).toBeInstanceOf(TaskSplitter);
    });
  });
});
