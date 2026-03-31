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

function getApiKey(): string {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  const secretPath = join(homedir(), '.cocapn', 'secrets.json');
  if (existsSync(secretPath)) {
    try {
      const secrets = JSON.parse(readFileSync(secretPath, 'utf-8')) as Record<string, string>;
      if (secrets.DEEPSEEK_API_KEY) return secrets.DEEPSEEK_API_KEY;
    } catch { /* skip */ }
  }
  console.error('[cocapn] No DEEPSEEK_API_KEY found. Set it:');
  console.error('  export DEEPSEEK_API_KEY=your-key');
  process.exit(1);
}

// ─── Terminal REPL ─────────────────────────────────────────────────────────────

async function terminalChat(llm: DeepSeek, memory: Memory, awareness: Awareness, systemPrompt: string): Promise<void> {
  const self = awareness.narrate();
  const B = '\x1b[1m', C = '\x1b[36m', G = '\x1b[32m', GR = '\x1b[90m', R = '\x1b[0m';

  console.log(`\n${C}${B}cocapn${R} ${GR}— the repo IS the agent${R}`);
  console.log(`${GR}${self.slice(0, 200)}${self.length > 200 ? '...' : ''}`);
  console.log(`${GR}Commands: /quit  /clear  /whoami${R}\n`);

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: `${G}> ${R}` });
  rl.prompt();

  for await (const line of rl) {
    const input = line.trim();
    if (!input) { rl.prompt(); continue; }
    if (input === '/quit' || input === '/exit') { console.log(`${GR}Goodbye!${R}`); rl.close(); return; }
    if (input === '/clear') { console.log(`${GR}Context cleared.${R}`); rl.prompt(); continue; }
    if (input === '/whoami') { console.log(self); rl.prompt(); continue; }

    const fullSystem = [systemPrompt, '', '## Who I Am', awareness.narrate(), '',
      memory.formatFacts() ? `## What I Remember\n${memory.formatFacts()}` : '', '',
      '## Recent Conversation', memory.formatContext(20) || '(start of conversation)',
    ].join('\n');

    memory.addMessage('user', input);
    process.stdout.write(`${B}Assistant: ${R}`);
    let full = '';
    try {
      for await (const chunk of llm.chatStream([{ role: 'system', content: fullSystem }, { role: 'user', content: input }])) {
        if (chunk.type === 'content' && chunk.text) { process.stdout.write(chunk.text); full += chunk.text; }
        if (chunk.type === 'error' && chunk.error) process.stdout.write(`\n${chunk.error}`);
      }
    } catch (err) { process.stdout.write(`\nError: ${String(err)}`); }
    console.log('\n');
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
    console.log('  cocapn            Start chat (terminal)');
    console.log('  cocapn --web      Start web chat');
    console.log('  cocapn --port N   Set web port (default 3100)');
    console.log('  cocapn whoami     Print self-description');
    console.log('  cocapn help       Show this help');
    process.exit(0);
  }

  const repoDir = process.cwd();
  const config = loadConfig(repoDir);
  const apiKey = getApiKey();

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
    console.log(awareness.narrate());
    return;
  }

  if (args.values.web) {
    const port = parseInt(args.values.port, 10) || config.port ?? 3100;
    startWebServer(port, llm, memory, awareness, soul);
  } else {
    await terminalChat(llm, memory, awareness, systemPrompt);
  }
}

main().catch((err) => { console.error('[cocapn] Fatal:', err); process.exit(1); });
