// crystallized-actualization.ts — Reverse-actualization that learns from its own simulations
// Each run crystallizes insights into a graph. Future runs traverse the graph first.
// Only calls expensive models when the graph can't answer. The graph IS the shrinking logic.

export interface InsightNode {
  id: string;
  domain: string;           // which repo/concept
  horizon: string;          // 1yr, 3yr, 5yr, 10yr, 25yr
  model: string;            // which model generated this
  insight: string;          // the novel concept
  category: 'capability' | 'risk' | 'decision' | 'moat' | 'build';
  confidence: number;       // 0-1, how many models agree
  agreementCount: number;   // how many models independently found this
  parentNodes: string[];    // what insights led to this
  childNodes: string[];     // what insights this leads to
  createdAt: number;
  lastValidated: number;
  validationCount: number;
  effective: boolean;       // did this insight lead to a build that worked?
}

export interface DecisionEdge {
  from: string;             // insight node id
  to: string;
  weight: number;           // 0-1, strength of connection
  type: 'enables' | 'contradicts' | 'refines' | 'supersedes';
  horizon: string;          // at what time horizon does this edge activate?
  evidence: string;         // what simulation produced this edge
}

export interface ActualizationGraph {
  nodes: Map<string, InsightNode>;
  edges: DecisionEdge[];
  modelCalls: number;       // total model API calls ever made
  graphHits: number;        // times graph answered without model call
  cacheHitRate: number;     // graphHits / (graphHits + modelCalls)
  crystallizationLevel: number; // 0-1, how much of the methodology is graph-based
}

// Try to answer a reverse-actualization query from the graph first
// Returns null if graph can't answer (need model call)
export function queryGraph(
  graph: ActualizationGraph,
  domain: string,
  horizon: string,
  queryType: 'capability' | 'build' | 'risk' | 'moat'
): InsightNode[] | null {
  const candidates = [...graph.nodes.values()].filter(n =>
    n.domain === domain &&
    n.horizon === horizon &&
    n.category === queryType &&
    n.confidence >= 0.5 // Only high-confidence nodes
  );
  
  if (candidates.length >= 2) {
    // Graph has enough to answer
    graph.graphHits++;
    return candidates.sort((a, b) => b.confidence - a.confidence);
  }
  
  return null; // Need model call
}

// Crystallize a model's output into graph nodes
export function crystallizeInsight(
  graph: ActualizationGraph,
  domain: string,
  horizon: string,
  model: string,
  insight: string,
  category: InsightNode['category']
): InsightNode {
  const id = `${domain}:${horizon}:${category}:${hashStr(insight)}`;
  
  // Check if this insight already exists (agreement detection)
  const existing = findSimilarInsight(graph, insight, domain);
  
  if (existing) {
    // Multiple models agree — increase confidence
    existing.agreementCount++;
    existing.confidence = Math.min(1, existing.agreementCount / 3); // 3 models = full confidence
    existing.lastValidated = Date.now();
    existing.validationCount++;
    
    // Add model to evidence
    if (!existing.id.includes(model)) {
      existing.id += `+${model}`;
    }
    
    return existing;
  }
  
  // New insight — create node
  const node: InsightNode = {
    id,
    domain,
    horizon,
    model,
    insight,
    category,
    confidence: 0.3, // Start low, increase with agreement
    agreementCount: 1,
    parentNodes: [],
    childNodes: [],
    createdAt: Date.now(),
    lastValidated: Date.now(),
    validationCount: 1,
    effective: false,
  };
  
  graph.nodes.set(id, node);
  return node;
}

// Add edge between insights
export function addEdge(
  graph: ActualizationGraph,
  fromId: string,
  toId: string,
  type: DecisionEdge['type'],
  horizon: string,
  evidence: string
): void {
  // Remove superseded edges
  if (type === 'supersedes') {
    graph.edges = graph.edges.filter(e =>
      !(e.from === fromId && e.to === toId && e.type !== 'supersedes')
    );
  }
  
  graph.edges.push({
    from: fromId,
    to: toId,
    weight: type === 'supersedes' ? 0.9 : type === 'enables' ? 0.7 : 0.5,
    type,
    horizon,
    evidence,
  });
}

