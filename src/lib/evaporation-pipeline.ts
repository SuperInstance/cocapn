// evaporation-pipeline.ts — Unified 3-tier response pipeline: lock → cache → LLM

import { checkLocks } from './lock-table.js';
import { deadbandCheck, deadbandStore } from './deadband.js';
import { recordHit, getEvapReport, promoteToLock } from './evaporation-engine.js';

export type ResponseSource = 'lock' | 'cache' | 'llm';

export async function evapPipeline(
  env: any,
  input: string,
  llmCall: () => Promise<string>,
  repo: string,
): Promise<{ response: string; source: ResponseSource; tokensUsed: number }> {
  // Tier 1: Lock table (hardcoded, 0 tokens)
  const locked = await checkLocks(env, input);
  if (locked) {
    return { response: locked, source: 'lock', tokensUsed: 0 };
  }

  // Tier 2: Deadband cache (0 tokens)
  const cacheKey = JSON.stringify({ repo, input: input.slice(0, 200) });
  const cached = await deadbandCheck(env, cacheKey);
  if (cached) {
    await recordHit(env, repo, input.slice(0, 100), 0.9);
    return { response: cached, source: 'cache', tokensUsed: 0 };
  }

  // Tier 3: LLM call (actual tokens)
  const response = await llmCall();
  await deadbandStore(env, cacheKey, response);

  // Track for evaporation scoring (use response length as proxy confidence)
  const conf = Math.min(response.length / 200, 1);
  await recordHit(env, repo, input.slice(0, 100), conf);

  // Check if any candidates should auto-promote to lock
  try {
    const report = await getEvapReport(env, repo);
    for (const candidate of report.hot) {
      await promoteToLock(env, candidate);
    }
  } catch { /* non-critical */ }

  return { response, source: 'llm', tokensUsed: response.length * 2 };
}

export { getEvapReport } from './evaporation-engine.js';
export { getLockStats } from './lock-table.js';
