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
 *
 * Zero dependencies. Uses only Node.js built-ins.
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { DeepSeek } from './llm.js';
import type { Memory } from './memory.js';
import type { Awareness } from './awareness.js';
import type { Soul } from './soul.js';
import { log as gitLog, stats as gitStats, diff as gitDiff } from './git.js';

// ─── Inline HTML (loaded from public/index.html at startup) ────────────────────

let htmlCache: string | null = null;

function getHTML(): string {
  if (htmlCache) return htmlCache;
  const paths = [
    join(resolve('.'), 'public', 'index.html'),
    join(import.meta.dirname ?? '.', '..', 'public', 'index.html'),
  ];
  for (const p of paths) {
    if (existsSync(p)) { htmlCache = readFileSync(p, 'utf-8'); return htmlCache; }
  }
  // Fallback minimal UI
  htmlCache = `<!DOCTYPE html><html><body style="background:#0a0a0a;color:#e0e0e0;font-family:monospace;display:flex;justify-content:center;align-items:center;height:100vh"><div><h1>cocapn</h1><p>Chat UI not found. Use POST /api/chat</p></div></body></html>`;
  return htmlCache;
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
  llm: DeepSeek,
  memory: Memory,
  awareness: Awareness,
  soul: Soul,
): void {
  const systemPrompt = `You are ${soul.name}. Your tone is ${soul.tone}.\n\n${soul.body}`;
  const self = awareness.perceive();
  const repoDir = process.cwd();

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
      res.end(getHTML());
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
      await handleChat(req, res, llm, memory, awareness, systemPrompt);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(port, () => {
    console.log(`[cocapn] Web chat at http://localhost:${port}`);
  });
}

// ─── Chat handler ──────────────────────────────────────────────────────────────

async function handleChat(
  req: IncomingMessage, res: ServerResponse,
  llm: DeepSeek, memory: Memory, awareness: Awareness, systemPrompt: string,
): Promise<void> {
  const body = await readBody(req);
  let userMessage: string;
  try {
    const parsed = JSON.parse(body) as { message?: string };
    userMessage = parsed.message ?? '';
  } catch { json(res, { error: 'Invalid JSON' }, 400); return; }

  if (!userMessage.trim()) { json(res, { error: 'Empty message' }, 400); return; }

  // Build LLM context
  const awarenessText = awareness.narrate();
  const context = memory.formatContext(20);
  const facts = memory.formatFacts();
  const fullSystem = [
    systemPrompt, '', '## Who I Am', awarenessText, '',
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

  // Save to memory
  memory.addMessage('user', userMessage);
  if (fullResponse) memory.addMessage('assistant', fullResponse);
}
