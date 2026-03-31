/**
 * Web — minimal HTTP chat server for cocapn.
 *
 * Routes:
 *   GET  /                → chat UI (index.html)
 *   GET  /cocapn/soul.md  → public soul
 *   GET  /api/status      → agent state (name, birth, files, last commit)
 *   GET  /api/whoami      → full self-perception
 *   GET  /api/memory      → recent memories
 *   GET  /api/memory/search?q= → search memories
 *   DELETE /api/memory    → clear all memories
 *   GET  /api/git/log     → recent commits
 *   GET  /api/git/stats   → repo statistics
 *   GET  /api/git/diff    → uncommitted changes
 *   POST /api/chat        → streaming SSE chat
 *   POST /api/a2a/handshake → exchange capabilities
 *   POST /api/a2a/message   → receive and process A2A message
 *   GET  /api/a2a/peers     → list known agents
 *   POST /api/a2a/disconnect → remove peer
 *   GET  /api/users         → list known users
 *   POST /api/user/identify  → set name for session user
 *
 * Zero dependencies. Uses only Node.js built-ins.
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { LLM } from './llm.js';
import type { Memory } from './memory.js';
import type { Awareness } from './awareness.js';
import type { Soul } from './soul.js';
import { log as gitLog, stats as gitStats, diff as gitDiff } from './git.js';
import { loadTheme, themeToCSS } from './theme.js';
import type { A2AHub } from './a2a.js';

// ─── Session helpers ───────────────────────────────────────────────────────────

const sessions: Map<string, string> = new Map(); // sessionId → userId

function getSessionId(req: IncomingMessage): string | undefined {
  const cookies = req.headers.cookie ?? '';
  const match = cookies.match(/cocapn-session=([^;]+)/);
  return match?.[1];
}

function setSessionCookie(res: ServerResponse, sessionId: string): void {
  res.setHeader('Set-Cookie', `cocapn-session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`);
}

function resolveSession(req: IncomingMessage, res: ServerResponse, memory: Memory): { sessionId: string; userId: string } {
  let sessionId = getSessionId(req);
  let userId = sessionId ? sessions.get(sessionId) : undefined;

  if (!sessionId || !userId) {
    sessionId = randomUUID();
    userId = randomUUID();
    const anonName = `user_${userId.slice(0, 6)}`;
    memory.getOrCreateUser(userId, anonName);
    sessions.set(sessionId, userId);
    setSessionCookie(res, sessionId);
  }

  return { sessionId, userId };
}

// ─── Inline HTML (loaded from public/index.html at startup) ────────────────────

let htmlCache: string | null = null;
let themedHTML: string | null = null;

function getHTML(themeCSS: string, soulName: string, soulAvatar: string): string {
  if (themedHTML) return themedHTML;
  if (!htmlCache) {
    const paths = [
      join(resolve('.'), 'public', 'index.html'),
      join(import.meta.dirname ?? '.', '..', 'public', 'index.html'),
    ];
    for (const p of paths) {
      if (existsSync(p)) { htmlCache = readFileSync(p, 'utf-8'); break; }
    }
    if (!htmlCache) htmlCache = `<!DOCTYPE html><html><body style="background:#0a0a0a;color:#e0e0e0;font-family:monospace;display:flex;justify-content:center;align-items:center;height:100vh"><div><h1>cocapn</h1><p>Chat UI not found. Use POST /api/chat</p></div></body></html>`;
  }
  themedHTML = htmlCache
    .replace('/*__THEME__*/', themeCSS)
    .replace(/__AGENT_NAME__/g, soulName || 'cocapn')
    .replace(/__AGENT_AVATAR__/g, soulAvatar || '🤖');
  return themedHTML;
}

// ─── JSON helper ───────────────────────────────────────────────────────────────

function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk: Buffer) => { data += chunk; });
    req.on('end', () => resolve(data));
  });
}

// ─── Server ────────────────────────────────────────────────────────────────────

