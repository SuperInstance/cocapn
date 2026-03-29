/**
 * Fleet Task Splitter
 *
 * Decomposes complex tasks into subtasks and merges results.
 */

import type {
  Subtask,
  DecompositionStrategy,
  TaskSplitResult,
  MergeResult,
  FleetAgent,
  AgentScore,
  MergeStrategy,
} from './types.js';

// ---------------------------------------------------------------------------
// Task Splitting
// ---------------------------------------------------------------------------

export class TaskSplitter {
  /**
   * Split a complex task into subtasks based on decomposition strategy
   */
  splitTask(
    description: string,
    strategy: DecompositionStrategy,
    input?: any
  ): TaskSplitResult {
    switch (strategy.type) {
      case 'parallel':
        return this.splitParallel(description, strategy);
      case 'sequential':
        return this.splitSequential(description, strategy);
      case 'map-reduce':
        return this.splitMapReduce(description, strategy);
      default:
        throw new Error(`Unknown decomposition strategy: ${(strategy as any).type}`);
    }
  }

  /**
   * Split task into parallel independent subtasks
   */
  private splitParallel(
    description: string,
    strategy: Extract<DecompositionStrategy, { type: 'parallel' }>
  ): TaskSplitResult {
    const subtasks = strategy.subtasks;
    const estimatedDuration = subtasks.length > 0 ? Math.max(...subtasks.map(st => st.timeout)) : 0;

    return {
      subtasks,
      mergeStrategy: strategy.mergeStrategy,
      estimatedDuration,
    };
  }

  /**
   * Split task into sequential stages
   */
  private splitSequential(
    description: string,
    strategy: Extract<DecompositionStrategy, { type: 'sequential' }>
  ): TaskSplitResult {
    const subtasks: Subtask[] = strategy.stages.map((stage, index) => {
      const subtask: Subtask = {
        id: `${this.generateId()}-${index}`,
        description: `${stage.name}: ${description}`,
        input: {
          role: 'user' as const,
          parts: [{ type: 'text' as const, text: description }],
        },
        timeout: 300000, // 5 minutes default per stage
        priority: 5,
      };
      if (stage.assignedTo) {
        subtask.requiredSkills = [stage.assignedTo];
      }
      return subtask;
    });

    const estimatedDuration = subtasks.reduce((sum, st) => sum + st.timeout, 0);

    return {
      subtasks,
      mergeStrategy: 'concat',
      estimatedDuration,
    };
  }

  /**
   * Split task into map-reduce pattern
   */
  private splitMapReduce(
    description: string,
    strategy: Extract<DecompositionStrategy, { type: 'map-reduce' }>
  ): TaskSplitResult {
    // For map-reduce, create a mapper subtask
    const mapperSubtask: Subtask = {
      id: this.generateId(),
      description: `Map: ${strategy.mapper.mapFunction} on ${description}`,
      input: strategy.mapper.input,
      requiredSkills: [strategy.mapper.mapFunction],
      timeout: 300000,
      priority: 5,
    };

    const estimatedDuration = mapperSubtask.timeout + 60000; // Mapper + reducer time

    return {
      subtasks: [mapperSubtask],
      mergeStrategy: 'custom', // Will be handled by reducer
      estimatedDuration,
    };
  }

  /**
   * Merge results from multiple subtasks based on strategy
   */
  mergeResults(
    results: Array<{ subtaskId: string; result: any }>,
    mergeStrategy: MergeStrategy
  ): MergeResult {
    switch (mergeStrategy) {
      case 'concat':
        return this.mergeConcat(results);
      case 'vote':
        return this.mergeVote(results);
      case 'quorum':
        return this.mergeQuorum(results);
      case 'custom':
        return this.mergeCustom(results);
      default:
        throw new Error(`Unknown merge strategy: ${mergeStrategy}`);
    }
  }

