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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { LLM, detectOllama } from './llm.js';
import type { LLMConfig } from './llm.js';
import { Memory } from './memory.js';
import { Awareness } from './awareness.js';
import { loadSoul, soulToSystemPrompt } from './soul.js';
import type { Soul } from './soul.js';
import { startWebServer } from './web.js';
import { PluginLoader } from './plugins.js';
import type { ChatContext } from './plugins.js';
import { A2AHub } from './a2a.js';

// ─── Config ────────────────────────────────────────────────────────────────────

interface Config {
  port?: number;
  mode?: string;
  llm?: LLMConfig;
  // Legacy flat fields (backward compat)
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

function loadConfig(repoDir: string): Config {
  for (const name of ['cocapn.json', 'cocapn/cocapn.json']) {
    const p = join(repoDir, name);
    if (existsSync(p)) {
      try {
        const raw = readFileSync(p, 'utf-8');
        const parsed = JSON.parse(raw);
        const errors = validateConfig(parsed);
        if (errors.length > 0) {
          console.error(`[cocapn] Invalid config in ${name}:`);
          for (const e of errors) console.error(`  - ${e}`);
          process.exit(1);
        }
        return parsed as Config;
      } catch (e: unknown) {
        console.error(`[cocapn] Failed to parse ${name}: ${String(e)}`);
        process.exit(1);
      }
    }
  }
  return {};
}

function validateConfig(raw: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (raw.mode !== undefined) {
    if (typeof raw.mode !== 'string' || !['private', 'public'].includes(raw.mode)) {
      errors.push('mode must be "private" or "public"');
    }
  }
  if (raw.port !== undefined) {
    if (typeof raw.port !== 'number' || !Number.isInteger(raw.port) || raw.port < 1 || raw.port > 65535) {
      errors.push('port must be a number between 1 and 65535');
    }
  }
  if (raw.llm !== undefined) {
    if (typeof raw.llm !== 'object' || raw.llm === null) {
      errors.push('llm must be an object');
    } else {
      const llm = raw.llm as Record<string, unknown>;
      if (llm.provider !== undefined && typeof llm.provider !== 'string') errors.push('llm.provider must be a string');
      if (llm.model !== undefined && typeof llm.model !== 'string') errors.push('llm.model must be a string');
      if (llm.baseUrl !== undefined && typeof llm.baseUrl !== 'string') errors.push('llm.baseUrl must be a string');
      if (llm.apiKey !== undefined && typeof llm.apiKey !== 'string') errors.push('llm.apiKey must be a string');
      if (llm.temperature !== undefined && (typeof llm.temperature !== 'number' || llm.temperature < 0 || llm.temperature > 2)) {
        errors.push('llm.temperature must be a number between 0 and 2');
      }
      if (llm.maxTokens !== undefined && (typeof llm.maxTokens !== 'number' || llm.maxTokens < 1)) {
        errors.push('llm.maxTokens must be a positive number');
      }
    }
  }
  return errors;
}

function resolveLLMConfig(config: Config): LLMConfig {
  const llm = config.llm ?? {};
  // Merge legacy flat fields into llm config
  return {
    provider: llm.provider,
    apiKey: llm.apiKey ?? config.apiKey,
    baseUrl: llm.baseUrl,
    model: llm.model ?? config.model,
    temperature: llm.temperature ?? config.temperature,
    maxTokens: llm.maxTokens ?? config.maxTokens,
  };
}

async function resolveApiKey(config: Config): Promise<string | undefined> {
  const llm = config.llm ?? {};
  // 1. Config
  if (llm.apiKey ?? config.apiKey) return llm.apiKey ?? config.apiKey;
  // 2. Environment variables
  for (const env of ['DEEPSEEK_API_KEY', 'OPENAI_API_KEY']) {
    if (process.env[env]) return process.env[env];
  }
  // 3. ~/.cocapn/secrets.json
  const secretPath = join(homedir(), '.cocapn', 'secrets.json');
  if (existsSync(secretPath)) {
    try {
      const secrets = JSON.parse(readFileSync(secretPath, 'utf-8')) as Record<string, string>;
      for (const key of ['DEEPSEEK_API_KEY', 'OPENAI_API_KEY']) {
        if (secrets[key]) return secrets[key];
      }
    } catch { /* skip */ }
  }
  return undefined;
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
  const GR = '\x1b[90m', G = '\x1b[32m', Y = '\x1b[33m', R = '\x1b[0m';
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
  if (results.gitLog.length > 0) {
    lines.push(`${Y}Git history matching "${query}":${R}`);
    for (const entry of results.gitLog) lines.push(`  ${GR}${entry}${R}`);
  }
  if (lines.length === 0) lines.push(`${GR}No matches for "${query}"${R}`);
  return lines.join('\n');
}

function cmdMemoryClear(memory: Memory): string {
  memory.clear();
  return '\x1b[90mMemory cleared.\x1b[0m';
}

function cmdHelp(agentName: string): string {
  const G = '\x1b[32m', R = '\x1b[0m';
  return [
    `${agentName} — commands:`,
    `${G}  /help${R}              Show this help`,
    `${G}  /whoami${R}            Full self-perception`,
    `${G}  /memory list${R}       Show all memories`,
    `${G}  /memory clear${R}      Clear all memories`,
    `${G}  /memory search <q>${R} Search memories + git history`,
    `${G}  /export${R}            Export memories to markdown`,
    `${G}  /import <file>${R}     Import facts from JSON file`,
    `${G}  /git log${R}           Recent commits`,
    `${G}  /git stats${R}         Repo statistics`,
    `${G}  /git diff${R}          Uncommitted changes`,
    `${G}  /clear${R}             Clear context`,
    `${G}  /plugins${R}           List loaded plugins`,
    `${G}  /a2a connect <url>${R} Connect to another agent`,
    `${G}  /a2a peers${R}         List connected agents`,
    `${G}  /a2a send <id> <msg>${R} Send message to agent`,
    `${G}  /a2a ask <id> <q>${R}  Ask another agent a question`,
    `${G}  /quit${R}              Exit`,
  ].join('\n');
}

function cmdExport(memory: Memory): string {
  const GR = '\x1b[90m', G = '\x1b[32m', R = '\x1b[0m';
  const lines: string[] = ['# Cocapn Memory Export', '', `Exported: ${new Date().toISOString()}`, ''];
  const facts = Object.entries(memory.facts);
  if (facts.length > 0) {
    lines.push('## Facts', '');
    for (const [k, v] of facts) lines.push(`- **${k}**: ${v}`);
    lines.push('');
  }
  if (memory.messages.length > 0) {
    lines.push('## Messages', '');
    for (const m of memory.messages) {
      const role = m.role === 'user' ? 'Human' : 'Assistant';
      lines.push(`**${role}** (${m.ts}):`);
      lines.push(`${m.content}`, '');
    }
  }
  const outPath = join(process.cwd(), '.cocapn', 'memories.md');
  writeFileSync(outPath, lines.join('\n'), 'utf-8');
  return `${G}Exported ${facts.length} facts, ${memory.messages.length} messages${R}\n${GR}${outPath}${R}`;
}

function cmdImport(memory: Memory, filePath: string): string {
  const GR = '\x1b[90m', G = '\x1b[32m', R = '\x1b[0m';
  const resolved = filePath.startsWith('/') ? filePath : join(process.cwd(), filePath);
  if (!existsSync(resolved)) return `${GR}File not found: ${resolved}${R}`;
  try {
    const raw = readFileSync(resolved, 'utf-8');
    const data = JSON.parse(raw) as Record<string, string>;
    let count = 0;
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === 'string') { memory.facts[k] = v; count++; }
    }
    memory['save']();
    return `${G}Imported ${count} facts from ${filePath}${R}`;
  } catch {
    return `${GR}Invalid JSON in ${filePath}${R}`;
  }
}