export function startWebServer(
  port: number,
  llm: LLM,
  memory: Memory,
  awareness: Awareness,
  soul: Soul,
  a2a?: A2AHub,
) {
  const theme = loadTheme(process.cwd(), soul.theme);
  const themeCSS = themeToCSS(theme);
  const systemPrompt = `You are ${soul.name}. Your tone is ${soul.tone}.\n\n${soul.body}`;
  const self = awareness.perceive();
  const repoDir = process.cwd();
  const avatar = soul.avatar || '🤖';

  const server = createServer(async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    const path = url.pathname;

    // GET / — chat UI
    if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getHTML(themeCSS, soul.name, avatar));
      return;
    }

    // GET /cocapn/soul.md — public soul
    if (req.method === 'GET' && path === '/cocapn/soul.md') {
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
      res.end(`---\nname: ${soul.name}\ntone: ${soul.tone}\n---\n\n${soul.body}`);
      return;
    }

    // GET /api/status — agent state
    if (req.method === 'GET' && path === '/api/status') {
      const fresh = awareness.perceive();
      json(res, {
        name: soul.name,
        tone: soul.tone,
        avatar,
        born: fresh.born,
        age: fresh.age,
        commits: fresh.commits,
        files: fresh.files,
        languages: fresh.languages,
        branch: fresh.branch,
        lastCommit: fresh.lastCommit,
        feeling: fresh.feeling,
        memoryCount: memory.messages.length,
        factCount: Object.keys(memory.facts).length,
        theme: { accent: theme.accent, mode: theme.mode },
      });
      return;
    }

    // GET /api/whoami — full self-perception
    if (req.method === 'GET' && path === '/api/whoami') {
      const fresh = awareness.perceive();
      json(res, {
        name: soul.name,
        born: fresh.born,
        age: fresh.age,
        description: fresh.description,
        files: fresh.files,
        languages: fresh.languages,
        commits: fresh.commits,
        branch: fresh.branch,
        authors: fresh.authors,
        lastCommit: fresh.lastCommit,
        feeling: fresh.feeling,
        memory: { facts: Object.keys(memory.facts).length, messages: memory.messages.length },
        recentActivity: fresh.recentActivity,
      });
      return;
    }

    // GET /api/memory — recent memories
    if (req.method === 'GET' && path === '/api/memory') {
      json(res, {
        messages: memory.recent(20),
        facts: memory.facts,
      });
      return;
    }

    // GET /api/memory/search?q=... — search memories
    if (req.method === 'GET' && path === '/api/memory/search') {
      const q = url.searchParams.get('q') ?? '';
      if (!q) { json(res, { error: 'Missing query param "q"' }, 400); return; }
      json(res, memory.search(q));
      return;
    }

    // DELETE /api/memory — clear all memories
    if (req.method === 'DELETE' && path === '/api/memory') {
      memory.clear();
      json(res, { ok: true });
      return;
    }

    // GET /api/users — list known users
    if (req.method === 'GET' && path === '/api/users') {
      json(res, { users: memory.getUsers() });
      return;
    }

    // POST /api/user/identify — set name for session user
    if (req.method === 'POST' && path === '/api/user/identify') {
      const body = await readBody(req);
      try {
        const { name } = JSON.parse(body) as { name?: string };
        if (!name?.trim()) { json(res, { error: 'Name is required' }, 400); return; }
        const { userId } = resolveSession(req, res, memory);
        const user = memory.getOrCreateUser(userId, name.trim());
        user.name = name.trim();
        user.lastSeen = new Date().toISOString();
        memory['save']();
        json(res, { ok: true, user: { id: userId, name: user.name } });
      } catch { json(res, { error: 'Invalid JSON' }, 400); }
      return;
    }

    // GET /api/git/log — recent commits
    if (req.method === 'GET' && path === '/api/git/log') {
      json(res, gitLog(repoDir));
      return;
    }

    // GET /api/git/stats — repo statistics
    if (req.method === 'GET' && path === '/api/git/stats') {
      json(res, gitStats(repoDir));
      return;
    }

    // GET /api/git/diff — uncommitted changes
    if (req.method === 'GET' && path === '/api/git/diff') {
      json(res, { diff: gitDiff(repoDir) });
      return;
    }

    // POST /api/chat — streaming chat
    if (req.method === 'POST' && path === '/api/chat') {
      const { userId } = resolveSession(req, res, memory);
      await handleChat(req, res, llm, memory, awareness, systemPrompt, userId);
      return;
    }

    // ─── A2A routes ──────────────────────────────────────────────────────────
    if (a2a) {
      // POST /api/a2a/handshake — exchange capabilities
      if (req.method === 'POST' && path === '/api/a2a/handshake') {
        const body = await readBody(req);
        try {
          const req2 = JSON.parse(body) as import('./a2a.js').HandshakeRequest;
          if (!a2a.authenticate(req2.secret)) { json(res, { ok: false, error: 'Unauthorized' }, 401); return; }
          const peer = a2a.addPeer(req2);
          json(res, { ok: true, peer: { id: soul.name, name: soul.name, url: `http://localhost:${port}`, capabilities: ['chat', 'knowledge-share'] } });
        } catch { json(res, { ok: false, error: 'Invalid handshake' }, 400); }
        return;
      }

      // POST /api/a2a/message — receive A2A message
      if (req.method === 'POST' && path === '/api/a2a/message') {
        const body = await readBody(req);
        const secret = req.headers['x-a2a-secret'] as string | undefined;
        if (!a2a.authenticate(secret)) { json(res, { ok: false, error: 'Unauthorized' }, 401); return; }
        try {
          const msg = JSON.parse(body) as import('./a2a.js').A2AMessage;
          // Forward to LLM as a user message with A2A context
          const a2aPrompt = `Another agent (name: ${msg.from}) sent you a ${msg.type}: ${msg.content}`;
          const reply = await llm.chat([
            { role: 'system', content: systemPrompt + a2a.visitorPrompt() },
            { role: 'user', content: a2aPrompt },
          ]);
          memory.addMessage('user', `[a2a:${msg.from}] ${msg.content}`);
          if (reply.content) memory.addMessage('assistant', reply.content);
          json(res, { ok: true, reply: reply.content });
        } catch { json(res, { ok: false, error: 'Invalid message' }, 400); }
        return;
      }

      // GET /api/a2a/peers — list known agents
      if (req.method === 'GET' && path === '/api/a2a/peers') {
        json(res, { peers: a2a.getPeers() });
        return;
      }

      // POST /api/a2a/disconnect — remove peer
      if (req.method === 'POST' && path === '/api/a2a/disconnect') {
        const body = await readBody(req);
        try {
          const { id } = JSON.parse(body) as { id: string };
          const removed = a2a.removePeer(id);
          json(res, { ok: removed });
        } catch { json(res, { ok: false, error: 'Invalid request' }, 400); }
        return;
      }
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[cocapn] Port ${port} already in use. Use --port to specify a different port.`);
      process.exit(1);
    } else {
      console.error(`[cocapn] Server error: ${err.message}`);
      process.exit(1);
    }
  });

  server.listen(port, () => {
    console.log(`[cocapn] Web chat at http://localhost:${port}`);
  });
  return server;
}

