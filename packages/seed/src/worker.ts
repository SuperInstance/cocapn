/**
 * Cloudflare Worker — edge deployment for cocapn seed.
 *
 * Serves the web UI and proxies /api/chat to the user's LLM provider.
 * Uses KV for memory persistence (instead of JSON file).
 *
 * Secrets (set via `wrangler secret put`):
 *   DEEPSEEK_API_KEY
 *   OPENAI_API_KEY
 */

// ─── Types ────────────────────────────────────────────────────────────────────

interface Env {
  DEEPSEEK_API_KEY?: string;
  OPENAI_API_KEY?: string;
  PROVIDER: string;
  MODEL: string;
  MEMORY: KVNamespace;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  ts: number;
}

interface MemoryStore {
  messages: Message[];
  facts: Record<string, string>;
}

const MAX_MESSAGES = 100;
const MEMORY_KEY = 'cocapn:memory';

// ─── Provider config ─────────────────────────────────────────────────────────

const PROVIDERS: Record<string, { baseUrl: string; model: string }> = {
  deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  openai: { baseUrl: 'https://api.openai.com', model: 'gpt-4o-mini' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...headers },
  });
}

function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
  });
}

async function getMemory(kv: KVNamespace): Promise<MemoryStore> {
  const raw = await kv.get(MEMORY_KEY);
  if (!raw) return { messages: [], facts: {} };
  try {
    const parsed = JSON.parse(raw) as MemoryStore;
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      facts: parsed.facts && typeof parsed.facts === 'object' ? parsed.facts as Record<string, string> : {},
    };
  } catch {
    return { messages: [], facts: {} };
  }
}

async function putMemory(kv: KVNamespace, data: MemoryStore): Promise<void> {
  await kv.put(MEMORY_KEY, JSON.stringify(data));
}

function resolveProvider(env: Env): { baseUrl: string; model: string; apiKey: string } {
  const p = PROVIDERS[env.PROVIDER ?? 'deepseek'] ?? PROVIDERS.deepseek;
  const apiKey = env.DEEPSEEK_API_KEY ?? env.OPENAI_API_KEY ?? '';
  return { baseUrl: p.baseUrl, model: env.MODEL || p.model, apiKey };
}

// ─── Chat handler ─────────────────────────────────────────────────────────────

