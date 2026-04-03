import { evapPipeline, getEvapReport, getLockStats } from './lib/evaporation-pipeline.js';
import { selectModel } from './lib/model-router.js';
import { trackConfidence, getConfidence } from './lib/confidence-tracker.js';
import { callLLM, generateSetupHTML } from './lib/byok.js';
import { deadbandCheck, deadbandStore, getEfficiencyStats } from './lib/deadband.js';
import { logResponse } from './lib/response-logger.js';

import { storePattern, findSimilar, getNeighborhood, crossRepoTransfer, listPatterns } from './lib/structural-memory.js';
import { exportPatterns, importPatterns, fleetSync } from './lib/cross-cocapn-bridge.js';
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

function dashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Cocapn.ai — Fleet Efficiency Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui;background:#07060f;color:#e0e0e0;min-height:100vh}
.topbar{background:linear-gradient(135deg,#7c3aed 0%,#3b82f6 100%);padding:1rem 2rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem}
.topbar h1{font-size:1.3rem;color:#fff;font-weight:800}
.topbar .meta{font-size:.75rem;color:#c4b5fd;display:flex;gap:1rem;align-items:center}
.topbar .meta .live{width:8px;height:8px;border-radius:50%;background:#34d399;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.container{max-width:1200px;margin:0 auto;padding:1.5rem}
.overview{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:.75rem;margin-bottom:2rem}
.ov-card{background:#0d0c1a;border:1px solid #1e1b3a;border-radius:10px;padding:1.25rem}
.ov-card .label{font-size:.7rem;color:#6b7280;text-transform:uppercase;letter-spacing:1px}
.ov-card .value{font-size:1.8rem;font-weight:800;margin-top:.25rem;background:linear-gradient(90deg,#c4b5fd,#60a5fa);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.ov-card .sub{font-size:.7rem;color:#4b5563;margin-top:.25rem}
.section-title{font-size:1.1rem;font-weight:700;color:#a78bfa;margin-bottom:1rem;display:flex;align-items:center;gap:.5rem}
.repo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:.75rem;margin-bottom:2rem}
.repo-card{background:#0d0c1a;border:1px solid #1e1b3a;border-radius:10px;padding:1.25rem;transition:border-color .3s}
.repo-card:hover{border-color:#7c3aed}
.repo-card.offline{opacity:.5}
.repo-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem}
.repo-name{font-weight:700;font-size:.95rem;color:#e0e0e0}
.repo-domain{font-size:.7rem;color:#6b7280}
.repo-badge{font-size:.6rem;padding:.2rem .6rem;border-radius:10px;font-weight:700}
.tier1{background:rgba(167,139,250,.15);color:#a78bfa}
.tier2{background:rgba(59,130,246,.15);color:#60a5fa}
.tier3{background:rgba(107,114,128,.15);color:#6b7280}
.online-dot{color:#34d399;font-size:.7rem}
.offline-dot{color:#ef4444;font-size:.7rem}
.metrics{display:flex;flex-direction:column;gap:.5rem}
.metric-row{display:flex;align-items:center;gap:.5rem;font-size:.75rem}
.metric-label{width:100px;color:#6b7280;flex-shrink:0}
.metric-bar-bg{flex:1;height:6px;background:#1e1b3a;border-radius:3px;overflow:hidden}
.metric-bar{height:100%;border-radius:3px;transition:width .8s ease}
.bar-eff{background:linear-gradient(90deg,#7c3aed,#a78bfa)}
.bar-cache{background:linear-gradient(90deg,#3b82f6,#60a5fa)}
.bar-lock{background:linear-gradient(90deg,#10b981,#34d399)}
.bar-evap{background:linear-gradient(90deg,#f59e0b,#fbbf24)}
.metric-val{width:40px;text-align:right;color:#e0e0e0;font-weight:600;font-family:'JetBrains Mono',monospace;font-size:.7rem}
.conf-topics{margin-top:.75rem;border-top:1px solid #1e1b3a;padding-top:.5rem}
.conf-topics .ct-title{font-size:.65rem;color:#4b5563;text-transform:uppercase;letter-spacing:1px;margin-bottom:.3rem}
.conf-chip{display:inline-block;font-size:.6rem;padding:.15rem .5rem;background:#16142a;border:1px solid #1e1b3a;border-radius:8px;color:#a78bfa;margin:.1rem .15rem}
.leaderboard{margin-bottom:2rem}
.lb-list{display:flex;flex-direction:column;gap:.5rem}
.lb-row{display:flex;align-items:center;gap:1rem;background:#0d0c1a;border:1px solid #1e1b3a;border-radius:8px;padding:.75rem 1rem}
.lb-rank{font-size:1.1rem;font-weight:800;width:30px;text-align:center}
.lb-rank.gold{color:#fbbf24}.lb-rank.silver{color:#94a3b8}.lb-rank.bronze{color:#d97706}
.lb-name{flex:1;font-weight:600;font-size:.85rem}
.lb-phase{font-size:.7rem;padding:.2rem .5rem;border-radius:6px;font-weight:700}
.phase4{background:rgba(52,211,153,.15);color:#34d399}
.phase3{background:rgba(59,130,246,.15);color:#60a5fa}
.phase2{background:rgba(245,158,11,.15);color:#f59e0b}
.phase1{background:rgba(107,114,128,.15);color:#6b7280}
.lb-bar-wrap{width:120px}
.lb-bar-bg{height:6px;background:#1e1b3a;border-radius:3px;overflow:hidden}
.lb-bar{height:100%;border-radius:3px;background:linear-gradient(90deg,#f59e0b,#34d399)}
.lb-pct{font-size:.7rem;color:#6b7280;width:35px;text-align:right;font-family:'JetBrains Mono',monospace}
.info-row{display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:2rem}
@media(max-width:700px){.info-row{grid-template-columns:1fr}}
.info-card{background:#0d0c1a;border:1px solid #1e1b3a;border-radius:10px;padding:1.25rem}
.info-card h3{font-size:.8rem;color:#a78bfa;margin-bottom:.5rem}
.info-card p{font-size:.75rem;color:#6b7280;line-height:1.5}
.demote-list{list-style:none;margin-top:.5rem}
.demote-list li{font-size:.7rem;padding:.3rem 0;border-bottom:1px solid #1e1b3a;display:flex;justify-content:space-between}
.demote-list li:last-child{border:none}
.demote-score{color:#34d399;font-weight:600;font-family:'JetBrains Mono',monospace}
.loading{text-align:center;padding:4rem;color:#4b5563;font-size:1rem}
.spinner{display:inline-block;width:24px;height:24px;border:3px solid #1e1b3a;border-top-color:#7c3aed;border-radius:50%;animation:spin 1s linear infinite;margin-bottom:1rem}
@keyframes spin{to{transform:rotate(360deg)}}
.refresh-bar{position:fixed;top:0;left:0;height:2px;background:linear-gradient(90deg,#7c3aed,#3b82f6);z-index:100;transition:width 1s linear}
</style></head>
<body>
<div class="refresh-bar" id="refreshBar"></div>
<div class="topbar">
  <h1>📊 Fleet Efficiency Dashboard</h1>
  <div class="meta"><div class="live"></div><span id="lastUpdate">Loading...</span><span id="nextRefresh"></span></div>
</div>
<div class="container">
  <div id="loading" class="loading"><div class="spinner"></div><br>Scanning fleet vessels...</div>
  <div id="content" style="display:none"></div>
</div>
<script>
const REFRESH_MS = 60000;
let refreshTimer;
function startRefreshBar(){const bar=document.getElementById('refreshBar');let w=0;const iv=setInterval(()=>{w+=100/REFRESH_MS*1000;if(w>=100)w=0;bar.style.width=w+'%'},1000);return iv}
async function load(){
  try{
    const d=await fetch('/api/fleet/efficiency').then(r=>r.json());
    render(d);
    document.getElementById('loading').style.display='none';
    document.getElementById('content').style.display='block';
    const ts=new Date(d.timestamp).toLocaleTimeString();
    document.getElementById('lastUpdate').textContent='Updated: '+ts;
  }catch(e){document.getElementById('loading').innerHTML='<div style="color:#ef4444">Failed to load fleet data</div>'}
}
function render(d){
  const tot=d.totals||{};
  const effPct=tot.totalTokens>0?Math.round(tot.tokensSaved/tot.totalTokens*100):0;
  const cachePct=tot.totalRequests>0?Math.round((tot.cacheHits/tot.totalRequests)*100):0;
  let html=
    '<div class="overview">'+
      '<div class="ov-card"><div class="label">Total Vessels</div><div class="value">'+d.totalRepos+'</div><div class="sub">'+d.onlineRepos+' online</div></div>'+
      '<div class="ov-card"><div class="label">Total Requests</div><div class="value">'+(tot.totalRequests||0).toLocaleString()+'</div></div>'+
      '<div class="ov-card"><div class="label">Tokens Saved</div><div class="value">'+(tot.tokensSaved||0).toLocaleString()+'</div></div>'+
      '<div class="ov-card"><div class="label">Global Efficiency</div><div class="value">'+effPct+'%</div><div class="sub">tokens saved / total</div></div>'+
      '<div class="ov-card"><div class="label">Cache Coverage</div><div class="value">'+cachePct+'%</div></div>'+
      '<div class="ov-card"><div class="label">Cross-Domain Patterns</div><div class="value">'+(d.patternCount||0)+'</div><div class="sub">'+(d.crossDomainPairs||0)+' domain pairs linked</div></div>'+
    '</div>';
  html+='<div class="section-title">🚀 Vessel Performance</div><div class="repo-grid">';
  const sorted=[...(d.repos||[])].sort((a,b)=>b.tier-a.tier||(b.online-a.online));
  sorted.forEach(r=>{
    const eff=r.efficiency||{};
    const eScore=eff.totalTokens>0?Math.round((eff.tokensSaved/eff.totalTokens)*100):0;
    const cRate=eff.cacheHitRate||0;
    const lCov=r.lockStats?.coverage||0;
    const eCov=r.evaporation?.coverage||0;
    const tc=r.tier===1?'tier1':r.tier===2?'tier2':'tier3';
    const scores=r.confidence?.scores||[];
    const topTopics=[...scores].sort((a,b)=>(b.score||0)-(a.score||0)).slice(0,4);
    const chips=topTopics.map(t=>'<span class="conf-chip">'+(t.topic||t.pattern||'?')+' '+((t.score||0)*100).toFixed(0)+'%</span>').join('');
    html+='<div class="repo-card '+(r.online?'':'offline')+'"><div class="repo-header"><div><div class="repo-name">'+r.name+'</div><div class="repo-domain">'+(r.desc||'')+'</div></div><span class="repo-badge '+tc+'">T'+r.tier+'</span>'+(r.online?'<span class="online-dot">●</span>':'<span class="offline-dot">●</span>')+'</div><div class="metrics"><div class="metric-row"><span class="metric-label">Efficiency</span><div class="metric-bar-bg"><div class="metric-bar bar-eff" style="width:'+eScore+'%"></div></div><span class="metric-val">'+eScore+'%</span></div><div class="metric-row"><span class="metric-label">Cache Hit</span><div class="metric-bar-bg"><div class="metric-bar bar-cache" style="width:'+cRate+'%"></div></div><span class="metric-val">'+cRate+'%</span></div><div class="metric-row"><span class="metric-label">Lock Cov</span><div class="metric-bar-bg"><div class="metric-bar bar-lock" style="width:'+lCov+'%"></div></div><span class="metric-val">'+lCov+'%</span></div><div class="metric-row"><span class="metric-label">Evap Prog</span><div class="metric-bar-bg"><div class="metric-bar bar-evap" style="width:'+eCov+'%"></div></div><span class="metric-val">'+eCov+'%</span></div></div><div class="conf-topics"><div class="ct-title">Top Confidence</div>'+(chips||'<span style="color:#333;font-size:.65rem">No data</span>')+'</div></div>';
  });
  html+='</div>';
  const evapSorted=[...(d.repos||[])].filter(r=>r.online).map(r=>({name:r.name,coverage:r.evaporation?.coverage||0,tier:r.tier,hot:(r.evaporation?.hot||[]).length})).sort((a,b)=>b.coverage-a.coverage);
  html+='<div class="section-title">🔥 Evaporation Leaderboard</div><div class="leaderboard"><div class="lb-list">';
  evapSorted.forEach((r,i)=>{
    const phase=r.coverage>=80?4:r.coverage>=50?3:r.coverage>=20?2:1;
    const pClass=phase===4?'phase4':phase===3?'phase3':phase===2?'phase2':'phase1';
    const rankClass=i===0?'gold':i===1?'silver':i===2?'bronze':'';
    html+='<div class="lb-row"><div class="lb-rank '+rankClass+'">#'+(i+1)+'</div><div class="lb-name">'+r.name+'</div><span class="lb-phase '+pClass+'">Phase '+phase+(phase===4?' 🤖':'')+'</span><div class="lb-bar-wrap"><div class="lb-bar-bg"><div class="lb-bar" style="width:'+r.coverage+'%"></div></div></div><span class="lb-pct">'+r.coverage+'%</span></div>';
  });
  html+='</div></div>';
  html+='<div class="info-row"><div class="info-card"><h3>🔗 Cross-Domain Knowledge Graph</h3><p>'+(d.patternCount||0)+' structural patterns stored across '+(d.crossDomainPairs||0)+' possible domain pairings. Patterns flow between vessels via Fleet Protocol.</p></div><div class="info-card"><h3>⬇️ Model Demotion Candidates</h3><p>Topics with ≥95% confidence can be served by smaller, cheaper models.</p><ul class="demote-list">';
  const demotes=(d.demotionCandidates||[]).slice(0,8);
  if(demotes.length===0) html+='<li style="color:#333">No candidates yet</li>';
  demotes.forEach(c=>{html+='<li><span>'+c.repo+' → '+c.topic+'</span><span class="demote-score">'+(c.score*100).toFixed(1)+'%</span></li>'});
  html+='</ul></div></div>';
  document.getElementById('content').innerHTML=html;
}
load();
refreshTimer=setInterval(load,REFRESH_MS);
startRefreshBar();
</script></body></html>`;
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
    if (url.pathname === '/api/efficiency') {
      const stats = await getEfficiencyStats(env.COCAPN_KV, 'cocapn');
      const lockStats = await getLockStats(env);
      const evap = await getEvapReport(env, 'cocapn');
      const conf = await getConfidence(env);
      return new Response(JSON.stringify({ repo: 'cocapn.ai', ...stats, lockStats, evaporation: evap, confidence: conf }), { headers: jsonHeaders });
    }
    if (url.pathname === '/api/evaporation') {
      const report = await getEvapReport(env, 'cocapn');
      return new Response(JSON.stringify(report), { headers: jsonHeaders });
    }

    // ── Fleet Dashboard ──
    if (url.pathname === '/dashboard') {
      return new Response(dashboardHTML(), { headers });
    }
    if (url.pathname === '/api/fleet/efficiency') {
      const results: any[] = [];
      const promises = ECOSYSTEM.map(async (repo) => {
        try {
          const [eff, evapRes, confRes] = await Promise.allSettled([
            fetch(`${repo.url}/api/efficiency`).then(r => r.json()),
            fetch(`${repo.url}/api/evaporation`).then(r => r.json()),
            fetch(`${repo.url}/api/confidence`).then(r => r.json()),
          ]);
          const efficiency = eff.status === 'fulfilled' ? eff.value : { totalRequests: 0, cacheHits: 0, cacheHitRate: 0, tokensSaved: 0, totalTokens: 0 };
          const evaporation = evapRes.status === 'fulfilled' ? evapRes.value : { hot: [], warm: [], coverage: 0 };
          const confidence = confRes.status === 'fulfilled' ? confRes.value : { scores: [] };
          results.push({ name: repo.name, url: repo.url, desc: repo.desc, tier: repo.tier, online: eff.status === 'fulfilled', efficiency, evaporation, confidence });
        } catch {
          results.push({ name: repo.name, url: repo.url, desc: repo.desc, tier: repo.tier, online: false, efficiency: { totalRequests: 0, cacheHits: 0, cacheHitRate: 0, tokensSaved: 0, totalTokens: 0 }, evaporation: { hot: [], warm: [], coverage: 0 }, confidence: { scores: [] } });
        }
      });
      await Promise.all(promises);
      const totalRepos = results.length;
      const onlineRepos = results.filter(r => r.online).length;
      const totals = results.reduce((acc, r) => ({
        totalRequests: acc.totalRequests + (r.efficiency.totalRequests || 0),
        tokensSaved: acc.tokensSaved + (r.efficiency.tokensSaved || 0),
        totalTokens: acc.totalTokens + (r.efficiency.totalTokens || 0),
        cacheHits: acc.cacheHits + (r.efficiency.cacheHits || 0),
      }), { totalRequests: 0, tokensSaved: 0, totalTokens: 0, cacheHits: 0 });
      const globalEfficiency = totals.totalTokens > 0 ? Math.round(totals.tokensSaved / totals.totalTokens * 100) : 0;
      // Cross-domain patterns
      const patterns = await listPatterns(env);
      const domains = new Set((patterns as any[]).map((p: any) => p.source || p.repo));
      const crossDomainPairs = Math.floor(domains.size * (domains.size - 1) / 2);
      // Model demotion candidates: topics with confidence >= 0.95
      const demotionCandidates: any[] = [];
      results.forEach(r => {
        const scores = (r.confidence.scores || []);
        scores.forEach((s: any) => {
          if (s.score >= 0.95) demotionCandidates.push({ repo: r.name, topic: s.topic || s.pattern, score: s.score });
        });
      });
      return new Response(JSON.stringify({ totalRepos, onlineRepos, totals, globalEfficiency, repos: results, crossDomainPairs, patternCount: (patterns as any[]).length, demotionCandidates, timestamp: Date.now() }), { headers: jsonHeaders });
    }
    if (url.pathname === '/api/fleet/rankings') {
      // Reuse fleet/efficiency logic
      const url2 = new URL(request.url);
      url2.pathname = '/api/fleet/efficiency';
      const res = await fetch(url2.toString());
      const data = await res.json() as any;
      const ranked = data.repos
        .map((r: any) => ({ name: r.name, tier: r.tier, online: r.online, efficiencyScore: r.efficiency.totalTokens > 0 ? Math.round((r.efficiency.tokensSaved / r.efficiency.totalTokens) * 100) : 0, cacheHitRate: r.efficiency.cacheHitRate || 0, tokensSaved: r.efficiency.tokensSaved || 0, evapCoverage: r.evaporation?.coverage || 0 }))
        .sort((a: any, b: any) => b.efficiencyScore - a.efficiencyScore);
      return new Response(JSON.stringify({ rankings: ranked, timestamp: data.timestamp }), { headers: jsonHeaders });
    }

    // ── Phase 4: Structural Memory Routes ──
    if (url.pathname === '/api/memory' && request.method === 'GET') {
      const source = url.searchParams.get('source') || undefined;
      const patterns = await listPatterns(env, source);
      return new Response(JSON.stringify(patterns), { headers: jsonHeaders });
    }
    if (url.pathname === '/api/memory' && request.method === 'POST') {
      const body = await request.json();
      await storePattern(env, body);
      return new Response(JSON.stringify({ ok: true, id: body.id }), { headers: jsonHeaders });
    }
    if (url.pathname === '/api/memory/similar') {
      const structure = url.searchParams.get('structure') || '';
      const threshold = parseFloat(url.searchParams.get('threshold') || '0.7');
      const similar = await findSimilar(env, structure, threshold);
      return new Response(JSON.stringify(similar), { headers: jsonHeaders });
    }
    if (url.pathname === '/api/memory/transfer') {
      const fromRepo = url.searchParams.get('from') || '';
      const toRepo = url.searchParams.get('to') || '';
      const problem = url.searchParams.get('problem') || '';
      const transfers = await crossRepoTransfer(env, fromRepo, toRepo, problem);
      return new Response(JSON.stringify(transfers), { headers: jsonHeaders });
    }
    if (url.pathname === '/api/memory/sync' && request.method === 'POST') {
      const body = await request.json();
      const repos = body.repos || [];
      const result = await fleetSync(env, repos);
      return new Response(JSON.stringify(result), { headers: jsonHeaders });
    }
    return new Response('{"error":"Not Found"}', { status: 404, headers: jsonHeaders });
  },
};