// Find similar existing insight (agreement detection)
function findSimilarInsight(
  graph: ActualizationGraph,
  insight: string,
  domain: string
): InsightNode | null {
  const insightLower = insight.toLowerCase();
  const keywords = extractKeywords(insightLower);
  
  for (const node of graph.nodes.values()) {
    if (node.domain !== domain) continue;
    
    const nodeLower = node.insight.toLowerCase();
    const nodeKeywords = extractKeywords(nodeLower);
    
    // Simple keyword overlap
    const overlap = keywords.filter(k => nodeKeywords.includes(k)).length;
    const minKeywords = Math.min(keywords.length, nodeKeywords.length);
    
    if (minKeywords > 0 && overlap / minKeywords > 0.5) {
      return node; // 50%+ keyword overlap = same insight
    }
  }
  
  return null;
}

// Extract meaningful keywords from text
function extractKeywords(text: string): string[] {
  const stopWords = new Set(['the','a','an','is','are','was','were','be','been','being',
    'have','has','had','do','does','did','will','would','could','should','may','might',
    'shall','can','to','of','in','for','on','with','at','by','from','as','into','through',
    'and','but','or','nor','not','so','yet','both','either','neither','each','every',
    'that','this','these','those','which','who','whom','what','where','when','how',
    'it','its','their','they','them','we','our','us','you','your','he','she','him','her',
    'if','than','then','also','just','about','up','out','all','some','more','most',
    'new','one','two','three','first','last','own','other','same','such']);
  
  return text.split(/[^a-z0-9]+/)
    .filter(w => w.length > 3 && !stopWords.has(w))
    .slice(0, 10);
}

// Compute crystallization level (how much methodology is graph-based)
export function computeCrystallization(graph: ActualizationGraph): number {
  const total = graph.graphHits + graph.modelCalls;
  if (total === 0) return 0;
  return graph.graphHits / total;
}

// Find cross-horizon patterns (insights that appear at multiple time horizons)
export function findCrossHorizonPatterns(
  graph: ActualizationGraph
): { pattern: string; horizons: string[]; confidence: number }[] {
  const byInsight = new Map<string, { horizons: Set<string>; nodes: InsightNode[] }>();
  
  for (const node of graph.nodes.values()) {
    const key = extractKeywords(node.insight.toLowerCase()).sort().join(',');
    if (!byInsight.has(key)) {
      byInsight.set(key, { horizons: new Set(), nodes: [] });
    }
    byInsight.get(key)!.horizons.add(node.horizon);
    byInsight.get(key)!.nodes.push(node);
  }
  
  return [...byInsight.entries()]
    .filter(([_, data]) => data.horizons.size >= 2) // Appears at 2+ horizons
    .map(([keywords, data]) => ({
      pattern: keywords,
      horizons: [...data.horizons].sort(),
      confidence: data.nodes.reduce((sum, n) => sum + n.confidence, 0) / data.nodes.length,
    }))
    .sort((a, b) => b.horizons.length - a.horizons.length); // Most cross-horizon first
}

// Find cross-model agreements (insights multiple models independently found)
export function findModelAgreements(
  graph: ActualizationGraph
): { insight: string; models: string[]; domain: string }[] {
  return [...graph.nodes.values()]
    .filter(n => n.agreementCount >= 2)
    .map(n => ({
      insight: n.insight,
      models: n.model.split('+'),
      domain: n.domain,
    }))
    .sort((a, b) => b.models.length - a.models.length);
}

// Validate an insight against real-world results
export function validateInsight(
  graph: ActualizationGraph,
  nodeId: string,
  wasEffective: boolean
): void {
  const node = graph.nodes.get(nodeId);
  if (!node) return;
  
  node.effective = wasEffective;
  node.lastValidated = Date.now();
  node.validationCount++;
  
  // Adjust confidence based on real-world feedback
  if (wasEffective) {
    node.confidence = Math.min(1, node.confidence + 0.1);
  } else {
    node.confidence = Math.max(0, node.confidence - 0.2);
  }
}

// Get the "sloppy logic" — the crystallized decision path for a domain
// This IS the external logic that shrinks model usage
export function getDecisionPath(
  graph: ActualizationGraph,
  domain: string
): { node: InsightNode; enabledBy: string[] }[] {
  const domainNodes = [...graph.nodes.values()]
    .filter(n => n.domain === domain)
    .sort((a, b) => a.confidence - b.confidence); // Low confidence first (foundation)
  
  return domainNodes.map(node => {
    const enablers = graph.edges
      .filter(e => e.to === node.id && e.type === 'enables')
      .map(e => graph.nodes.get(e.from)?.insight || e.from);
    
    return { node, enabledBy: enablers };
  });
}

function hashStr(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}
