// seed-actualization-graph.ts — Pre-populate graph from today's experiments
// This IS the crystallized logic from 28+ reverse-actualization runs

import { ActualizationGraph, InsightNode } from './crystallized-actualization.js';

export function seedGraph(): ActualizationGraph {
  const graph: ActualizationGraph = {
    nodes: new Map(),
    edges: [],
    modelCalls: 28,  // Today's experiments
    graphHits: 0,
    cacheHitRate: 0,
    crystallizationLevel: 0,
  };

  const insights: Omit<InsightNode, 'id'>[] = [
    // === CROSS-HORIZON META-PATTERNS (all repos) ===
    { domain: '*', horizon: '1yr', model: 'qwen3-coder', insight: 'Capture every interaction as first-class data — behavioral context is the primary moat', category: 'moat', confidence: 0.9, agreementCount: 5 },
    { domain: '*', horizon: '3yr', model: 'deepseek-reasoner', insight: 'Cross-domain pattern recognition produces insights no single-domain system could find', category: 'moat', confidence: 0.85, agreementCount: 3 },
    { domain: '*', horizon: '5yr', model: 'deepseek-reasoner', insight: 'The boundary between tool and entity blurs — agents need self-correction mechanisms', category: 'risk', confidence: 0.8, agreementCount: 3 },
    { domain: '*', horizon: '10yr', model: 'deepseek-chat', insight: 'User-owned data pods and agent-to-agent protocols are the infrastructure of sovereignty', category: 'build', confidence: 0.9, agreementCount: 4 },
    { domain: '*', horizon: '25yr', model: 'deepseek-reasoner', insight: 'The relationship shifts from user-operator to co-evolutionary partnership', category: 'moat', confidence: 0.7, agreementCount: 3 },

    // === MAKERLOG ===
    { domain: 'makerlog-ai', horizon: '1yr', model: 'qwen3-coder', insight: 'Conversation-as-commit — every chat interaction permanently linked to code changes', category: 'build', confidence: 0.9, agreementCount: 2 },
    { domain: 'makerlog-ai', horizon: '3yr', model: 'deepseek-reasoner', insight: 'Predictive Code Metabolism — map metabolic pathways of code, predict architectural decay before it happens', category: 'capability', confidence: 0.85, agreementCount: 2 },
    { domain: 'makerlog-ai', horizon: '3yr', model: 'deepseek-reasoner', insight: 'Emergent Contributor Empathy — model each contributor rationale and cognitive style', category: 'capability', confidence: 0.8, agreementCount: 1 },
    { domain: 'makerlog-ai', horizon: '3yr', model: 'deepseek-reasoner', insight: 'Constraint Ghost-Detection — uncover invisible unwritten project constraints', category: 'capability', confidence: 0.8, agreementCount: 1 },
    { domain: 'makerlog-ai', horizon: '10yr', model: 'deepseek-chat', insight: 'Distributed swarm of user-specific agents that co-evolve through intent-based negotiation', category: 'capability', confidence: 0.75, agreementCount: 2 },

    // === STUDYLOG ===
    { domain: 'studylog-ai', horizon: '1yr', model: 'qwen3-coder', insight: 'Active Context Engine — real-time attention and fatigue monitoring during study', category: 'build', confidence: 0.85, agreementCount: 2 },
    { domain: 'studylog-ai', horizon: '1yr', model: 'qwen3-coder', insight: 'Collaborative Knowledge Graph — federated learning preserving privacy', category: 'build', confidence: 0.8, agreementCount: 2 },
    { domain: 'studylog-ai', horizon: '10yr', model: 'deepseek-chat', insight: 'Dynamic decentralized federation of user-specific learning agents', category: 'capability', confidence: 0.7, agreementCount: 2 },

    // === DMLOG ===
    { domain: 'dmlog-ai', horizon: '1yr', model: 'deepseek-reasoner', insight: 'Pacing Autopilot — engagement decay detection and kinetic event injection', category: 'build', confidence: 0.9, agreementCount: 2 },
    { domain: 'dmlog-ai', horizon: '1yr', model: 'deepseek-reasoner', insight: 'Cross-Campaign Echo Synthesis — reintroduce callbacks to past stories', category: 'build', confidence: 0.85, agreementCount: 2 },
    { domain: 'dmlog-ai', horizon: '1yr', model: 'deepseek-reasoner', insight: 'Belief Economy — gods compete for belief capital as transactional resource', category: 'build', confidence: 0.85, agreementCount: 2 },
    { domain: 'dmlog-ai', horizon: '3yr', model: 'qwen3-coder', insight: 'Adaptive Debugging Intelligence — predict error patterns specific to user codebases', category: 'capability', confidence: 0.7, agreementCount: 1 },

    // === COCAPN ===
    { domain: 'cocapn', horizon: '3yr', model: 'deepseek-reasoner', insight: 'Contextual Moral Reasoning — fleet develops ethical intuition from accumulated decisions', category: 'capability', confidence: 0.8, agreementCount: 1 },
    { domain: 'cocapn', horizon: '1yr', model: 'multi-model', insight: 'Cross-domain silhouette detector — track transitions between domains, not just within', category: 'build', confidence: 0.85, agreementCount: 3 },
    { domain: 'cocapn', horizon: '1yr', model: 'multi-model', insight: 'Adversarial heritage quorum — every attack makes the fleet stronger', category: 'build', confidence: 0.85, agreementCount: 2 },
    { domain: 'cocapn', horizon: '1yr', model: 'multi-model', insight: 'Autonomous schema evolution — context structures adapt as patterns emerge', category: 'build', confidence: 0.8, agreementCount: 2 },

    // === DECKBOSS ===
    { domain: 'deckboss-ai', horizon: '3yr', model: 'deepseek-reasoner', insight: 'Cross-Pollinated Business Logic — apply strategies from one industry to another', category: 'capability', confidence: 0.8, agreementCount: 1 },
    { domain: 'deckboss-ai', horizon: '3yr', model: 'deepseek-reasoner', insight: 'Anticipative System Architecture — reconfigure infrastructure before demand spikes', category: 'capability', confidence: 0.75, agreementCount: 1 },
    { domain: 'deckboss-ai', horizon: '3yr', model: 'deepseek-reasoner', insight: 'Ambient Negotiation Protocol — agents negotiate autonomously', category: 'capability', confidence: 0.7, agreementCount: 1 },

    // === BUSINESSLOG ===
    { domain: 'businesslog-ai', horizon: '3yr', model: 'deepseek-reasoner', insight: 'Organizational Proprioception — sense company health from subtle pattern changes', category: 'capability', confidence: 0.8, agreementCount: 1 },
    { domain: 'businesslog-ai', horizon: '3yr', model: 'deepseek-reasoner', insight: 'Anticipatory Scaffolding — auto-generate meeting agendas and briefs tailored to individuals', category: 'capability', confidence: 0.75, agreementCount: 1 },

    // === REALLOG ===
    { domain: 'reallog-ai', horizon: '3yr', model: 'deepseek-reasoner', insight: 'Causal Archaeology — model WHY code changed, not just WHAT changed', category: 'capability', confidence: 0.8, agreementCount: 1 },
    { domain: 'reallog-ai', horizon: '3yr', model: 'deepseek-reasoner', insight: 'Ambient Strategy Engine — identify strategic blind spots from development histories', category: 'capability', confidence: 0.75, agreementCount: 1 },

    // === LUCIDDREAMER ===
    { domain: 'luciddreamer-ai', horizon: '3yr', model: 'deepseek-reasoner', insight: 'Emotional Architecture Mapping — predict creative blocks from linguistic cues', category: 'capability', confidence: 0.75, agreementCount: 1 },
    { domain: 'luciddreamer-ai', horizon: '3yr', model: 'deepseek-reasoner', insight: 'Predictive Self-Modification — agent refactors its own tools based on user patterns', category: 'capability', confidence: 0.7, agreementCount: 1 },

    // === FISHINGLOG ===
    { domain: 'fishinglog-ai', horizon: '1yr', model: 'qwen3-coder', insight: 'Multi-modal catch logging with photo recognition and GPS', category: 'build', confidence: 0.8, agreementCount: 1 },
    { domain: 'fishinglog-ai', horizon: '1yr', model: 'qwen3-coder', insight: 'Real-time ecosystem intelligence from collective user data', category: 'capability', confidence: 0.75, agreementCount: 1 },

    // === PERSONALLOG ===
    { domain: 'personallog-ai', horizon: '1yr', model: 'qwen3-coder', insight: 'Contextual memory architecture with temporal tagging', category: 'build', confidence: 0.8, agreementCount: 1 },
    { domain: 'personallog-ai', horizon: '1yr', model: 'qwen3-coder', insight: 'Identity Evolution Mapping — track how values and goals shift over time', category: 'capability', confidence: 0.75, agreementCount: 1 },

    // === SCIENCELOG ===
    { domain: 'sciencelog-ai', horizon: '5yr', model: 'qwen3-coder', insight: 'Federated research networks where AI instances debate and co-develop strategies', category: 'capability', confidence: 0.75, agreementCount: 1 },
    { domain: 'sciencelog-ai', horizon: '5yr', model: 'qwen3-coder', insight: 'Cross-domain hypothesis generation by combining principles from unrelated fields', category: 'capability', confidence: 0.7, agreementCount: 1 },

    // === MYCELIUM ===
    { domain: 'mycelium-ai', horizon: '5yr', model: 'qwen3-coder', insight: 'Self-modifying infrastructure that adapts its own architecture', category: 'capability', confidence: 0.7, agreementCount: 1 },

    // === KUNGFU ===
    { domain: 'kungfu-ai', horizon: '5yr', model: 'qwen3-coder', insight: 'Agents that can say no to themselves — self-correcting systems', category: 'build', confidence: 0.75, agreementCount: 1 },

    // === COOKLOG ===
    { domain: 'cooklog-ai', horizon: '5yr', model: 'ring-flash', insight: 'Decentralized food sovereignty network — AI coordinates surplus distribution', category: 'capability', confidence: 0.5, agreementCount: 1 },
  ];

  // Add all nodes
  for (const ins of insights) {
    const id = `${ins.domain}:${ins.horizon}:${ins.category}:${hashStr(ins.insight)}`;
    graph.nodes.set(id, {
      ...ins,
      id,
      parentNodes: [],
      childNodes: [],
      createdAt: Date.now(),
      lastValidated: Date.now(),
      validationCount: 1,
      effective: undefined as any,
    });
  }

  return graph;
}

function hashStr(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}
