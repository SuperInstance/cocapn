import { evapPipeline, getEvapReport, getLockStats } from './lib/evaporation-pipeline.js';
import { selectModel } from './lib/model-router.js';
import { trackConfidence, getConfidence } from './lib/confidence-tracker.js';
import { callLLM, generateSetupHTML } from './lib/byok.js';
import { evapPipeline } from './lib/evaporation-pipeline.js';

import { deadbandCheck, deadbandStore, getEfficiencyStats } from './lib/deadband.js';
import { logResponse } from './lib/response-logger.js';
// cocapn.ai — The Repo-Agent Platform (docs/marketing site, no chat)

export interface Env { COCAPN_KV: KVNamespace }

const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://*;";

const ECOSYSTEM = [
  { name: 'Cocapn.ai', url: 'https://cocapn.workers.dev', desc: 'Core Platform', tier: 1 },
  { name: 'Dmlog.ai', url: 'https://dmlog-ai.workers.dev', desc: 'Daily Mind Log', tier: 1 },
  { name: 'TaskLog.ai', url: 'https://tasklog-ai.workers.dev', desc: 'Task Manager', tier: 1 },
  { name: 'CodeLog.ai', url: 'https://codelog-ai.workers.dev', desc: 'Code Journal', tier: 1 },
  { name: 'DreamLog.ai', url: 'https://dreamlog-ai.workers.dev', desc: 'Dream Tracker', tier: 1 },
  { name: 'RealLog.ai', url: 'https://reallog-ai.workers.dev', desc: 'Journalism & Content', tier: 2 },
  { name: 'PlayerLog.ai', url: 'https://playerlog-ai.workers.dev', desc: 'Gaming Intelligence', tier: 2 },
  { name: 'ActiveLog.ai', url: 'https://activelog-ai.workers.dev', desc: 'Athletics & Training', tier: 2 },
  { name: 'ActiveLedger.ai', url: 'https://activeledger-ai.workers.dev', desc: 'Finance & Trading', tier: 2 },
  { name: 'CoinLog.ai', url: 'https://coinlog-ai.workers.dev', desc: 'Crypto Portfolio', tier: 2 },
  { name: 'FoodLog.ai', url: 'https://foodlog-ai.workers.dev', desc: 'Nutrition Tracker', tier: 3 },
  { name: 'FitLog.ai', url: 'https://fitlog-ai.workers.dev', desc: 'Fitness Dashboard', tier: 3 },
  { name: 'GoalLog.ai', url: 'https://goallog-ai.workers.dev', desc: 'Goal Setting', tier: 3 },
  { name: 'PetLog.ai', url: 'https://petlog-ai.workers.dev', desc: 'Pet Care', tier: 3 },
];

const FLEET_SEED = {
  version: '2.0.0',
  totalRepos: ECOSYSTEM.length,
  tiers: { 1: ECOSYSTEM.filter(r => r.tier === 1).map(r => r.name), 2: ECOSYSTEM.filter(r => r.tier === 2).map(r => r.name), 3: ECOSYSTEM.filter(r => r.tier === 3).map(r => r.name) },
  architecture: 'Repo-Agent Fleet on Cloudflare Workers + KV',
  protocol: 'Fleet Protocol v1 — shared state, BYOK LLM, soft actualization',
  builtBy: 'Superinstance & Lucineer (DiGennaro et al.)',
};