async function handleChat(req: Request, env: Env): Promise<Response> {
  let body: { message?: string };
  try {
    body = await req.json() as { message?: string };
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }
  const userMessage = (body.message ?? '').trim();
  if (!userMessage) return jsonResponse({ error: 'Empty message' }, 400);

  const memory = await getMemory(env.MEMORY);
  const provider = resolveProvider(env);

  // Build system prompt
  const facts = Object.entries(memory.facts);
  const factsSection = facts.length > 0
    ? '## What I Remember\n' + facts.map(([k, v]) => `- ${k}: ${v}`).join('\n')
    : '';
  const recentCtx = memory.messages.slice(-20)
    .map(m => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  const systemPrompt = [
    'You are a cocapn agent — a self-aware repository. You speak in first person.',
    'You are helpful, curious, and honest.',
    factsSection,
    '## Recent Conversation',
    recentCtx || '(start of conversation)',
  ].join('\n\n');

  // Stream from LLM
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (provider.apiKey) headers['Authorization'] = `Bearer ${provider.apiKey}`;

  const llmRes = await fetch(`${provider.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 2048,
      stream: true,
    }),
  });

  if (!llmRes.ok) {
    const errText = await llmRes.text().catch(() => 'unknown');
    return jsonResponse({ error: `LLM ${llmRes.status}: ${errText}` }, 502);
  }

  // Save user message to memory
  memory.messages.push({ role: 'user', content: userMessage, ts: Date.now() });

  // Stream response back as SSE
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Process stream in background
  (async () => {
    let fullResponse = '';
    try {
      const reader = llmRes.body?.getReader();
      if (!reader) { await writer.close(); return; }
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const payload = trimmed.slice(6);
          if (payload === '[DONE]') break;
          try {
            const chunk = JSON.parse(payload) as {
              choices: Array<{ delta?: { content?: string }; finish_reason?: string }>;
            };
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              fullResponse += content;
              await writer.write(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`));
    }
    await writer.write(encoder.encode('data: [DONE]\n\n'));
    await writer.close();

    // Save assistant response to KV
    if (fullResponse) {
      memory.messages.push({ role: 'assistant', content: fullResponse, ts: Date.now() });
      if (memory.messages.length > MAX_MESSAGES) {
        memory.messages = memory.messages.slice(-MAX_MESSAGES);
      }
      await putMemory(env.MEMORY, memory);
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// ─── Web UI (inline) ─────────────────────────────────────────────────────────

// This is a minimal version. For the full UI, the build process can inline
// public/index.html from the seed package.
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>cocapn</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  :root{--bg:#09090b;--surface:#111113;--border:#1e1e22;--text:#d4d4d8;--muted:#71717a;
    --accent:#22c55e;--accent2:#16a34a;--user-bg:#1e3a5f;--bot-bg:#16161a;--mono:'SF Mono',SFMono-Regular,Consolas,'Liberation Mono',Menlo,monospace}
  body{font-family:var(--mono);background:var(--bg);color:var(--text);height:100vh;height:100dvh;display:flex;flex-direction:column;overflow:hidden}
  header{padding:14px 20px;background:var(--surface);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-shrink:0}
  .dot{width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 6px var(--accent);animation:pulse 2s ease-in-out infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
  header h1{font-size:13px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text)}
  #messages{flex:1;overflow-y:auto;padding:12px 20px 20px;scroll-behavior:smooth}
  #messages::-webkit-scrollbar{width:4px}
  #messages::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
  .msg{margin-bottom:14px;max-width:680px;animation:fadeIn .2s ease}
  @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
  .msg.user{margin-left:auto;text-align:right}
  .msg .role{font-size:10px;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px}
  .msg .bubble{padding:10px 14px;border-radius:10px;white-space:pre-wrap;line-height:1.6;font-size:13px;word-break:break-word}
  .msg.user .bubble{background:var(--user-bg);border-bottom-right-radius:2px;display:inline-block;text-align:left}
  .msg.assistant .bubble{background:var(--bot-bg);border:1px solid var(--border);border-bottom-left-radius:2px}
  #input-area{padding:14px 20px;background:var(--surface);border-top:1px solid var(--border);display:flex;gap:8px;flex-shrink:0}
  #input{flex:1;padding:10px 14px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-family:var(--mono);font-size:13px;outline:none;resize:none}
  #input:focus{border-color:var(--accent)}
  #input::placeholder{color:var(--muted)}
  .btn{padding:10px 18px;border-radius:8px;border:none;background:var(--accent);color:#000;font-family:var(--mono);font-weight:600;font-size:12px;cursor:pointer}
  .btn:hover{background:var(--accent2)}
  .btn:disabled{opacity:.4;cursor:not-allowed}
</style>
</head>
<body>
<header>
  <div class="dot"></div>
  <h1>cocapn</h1>
  <span style="margin-left:auto;font-size:11px;color:var(--muted)">edge worker</span>
</header>
<div id="messages"></div>
<div id="input-area">
  <input id="input" placeholder="Say something..." autofocus autocomplete="off" />
  <button class="btn" id="send">Send</button>
</div>
<script>
const msgs=document.getElementById('messages'),input=document.getElementById('input'),sendBtn=document.getElementById('send');
let busy=false;
function esc(t){const d=document.createElement('div');d.textContent=t;return d.innerHTML}
function addMsg(role,text){const d=document.createElement('div');d.className='msg '+role;d.innerHTML='<div class="role">'+role+'</div><div class="bubble">'+esc(text)+'</div>';msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight}
async function send(){const text=input.value.trim();if(!text||busy)return;input.value='';busy=true;sendBtn.disabled=true;addMsg('user',text);try{const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text})});const reader=res.body.getReader();const dec=new TextDecoder();let full='',msgDiv=null;while(true){const{done,value}=await reader.read();if(done)break;const chunk=dec.decode(value,{stream:true});for(const line of chunk.split('\\n')){if(!line.startsWith('data: '))continue;const p=line.slice(6).trim();if(p==='[DONE]')break;try{const d=JSON.parse(p);if(d.content){full+=d.content;if(!msgDiv)msgDiv=addMsg('assistant','');msgDiv.querySelector('.bubble').textContent=full;msgs.scrollTop=msgs.scrollHeight}if(d.error){addMsg('assistant','Error: '+d.error);break}}catch{}}}if(!full&&!msgDiv)addMsg('assistant','(no response)')}catch(e){addMsg('assistant','Error: '+e.message)}busy=false;sendBtn.disabled=false;input.focus()}
sendBtn.onclick=send;
input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}};
</script>
</body>
</html>`;

// ─── Router ──────────────────────────────────────────────────────────────────

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
    }

    // GET / — chat UI
    if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
      return htmlResponse(HTML);
    }

    // GET /api/status
    if (req.method === 'GET' && path === '/api/status') {
      const memory = await getMemory(env.MEMORY);
      return jsonResponse({
        name: 'cocapn-edge',
        tone: 'helpful',
        born: 'deployed on Cloudflare Workers',
        commits: 0,
        files: 0,
        branch: 'edge',
        memoryCount: memory.messages.length,
        factCount: Object.keys(memory.facts).length,
      });
    }

    // GET /api/memory
    if (req.method === 'GET' && path === '/api/memory') {
      const memory = await getMemory(env.MEMORY);
      return jsonResponse({ messages: memory.messages.slice(-20), facts: memory.facts });
    }

    // DELETE /api/memory
    if (req.method === 'DELETE' && path === '/api/memory') {
      await putMemory(env.MEMORY, { messages: [], facts: {} });
      return jsonResponse({ ok: true });
    }

    // POST /api/chat
    if (req.method === 'POST' && path === '/api/chat') {
      return handleChat(req, env);
    }

    return jsonResponse({ error: 'Not found' }, 404);
  },
} satisfies ExportedHandler<Env>;