// ─── A2A commands ──────────────────────────────────────────────────────────────

async function cmdA2a(input: string, hub: A2AHub): Promise<string> {
  const GR = '\x1b[90m', G = '\x1b[32m', Y = '\x1b[33m', R = '\x1b[0m';
  const parts = input.trim().split(/\s+/);
  const sub = parts[1] ?? '';

  if (sub === 'connect') {
    const url = parts[2];
    if (!url) return `${GR}Usage: /a2a connect <url>${R}`;
    const peer = await hub.connect(url.replace(/\/$/, ''));
    if (!peer) return `${GR}Failed to connect to ${url}${R}`;
    return `${G}Connected to ${peer.name} (${peer.url})${R}`;
  }

  if (sub === 'peers') {
    const peers = hub.getPeers();
    if (peers.length === 0) return `${GR}(no connected agents)${R}`;
    return peers.map(p => `${G}${p.name}${R} ${GR}(${p.url}) — ${p.capabilities.join(', ')}${R}`).join('\n');
  }

  if (sub === 'send') {
    const id = parts[2];
    const msg = parts.slice(3).join(' ');
    if (!id || !msg) return `${GR}Usage: /a2a send <agent-id> <message>${R}`;
    const res = await hub.sendMessage(id, msg, 'knowledge-share');
    if (!res.ok) return `${GR}Failed: ${res.error}${R}`;
    return `${G}${id}:${R} ${res.reply ?? '(no reply)'}`;
  }

  if (sub === 'ask') {
    const id = parts[2];
    const q = parts.slice(3).join(' ');
    if (!id || !q) return `${GR}Usage: /a2a ask <agent-id> <question>${R}`;
    const res = await hub.sendMessage(id, q, 'question');
    if (!res.ok) return `${GR}Failed: ${res.error}${R}`;
    return `${Y}${id} replies:${R} ${res.reply ?? '(no reply)'}`;
  }

  return `${GR}Usage: /a2a connect <url> | peers | send <id> <msg> | ask <id> <q>${R}`;
}

