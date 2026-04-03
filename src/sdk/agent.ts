import type { Tile, Pattern, RunMetrics } from './types.js';

/**
 * CocapnAgent — the think-act-observe-learn loop that any vessel runs.
 *
 * Designed to be instantiated with a Cloudflare Worker env and a domain string.
 * Each method in the loop is overridable for vessel-specific behavior.
 */
export class CocapnAgent {
  env: any;
  domain: string;
  memory: Map<string, any>;

  constructor(env: any, domain: string) {
    this.env = env;
    this.domain = domain;
    this.memory = new Map();
  }

  /** THINK: decompose input into tiles and form a plan. */
  async think(input: string): Promise<{ tiles: Tile[]; plan: string }> {
    const tiles: Tile[] = [
      { id: this.#uid(), type: 'query', content: input, confidence: 1.0, source: this.domain },
    ];
    const plan = `[${this.domain}] process: "${input.slice(0, 120)}"`;
    return { tiles, plan };
  }

  /** ACT: execute the plan against the env (KV, APIs, etc). */
  async act(plan: string): Promise<{ result: any; source: string; tokens: number }> {
    const start = Date.now();
    let result: any = null;
    let source = 'local';

    try {
      // Default: query local KV for relevant knowledge
      if (this.env?.COCAPN_KV) {
        const key = `agent:${this.domain}:response:${this.#hash(plan)}`;
        const cached = await this.env.COCAPN_KV.get(key);
        if (cached) { result = JSON.parse(cached); source = 'kv'; }
      }

      if (!result) {
        // Check memory store
        const memKey = `plan:${this.#hash(plan)}`;
        if (this.memory.has(memKey)) {
          result = this.memory.get(memKey);
          source = 'memory';
        }
      }

      if (!result) {
        result = { plan, status: 'pending', domain: this.domain };
        source = 'generated';
      }
    } catch {
      result = { plan, status: 'error', domain: this.domain };
      source = 'fallback';
    }

    return { result, source, tokens: plan.length >> 2 };
  }

  /** OBSERVE: extract patterns and insights from an act result. */
  async observe(result: any): Promise<{ patterns: Pattern[]; insights: string[] }> {
    const patterns: Pattern[] = [];
    const insights: string[] = [];

    if (result?.status === 'error') {
      insights.push(`Execution error in ${this.domain}: ${result.plan}`);
    } else if (result?.status === 'pending') {
      insights.push(`No cached result for plan — needs actualization.`);
    } else {
      insights.push(`Result sourced from ${result?._source || 'unknown'}.`);
    }

    // Store in local memory for future rehydration
    this.memory.set(`obs:${Date.now()}`, result);

    return { patterns, insights };
  }

  /** LEARN: persist patterns into KV. */
  async learn(patterns: Pattern[]): Promise<void> {
    if (!patterns.length || !this.env?.COCAPN_KV) return;
    const batch: Record<string, string> = {};
    for (const p of patterns) {
      batch[`pattern:${p.id}`] = JSON.stringify(p);
    }
    await Promise.all(
      Object.entries(batch).map(([k, v]) => this.env.COCAPN_KV.put(k, v))
    );
  }

  /** RUN: full think → act → observe → learn pipeline. */
  async run(input: string): Promise<{ response: string; source: string; metrics: RunMetrics }> {
    const t0 = Date.now();
    const tThink = Date.now();
    const { tiles, plan } = await this.think(input);
    const thinkMs = Date.now() - tThink;

    const tAct = Date.now();
    const { result, source, tokens } = await this.act(plan);
    const actMs = Date.now() - tAct;

    const tObs = Date.now();
    const { patterns, insights } = await this.observe(result);
    const observeMs = Date.now() - tObs;

    const tLearn = Date.now();
    await this.learn(patterns);
    const learnMs = Date.now() - tLearn;

    const response = insights.join('\n') || JSON.stringify(result);
    return {
      response,
      source,
      metrics: {
        thinkMs, actMs, observeMs, learnMs,
        totalMs: Date.now() - t0,
        tilesGenerated: tiles.length,
        patternsLearned: patterns.length,
        tokensUsed: tokens,
      },
    };
  }

  /** Self-audit: check memory health and stale entries. */
  async selfAudit(): Promise<{ issues: string[]; fixes: string[] }> {
    const issues: string[] = [];
    const fixes: string[] = [];
    const now = Date.now();

    for (const [key] of this.memory) {
      if (key.startsWith('obs:')) {
        const age = now - parseInt(key.split(':')[1], 10);
        if (age > 86_400_000) { // 24h
          issues.push(`Stale observation: ${key}`);
          fixes.push(`prune:${key}`);
          this.memory.delete(key);
        }
      }
    }

    if (this.memory.size === 0) issues.push('Memory is empty — vessel may need seeding.');

    return { issues, fixes };
  }

  /** Rehydrate: reload patterns from KV into local memory. */
  async rehydrate(): Promise<{ rehydrated: number }> {
    if (!this.env?.COCAPN_KV) return { rehydrated: 0 };
    const list = await this.env.COCAPN_KV.list({ prefix: `pattern:` });
    let count = 0;
    for (const key of list.keys) {
      const val = await this.env.COCAPN_KV.get(key.name);
      if (val) { this.memory.set(key.name, JSON.parse(val)); count++; }
    }
    return { rehydrated: count };
  }

  #uid(): string {
    return `${this.domain}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }
  #hash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
    return Math.abs(h).toString(36);
  }
}
