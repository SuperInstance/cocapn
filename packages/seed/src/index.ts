#!/usr/bin/env node

/**
 * cocapn — the repo IS the agent.
 *
 * Usage:
 *   cocapn              Start chat (terminal)
 *   cocapn --web        Start web chat
 *   cocapn --port 3100  Custom port (default 3100)
 *   cocapn whoami       Print self-description and exit
 *   cocapn help         Show help
 */

import { parseArgs } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { DeepSeek } from './llm.js';
import { Memory } from './memory.js';
import { Awareness } from './awareness.js';
import { loadSoul, soulToSystemPrompt } from './soul.js';
import type { Soul } from './soul.js';
import { startWebServer } from './web.js';

// ─── Config ────────────────────────────────────────────────────────────────────

interface Config {
  apiKey?: string;
  model?: string;
  port?: number;
  temperature?: number;
  maxTokens?: number;
}

function loadConfig(repoDir: string): Config {
  for (const name of ['cocapn.json', 'cocapn/cocapn.json']) {
    const p = join(repoDir, name);
    if (existsSync(p)) {
      try { return JSON.parse(readFileSync(p, 'utf-8')) as Config; } catch { /* skip */ }
    }
  }
  return {};
}

function getApiKey(config: Config): string {
  // 1. cocapn.json config
  if (config.apiKey) return config.apiKey;
  // 2. Environment variable
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  // 3. ~/.cocapn/secrets.json
  const secretPath = join(homedir(), '.cocapn', 'secrets.json');
  if (existsSync(secretPath)) {
    try {
      const secrets = JSON.parse(readFileSync(secretPath, 'utf-8')) as Record<string, string>;
      if (secrets.DEEPSEEK_API_KEY) return secrets.DEEPSEEK_API_KEY;
    } catch { /* skip */ }
  }
  console.error('[cocapn] No API key found. Set one:');
  console.error('  export DEEPSEEK_API_KEY=your-key');
  console.error('  or add "apiKey" to cocapn.json');
  process.exit(1);
}

// ─── Command handlers ──────────────────────────────────────────────────────────

function cmdWhoami(awareness: Awareness, memory: Memory): string {
  const self = awareness.perceive();
  const factCount = Object.keys(memory.facts).length;
  const msgCount = memory.messages.length;
  const GR = '\x1b[90m', C = '\x1b[36m', G = '\x1b[32m', B = '\x1b[1m', R = '\x1b[0m';

  const lines = [
    `${C}${B}${self.name}${R}`,
    `${GR}Born:       ${R}${self.born || 'unknown'} ${GR}(${self.age})${R}`,
    `${GR}Body:       ${R}${self.files} files, ${self.languages.length > 0 ? self.languages.join(', ') : 'unknown languages'}`,
    `${GR}Memory:     ${R}${factCount} facts, ${msgCount} messages`,
    `${GR}Pulse:      ${R}${self.feeling || 'calm'}`,
    `${GR}Commits:    ${R}${self.commits}`,
    `${GR}Branch:     ${R}${self.branch}`,
  ];
  if (self.authors.length > 0) {
    lines.push(`${GR}Creators:   ${R}${self.authors.join(', ')}`);
  }
  if (self.lastCommit) {
    lines.push(`${GR}Last act:   ${R}${self.lastCommit}`);
  }
  if (self.description) {
    lines.push(`${GR}Purpose:    ${R}${self.description}`);
  }
  return lines.join('\n');
}

function cmdMemoryList(memory: Memory): string {
  const GR = '\x1b[90m', G = '\x1b[32m', R = '\x1b[0m';
  const lines: string[] = [];
  const facts = Object.entries(memory.facts);
  if (facts.length > 0) {
    lines.push(`${G}Facts:${R}`);
    for (const [k, v] of facts) lines.push(`  ${k}: ${v}`);
  }
  if (memory.messages.length > 0) {
    lines.push(`${G}Messages (${memory.messages.length}):${R}`);
    for (const m of memory.messages.slice(-10)) {
      const preview = m.content.length > 80 ? m.content.slice(0, 80) + '...' : m.content;
      lines.push(`  ${GR}[${m.role}]${R} ${preview}`);
    }
  }
  if (lines.length === 0) lines.push(`${GR}(empty — no memories yet)${R}`);
  return lines.join('\n');
}

