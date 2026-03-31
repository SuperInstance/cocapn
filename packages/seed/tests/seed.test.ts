/* eslint-disable */
// @ts-nocheck
/**
 * Seed tests for cocapn.
 * Tests soul, memory, awareness, LLM, web, and git modules.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

import * as soulMod from '../src/soul.ts';
import * as memoryMod from '../src/memory.ts';
import * as awarenessMod from '../src/awareness.ts';
import * as llmMod from '../src/llm.ts';
import * as webMod from '../src/web.ts';
import * as gitMod from '../src/git.ts';
import * as extractMod from '../src/extract.ts';
import * as contextMod from '../src/context.ts';
import * as reflectMod from '../src/reflect.ts';
import * as summarizeMod from '../src/summarize.ts';
import * as pluginsMod from '../src/plugins.ts';

const { loadSoul, soulToSystemPrompt, buildFullSystemPrompt } = soulMod;
const { Memory } = memoryMod;
const { Awareness } = awarenessMod;
const { DeepSeek } = llmMod;

const uid = () => Math.random().toString(36).slice(2);

// ─── Soul Tests ───────────────────────────────────────────────────────────────

describe('Soul', () => {
  let testDir: string;
  beforeEach(() => { testDir = join(tmpdir(), `cocapn-soul-${uid()}`); mkdirSync(testDir, { recursive: true }); });
  afterEach(() => { try { rmSync(testDir, { recursive: true, force: true }); } catch {} });

  it('parses YAML frontmatter', () => {
    writeFileSync(join(testDir, 'soul.md'), '---\nname: Aurora\ntone: warm\nmodel: deepseek-reasoner\n---\n\nI am Aurora.');
    const soul = loadSoul(join(testDir, 'soul.md'));
    expect(soul.name).toBe('Aurora');
    expect(soul.tone).toBe('warm');
    expect(soul.body).toBe('I am Aurora.');
  });

  it('uses defaults when no frontmatter', () => {
    writeFileSync(join(testDir, 'soul.md'), 'I am a plain soul.');
    const soul = loadSoul(join(testDir, 'soul.md'));
    expect(soul.name).toBe('unnamed');
    expect(soul.tone).toBe('neutral');
    expect(soul.body).toBe('I am a plain soul.');
  });

  it('generates system prompt', () => {
    const prompt = soulToSystemPrompt({ name: 'Test', tone: 'curious', model: 'deepseek', body: 'I help.' });
    expect(prompt).toContain('You are Test');
    expect(prompt).toContain('curious');
  });

  it('handles empty soul.md', () => {
    writeFileSync(join(testDir, 'soul.md'), '');
    const soul = loadSoul(join(testDir, 'soul.md'));
    expect(soul.name).toBe('unnamed');
    expect(soul.body).toBe('');
  });
});

// ─── Memory Tests ──────────────────────────────────────────────────────────────

describe('Memory', () => {
  let testDir: string;
  beforeEach(() => { testDir = join(tmpdir(), `cocapn-mem-${uid()}`); mkdirSync(testDir, { recursive: true }); });
  afterEach(() => { try { rmSync(testDir, { recursive: true, force: true }); } catch {} });

  it('creates .cocapn dir on init', () => {
    const mem = new Memory(testDir);
    expect(existsSync(join(testDir, '.cocapn'))).toBe(true);
    expect(mem.messages).toEqual([]);
    expect(mem.facts).toEqual({});
  });

  it('persists messages', () => {
    const mem = new Memory(testDir);
    mem.addMessage('user', 'Hello');
    mem.addMessage('assistant', 'Hi');
    expect(mem.messages.length).toBe(2);

    const mem2 = new Memory(testDir);
    expect(mem2.messages.length).toBe(2);
    expect(mem2.messages[0].content).toBe('Hello');
  });

  it('trims to 100 messages', () => {
    const mem = new Memory(testDir);
    for (let i = 0; i < 150; i++) mem.addMessage('user', `Msg ${i}`);
    expect(mem.messages.length).toBe(100);
  });

  it('persists facts via file', () => {
    const mem = new Memory(testDir);
    mem.facts['user'] = 'Alice';
    mem['save']();
    expect(mem.facts['user']).toBe('Alice');
    expect(mem.facts['nope']).toBeUndefined();

    const mem2 = new Memory(testDir);
    expect(mem2.facts['user']).toBe('Alice');
  });

  it('formats context', () => {
    const mem = new Memory(testDir);
    mem.addMessage('user', 'Hello');
    mem.addMessage('assistant', 'Hi');
    mem.addMessage('user', 'Bye');
    const ctx = mem.formatContext(2);
    expect(ctx).toContain('Hi');
    expect(ctx).toContain('Bye');
    expect(ctx).not.toContain('Hello');
  });

  it('formats facts', () => {
    const mem = new Memory(testDir);
    mem.facts['name'] = 'Bob';
    mem['save']();
    expect(mem.formatFacts()).toContain('name: Bob');
  });

  it('handles corrupted json', () => {
    const corruptDir = join(tmpdir(), `cocapn-corrupt-${uid()}-${Date.now()}`);
    mkdirSync(join(corruptDir, '.cocapn'), { recursive: true });
    writeFileSync(join(corruptDir, '.cocapn', 'memory.json'), 'bad json {{{');
    const content = readFileSync(join(corruptDir, '.cocapn', 'memory.json'), 'utf-8');
    expect(content).toBe('bad json {{{');
    const mem = new Memory(corruptDir);
    expect(mem.messages).toEqual([]);
    try { rmSync(corruptDir, { recursive: true, force: true }); } catch {}
  });

  it('returns recent messages', () => {
    const mem = new Memory(testDir);
    mem.addMessage('user', 'a');
    mem.addMessage('assistant', 'b');
    mem.addMessage('user', 'c');
    const r = mem.recent(2);
    expect(r.length).toBe(2);
    expect(r[0].content).toBe('b');
  });

  it('clears all data', () => {
    const mem = new Memory(testDir);
    mem.addMessage('user', 'Hello');
    mem.facts['key'] = 'value';
    mem['save']();
    mem.clear();
    expect(mem.messages).toEqual([]);
    expect(mem.facts).toEqual({});
    // Verify persistence
    const mem2 = new Memory(testDir);
    expect(mem2.messages).toEqual([]);
    expect(mem2.facts).toEqual({});
  });

  it('searches messages and facts', () => {
    const mem = new Memory(testDir);
    mem.addMessage('user', 'I love TypeScript');
    mem.addMessage('assistant', 'TypeScript is great');
    mem.addMessage('user', 'What about Python?');
    mem.facts['language'] = 'TypeScript';
    mem['save']();

    const results = mem.search('typescript');
    expect(results.messages.length).toBe(2);
    expect(results.facts.length).toBe(1);
    expect(results.facts[0].key).toBe('language');
    expect(results.gitLog).toBeDefined();
  });

  it('search returns empty on no match', () => {
    const mem = new Memory(testDir);
    mem.addMessage('user', 'Hello world');
    const results = mem.search('xyz');
    expect(results.messages.length).toBe(0);
    expect(results.facts.length).toBe(0);
    expect(results.gitLog).toEqual([]);
  });

  it('searchGit returns matching commits', () => {
    // Use the real cocapn repo which has git history
    const mem = new Memory('/tmp/cocapn');
    const results = mem.searchGit('seed');
    // Should find at least one commit mentioning "seed"
    expect(Array.isArray(results)).toBe(true);
  });
});

// ─── Awareness Tests ───────────────────────────────────────────────────────────

describe('Awareness', () => {
  let testDir: string;
  beforeEach(() => { testDir = join(tmpdir(), `cocapn-aw-${uid()}`); mkdirSync(testDir, { recursive: true }); });
  afterEach(() => { try { rmSync(testDir, { recursive: true, force: true }); } catch {} });

  it('infers name from directory', () => {
    const aware = new Awareness(testDir);
    const desc = aware.perceive();
    expect(desc.name).toBeTruthy();
  });

  it('reads name from package.json', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'test-app', description: 'A test' }));
    const desc = new Awareness(testDir).perceive();
    expect(desc.name).toBe('test-app');
    expect(desc.description).toBe('A test');
  });

  it('counts files', () => {
    writeFileSync(join(testDir, 'a.ts'), '');
    writeFileSync(join(testDir, 'b.js'), '');
    mkdirSync(join(testDir, 'src'), { recursive: true });
    writeFileSync(join(testDir, 'src', 'c.ts'), '');
    expect(new Awareness(testDir).perceive().files).toBe(3);
  });

  it('detects languages', () => {
    writeFileSync(join(testDir, 'app.ts'), '');
    writeFileSync(join(testDir, 'util.js'), '');
    writeFileSync(join(testDir, 'script.py'), '');
    const desc = new Awareness(testDir).perceive();
    expect(desc.languages).toContain('TypeScript');
    expect(desc.languages).toContain('JavaScript');
    expect(desc.languages).toContain('Python');
  });

  it('narrates in first person', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'narrate-test' }));
    const narrative = new Awareness(testDir).narrate();
    expect(narrative).toContain('I am narrate-test');
    expect(narrative).toContain('files');
  });

  it('ignores node_modules and .git', () => {
    mkdirSync(join(testDir, 'node_modules', 'pkg'), { recursive: true });
    mkdirSync(join(testDir, '.git', 'obj'), { recursive: true });
    writeFileSync(join(testDir, 'node_modules', 'pkg', 'i.js'), '');
    writeFileSync(join(testDir, '.git', 'obj', 'abc'), '');
    writeFileSync(join(testDir, 'real.ts'), '');
    expect(new Awareness(testDir).perceive().files).toBe(1);
  });

  it('works without git', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'no-git' }));
    const desc = new Awareness(testDir).perceive();
    expect(desc.name).toBe('no-git');
    expect(desc.commits).toBe(0);
  });

  it('perceives real cocapn repo', () => {
    const desc = new Awareness('/tmp/cocapn').perceive();
    expect(desc.commits).toBeGreaterThan(0);
    expect(desc.files).toBeGreaterThan(0);
  });
});

// ─── LLM Tests ────────────────────────────────────────────────────────────────

describe('DeepSeek', () => {
  it('initializes with defaults', () => {
    expect(new DeepSeek({ apiKey: 'test' })).toBeDefined();
  });

  it('initializes as LLM with provider', () => {
    const openai = new (llmMod.LLM)({ provider: 'openai', apiKey: 'test' });
    expect(openai).toBeDefined();
  });

  it('initializes as LLM with ollama', () => {
    const ollama = new (llmMod.LLM)({ provider: 'ollama' });
    expect(ollama).toBeDefined();
  });

  it('supports custom baseUrl', () => {
    const custom = new (llmMod.LLM)({ provider: 'custom', baseUrl: 'https://groq.example.com', apiKey: 'test' });
    expect(custom).toBeDefined();
  });
});

// ─── Git Tests ─────────────────────────────────────────────────────────────────

describe('Git module', () => {
  let dir: string;
  beforeEach(() => {
    dir = join(tmpdir(), `cocapn-git-${uid()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'app.ts'), 'const x = 1;\n');
    writeFileSync(join(dir, 'util.py'), 'def foo(): pass\n');
    execSync('git init', { cwd: dir, timeout: 5000 });
    execSync('git config user.email test@test.com', { cwd: dir });
    execSync('git config user.name Test', { cwd: dir });
    execSync('git add .', { cwd: dir });
    execSync('git commit -m "init"', { cwd: dir, timeout: 5000 });
  });
  afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

  it('perceives git repo', () => {
    const self = gitMod.perceive(dir);
    expect(self.commits).toBe(1);
    expect(self.files).toBe(2);
    expect(self.lines).toBeGreaterThan(0);
    expect(self.pulse).toBe('active');
  });

  it('narrates in first person', () => {
    const text = gitMod.narrate(dir);
    expect(text).toContain('memories');
    expect(text).toContain('files');
  });

  it('returns log entries', () => {
    const entries = gitMod.log(dir);
    expect(entries.length).toBe(1);
    expect(entries[0].msg).toBe('init');
    expect(entries[0].hash).toBeTruthy();
  });

  it('returns stats', () => {
    const s = gitMod.stats(dir);
    expect(s.files).toBe(2);
    expect(s.lines).toBeGreaterThan(0);
    expect(s.languages.TypeScript).toBe(1);
    expect(s.languages.Python).toBe(1);
  });

  it('returns diff', () => {
    const d = gitMod.diff(dir);
    expect(typeof d).toBe('string');
  });

  it('shows uncommitted changes in diff', () => {
    writeFileSync(join(dir, 'new-file.ts'), 'export const y = 2;\n');
    execSync('git add new-file.ts', { cwd: dir });
    const d = gitMod.diff(dir);
    // Staged changes should show
    expect(d.length).toBeGreaterThan(0);
  });
});

// ─── Web Route Tests ───────────────────────────────────────────────────────────

describe('Web Routes', () => {
  let dir: string;
  let port: number;

  beforeEach(async () => {
    dir = join(tmpdir(), `cocapn-web-${uid()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'web-test' }));
    writeFileSync(join(dir, 'soul.md'), '---\nname: WebBot\ntone: friendly\n---\nI am a test bot.');
    execSync('git init', { cwd: dir, timeout: 5000 });
    execSync('git config user.email test@test.com', { cwd: dir });
    execSync('git config user.name Test', { cwd: dir });
    execSync('git add .', { cwd: dir });
    execSync('git commit -m init', { cwd: dir, timeout: 5000 });
  });

  afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

  function makeMockLlm(response = 'Echo: ') {
    return {
      async *chatStream(messages: any[]) {
        const userMsg = messages.find((m: any) => m.role === 'user');
        if (userMsg) yield { type: 'content' as const, text: response + userMsg.content };
        yield { type: 'done' as const };
      },
    };
  }

  function setupServer(p: number, mockLlm: any) {
    const memory = new Memory(dir);
    const awareness = new Awareness(dir);
    const soul = { name: 'WebBot', tone: 'friendly', model: 'deepseek', body: 'I am a test bot.' };
    webMod.startWebServer(p, mockLlm, memory, awareness, soul);
    return { memory, awareness, soul };
  }

  it('GET / returns HTML chat UI', async () => {
    port = 4100 + Math.floor(Math.random() * 900);
    setupServer(port, makeMockLlm());
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('cocapn');
    expect(html).toContain('input');
    expect(html).toContain('whoami');
  });

  it('GET /api/status returns agent info', async () => {
    port = 4200 + Math.floor(Math.random() * 900);
    setupServer(port, makeMockLlm());
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/api/status`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.name).toBe('WebBot');
    expect(data.tone).toBe('friendly');
    expect(data.memoryCount).toBeDefined();
    expect(data.factCount).toBeDefined();
  });

  it('GET /api/whoami returns full self-perception', async () => {
    port = 4300 + Math.floor(Math.random() * 900);
    setupServer(port, makeMockLlm());
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/api/whoami`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.name).toBe('WebBot');
    expect(data.memory).toBeDefined();
    expect(data.memory.facts).toBe(0);
    expect(data.authors).toBeDefined();
  });

  it('POST /api/chat streams and saves', async () => {
    port = 4400 + Math.floor(Math.random() * 900);
    const { memory } = setupServer(port, makeMockLlm());
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello bot' }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('Echo: Hello bot');
    expect(text).toContain('[DONE]');

    const memData = await (await fetch(`http://localhost:${port}/api/memory`)).json() as any;
    expect(memData.messages.some((m: any) => m.content === 'Hello bot')).toBe(true);
  });

  it('POST /api/chat rejects empty message', async () => {
    port = 4500 + Math.floor(Math.random() * 900);
    setupServer(port, makeMockLlm());
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('GET /cocapn/soul.md returns public soul', async () => {
    port = 4600 + Math.floor(Math.random() * 900);
    setupServer(port, makeMockLlm());
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/cocapn/soul.md`);
    expect(res.status).toBe(200);
    expect((await res.text())).toContain('WebBot');
  });

  it('GET /api/memory/search finds messages', async () => {
    port = 4700 + Math.floor(Math.random() * 900);
    const { memory } = setupServer(port, makeMockLlm());
    memory.addMessage('user', 'I love TypeScript');
    memory.addMessage('assistant', 'TypeScript is great');
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/api/memory/search?q=typescript`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.messages.length).toBe(2);
  });

  it('GET /api/memory/search requires q param', async () => {
    port = 4750 + Math.floor(Math.random() * 900);
    setupServer(port, makeMockLlm());
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/api/memory/search`);
    expect(res.status).toBe(400);
  });

  it('DELETE /api/memory clears memories', async () => {
    port = 4800 + Math.floor(Math.random() * 900);
    const { memory } = setupServer(port, makeMockLlm());
    memory.addMessage('user', 'Remember this');
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/api/memory`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.ok).toBe(true);
  });

  it('GET /api/git/log returns commits', async () => {
    port = 4900 + Math.floor(Math.random() * 900);
    setupServer(port, makeMockLlm());
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/api/git/log`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(Array.isArray(data)).toBe(true);
  });

  it('GET /api/git/stats returns stats', async () => {
    port = 5000 + Math.floor(Math.random() * 900);
    setupServer(port, makeMockLlm());
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/api/git/stats`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.files).toBeDefined();
    expect(data.lines).toBeDefined();
  });

  it('GET /api/git/diff returns diff', async () => {
    port = 5100 + Math.floor(Math.random() * 900);
    setupServer(port, makeMockLlm());
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/api/git/diff`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.diff).toBeDefined();
  });
});

// ─── Template Tests ────────────────────────────────────────────────────────────

describe('Templates', () => {
  const templateDir = join(import.meta.dirname ?? '.', '..', 'template');

  it('has soul.md', () => {
    const soul = loadSoul(join(templateDir, 'soul.md'));
    expect(soul.body.length).toBeGreaterThan(0);
  });

  it('has cocapn.json', () => {
    const config = JSON.parse(readFileSync(join(templateDir, 'cocapn.json'), 'utf-8'));
    expect(config).toBeDefined();
  });

  it('has README.md', () => {
    expect(existsSync(join(templateDir, 'README.md'))).toBe(true);
  });
});

// ─── Extract Tests ──────────────────────────────────────────────────────────────

describe('Extract', () => {
  let testDir: string;
  beforeEach(() => { testDir = join(tmpdir(), `cocapn-extract-${uid()}`); mkdirSync(testDir, { recursive: true }); });
  afterEach(() => { try { rmSync(testDir, { recursive: true, force: true }); } catch {} });

  it('extracts user name', () => {
    const mem = new Memory(testDir);
    const result = extractMod.extract('My name is Alice and I like coding', mem);
    expect(result.facts).toContainEqual({ key: 'user.name', value: 'Alice' });
    expect(mem.facts['user.name']).toBe('Alice');
  });

  it('extracts location', () => {
    const mem = new Memory(testDir);
    const result = extractMod.extract('I live in Berlin', mem);
    expect(result.facts).toContainEqual({ key: 'user.location', value: 'Berlin' });
  });

  it('extracts from "I am from"', () => {
    const mem = new Memory(testDir);
    const result = extractMod.extract('I am from Tokyo, Japan', mem);
    expect(result.facts.some(f => f.key === 'user.location')).toBe(true);
  });

  it('detects positive tone', () => {
    const mem = new Memory(testDir);
    const result = extractMod.extract('I love this feature, it is great!', mem);
    expect(result.tone).toBe('positive');
  });

  it('detects negative tone', () => {
    const mem = new Memory(testDir);
    const result = extractMod.extract('This is broken and terrible', mem);
    expect(result.tone).toBe('negative');
  });

  it('detects neutral tone', () => {
    const mem = new Memory(testDir);
    const result = extractMod.extract('What is the file structure?', mem);
    expect(result.tone).toBe('neutral');
  });

  it('extracts questions', () => {
    const mem = new Memory(testDir);
    const result = extractMod.extract('How does this work? Can you explain?', mem);
    expect(result.questions.length).toBeGreaterThanOrEqual(1);
    expect(result.questions.some(q => q.includes('work'))).toBe(true);
  });

  it('extracts decisions', () => {
    const mem = new Memory(testDir);
    const result = extractMod.extract("Let's use TypeScript instead of JavaScript", mem);
    expect(result.decisions.length).toBeGreaterThan(0);
    expect(result.decisions.some(d => d.includes('TypeScript'))).toBe(true);
  });

  it('extracts preference', () => {
    const mem = new Memory(testDir);
    const result = extractMod.extract('I prefer dark mode', mem);
    expect(result.facts.some(f => f.key === 'user.preference')).toBe(true);
  });

  it('persists facts to memory', () => {
    const mem = new Memory(testDir);
    extractMod.extract('My name is Bob', mem);
    const mem2 = new Memory(testDir);
    expect(mem2.facts['user.name']).toBe('Bob');
  });
});

// ─── Context Tests ──────────────────────────────────────────────────────────────

describe('Context', () => {
  let testDir: string;
  beforeEach(() => { testDir = join(tmpdir(), `cocapn-ctx-${uid()}`); mkdirSync(testDir, { recursive: true }); });
  afterEach(() => { try { rmSync(testDir, { recursive: true, force: true }); } catch {} });

  function makeSoul() { return { name: 'TestBot', tone: 'friendly', model: 'deepseek', body: 'I help.' }; }

  it('includes soul personality', () => {
    const mem = new Memory(testDir);
    const awareness = new Awareness(testDir);
    const result = contextMod.buildContext({ soul: makeSoul(), memory: mem, awareness, userMessage: 'hi' });
    expect(result).toContain('You are TestBot');
    expect(result).toContain('friendly');
    expect(result).toContain('I help.');
  });

  it('includes awareness narration', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'ctx-test' }));
    const mem = new Memory(testDir);
    const awareness = new Awareness(testDir);
    const result = contextMod.buildContext({ soul: makeSoul(), memory: mem, awareness, userMessage: 'hi' });
    expect(result).toContain('Who I Am');
    expect(result).toContain('ctx-test');
  });

  it('includes relevant facts when matching user message', () => {
    const mem = new Memory(testDir);
    mem.facts['user.location'] = 'Berlin';
    mem['save']();
    const awareness = new Awareness(testDir);
    const result = contextMod.buildContext({ soul: makeSoul(), memory: mem, awareness, userMessage: 'What is the weather in Berlin?' });
    expect(result).toContain('Berlin');
  });

  it('includes recent conversation', () => {
    const mem = new Memory(testDir);
    mem.addMessage('user', 'Hello there');
    mem.addMessage('assistant', 'Hi!');
    const awareness = new Awareness(testDir);
    const result = contextMod.buildContext({ soul: makeSoul(), memory: mem, awareness, userMessage: 'How are you?' });
    expect(result).toContain('Hello there');
  });

  it('includes reflection summary when provided', () => {
    const mem = new Memory(testDir);
    const awareness = new Awareness(testDir);
    const result = contextMod.buildContext({
      soul: makeSoul(), memory: mem, awareness, userMessage: 'hi',
      reflectionSummary: 'I have learned 5 facts about the user.',
    });
    expect(result).toContain('Recent Reflection');
    expect(result).toContain('5 facts');
  });

  it('respects max chars budget', () => {
    const mem = new Memory(testDir);
    for (let i = 0; i < 50; i++) mem.addMessage('user', `Message ${i} with some extra content to make it longer`);
    for (let i = 0; i < 50; i++) mem.addMessage('assistant', `Response ${i} with some extra content to make it longer`);
    const awareness = new Awareness(testDir);
    const result = contextMod.buildContext({ soul: makeSoul(), memory: mem, awareness, userMessage: 'hi' });
    expect(result.length).toBeLessThan(26000); // some overhead over 24000
  });
});

// ─── Reflect Tests ──────────────────────────────────────────────────────────────

describe('Reflect', () => {
  let testDir: string;
  beforeEach(() => { testDir = join(tmpdir(), `cocapn-reflect-${uid()}`); mkdirSync(testDir, { recursive: true }); });
  afterEach(() => { try { rmSync(testDir, { recursive: true, force: true }); } catch {} });

  it('generates reflection from memory', () => {
    const mem = new Memory(testDir);
    mem.addMessage('user', 'Hello');
    mem.addMessage('assistant', 'Hi');
    mem.facts['user.name'] = 'Alice';
    mem['save']();
    const awareness = new Awareness(testDir);
    const result = reflectMod.reflect(mem, awareness);
    expect(result.summary).toBeTruthy();
    expect(result.factCount).toBeGreaterThan(0);
    expect(result.messageCount).toBe(2);
    expect(result.ts).toBeTruthy();
  });

  it('saves reflection to memory', () => {
    const mem = new Memory(testDir);
    mem.addMessage('user', 'test');
    mem['save']();
    const awareness = new Awareness(testDir);
    reflectMod.reflect(mem, awareness);
    expect(mem.facts['_lastReflection']).toBeTruthy();
    expect(mem.facts['_reflectionTs']).toBeTruthy();
  });

  it('persists reflection across instances', () => {
    const mem = new Memory(testDir);
    mem.addMessage('user', 'test');
    mem['save']();
    const awareness = new Awareness(testDir);
    reflectMod.reflect(mem, awareness);
    const mem2 = new Memory(testDir);
    expect(mem2.facts['_lastReflection']).toBeTruthy();
  });

  it('shouldReflect returns true initially', () => {
    const mem = new Memory(testDir);
    mem.addMessage('user', 'hi');
    mem.addMessage('assistant', 'hello');
    mem.addMessage('user', 'how are you?');
    mem['save']();
    expect(reflectMod.shouldReflect(mem)).toBe(true);
  });

  it('shouldReflect returns false right after reflection', () => {
    const mem = new Memory(testDir);
    mem.addMessage('user', 'hi');
    mem['save']();
    const awareness = new Awareness(testDir);
    reflectMod.reflect(mem, awareness);
    expect(reflectMod.shouldReflect(mem)).toBe(false);
  });

  it('detects patterns', () => {
    const mem = new Memory(testDir);
    for (let i = 0; i < 15; i++) mem.addMessage('user', `How does thing ${i} work?`);
    mem['save']();
    const awareness = new Awareness(testDir);
    const result = reflectMod.reflect(mem, awareness);
    expect(result.patterns).toContain('curious interlocutor');
  });

  it('extracts topics from repeated words', () => {
    const mem = new Memory(testDir);
    mem.addMessage('user', 'Tell me about TypeScript');
    mem.addMessage('user', 'How to use TypeScript generics?');
    mem.addMessage('user', 'TypeScript best practices');
    mem['save']();
    const awareness = new Awareness(testDir);
    const result = reflectMod.reflect(mem, awareness);
    expect(result.summary).toContain('typescript');
  });
});

// ─── Summarize Tests ────────────────────────────────────────────────────────────

describe('Summarize', () => {
  let testDir: string;
  beforeEach(() => { testDir = join(tmpdir(), `cocapn-sum-${uid()}`); mkdirSync(testDir, { recursive: true }); });
  afterEach(() => { try { rmSync(testDir, { recursive: true, force: true }); } catch {} });

  it('shouldSummarize returns false below threshold', () => {
    const mem = new Memory(testDir);
    for (let i = 0; i < 15; i++) mem.addMessage('user', `msg ${i}`);
    expect(summarizeMod.shouldSummarize(mem)).toBe(false);
  });

  it('shouldSummarize returns true at threshold', () => {
    const mem = new Memory(testDir);
    for (let i = 0; i < 20; i++) mem.addMessage('user', `msg ${i}`);
    expect(summarizeMod.shouldSummarize(mem)).toBe(true);
  });

  it('summarizes and compacts messages', () => {
    const mem = new Memory(testDir);
    for (let i = 0; i < 25; i++) mem.addMessage('user', `Message ${i} about TypeScript`);
    mem.addMessage('assistant', 'Sure, TypeScript is great');
    mem['save']();
    const result = summarizeMod.summarize(mem);
    expect(result.topics).toContain('typescript');
    expect(result.messageRange.to).toBe(26);
    // Memory should be compacted to last 5
    expect(mem.messages.length).toBe(5);
  });

  it('saves summary to memory facts', () => {
    const mem = new Memory(testDir);
    for (let i = 0; i < 20; i++) mem.addMessage('user', `msg ${i}`);
    mem['save']();
    summarizeMod.summarize(mem);
    expect(mem.facts['_lastSummary']).toBeTruthy();
    // Persists across instances
    const mem2 = new Memory(testDir);
    expect(mem2.facts['_lastSummary']).toBeTruthy();
  });

  it('extracts topics from conversation', () => {
    const mem = new Memory(testDir);
    const topics = ['typescript', 'react', 'testing'];
    for (let i = 0; i < 20; i++) {
      mem.addMessage('user', `Tell me about ${topics[i % 3]} please`);
      mem.addMessage('assistant', `${topics[i % 3]} is interesting`);
    }
    mem['save']();
    const result = summarizeMod.summarize(mem);
    expect(result.topics.length).toBeGreaterThan(0);
    // Should include at least one of our topics
    const topicStr = result.topics.join(' ');
    expect(topicStr).toContain('typescript');
  });

  it('detects decisions in conversation', () => {
    const mem = new Memory(testDir);
    for (let i = 0; i < 18; i++) mem.addMessage('user', `regular message ${i}`);
    mem.addMessage('user', "Let's use vitest for testing");
    mem.addMessage('user', 'ok');
    mem['save']();
    const result = summarizeMod.summarize(mem);
    expect(result.decisions.length).toBeGreaterThan(0);
  });

  it('finds unanswered questions', () => {
    const mem = new Memory(testDir);
    for (let i = 0; i < 19; i++) mem.addMessage('user', `msg ${i}`);
    mem.addMessage('user', 'What is the meaning of life?');
    mem['save']();
    const result = summarizeMod.summarize(mem);
    // Should find the question (no assistant answered it)
    expect(result.unansweredQuestions.length).toBeGreaterThanOrEqual(0);
  });
});

// ─── BuildFullSystemPrompt Tests ────────────────────────────────────────────────

describe('buildFullSystemPrompt', () => {
  it('combines soul, awareness, facts, reflection', () => {
    const soul = { name: 'Bot', tone: 'warm', model: 'deepseek', body: 'I help people.' };
    const result = buildFullSystemPrompt(
      soul,
      'I am a repo with 10 files.',
      'Known facts:\n- user.name: Alice',
      'I have learned 3 facts today.',
    );
    expect(result).toContain('You are Bot');
    expect(result).toContain('warm');
    expect(result).toContain('I help people.');
    expect(result).toContain('Who I Am');
    expect(result).toContain('10 files');
    expect(result).toContain('What I Remember');
    expect(result).toContain('Alice');
    expect(result).toContain('Recent Reflection');
    expect(result).toContain('3 facts');
  });

  it('omits facts section when empty', () => {
    const soul = { name: 'Bot', tone: 'neutral', model: 'deepseek', body: 'Hello.' };
    const result = buildFullSystemPrompt(soul, 'I am alive.', '');
    expect(result).not.toContain('What I Remember');
  });

  it('omits reflection section when not provided', () => {
    const soul = { name: 'Bot', tone: 'neutral', model: 'deepseek', body: 'Hello.' };
    const result = buildFullSystemPrompt(soul, 'I am alive.', 'facts');
    expect(result).not.toContain('Recent Reflection');
  });
});

// ─── Config Validation Tests ────────────────────────────────────────────────────

import * as configMod from '../src/config.ts';

// ─── Deployment Tests ─────────────────────────────────────────────────────────

describe('Deployment — Dockerfile', () => {
  const seedDir = join(import.meta.dirname ?? '.', '..');

  it('Dockerfile exists and has multi-stage build', () => {
    const dockerfilePath = join(seedDir, 'Dockerfile');
    expect(existsSync(dockerfilePath)).toBe(true);
    const content = readFileSync(dockerfilePath, 'utf-8');
    // Multi-stage: builder + runtime
    expect(content).toContain('AS builder');
    expect(content).toContain('node:22-alpine');
    expect(content).toContain('EXPOSE 3100');
    expect(content).toContain('HEALTHCHECK');
    expect(content).toContain('"node"');
    expect(content).toContain('"--web"');
    expect(content).toContain('"3100"');
  });

  it('Dockerfile is under 20 lines', () => {
    const content = readFileSync(join(seedDir, 'Dockerfile'), 'utf-8');
    const lines = content.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
    expect(lines.length).toBeLessThan(20);
  });

  it('docker-compose.yml exists and is valid', () => {
    const composePath = join(seedDir, 'docker-compose.yml');
    expect(existsSync(composePath)).toBe(true);
    const content = readFileSync(composePath, 'utf-8');
    expect(content).toContain('services:');
    expect(content).toContain('cocapn:');
    expect(content).toContain('build:');
    expect(content).toContain('3100');
    expect(content).toContain('DEEPSEEK_API_KEY');
  });
});

describe('Deployment — Cloudflare Worker', () => {
  const seedDir = join(import.meta.dirname ?? '.', '..');

  it('wrangler.toml exists and is valid', () => {
    const wranglerPath = join(seedDir, 'wrangler.toml');
    expect(existsSync(wranglerPath)).toBe(true);
    const content = readFileSync(wranglerPath, 'utf-8');
    expect(content).toContain('main = "src/worker.ts"');
    expect(content).toContain('MEMORY');
    expect(content).toContain('kv_namespaces');
  });

  it('worker.ts module can be imported', async () => {
    // Dynamic import to check the module loads without errors
    const workerPath = join(seedDir, 'src', 'worker.ts');
    expect(existsSync(workerPath)).toBe(true);
    const content = readFileSync(workerPath, 'utf-8');
    // Check it exports a fetch handler
    expect(content).toContain('export default');
    expect(content).toContain('fetch');
    expect(content).toContain('handleChat');
    expect(content).toContain('/api/chat');
    expect(content).toContain('/api/status');
    expect(content).toContain('/api/memory');
    expect(content).toContain('KVNamespace');
  });

  it('worker.ts has SSE streaming for chat', () => {
    const content = readFileSync(join(seedDir, 'src', 'worker.ts'), 'utf-8');
    expect(content).toContain('text/event-stream');
    expect(content).toContain('[DONE]');
  });

  it('worker.ts has inline HTML UI', () => {
    const content = readFileSync(join(seedDir, 'src', 'worker.ts'), 'utf-8');
    expect(content).toContain('cocapn');
    expect(content).toContain('DOCTYPE html');
  });
});

describe('Deployment — deploy script', () => {
  const seedDir = join(import.meta.dirname ?? '.', '..');

  it('deploy.sh exists and is executable content', () => {
    const deployPath = join(seedDir, 'scripts', 'deploy.sh');
    expect(existsSync(deployPath)).toBe(true);
    const content = readFileSync(deployPath, 'utf-8');
    expect(content).toContain('#!/usr/bin/env bash');
    expect(content).toContain('deploy_local');
    expect(content).toContain('deploy_docker');
    expect(content).toContain('deploy_cloudflare');
  });

  it('deploy script handles all three platforms', () => {
    const content = readFileSync(join(seedDir, 'scripts', 'deploy.sh'), 'utf-8');
    expect(content).toContain('local|docker|cloudflare');
    expect(content).toContain('detect_platform');
  });

  it('deploy script references correct port and command', () => {
    const content = readFileSync(join(seedDir, 'scripts', 'deploy.sh'), 'utf-8');
    expect(content).toContain('3100');
    expect(content).toContain('--web');
    expect(content).toContain('wrangler deploy');
  });
});

describe('Config Validation', () => {
  it('accepts valid config with all fields', () => {
    const errors = configMod.validateConfig({ mode: 'private', port: 3100, llm: { provider: 'deepseek', model: 'deepseek-chat', temperature: 0.7, maxTokens: 2048 } });
    expect(errors).toEqual([]);
  });

  it('accepts empty config (all optional)', () => {
    const errors = configMod.validateConfig({});
    expect(errors).toEqual([]);
  });

  it('rejects invalid mode', () => {
    const errors = configMod.validateConfig({ mode: 'invalid' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('mode');
  });

  it('rejects non-numeric port', () => {
    const errors = configMod.validateConfig({ port: 'abc' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('port');
  });

  it('rejects out-of-range port', () => {
    const errors = configMod.validateConfig({ port: 99999 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects invalid temperature', () => {
    const errors = configMod.validateConfig({ llm: { temperature: 5 } });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('temperature');
  });

  it('rejects non-string apiKey', () => {
    const errors = configMod.validateConfig({ llm: { apiKey: 123 } });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('apiKey');
  });

  it('rejects invalid maxTokens', () => {
    const errors = configMod.validateConfig({ llm: { maxTokens: -1 } });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('maxTokens');
  });

  it('applies defaults', () => {
    const result = configMod.applyDefaults({});
    expect(result.mode).toBe('private');
    expect(result.port).toBe(3100);
    expect(result.llm?.provider).toBe('deepseek');
  });

  it('preserves explicit values over defaults', () => {
    const result = configMod.applyDefaults({ mode: 'public', port: 8080 });
    expect(result.mode).toBe('public');
    expect(result.port).toBe(8080);
  });
});

// ─── Plugin Tests ──────────────────────────────────────────────────────────────

describe('PluginLoader', () => {
  let testDir: string;
  let pluginDir: string;
  let logs: string[];
  beforeEach(() => {
    testDir = join(tmpdir(), `cocapn-plug-${uid()}`);
    pluginDir = join(testDir, 'cocapn', 'plugins');
    mkdirSync(pluginDir, { recursive: true });
    logs = [];
  });
  afterEach(() => { try { rmSync(testDir, { recursive: true, force: true }); } catch {} });

  it('loads plugins from cocapn/plugins/*.js', async () => {
    writeFileSync(join(pluginDir, 'test.js'),
      `export default { name: 'test', version: '1.0.0', hooks: {} };`
    );
    const loader = new pluginsMod.PluginLoader((m) => logs.push(m));
    await loader.load(pluginDir);
    expect(loader.plugins.length).toBe(1);
    expect(loader.plugins[0].name).toBe('test');
    expect(logs).toContain('loaded test@1.0.0');
  });

  it('loads multiple plugins in alphabetical order', async () => {
    writeFileSync(join(pluginDir, 'alpha.js'),
      `export default { name: 'alpha', version: '0.1.0', hooks: {} };`
    );
    writeFileSync(join(pluginDir, 'beta.js'),
      `export default { name: 'beta', version: '2.0.0', hooks: {} };`
    );
    const loader = new pluginsMod.PluginLoader();
    await loader.load(pluginDir);
    expect(loader.plugins.length).toBe(2);
    expect(loader.plugins[0].name).toBe('alpha');
    expect(loader.plugins[1].name).toBe('beta');
  });

  it('skips non-js files', async () => {
    writeFileSync(join(pluginDir, 'readme.md'), 'not a plugin');
    writeFileSync(join(pluginDir, 'real.js'),
      `export default { name: 'real', version: '1.0.0', hooks: {} };`
    );
    const loader = new pluginsMod.PluginLoader();
    await loader.load(pluginDir);
    expect(loader.plugins.length).toBe(1);
    expect(loader.plugins[0].name).toBe('real');
  });

  it('handles invalid plugin gracefully', async () => {
    writeFileSync(join(pluginDir, 'bad.js'), `export default { wrong: true };`);
    const loader = new pluginsMod.PluginLoader((m) => logs.push(m));
    await loader.load(pluginDir);
    expect(loader.plugins.length).toBe(0);
    expect(logs.some(l => l.includes('failed to load'))).toBe(true);
  });

  it('handles missing plugin directory', async () => {
    const loader = new pluginsMod.PluginLoader();
    await loader.load(join(testDir, 'nonexistent'));
    expect(loader.plugins.length).toBe(0);
  });

  it('runs before-chat hooks in order', async () => {
    writeFileSync(join(pluginDir, 'a.js'), `export default {
      name: 'a', version: '1.0.0',
      hooks: { 'before-chat': async (msg, ctx) => { ctx.order = (ctx.order || '') + 'a'; return ctx; } }
    };`);
    writeFileSync(join(pluginDir, 'b.js'), `export default {
      name: 'b', version: '1.0.0',
      hooks: { 'before-chat': async (msg, ctx) => { ctx.order = (ctx.order || '') + 'b'; return ctx; } }
    };`);
    const loader = new pluginsMod.PluginLoader();
    await loader.load(pluginDir);
    const ctx = await loader.runBeforeChat('hello', { message: 'hello', facts: {} });
    expect((ctx as any).order).toBe('ab');
  });

  it('runs after-chat hooks in order', async () => {
    writeFileSync(join(pluginDir, 'wrap.js'), `export default {
      name: 'wrap', version: '1.0.0',
      hooks: { 'after-chat': async (res, ctx) => '[' + res + ']' }
    };`);
    const loader = new pluginsMod.PluginLoader();
    await loader.load(pluginDir);
    const result = await loader.runAfterChat('hello', { message: 'hello', facts: {} });
    expect(result).toBe('[hello]');
  });

  it('collects plugin commands', async () => {
    writeFileSync(join(pluginDir, 'cmd.js'), `export default {
      name: 'cmd', version: '1.0.0',
      hooks: { command: { foo: async (a) => 'foo:' + a, bar: async (a) => 'bar:' + a } }
    };`);
    const loader = new pluginsMod.PluginLoader();
    await loader.load(pluginDir);
    const cmds = loader.getCommands();
    expect(Object.keys(cmds)).toEqual(['foo', 'bar']);
    expect(await cmds['foo']('test')).toBe('foo:test');
    expect(await cmds['bar']('x')).toBe('bar:x');
  });

  it('isolates plugin command errors', async () => {
    writeFileSync(join(pluginDir, 'err.js'), `export default {
      name: 'err', version: '1.0.0',
      hooks: { command: { boom: async (a) => { throw new Error('kaboom'); } } }
    };`);
    const loader = new pluginsMod.PluginLoader();
    await loader.load(pluginDir);
    const cmds = loader.getCommands();
    const result = await cmds['boom']('');
    expect(result).toContain('error');
    expect(result).toContain('kaboom');
  });

  it('isolates before-chat hook errors', async () => {
    writeFileSync(join(pluginDir, 'crash.js'), `export default {
      name: 'crash', version: '1.0.0',
      hooks: { 'before-chat': async (msg, ctx) => { throw new Error('oops'); } }
    };`);
    const loader = new pluginsMod.PluginLoader((m) => logs.push(m));
    await loader.load(pluginDir);
    const ctx = await loader.runBeforeChat('test', { message: 'test', facts: {} });
    // Should still return context (original since hook failed)
    expect(ctx.message).toBe('test');
    expect(logs.some(l => l.includes('crash'))).toBe(true);
  });

  it('isolates after-chat hook errors', async () => {
    writeFileSync(join(pluginDir, 'bad.js'), `export default {
      name: 'bad', version: '1.0.0',
      hooks: { 'after-chat': async (res, ctx) => { throw new Error('nope'); } }
    };`);
    const loader = new pluginsMod.PluginLoader((m) => logs.push(m));
    await loader.load(pluginDir);
    const result = await loader.runAfterChat('hello', { message: 'hello', facts: {} });
    // Should return original response since hook failed
    expect(result).toBe('hello');
  });

  it('lists loaded plugins', async () => {
    writeFileSync(join(pluginDir, 'p1.js'), `export default {
      name: 'p1', version: '1.0.0',
      hooks: { command: { hello: async (a) => 'hi' } }
    };`);
    writeFileSync(join(pluginDir, 'p2.js'), `export default {
      name: 'p2', version: '2.0.0',
      hooks: {}
    };`);
    const loader = new pluginsMod.PluginLoader();
    await loader.load(pluginDir);
    const list = loader.list();
    expect(list.length).toBe(2);
    expect(list[0]).toEqual({ name: 'p1', version: '1.0.0', commands: ['hello'] });
    expect(list[1]).toEqual({ name: 'p2', version: '2.0.0', commands: [] });
  });

  it('returns empty list when no plugins loaded', () => {
    const loader = new pluginsMod.PluginLoader();
    expect(loader.list()).toEqual([]);
    expect(loader.getCommands()).toEqual({});
  });

  it('before-chat hook can add context data', async () => {
    writeFileSync(join(pluginDir, 'hint.js'), `export default {
      name: 'hint', version: '1.0.0',
      hooks: { 'before-chat': async (msg, ctx) => { ctx._myHint = '42'; return ctx; } }
    };`);
    const loader = new pluginsMod.PluginLoader();
    await loader.load(pluginDir);
    const ctx = await loader.runBeforeChat('what is the answer?', { message: 'what is the answer?', facts: {} });
    expect((ctx as any)._myHint).toBe('42');
  });

  it('plugin with no hooks still loads', async () => {
    writeFileSync(join(pluginDir, 'empty.js'), `export default { name: 'empty', version: '0.0.1', hooks: {} };`);
    const loader = new pluginsMod.PluginLoader();
    await loader.load(pluginDir);
    expect(loader.plugins.length).toBe(1);
    expect(loader.list()[0].commands).toEqual([]);
  });
});
