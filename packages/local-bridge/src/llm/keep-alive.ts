/**
 * HTTP Keep-Alive Agent Pool — one undici Agent per LLM provider.
 *
 * Reuses TCP connections across requests to the same provider,
 * reducing latency from repeated TLS handshakes.
 */

import { Agent, type Dispatcher } from 'undici';

const agents = new Map<string, Agent>();

/**
 * Get or create a keep-alive Agent for the given provider name.
 * Each provider gets its own Agent to isolate connection pools.
 */
export function getKeepAliveAgent(providerName: string): Dispatcher {
  let agent = agents.get(providerName);
  if (!agent) {
    agent = new Agent({
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 60_000,
      connections: 10,
    });
    agents.set(providerName, agent);
  }
  return agent;
}

/**
 * Destroy all keep-alive agents. Call during bridge shutdown.
 */
export function destroyAllAgents(): void {
  for (const agent of agents.values()) {
    agent.close();
  }
  agents.clear();
}
