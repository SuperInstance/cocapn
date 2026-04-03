// lock-table.ts — Static KV lookup for evaporated (hardcoded) responses
// Bypasses LLM entirely when a known pattern matches.

export interface LockEntry {
  pattern: string;
  response: string;
  hitCount: number;
  lockedAt: number;
}

const LOCK_PREFIX = 'evap:lock:';

export async function checkLocks(env: any, input: string): Promise<string | null> {
  const listRaw = await env.SESSIONS?.get(`${LOCK_PREFIX}index`);
  if (!listRaw) return null;
  const patterns: string[] = JSON.parse(listRaw);
  const lower = input.toLowerCase().trim();
  for (const p of patterns) {
    if (lower.includes(p.toLowerCase())) {
      const entryRaw = await env.SESSIONS?.get(`${LOCK_PREFIX}${p}`);
      if (entryRaw) {
        const entry: LockEntry = JSON.parse(entryRaw);
        entry.hitCount++;
        await env.SESSIONS?.put(`${LOCK_PREFIX}${p}`, JSON.stringify(entry));
        return entry.response;
      }
    }
  }
  return null;
}

export async function addLock(env: any, pattern: string, response: string): Promise<void> {
  const entry: LockEntry = { pattern, response, hitCount: 0, lockedAt: Date.now() };
  await env.SESSIONS?.put(`${LOCK_PREFIX}${pattern}`, JSON.stringify(entry));
  const listRaw = await env.SESSIONS?.get(`${LOCK_PREFIX}index`);
  const list: string[] = listRaw ? JSON.parse(listRaw) : [];
  if (!list.includes(pattern)) {
    list.push(pattern);
    await env.SESSIONS?.put(`${LOCK_PREFIX}index`, JSON.stringify(list));
  }
}

export async function getLockStats(env: any): Promise<{ totalLocks: number; coverage: number }> {
  const listRaw = await env.SESSIONS?.get(`${LOCK_PREFIX}index`);
  const patterns: string[] = listRaw ? JSON.parse(listRaw) : [];
  let totalHits = 0;
  for (const p of patterns) {
    const raw = await env.SESSIONS?.get(`${LOCK_PREFIX}${p}`);
    if (raw) totalHits += (JSON.parse(raw) as LockEntry).hitCount;
  }
  const totalRequests = parseInt((await env.SESSIONS?.get('evap:total_requests')) ?? '0', 10);
  return {
    totalLocks: patterns.length,
    coverage: totalRequests > 0 ? totalHits / totalRequests : 0,
  };
}