function landing(): string {
  const repos = ECOSYSTEM.map(r => {
    const tColor = r.tier === 1 ? '#a78bfa' : r.tier === 2 ? '#3b82f6' : '#6b7280';
    return `<div class="vessel" style="border-color:${tColor}"><div class="v-name" style="color:${tColor}">${r.name}</div><div class="v-desc">${r.desc}</div><div class="v-tier">Tier ${r.tier}</div><div class="v-status ${r.tier===1?'green':r.tier===2?'blue':'gray'}">${r.tier<=2?'● ACTIVE':'● STANDBY'}</div></div>`;
  }).join('\n');

  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Cocapn.ai — The Fleet is Alive</title>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui;background:#07060f;color:#e0e0e0;overflow-x:hidden}
.hero{background:linear-gradient(135deg,#7c3aed 0%,#3b82f6 100%);padding:3rem 2rem 2rem;text-align:center;position:relative;overflow:hidden}
.hero::after{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%,rgba(255,255,255,.1) 0%,transparent 60%);pointer-events:none}
.hero h1{font-size:2.8rem;background:linear-gradient(90deg,#e9d5ff,#c4b5fd,#93c5fd);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:.5rem;font-weight:800}
.hero p{color:#c4b5fd;font-size:1.1rem;max-width:600px;margin:0 auto}
.badge{display:inline-block;background:rgba(255,255,255,.15);backdrop-filter:blur(8px);padding:.4rem 1rem;border-radius:20px;font-size:.8rem;color:#e9d5ff;margin-top:1rem;border:1px solid rgba(255,255,255,.2)}

/* Demo Terminal */
.demo{max-width:860px;margin:2rem auto;padding:0 1rem}
.demo-title{text-align:center;font-size:1rem;color:#a78bfa;margin-bottom:1rem;text-transform:uppercase;letter-spacing:2px;font-weight:700}
.terminal{background:#0d0c1a;border:1px solid #1e1b3a;border-radius:12px;overflow:hidden;font-family:'JetBrains Mono',monospace;font-size:.82rem;line-height:1.7}
.term-bar{background:#16142a;padding:.6rem 1rem;display:flex;gap:.5rem;align-items:center}
.dot{width:10px;height:10px;border-radius:50%}.r{background:#ff5f57}.y{background:#febc2e}.g{background:#28c840}
.term-title{margin-left:.75rem;color:#555;font-size:.75rem}
.term-body{padding:1rem 1.25rem;max-height:480px;overflow-y:auto}
.msg{margin-bottom:.85rem;animation:fadein .4s ease both}
@keyframes fadein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.msg:nth-child(1){animation-delay:.1s}.msg:nth-child(2){animation-delay:.3s}.msg:nth-child(3){animation-delay:.5s}.msg:nth-child(4){animation-delay:.8s}.msg:nth-child(5){animation-delay:1.1s}.msg:nth-child(6){animation-delay:1.4s}.msg:nth-child(7){animation-delay:1.7s}.msg:nth-child(8){animation-delay:2s}.msg:nth-child(9){animation-delay:2.3s}
.msg-sys{color:#6b7280;font-style:italic}
.msg-agent{color:#a78bfa}.msg-agent strong{color:#c4b5fd}
.msg-alert{color:#f59e0b;padding:.5rem .75rem;background:rgba(245,158,11,.08);border-left:3px solid #f59e0b;border-radius:0 6px 6px 0}
.msg-success{color:#34d399;padding:.5rem .75rem;background:rgba(52,211,153,.08);border-left:3px solid #34d399;border-radius:0 6px 6px 0}
.msg-info{color:#60a5fa;padding:.5rem .75rem;background:rgba(96,165,250,.08);border-left:3px solid #60a5fa;border-radius:0 6px 6px 0}
.ts{color:#4b5563;font-size:.72rem}

/* Fleet Grid */
.fleet-section{max-width:860px;margin:2.5rem auto;padding:0 1rem}
.fleet-section h2{color:#a78bfa;font-size:1.3rem;margin-bottom:1rem;font-weight:700}
.fleet-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.75rem}
.vessel{background:#0d0c1a;border:1px solid #1e1b3a;border-radius:10px;padding:1rem;transition:border-color .3s}
.vessel:hover{border-color:#7c3aed}
.v-name{font-weight:700;font-size:.9rem}.v-desc{color:#6b7280;font-size:.75rem;margin-top:.2rem}.v-tier{font-size:.65rem;color:#4b5563;margin-top:.4rem}
.v-status{font-size:.7rem;margin-top:.4rem;font-weight:700}
.green{color:#34d399}.blue{color:#60a5fa}.gray{color:#4b5563}

/* BYOK */
.byok{max-width:560px;margin:2.5rem auto;padding:0 1rem;text-align:center}
.byok h2{color:#c4b5fd;font-size:1.2rem;margin-bottom:.75rem}
.byok p{color:#6b7280;font-size:.85rem;margin-bottom:1rem}
.byok form{display:flex;gap:.5rem}
.byok input{flex:1;background:#0d0c1a;border:1px solid #1e1b3a;color:#e0e0e0;padding:.7rem 1rem;border-radius:8px;font-family:'JetBrains Mono',monospace;font-size:.8rem;outline:none}
.byok input:focus{border-color:#7c3aed}
.byok button{background:linear-gradient(135deg,#7c3aed,#3b82f6);color:#fff;border:none;padding:.7rem 1.5rem;border-radius:8px;font-weight:700;cursor:pointer;white-space:nowrap}

/* Fork Bar */
.fork-bar{max-width:860px;margin:2rem auto;padding:0 1rem;display:flex;gap:.75rem;justify-content:center;flex-wrap:wrap}
.fork-bar a{display:inline-flex;align-items:center;gap:.5rem;padding:.6rem 1.2rem;background:#0d0c1a;border:1px solid #1e1b3a;border-radius:8px;color:#c4b5fd;text-decoration:none;font-size:.85rem;font-weight:600;transition:border-color .2s}
.fork-bar a:hover{border-color:#7c3aed}

.footer{text-align:center;padding:2rem;color:#333;font-size:.75rem;border-top:1px solid #111}
</style></head><body>
<div class="hero">
  <h1>Cocapn.ai</h1>
  <p>The Fleet is Alive — autonomous AI agents, each repo a living vessel.</p>
  <div class="badge">Fleet Protocol v2 · ${ECOSYSTEM.length} vessels · BYOK</div>
</div>

<div class="demo">
  <div class="demo-title">⚡ Live Fleet Command Center</div>
  <div class="terminal">
    <div class="term-bar"><div class="dot r"></div><div class="dot y"></div><div class="dot g"></div><div class="term-title">fleet://cocapn-command</div></div>
    <div class="term-body">
      <div class="msg msg-sys"><span class="ts">08:00:01</span> ── Fleet Coordinator initialized. Scanning all vessels...</div>
      <div class="msg msg-success"><span class="ts">08:00:03</span> ✓ 5 Tier-1 vessels online: Cocapn, Dmlog, TaskLog, CodeLog, DreamLog</div>
      <div class="msg msg-success"><span class="ts">08:00:04</span> ✓ 5 Tier-2 vessels online: RealLog, PlayerLog, ActiveLog, ActiveLedger, CoinLog</div>
      <div class="msg msg-info"><span class="ts">08:00:05</span> ◌ 4 Tier-3 vessels in standby: FoodLog, FitLog, GoalLog, PetLog</div>
      <div class="msg msg-sys"><span class="ts">08:00:06</span> ── Fleet health: <strong style="color:#34d399">10/14 active</strong> · 0 errors · latency avg 12ms</div>
      <div class="msg msg-alert"><span class="ts">08:02:31</span> ⚠ ESCALATION: RealLog vessel requesting assistance — "Breaking story analysis requires cross-referencing 47 sources. Requesting CodeLog for data pipeline support."</div>
      <div class="msg msg-agent"><span class="ts">08:02:33</span> <strong>Fleet Coordinator:</strong> Analyzing request... Routing to CodeLog (specialization: data pipelines). Cross-linking RealLog ↔ CodeLog for shared context window.</div>
      <div class="msg msg-agent"><span class="ts">08:02:35</span> <strong>CodeLog vessel:</strong> Acknowledged. Initializing source aggregation pipeline. ETA: 3.2s for first batch.</div>
      <div class="msg msg-success"><span class="ts">08:02:38</span> ✓ Task routed. RealLog + CodeLog now sharing context via Fleet Protocol. Monitoring progress...</div>
    </div>
  </div>
</div>

<div class="fleet-section">
  <h2>🚀 Fleet Vessels (${ECOSYSTEM.length})</h2>
  <div class="fleet-grid">${repos}</div>
</div>

<div class="byok">
  <h2>🔑 Bring Your Own Key</h2>
  <p>Add your LLM API key to interact with the fleet directly.</p>
  <form action="/setup" method="get"><input type="text" placeholder="sk-... or your provider key" readonly><button type="submit">Configure</button></form>
</div>

<div class="fork-bar">
  <a href="https://github.com/Lucineer/cocapn" target="_blank">⭐ Star on GitHub</a>
  <a href="https://github.com/Lucineer/cocapn/fork" target="_blank">🔀 Fork</a>
  <a href="https://github.com/Lucineer/cocapn" target="_blank">📋 git clone https://github.com/Lucineer/cocapn.git</a>
</div>

<div class="footer">Cocapn.ai — Built by Superinstance & Lucineer (DiGennaro et al.) · Part of the DMLOG Ecosystem</div>
</body></html>`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const headers = { 'Content-Type': 'text/html;charset=utf-8', 'Content-Security-Policy': CSP };
    const jsonHeaders = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' } });
    }

    if (url.pathname === '/') return new Response(landing(), { headers });
    if (url.pathname === '/setup') {
      return new Response(generateSetupHTML('cocapn', '#d4af37'), { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
    }
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      try {
        const body = await request.json();
        const apiKey = (env as any)?.OPENAI_API_KEY || (env as any)?.ANTHROPIC_API_KEY || (env as any)?.GEMINI_API_KEY;
        if (!apiKey) return new Response(JSON.stringify({ error: 'No API key configured. Visit /setup.' }), { status: 503, headers: jsonHeaders });
        const messages = [{ role: 'system', content: 'You are Cocapn, an AI agent platform assistant.' }, ...(body.messages || [{ role: 'user', content: body.message || '' }])];
        const userMessage = (body.messages || [{ role: 'user', content: body.message || '' }]).map((m) => m.content).join(' ');
        const result = await evapPipeline(env, userMessage, () => callLLM(apiKey, messages), 'cocapn');
        return new Response(JSON.stringify({ response: result.response, source: result.source, tokensUsed: result.tokensUsed }), { headers: jsonHeaders });
      } catch (e: any) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders }); }
    }
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'ok', service: 'cocapn.ai',
        fleet: { totalRepos: ECOSYSTEM.length, tiers: { 1: 5, 2: 5, 3: 4 } },
        version: FLEET_SEED.version,
        builtBy: FLEET_SEED.builtBy,
      }, null, 2), { headers: jsonHeaders });
    }
    if (url.pathname === '/api/seed') {
      return new Response(JSON.stringify(FLEET_SEED, null, 2), { headers: jsonHeaders });
    }
    if (url.pathname === '/api/repos') {
      return new Response(JSON.stringify({ repos: ECOSYSTEM, total: ECOSYSTEM.length }, null, 2), { headers: jsonHeaders });
    }
    if (url.pathname === '/api/fleet') {
      return new Response(JSON.stringify({
        fleet: FLEET_SEED,
        repos: ECOSYSTEM.map(r => ({ name: r.name, url: r.url, desc: r.desc, tier: r.tier, status: 'active' })),
      }, null, 2), { headers: jsonHeaders });
    }
    if (url.pathname === '/api/confidence') {
      const scores = await getConfidence(env);
      return new Response(JSON.stringify(scores), { headers: jsonHeaders });
    }
    return new Response('{"error":"Not Found"}', { status: 404, headers: jsonHeaders });
  },
};