  /**
   * Concatenate all results
   */
  private mergeConcat(
    results: Array<{ subtaskId: string; result: any }>
  ): MergeResult {
    const concatenated = results.map(r => r.result).join('\n\n');

    return {
      success: true,
      result: concatenated,
      errors: [],
    };
  }

  /**
   * Vote on best result (requires odd number of agents)
   */
  private mergeVote(
    results: Array<{ subtaskId: string; result: any }>
  ): MergeResult {
    // Count occurrences of each result
    const counts = new Map<string, number>();
    for (const { result } of results) {
      const key = JSON.stringify(result);
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    // Find most common
    let maxCount = 0;
    let winner: string | null = null;
    for (const [key, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        winner = key;
      }
    }

    if (!winner) {
      return {
        success: false,
        errors: ['No results to vote on'],
      };
    }

    return {
      success: true,
      result: JSON.parse(winner),
      errors: [],
    };
  }

  /**
   * Require quorum (2/3 majority)
   */
  private mergeQuorum(
    results: Array<{ subtaskId: string; result: any }>
  ): MergeResult {
    const total = results.length;
    const quorum = Math.ceil((2 * total) / 3);

    // Count successful results
    const successful = results.filter(r => r.result?.status === 'success');

    if (successful.length >= quorum) {
      return {
        success: true,
        result: {
          message: `Quorum reached: ${successful.length}/${total} succeeded`,
          results: successful.map(r => r.result),
        },
        errors: [],
      };
    }

    return {
      success: false,
      errors: [`Quorum not reached: ${successful.length}/${total} required ${quorum}`],
    };
  }

  /**
   * Custom merge (just return all results)
   */
  private mergeCustom(
    results: Array<{ subtaskId: string; result: any }>
  ): MergeResult {
    return {
      success: true,
      result: {
        results,
        count: results.length,
      },
      errors: [],
    };
  }

  /**
   * Determine best-fit agent for a task
   */
  determineAgentFit(
    subtask: Subtask,
    agents: FleetAgent[]
  ): AgentScore[] {
    const scores: AgentScore[] = agents
      .filter(agent => agent.status !== 'offline' && agent.status !== 'degraded')
      .map(agent => ({
        agentId: agent.id,
        score: this.calculateScore(agent, subtask),
        reasons: this.getScoreReasons(agent, subtask),
      }));

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    return scores;
  }

  /**
   * Calculate score for agent-task match
   */
  private calculateScore(agent: FleetAgent, subtask: Subtask): number {
    let score = 0;

    // Skill match (50 points)
    if (subtask.requiredSkills && subtask.requiredSkills.length > 0) {
      const skillMatch = subtask.requiredSkills.every(s =>
        agent.skills.includes(s)
      );
      if (skillMatch) score += 50;
    } else {
      // No specific skills required, give partial credit
      score += 25;
    }

    // Current load (30 points — inverse)
    score += (1 - agent.load) * 30;

    // Past performance (20 points)
    score += agent.successRate * 20;

    return score;
  }

  /**
   * Get human-readable reasons for score
   */
  private getScoreReasons(agent: FleetAgent, subtask: Subtask): string[] {
    const reasons: string[] = [];

    // Skill match
    if (subtask.requiredSkills && subtask.requiredSkills.length > 0) {
      const matchingSkills = subtask.requiredSkills.filter(s => agent.skills.includes(s));
      if (matchingSkills.length === subtask.requiredSkills.length) {
        reasons.push(`All required skills present: ${matchingSkills.join(', ')}`);
      } else {
        reasons.push(`Missing skills: ${subtask.requiredSkills.filter(s => !agent.skills.includes(s)).join(', ')}`);
      }
    }

    // Load
    if (agent.load < 0.3) {
      reasons.push('Low load');
    } else if (agent.load > 0.7) {
      reasons.push('High load');
    }

    // Success rate
    if (agent.successRate > 0.9) {
      reasons.push('Excellent success rate');
    } else if (agent.successRate < 0.7) {
      reasons.push('Low success rate');
    }

    return reasons;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

export const taskSplitter = new TaskSplitter();
