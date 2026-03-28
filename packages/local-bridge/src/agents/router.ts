/**
 * AgentRouter — routes incoming tasks to the best available agent.
 *
 * Priority chain (all steps respect the configured strategy):
 *   1. Local agent that matches routing rules and is already running
 *   2. Local agent that matches routing rules (will be spawned on demand)
 *   3. Cloud agent that matches routing rules (if local not installed)
 *   4. Configured defaultAgent (local then cloud)
 *   5. Configured fallbackAgent (local then cloud)
 */

import type { AgentDefinition, AgentSpawner } from "./spawner.js";
import type { AgentRegistry } from "./registry.js";
import type { CloudAdapterRegistry } from "../CloudAdapter.js";

export interface RoutingRule {
  match: string;
  agent: string;
  priority?: number;
}

export interface RouterConfig {
  rules: RoutingRule[];
  strategy: "first-match" | "highest-priority" | "cost-optimized";
  defaultAgent: string | undefined;
  fallbackAgent: string | undefined;
}

// ─── Routing result ───────────────────────────────────────────────────────────

export type RouteSource = "local" | "cloud";

export interface RouteResult {
  definition: AgentDefinition;
  source: RouteSource;
}

// ─── AgentRouter ──────────────────────────────────────────────────────────────

export class AgentRouter {
  private config:       RouterConfig;
  private registry:     AgentRegistry;
  private spawner:      AgentSpawner;
  private cloudAdapters: CloudAdapterRegistry | undefined;

  constructor(
    config:       RouterConfig,
    registry:     AgentRegistry,
    spawner:      AgentSpawner,
    cloudAdapters?: CloudAdapterRegistry
  ) {
    this.config       = config;
    this.registry     = registry;
    this.spawner      = spawner;
    this.cloudAdapters = cloudAdapters;
  }

  // ---------------------------------------------------------------------------
  // Public resolution API
  // ---------------------------------------------------------------------------

  /**
   * Resolve the best agent for the task description.
   *
   * Applies the priority chain: local > cloud.
   * Returns undefined only when no registered agent (local or cloud) exists.
   */
  resolve(taskDescription: string): RouteResult | undefined {
    const candidates = this.matchingRules(taskDescription);

    if (candidates.length > 0) {
      const agentId = this.pickByStrategy(candidates);
      const result  = this.resolveId(agentId);
      if (result) return result;
    }

    // Default agent
    if (this.config.defaultAgent) {
      const result = this.resolveId(this.config.defaultAgent);
      if (result) return result;
    }

    // Fallback agent
    if (this.config.fallbackAgent) {
      return this.resolveId(this.config.fallbackAgent);
    }

    return undefined;
  }

  /**
   * Resolve and, for local agents, ensure the process is running.
   * Remote/cloud agents are never "spawned" — their adapter handles the call.
   */
  async resolveAndEnsureRunning(
    taskDescription: string
  ): Promise<RouteResult | undefined> {
    const result = this.resolve(taskDescription);
    if (!result) return undefined;

    if (result.source === "local" && !this.spawner.get(result.definition.id)) {
      await this.spawner.spawn(result.definition);
    }

    return result;
  }

  /**
   * Compatibility shim for callers that expect AgentDefinition | undefined.
   * @deprecated Prefer resolve() which returns RouteResult with source info.
   */
  resolveDefinition(taskDescription: string): AgentDefinition | undefined {
    return this.resolve(taskDescription)?.definition;
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  /**
   * Resolve a specific agent id with local-first, cloud-fallback logic.
   */
  private resolveId(agentId: string): RouteResult | undefined {
    const hybrid = this.registry.resolveHybrid(agentId);
    if (hybrid) {
      return { definition: hybrid.definition, source: hybrid.source };
    }

    // If registry has no record at all, try cloud directly
    if (this.cloudAdapters?.get(agentId)) {
      const stub: AgentDefinition = {
        id:           agentId,
        type:         "remote",
        command:      this.cloudAdapters.get(agentId)!.getWorkerUrl(),
        args:         [],
        env:          {},
        capabilities: ["chat", "tasks"],
        cost:         "medium",
      };
      return { definition: stub, source: "cloud" };
    }

    return undefined;
  }

  private matchingRules(description: string): RoutingRule[] {
    const lower = description.toLowerCase();
    return this.config.rules.filter((rule) =>
      lower.includes(rule.match.toLowerCase())
    );
  }

  private pickByStrategy(rules: RoutingRule[]): string {
    switch (this.config.strategy) {
      case "highest-priority": {
        const sorted = [...rules].sort(
          (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
        );
        return sorted[0]!.agent;
      }

      case "cost-optimized": {
        const costs: Record<AgentDefinition["cost"], number> = {
          low: 0, medium: 1, high: 2,
        };
        let best     = rules[0]!;
        let bestCost = Infinity;
        for (const rule of rules) {
          const def  = this.registry.get(rule.agent);
          const cost = def ? costs[def.cost] : 1;
          if (cost < bestCost) { bestCost = cost; best = rule; }
        }
        return best.agent;
      }

      case "first-match":
      default:
        return rules[0]!.agent;
    }
  }
}