// ─── Terminal REPL ─────────────────────────────────────────────────────────────

async function terminalChat(llm: LLM, memory: Memory, awareness: Awareness, systemPrompt: string, soulName: string, pluginLoader?: PluginLoader, a2a?: A2AHub): Promise<void> {
  const self = awareness.narrate();
  const B = '\x1b[1m', C = '\x1b[36m', G = '\x1b[32m', GR = '\x1b[90m', R = '\x1b[0m';

  console.log(`\n${C}${B}cocapn${R} ${GR}— the repo IS the agent${R}`);
  console.log(`${GR}${self.slice(0, 200)}${self.length > 200 ? '...' : ''}`);
  console.log(`${GR}Type /help for commands${R}\n`);

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: `${C}you${R}> ` });
  rl.prompt();

  for await (const line of rl) {
    const input = line.trim();
    if (!input) { rl.prompt(); continue; }
    if (input === '/quit' || input === '/exit') {
      console.log(`${GR}Goodbye! I'll be here when you come back. Your memories are safe in cocapn/memory.json${R}`);
      rl.close(); return;
    }
    if (input === '/help') { console.log(cmdHelp(soulName)); rl.prompt(); continue; }
    if (input === '/clear') { console.log(`${GR}Context cleared.${R}`); rl.prompt(); continue; }
    if (input === '/whoami') { console.log(cmdWhoami(awareness, memory)); rl.prompt(); continue; }
    if (input === '/export') { console.log(cmdExport(memory)); rl.prompt(); continue; }
    if (input.startsWith('/import ')) { console.log(cmdImport(memory, input.slice(8))); rl.prompt(); continue; }

    // /plugins command
    if (input === '/plugins') {
      if (!pluginLoader || pluginLoader.plugins.length === 0) {
        console.log(`${GR}(no plugins loaded)${R}`);
      } else {
        const G2 = '\x1b[32m', R2 = '\x1b[0m';
        for (const p of pluginLoader.list()) {
          const cmds = p.commands.length > 0 ? ` — commands: ${p.commands.map(c => `/${c}`).join(', ')}` : '';
          console.log(`  ${G2}${p.name}@${p.version}${R2}${cmds}`);
        }
      }
      rl.prompt(); continue;
    }

    // Plugin commands
    if (pluginLoader && input.startsWith('/')) {
      const pluginCmds = pluginLoader.getCommands();
      const parts = input.slice(1).split(/\s+(.*)/);
      const cmdName = parts[0];
      const cmdArgs = parts[1] ?? '';
      if (pluginCmds[cmdName]) {
        const result = await pluginCmds[cmdName](cmdArgs);
        console.log(result);
        rl.prompt(); continue;
      }
    }

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

    // /a2a commands
    if (input.startsWith('/a2a')) {
      if (!a2a) { console.log(`${GR}A2A not enabled. Set COCAPN_A2A_SECRET or create cocapn/a2a-secret.json${R}`); rl.prompt(); continue; }
      console.log(await cmdA2a(input, a2a));
      rl.prompt(); continue;
    }

    const fullSystem = [systemPrompt, '', '## Who I Am', awareness.narrate(), '',
      memory.formatFacts() ? `## What I Remember\n${memory.formatFacts()}` : '', '',
      '## Recent Conversation', memory.formatContext(20) || '(start of conversation)',
    ].join('\n');

    memory.addMessage('user', input);
    process.stdout.write(`${C}${soulName}: ${R}`);
    let full = '';
    let interrupted = false;

    // Run before-chat hooks
    let chatCtx: ChatContext | undefined;
    if (pluginLoader) {
      chatCtx = await pluginLoader.runBeforeChat(input, { message: input, facts: memory.facts });
      if (chatCtx._weatherHint) process.stdout.write(`\n${GR}[weather] ${chatCtx._weatherHint}${R}\n`);
      if (chatCtx._tzHint) process.stdout.write(`\n${GR}[tz] ${chatCtx._tzHint}${R}\n`);
    }

    // Allow Ctrl+C to interrupt streaming
    const onInterrupt = () => { interrupted = true; };
    process.once('SIGINT', onInterrupt);

    try {
      for await (const chunk of llm.chatStream([{ role: 'system', content: fullSystem }, { role: 'user', content: input }])) {
        if (interrupted) break;
        if (chunk.type === 'content' && chunk.text) { process.stdout.write(chunk.text); full += chunk.text; }
        if (chunk.type === 'error' && chunk.error) process.stdout.write(`\n${chunk.error}`);
      }
    } catch (err) { process.stdout.write(`\nError: ${String(err)}`); }

    // Run after-chat hooks
    if (pluginLoader && full && chatCtx) {
      full = await pluginLoader.runAfterChat(full, chatCtx);
    }

    process.removeListener('SIGINT', onInterrupt);
    if (interrupted) process.stdout.write(`\n${GR}[interrupted]${R}`);
    const wordCount = full ? full.split(/\s+/).filter(Boolean).length : 0;
    console.log(`\n${GR}[${wordCount} words]${R}\n`);
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
    console.log('  /plugins            List loaded plugins');
    console.log('  /quit               Exit');
    process.exit(0);
  }

  const repoDir = process.cwd();
  const config = loadConfig(repoDir);

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

  // Resolve LLM config — try API key first, then auto-detect Ollama
  let llmConfig = resolveLLMConfig(config);
  const apiKey = await resolveApiKey(config);
  if (apiKey) {
    llmConfig = { ...llmConfig, apiKey };
  } else if (!llmConfig.provider || llmConfig.provider === 'ollama') {
    const ollama = await detectOllama();
    if (ollama) {
      console.log(`[cocapn] No API key found. Using Ollama (local) with model ${ollama.model}`);
      llmConfig = { ...llmConfig, provider: 'ollama', model: llmConfig.model ?? ollama.model };
    } else {
      console.error('[cocapn] No API key found and Ollama not detected. Set one:');
      console.error('  export DEEPSEEK_API_KEY=your-key   (or OPENAI_API_KEY)');
      console.error('  or install Ollama: https://ollama.com');
      process.exit(1);
    }
  } else {
    const ollama = await detectOllama();
    if (ollama && !llmConfig.model) llmConfig = { ...llmConfig, model: ollama.model };
  }

  const llm = new LLM(llmConfig);
  const memory = new Memory(repoDir);
  const awareness = new Awareness(repoDir);

  // Load plugins from cocapn/plugins/*.js
  const pluginLoader = new PluginLoader();
  await pluginLoader.load(join(repoDir, 'cocapn', 'plugins'));

  // Initialize A2A hub
  const a2aSecret = A2AHub.loadSecret(repoDir);
  const a2a = a2aSecret ? new A2AHub(soul.name, '', a2aSecret) : undefined;

  if (args.positionals[0] === 'whoami') {
    console.log(cmdWhoami(awareness, memory));
    return;
  }

  if (args.values.web) {
    const port = (parseInt(args.values.port, 10) || config.port) ?? 3100;
    const hub = a2a ?? (a2aSecret ? new A2AHub(soul.name, `http://localhost:${port}`, a2aSecret) : undefined);
    startWebServer(port, llm, memory, awareness, soul, hub);
  } else {
    await terminalChat(llm, memory, awareness, systemPrompt, soul.name, pluginLoader, a2a);
  }
}

main().catch((err) => { console.error('[cocapn] Fatal:', err); process.exit(1); });