function cmdMemorySearch(memory: Memory, query: string): string {
  const GR = '\x1b[90m', G = '\x1b[32m', R = '\x1b[0m';
  const results = memory.search(query);
  const lines: string[] = [];
  if (results.facts.length > 0) {
    lines.push(`${G}Facts matching "${query}":${R}`);
    for (const f of results.facts) lines.push(`  ${f.key}: ${f.value}`);
  }
  if (results.messages.length > 0) {
    lines.push(`${G}Messages matching "${query}":${R}`);
    for (const m of results.messages.slice(-10)) {
      const preview = m.content.length > 80 ? m.content.slice(0, 80) + '...' : m.content;
      lines.push(`  ${GR}[${m.role}]${R} ${preview}`);
    }
  }
  if (lines.length === 0) lines.push(`${GR}No matches for "${query}"${R}`);
  return lines.join('\n');
}

function cmdMemoryClear(memory: Memory): string {
  memory.clear();
  return '\x1b[90mMemory cleared.\x1b[0m';
}

// ─── Terminal REPL ─────────────────────────────────────────────────────────────

async function terminalChat(llm: DeepSeek, memory: Memory, awareness: Awareness, systemPrompt: string): Promise<void> {
  const self = awareness.narrate();
  const B = '\x1b[1m', C = '\x1b[36m', G = '\x1b[32m', GR = '\x1b[90m', R = '\x1b[0m';

  console.log(`\n${C}${B}cocapn${R} ${GR}— the repo IS the agent${R}`);
  console.log(`${GR}${self.slice(0, 200)}${self.length > 200 ? '...' : ''}`);
  console.log(`${GR}Commands: /quit  /clear  /whoami  /memory <list|clear|search q>  /git <log|stats|diff>${R}\n`);

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: `${G}> ${R}` });
  rl.prompt();

  for await (const line of rl) {
    const input = line.trim();
    if (!input) { rl.prompt(); continue; }
    if (input === '/quit' || input === '/exit') { console.log(`${GR}Goodbye!${R}`); rl.close(); return; }
    if (input === '/clear') { console.log(`${GR}Context cleared.${R}`); rl.prompt(); continue; }
    if (input === '/whoami') { console.log(cmdWhoami(awareness, memory)); rl.prompt(); continue; }

    // /memory commands
    if (input === '/memory' || input === '/memory list') { console.log(cmdMemoryList(memory)); rl.prompt(); continue; }
    if (input === '/memory clear') { console.log(cmdMemoryClear(memory)); rl.prompt(); continue; }
    if (input.startsWith('/memory search ')) {
      console.log(cmdMemorySearch(memory, input.slice(15)));
      rl.prompt(); continue;
    }

    // /git commands
    if (input === '/git' || input === '/git log') {
      const { log } = await import('./git.js');
      const entries = log(awareness['repoDir']);
      if (entries.length === 0) { console.log(`${GR}No git history.${R}`); }
      else { for (const e of entries) console.log(`${GR}${e.hash}${R} ${GR}${e.date}${R} ${e.author}: ${e.msg}`); }
      rl.prompt(); continue;
    }
    if (input === '/git stats') {
      const { stats } = await import('./git.js');
      const s = stats(awareness['repoDir']);
      console.log(`${G}Files:${R} ${s.files}  ${G}Lines:${R} ${s.lines}`);
      if (Object.keys(s.languages).length > 0) {
        const langStr = Object.entries(s.languages).map(([l, c]) => `${l} (${c})`).join(', ');
        console.log(`${G}Languages:${R} ${langStr}`);
      }
      rl.prompt(); continue;
    }
    if (input === '/git diff') {
      const { diff } = await import('./git.js');
      console.log(diff(awareness['repoDir']));
      rl.prompt(); continue;
    }

    const fullSystem = [systemPrompt, '', '## Who I Am', awareness.narrate(), '',
      memory.formatFacts() ? `## What I Remember\n${memory.formatFacts()}` : '', '',
      '## Recent Conversation', memory.formatContext(20) || '(start of conversation)',
    ].join('\n');

    memory.addMessage('user', input);
    process.stdout.write(`${B}Assistant: ${R}`);
    let full = '';
    let tokenCount = 0;
    let interrupted = false;

    // Allow Ctrl+C to interrupt streaming
    const onInterrupt = () => { interrupted = true; };
    process.once('SIGINT', onInterrupt);

    try {
      for await (const chunk of llm.chatStream([{ role: 'system', content: fullSystem }, { role: 'user', content: input }])) {
        if (interrupted) break;
        if (chunk.type === 'content' && chunk.text) { process.stdout.write(chunk.text); full += chunk.text; tokenCount++; }
        if (chunk.type === 'error' && chunk.error) process.stdout.write(`\n${chunk.error}`);
      }
    } catch (err) { process.stdout.write(`\nError: ${String(err)}`); }

    process.removeListener('SIGINT', onInterrupt);
    if (interrupted) process.stdout.write(`\n${GR}[interrupted]${R}`);
    console.log(`\n${GR}[${tokenCount} chunks]${R}\n`);
    if (full) memory.addMessage('assistant', full);
    rl.prompt();
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs({
    args: process.argv.slice(2),
    options: {
      port: { type: 'string', default: '3100' },
      web: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  });

  if (args.values.help || args.positionals[0] === 'help') {
    console.log('cocapn — your repo is alive');
    console.log('  cocapn              Start chat (terminal)');
    console.log('  cocapn --web        Start web chat');
    console.log('  cocapn --port N     Set web port (default 3100)');
    console.log('  cocapn whoami       Print self-description');
    console.log('  cocapn help         Show this help');
    console.log('');
    console.log('Terminal commands:');
    console.log('  /whoami             Full self-perception');
    console.log('  /memory list        Show all memories');
    console.log('  /memory clear       Clear all memories');
    console.log('  /memory search <q>  Search memories');
    console.log('  /git log            Recent commits');
    console.log('  /git stats          Repo statistics');
    console.log('  /git diff           Uncommitted changes');
    console.log('  /clear              Clear context');
    console.log('  /quit               Exit');
    process.exit(0);
  }

  const repoDir = process.cwd();
  const config = loadConfig(repoDir);
  const apiKey = getApiKey(config);

  // Load soul — try soul.md, then cocapn/soul.md
  let soul: Soul | undefined;
  for (const p of ['soul.md', 'cocapn/soul.md']) {
    const full = join(repoDir, p);
    if (existsSync(full)) { soul = loadSoul(full); break; }
  }
  if (!soul) {
    soul = { name: repoDir.split('/').pop() ?? 'cocapn', tone: 'neutral', model: 'deepseek',
      body: 'I am a self-aware repository. I speak in first person. Be curious, honest, and helpful.' };
  }

  const systemPrompt = soulToSystemPrompt(soul);
  const llm = new DeepSeek({ apiKey, model: config.model, temperature: config.temperature, maxTokens: config.maxTokens });
  const memory = new Memory(repoDir);
  const awareness = new Awareness(repoDir);

  if (args.positionals[0] === 'whoami') {
    console.log(cmdWhoami(awareness, memory));
    return;
  }

  if (args.values.web) {
    const port = (parseInt(args.values.port, 10) || config.port) ?? 3100;
    startWebServer(port, llm, memory, awareness, soul);
  } else {
    await terminalChat(llm, memory, awareness, systemPrompt);
  }
}

main().catch((err) => { console.error('[cocapn] Fatal:', err); process.exit(1); });
