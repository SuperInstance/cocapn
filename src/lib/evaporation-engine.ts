// evaporation-engine.ts — Monitors deadband hit rates, identifies patterns ready to lock

export interface EvapCandidate {
  pattern: string;
  hitRate: number;
  confidence: number;
  sampleSize: number;
  score: number;
  status: 'hot' | 'warm' | 'cold';
}

const CANDIDATE_PREFIX = 'evap:candidates:';

export function calcEvapScore(c: EvapCandidate): number {
  return c.hitRate * 0.4 + c.confidence * 0.4 + Math.min(c.sampleSize / 50, 1) * 0.2;
}

export function shouldLock(c: EvapCandidate): boolean {
  return c.score > 0.8 && c.hitRate > 0.7 && c.confidence > 0.85 && c.sampleSize > 20;
}

function classify(c: EvapCandidate): EvapCandidate {
  c.score = calcEvapScore(c);
  if (c.score > 0.7) c.status = 'hot';
  else if (c.score > 0.4) c.status = 'warm';
  else c.status = 'cold';
  return c;
}

export async function recordHit(env: any, repo: string, pattern: string, confidence: number): Promise<void> {
  const key = `${CANDIDATE_PREFIX}${repo}`;
  const raw = await env.SESSIONS?.get(key);
  const candidates: EvapCandidate[] = raw ? JSON.parse(raw) : [];
  let found = candidates.find(c => c.pattern === pattern);
  if (found) {
    found.sampleSize++;
    found.confidence = found.confidence * 0.9 + confidence * 0.1; // EMA
    found.hitRate = found.hitRate * 0.95 + 0.05; // decay + boost
  } else {
    found = { pattern, hitRate: 1, confidence, sampleSize: 1, score: 0, status: 'warm' };
    candidates.push(found);
  }
  // Decay all candidates slightly
  for (const c of candidates) {
    if (c.pattern !== pattern) c.hitRate *= 0.995;
  }
  classify(found);
  await env.SESSIONS?.put(key, JSON.stringify(candidates));
  // Track total requests
  const total = parseInt((await env.SESSIONS?.get('evap:total_requests')) ?? '0', 10) + 1;
  await env.SESSIONS?.put('evap:total_requests', String(total));
}

export async function getEvapReport(env: any, repo: string): Promise<{ hot: EvapCandidate[]; warm: EvapCandidate[]; coverage: number }> {
  const key = `${CANDIDATE_PREFIX}${repo}`;
  const raw = await env.SESSIONS?.get(key);
  const all: EvapCandidate[] = raw ? JSON.parse(raw) : [];
  const hot = all.filter(c => shouldLock(c));
  const warm = all.filter(c => !shouldLock(c) && c.score > 0.4);
  const totalRequests = parseInt((await env.SESSIONS?.get('evap:total_requests')) ?? '0', 10);
  const totalHits = hot.reduce((s, c) => s + c.sampleSize, 0);
  return { hot, warm, coverage: totalRequests > 0 ? totalHits / totalRequests : 0 };
}

export async function promoteToLock(env: any, candidate: EvapCandidate): Promise<void> {
  const { addLock } = await import('./lock-table.js');
  // Get the latest response from deadband for this pattern
  const cached = await env.SESSIONS?.get(`deadband:${candidate.pattern}`);
  const response = cached ?? `[Evaporated response for: ${candidate.pattern}]`;
  await addLock(env, candidate.pattern, response);
  // Remove from candidates
  // (done lazily on next report)
}