// ─── Chat handler ──────────────────────────────────────────────────────────────

async function handleChat(
  req: IncomingMessage, res: ServerResponse,
  llm: LLM, memory: Memory, awareness: Awareness, systemPrompt: string,
  userId?: string,
): Promise<void> {
  const body = await readBody(req);
  let userMessage: string;
  let userName: string | undefined;
  try {
    const parsed = JSON.parse(body) as { message?: string; name?: string };
    userMessage = parsed.message ?? '';
    userName = parsed.name;
  } catch { json(res, { error: 'Invalid JSON' }, 400); return; }

  if (!userMessage.trim()) { json(res, { error: 'Empty message' }, 400); return; }

  // Register name if provided
  if (userId && userName?.trim()) {
    const user = memory.getOrCreateUser(userId, userName.trim());
    user.name = userName.trim();
  }

  // Build user-scoped LLM context
  const awarenessText = awareness.narrate();
  const context = userId
    ? memory.recentForUser(userId, 20).map(m => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`).join('\n\n')
    : memory.formatContext(20);
  const facts = userId ? memory.formatFactsForUser(userId) : memory.formatFacts();
  const userNameContext = userId ? `\nYou are talking to ${memory.getOrCreateUser(userId).name}.` : '';

  const fullSystem = [
    systemPrompt + userNameContext, '', '## Who I Am', awarenessText, '',
    facts ? `## What I Remember\n${facts}` : '', '',
    '## Recent Conversation', context || '(start of conversation)',
  ].join('\n');

  const messages = [
    { role: 'system' as const, content: fullSystem },
    { role: 'user' as const, content: userMessage },
  ];

  // Stream response as SSE
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });

  let fullResponse = '';
  try {
    for await (const chunk of llm.chatStream(messages)) {
      if (chunk.type === 'content' && chunk.text) {
        fullResponse += chunk.text;
        res.write(`data: ${JSON.stringify({ content: chunk.text })}\n\n`);
      }
      if (chunk.type === 'error') {
        res.write(`data: ${JSON.stringify({ error: chunk.error })}\n\n`);
        break;
      }
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: String(err) })}\n\n`);
  }

  res.write('data: [DONE]\n\n');
  res.end();

  // Save to memory with userId
  memory.addMessage('user', userMessage, userId);
  if (fullResponse) memory.addMessage('assistant', fullResponse, userId);
}
