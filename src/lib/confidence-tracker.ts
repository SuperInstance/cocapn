// Confidence tracking — per-repo LLM response quality metrics stored in KV.
// No Google API dependency.

interface ConfidenceRecord {
  timestamp: number;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  cached: boolean;
}

export async function trackConfidence(
  env: { CONFIDENCE?: KVNamespace },
  key: string,
  record: ConfidenceRecord,
): Promise<void> {
  if (!env.CONFIDENCE) return;
  const historyKey = `history:${key}`;
  const raw = await env.CONFIDENCE.get(historyKey);
  const history: ConfidenceRecord[] = raw ? JSON.parse(raw) : [];
  history.push(record);
  // Keep last 100 entries
  if (history.length > 100) history.splice(0, history.length - 100);

  const hitCount = history.filter(h => h.cached).length;
  const score = Math.round((hitCount / history.length) * 100);

  await env.CONFIDENCE.put(historyKey, JSON.stringify(history), { expirationTtl: 86400 * 30 });
  await env.CONFIDENCE.put(`score:${key}`, JSON.stringify({ score, total: history.length, cached: hitCount }), { expirationTtl: 86400 * 30 });
}

export async function getConfidence(
  env: { CONFIDENCE?: KVNamespace },
  key?: string,
): Promise<Record<string, any>> {
  if (!env.CONFIDENCE) return { error: 'No CONFIDENCE KV bound' };
  if (key) {
    const raw = await env.CONFIDENCE.get(`score:${key}`);
    return raw ? JSON.parse(raw) : { score: 0, total: 0, cached: 0 };
  }
  // List all scores
  const list = await env.CONFIDENCE.list({ prefix: 'score:' });
  const scores: Record<string, any> = {};
  for (const key of list.keys) {
    const raw = await env.CONFIDENCE.get(key.name);
    if (raw) scores[key.name.replace('score:', '')] = JSON.parse(raw);
  }
  return scores;
}
