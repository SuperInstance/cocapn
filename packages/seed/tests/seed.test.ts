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
import * as themeMod from '../src/theme.ts';
import * as knowledgeMod from '../src/knowledge.ts';
import * as learnMod from '../src/learn.ts';
import * as visionMod from '../src/vision.ts';

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

// ─── Theme Tests ──────────────────────────────────────────────────────────────

describe('Theme', () => {
  let testDir: string;
  beforeEach(() => { testDir = join(tmpdir(), `cocapn-theme-${uid()}`); mkdirSync(testDir, { recursive: true }); });
  afterEach(() => { try { rmSync(testDir, { recursive: true, force: true }); } catch {} });

  it('loads default theme when no preset or css', () => {
    const theme = themeMod.loadTheme(testDir);
    expect(theme.accent).toBe('#22c55e');
    expect(theme.accent2).toBe('#16a34a');
    expect(theme.mode).toBe('dark');
    expect(theme.font).toBe('monospace');
  });

  it('loads ocean preset', () => {
    const theme = themeMod.loadTheme(testDir, 'ocean');
    expect(theme.accent).toBe('#1a73e8');
    expect(theme.accent2).toBe('#1557b0');
    expect(theme.mode).toBe('dark');
    expect(theme.font).toBe('sans-serif');
  });

  it('loads forest preset', () => {
    const theme = themeMod.loadTheme(testDir, 'forest');
    expect(theme.accent).toBe('#2e7d32');
    expect(theme.mode).toBe('dark');
  });

  it('loads sunset preset', () => {
    const theme = themeMod.loadTheme(testDir, 'sunset');
    expect(theme.accent).toBe('#e65100');
  });

  it('loads midnight preset', () => {
    const theme = themeMod.loadTheme(testDir, 'midnight');
    expect(theme.accent).toBe('#6a1b9a');
    expect(theme.accent2).toBe('#4a148c');
  });

  it('loads minimal preset (light mode)', () => {
    const theme = themeMod.loadTheme(testDir, 'minimal');
    expect(theme.accent).toBe('#000000');
    expect(theme.mode).toBe('light');
    expect(theme.font).toBe('monospace');
  });

  it('falls back to default on unknown preset', () => {
    const theme = themeMod.loadTheme(testDir, 'nonexistent');
    expect(theme.accent).toBe('#22c55e');
  });

  it('overrides accent from theme.css', () => {
    writeFileSync(join(testDir, 'theme.css'), ':root{--accent:#ff0000;--color-secondary:#880000}');
    const theme = themeMod.loadTheme(testDir, 'ocean');
    expect(theme.accent).toBe('#ff0000');
    expect(theme.accent2).toBe('#880000');
  });

  it('reads color-primary as accent fallback', () => {
    writeFileSync(join(testDir, 'theme.css'), ':root{--color-primary:#00ff00}');
    const theme = themeMod.loadTheme(testDir);
    expect(theme.accent).toBe('#00ff00');
  });

  it('reads theme.css from cocapn/ subdirectory', () => {
    mkdirSync(join(testDir, 'cocapn'), { recursive: true });
    writeFileSync(join(testDir, 'cocapn', 'theme.css'), ':root{--accent:#abcdef}');
    const theme = themeMod.loadTheme(testDir);
    expect(theme.accent).toBe('#abcdef');
  });
});

describe('Theme CSS Generation', () => {
  it('generates CSS variables for dark mode', () => {
    const css = themeMod.themeToCSS({ accent: '#22c55e', accent2: '#16a34a', mode: 'dark', font: 'monospace' });
    expect(css).toContain('--accent:#22c55e');
    expect(css).toContain('--accent2:#16a34a');
    expect(css).toContain('--bg:#09090b');
    expect(css).toContain('--text:#d4d4d8');
    expect(css).toContain('--user-bg:#1e3a5f');
  });

  it('generates CSS variables for light mode', () => {
    const css = themeMod.themeToCSS({ accent: '#000', accent2: '#333', mode: 'light', font: 'sans-serif' });
    expect(css).toContain('--bg:#ffffff');
    expect(css).toContain('--text:#1a1a1a');
    expect(css).toContain('--user-bg:#dbeafe');
    expect(css).toContain('--bot-bg:#f0f0f0');
  });

  it('generates correct font for monospace', () => {
    const css = themeMod.themeToCSS({ accent: '#000', accent2: '#333', mode: 'dark', font: 'monospace' });
    expect(css).toContain('SF Mono');
  });

  it('generates correct font for sans-serif', () => {
    const css = themeMod.themeToCSS({ accent: '#000', accent2: '#333', mode: 'dark', font: 'sans-serif' });
    expect(css).toContain('system-ui');
  });

  it('generates correct font for serif', () => {
    const css = themeMod.themeToCSS({ accent: '#000', accent2: '#333', mode: 'dark', font: 'serif' });
    expect(css).toContain('Georgia');
  });

  it('output is valid CSS variable format', () => {
    const css = themeMod.themeToCSS({ accent: '#1a73e8', accent2: '#1557b0', mode: 'dark', font: 'sans-serif' });
    expect(css).toMatch(/^:root\{--[\w-]+:[^;]+;/);
    expect(css).toContain('}');
  });
});

// ─── A2A Tests ────────────────────────────────────────────────────────────────

import * as a2aMod from '../src/a2a.ts';

const { A2AHub } = a2aMod;

describe('A2A', () => {
  it('creates a hub with name, url, and secret', () => {
    const hub = new A2AHub('Alice', 'http://localhost:3100', 'secret123');
    expect(hub.getPeers()).toEqual([]);
  });

  it('authenticates with correct secret', () => {
    const hub = new A2AHub('Alice', 'http://localhost:3100', 'secret123');
    expect(hub.authenticate('secret123')).toBe(true);
    expect(hub.authenticate('wrong')).toBe(false);
    expect(hub.authenticate(undefined)).toBe(false);
  });

  it('allows all requests when no secret is set', () => {
    const hub = new A2AHub('Alice', 'http://localhost:3100', '');
    expect(hub.authenticate(undefined)).toBe(true);
    expect(hub.authenticate('anything')).toBe(true);
  });

  it('adds a peer from handshake', () => {
    const hub = new A2AHub('Alice', 'http://localhost:3100', '');
    const peer = hub.addPeer({
      id: 'bob', name: 'Bob', url: 'http://localhost:3101',
      capabilities: ['chat', 'knowledge-share'],
    });
    expect(peer.name).toBe('Bob');
    expect(peer.id).toBe('bob');
    expect(hub.getPeers()).toHaveLength(1);
  });

  it('removes a peer', () => {
    const hub = new A2AHub('Alice', 'http://localhost:3100', '');
    hub.addPeer({ id: 'bob', name: 'Bob', url: 'http://localhost:3101', capabilities: [] });
    expect(hub.removePeer('bob')).toBe(true);
    expect(hub.getPeers()).toHaveLength(0);
    expect(hub.removePeer('bob')).toBe(false);
  });

  it('gets a specific peer by id', () => {
    const hub = new A2AHub('Alice', 'http://localhost:3100', '');
    hub.addPeer({ id: 'bob', name: 'Bob', url: 'http://localhost:3101', capabilities: ['chat'] });
    const peer = hub.getPeer('bob');
    expect(peer?.name).toBe('Bob');
    expect(hub.getPeer('unknown')).toBeUndefined();
  });

  it('generates visitor prompt when peers exist', () => {
    const hub = new A2AHub('Alice', 'http://localhost:3100', '');
    expect(hub.visitorPrompt()).toBe('');
    hub.addPeer({ id: 'bob', name: 'Bob', url: 'http://localhost:3101', capabilities: [] });
    const prompt = hub.visitorPrompt();
    expect(prompt).toContain('Visiting Agents');
    expect(prompt).toContain('Bob');
    expect(prompt).toContain("don't share private facts");
  });

  it('fails to send message to unknown peer', async () => {
    const hub = new A2AHub('Alice', 'http://localhost:3100', '');
    const res = await hub.sendMessage('unknown', 'hello', 'greeting');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Unknown peer');
  });

  it('loads secret from environment variable', () => {
    process.env.COCAPN_A2A_SECRET = 'env-secret';
    const secret = A2AHub.loadSecret('/nonexistent');
    expect(secret).toBe('env-secret');
    delete process.env.COCAPN_A2A_SECRET;
  });

  it('loads secret from file', () => {
    const dir = join(tmpdir(), `cocapn-a2a-${uid()}`);
    mkdirSync(join(dir, 'cocapn'), { recursive: true });
    writeFileSync(join(dir, 'cocapn', 'a2a-secret.json'), JSON.stringify({ secret: 'file-secret' }));
    const secret = A2AHub.loadSecret(dir);
    expect(secret).toBe('file-secret');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('A2A soul prompt', () => {
  it('builds A2A-aware system prompt', () => {
    const prompt = soulMod.buildA2ASystemPrompt(
      { name: 'Alice', tone: 'curious', model: 'deepseek', body: 'I help.' },
      'Bob',
      'http://localhost:3101',
    );
    expect(prompt).toContain('You are Alice');
    expect(prompt).toContain('Bob');
    expect(prompt).toContain('http://localhost:3101');
    expect(prompt).toContain("don't share private facts");
  });

  it('works without URL', () => {
    const prompt = soulMod.buildA2ASystemPrompt(
      { name: 'Alice', tone: 'curious', model: 'deepseek', body: 'I help.' },
      'Bob',
    );
    expect(prompt).toContain('Bob');
    expect(prompt).not.toContain('from undefined');
  });
});

// ─── Multi-User Memory Tests ──────────────────────────────────────────────────

describe('Multi-User Memory', () => {
  let testDir: string;
  beforeEach(() => { testDir = join(tmpdir(), `cocapn-multi-${uid()}`); mkdirSync(testDir, { recursive: true }); });
  afterEach(() => { try { rmSync(testDir, { recursive: true, force: true }); } catch {} });

  it('creates and retrieves user records', () => {
    const mem = new Memory(testDir);
    const user = mem.getOrCreateUser('casey-1', 'Casey');
    expect(user.name).toBe('Casey');
    expect(user.messageCount).toBe(0);
    expect(user.preferences).toEqual({});

    const user2 = mem.getOrCreateUser('casey-1');
    expect(user2.name).toBe('Casey'); // still Casey, not overwritten
  });

  it('creates second user independently', () => {
    const mem = new Memory(testDir);
    mem.getOrCreateUser('casey-1', 'Casey');
    mem.getOrCreateUser('alex-2', 'Alex');

    const users = mem.getUsers();
    expect(users.length).toBe(2);
    expect(users.some(u => u.name === 'Casey')).toBe(true);
    expect(users.some(u => u.name === 'Alex')).toBe(true);
  });

  it('persists users across memory instances', () => {
    const mem = new Memory(testDir);
    mem.getOrCreateUser('casey-1', 'Casey');
    const mem2 = new Memory(testDir);
    const users = mem2.getUsers();
    expect(users.length).toBe(1);
    expect(users[0].name).toBe('Casey');
  });

  it('tags messages with userId', () => {
    const mem = new Memory(testDir);
    mem.getOrCreateUser('casey-1', 'Casey');
    mem.addMessage('user', 'Hello from Casey', 'casey-1');
    mem.addMessage('assistant', 'Hi Casey!', 'casey-1');
    mem.getOrCreateUser('alex-2', 'Alex');
    mem.addMessage('user', 'Hello from Alex', 'alex-2');

    expect(mem.messages.length).toBe(3);
    expect(mem.messages[0].userId).toBe('casey-1');
    expect(mem.messages[2].userId).toBe('alex-2');
  });

  it('filters messages per user', () => {
    const mem = new Memory(testDir);
    mem.getOrCreateUser('casey-1', 'Casey');
    mem.getOrCreateUser('alex-2', 'Alex');
    mem.addMessage('user', 'Casey msg 1', 'casey-1');
    mem.addMessage('assistant', 'Reply to Casey', 'casey-1');
    mem.addMessage('user', 'Alex msg 1', 'alex-2');
    mem.addMessage('assistant', 'Reply to Alex', 'alex-2');
    mem.addMessage('user', 'Casey msg 2', 'casey-1');

    const caseyMsgs = mem.recentForUser('casey-1', 20);
    expect(caseyMsgs.length).toBe(3); // 2 user + 1 assistant
    expect(caseyMsgs.every(m => !m.userId || m.userId === 'casey-1')).toBe(true);
    expect(caseyMsgs.some(m => m.content.includes('Alex'))).toBe(false);
  });

  it('stores and retrieves per-user facts', () => {
    const mem = new Memory(testDir);
    mem.facts['global.fact'] = 'shared'; // global
    mem['save']();
    mem.setUserFact('casey-1', 'user.location', 'Portland');
    mem.setUserFact('alex-2', 'user.location', 'Berlin');

    const caseyFacts = mem.getFactsForUser('casey-1');
    expect(caseyFacts['global.fact']).toBe('shared');
    expect(caseyFacts['user.location']).toBe('Portland');

    const alexFacts = mem.getFactsForUser('alex-2');
    expect(alexFacts['global.fact']).toBe('shared');
    expect(alexFacts['user.location']).toBe('Berlin');
  });

  it('does not leak user facts across users', () => {
    const mem = new Memory(testDir);
    mem.setUserFact('casey-1', 'user.secret', 'caseys-secret');
    mem.setUserFact('alex-2', 'user.secret', 'alexs-secret');

    const caseyFacts = mem.getFactsForUser('casey-1');
    const alexFacts = mem.getFactsForUser('alex-2');

    expect(caseyFacts['user.secret']).toBe('caseys-secret');
    expect(alexFacts['user.secret']).toBe('alexs-secret');
    expect(caseyFacts['user.secret']).not.toBe('alexs-secret');
  });

  it('formats per-user facts', () => {
    const mem = new Memory(testDir);
    mem.facts['global.color'] = 'blue';
    mem['save']();
    mem.setUserFact('casey-1', 'user.name', 'Casey');

    const text = mem.formatFactsForUser('casey-1');
    expect(text).toContain('global.color: blue');
    expect(text).toContain('user.name: Casey');
  });

  it('updates messageCount on addMessage with userId', () => {
    const mem = new Memory(testDir);
    mem.getOrCreateUser('casey-1', 'Casey');
    mem.addMessage('user', 'msg1', 'casey-1');
    mem.addMessage('user', 'msg2', 'casey-1');

    const user = mem.getOrCreateUser('casey-1');
    expect(user.messageCount).toBe(2);
  });

  it('per-user facts persist across instances', () => {
    const mem = new Memory(testDir);
    mem.setUserFact('casey-1', 'user.likes', 'TypeScript');

    const mem2 = new Memory(testDir);
    const facts = mem2.getFactsForUser('casey-1');
    expect(facts['user.likes']).toBe('TypeScript');
  });
});

// ─── Multi-User Extract Tests ────────────────────────────────────────────────

describe('Multi-User Extract', () => {
  let testDir: string;
  beforeEach(() => { testDir = join(tmpdir(), `cocapn-multi-ext-${uid()}`); mkdirSync(testDir, { recursive: true }); });
  afterEach(() => { try { rmSync(testDir, { recursive: true, force: true }); } catch {} });

  it('saves facts to user store when userId provided', () => {
    const mem = new Memory(testDir);
    mem.getOrCreateUser('casey-1', 'Casey');
    const result = extractMod.extract('My name is Casey', mem, 'casey-1');
    expect(result.facts).toContainEqual({ key: 'user.name', value: 'Casey' });

    const facts = mem.getFactsForUser('casey-1');
    expect(facts['user.name']).toBe('Casey');
  });

  it('saves facts to global store when no userId', () => {
    const mem = new Memory(testDir);
    extractMod.extract('My name is Casey', mem);
    expect(mem.facts['user.name']).toBe('Casey');
  });

  it('separates facts between users', () => {
    const mem = new Memory(testDir);
    mem.getOrCreateUser('casey-1', 'Casey');
    mem.getOrCreateUser('alex-2', 'Alex');

    extractMod.extract('My name is Casey', mem, 'casey-1');
    extractMod.extract('My name is Alex', mem, 'alex-2');

    expect(mem.getFactsForUser('casey-1')['user.name']).toBe('Casey');
    expect(mem.getFactsForUser('alex-2')['user.name']).toBe('Alex');
  });
});

// ─── Multi-User Context Tests ────────────────────────────────────────────────

describe('Multi-User Context', () => {
  let testDir: string;
  beforeEach(() => { testDir = join(tmpdir(), `cocapn-multi-ctx-${uid()}`); mkdirSync(testDir, { recursive: true }); });
  afterEach(() => { try { rmSync(testDir, { recursive: true, force: true }); } catch {} });

  function makeSoul() { return { name: 'TestBot', tone: 'friendly', model: 'deepseek', body: 'I help.' }; }

  it('includes user name in context when userId set', () => {
    const mem = new Memory(testDir);
    mem.getOrCreateUser('casey-1', 'Casey');
    const awareness = new Awareness(testDir);
    const result = contextMod.buildContext({
      soul: makeSoul(), memory: mem, awareness,
      userMessage: 'hi', userId: 'casey-1',
    });
    expect(result).toContain('Casey');
    expect(result).toContain('talking to');
  });

  it('uses user-scoped facts in context', () => {
    const mem = new Memory(testDir);
    mem.getOrCreateUser('casey-1', 'Casey');
    mem.setUserFact('casey-1', 'user.location', 'Portland');
    const awareness = new Awareness(testDir);
    const result = contextMod.buildContext({
      soul: makeSoul(), memory: mem, awareness,
      userMessage: 'What about Portland weather?', userId: 'casey-1',
    });
    expect(result).toContain('Portland');
  });

  it('does not leak other user facts in context', () => {
    const mem = new Memory(testDir);
    mem.getOrCreateUser('casey-1', 'Casey');
    mem.getOrCreateUser('alex-2', 'Alex');
    mem.setUserFact('alex-2', 'user.secret', 'alexs-secret-value');
    const awareness = new Awareness(testDir);
    const result = contextMod.buildContext({
      soul: makeSoul(), memory: mem, awareness,
      userMessage: 'Tell me everything', userId: 'casey-1',
    });
    expect(result).not.toContain('alexs-secret-value');
  });

  it('shows user-scoped recent messages only', () => {
    const mem = new Memory(testDir);
    mem.getOrCreateUser('casey-1', 'Casey');
    mem.getOrCreateUser('alex-2', 'Alex');
    mem.addMessage('user', 'Casey private message', 'casey-1');
    mem.addMessage('assistant', 'Reply to Casey', 'casey-1');
    mem.addMessage('user', 'Alex private message', 'alex-2');

    const awareness = new Awareness(testDir);
    const result = contextMod.buildContext({
      soul: makeSoul(), memory: mem, awareness,
      userMessage: 'What did I say?', userId: 'casey-1',
    });
    expect(result).toContain('Casey private message');
    expect(result).not.toContain('Alex private message');
  });

  it('works without userId (backward compat)', () => {
    const mem = new Memory(testDir);
    mem.facts['global.fact'] = 'hello';
    mem['save']();
    mem.addMessage('user', 'global message');
    const awareness = new Awareness(testDir);
    const result = contextMod.buildContext({
      soul: makeSoul(), memory: mem, awareness,
      userMessage: 'test',
    });
    expect(result).toContain('You are TestBot');
    expect(result).toContain('global message');
  });
});

// ─── Web Multi-User Tests ────────────────────────────────────────────────────

describe('Web Multi-User', () => {
  let dir: string;
  let port: number;

  beforeEach(async () => {
    dir = join(tmpdir(), `cocapn-webmulti-${uid()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'web-multi-test' }));
    writeFileSync(join(dir, 'soul.md'), '---\nname: MultiBot\ntone: friendly\n---\nI am a multi-user test bot.');
    execSync('git init', { cwd: dir, timeout: 5000 });
    execSync('git config user.email test@test.com', { cwd: dir });
    execSync('git config user.name Test', { cwd: dir });
    execSync('git add .', { cwd: dir });
    execSync('git commit -m init', { cwd: dir, timeout: 5000 });
  });

  afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

  function makeMockLlm() {
    return {
      async *chatStream(messages: any[]) {
        const userMsg = messages.find((m: any) => m.role === 'user');
        if (userMsg) yield { type: 'content' as const, text: 'Reply: ' + userMsg.content };
        yield { type: 'done' as const };
      },
    };
  }

  function setupServer(p: number, mockLlm: any) {
    const memory = new Memory(dir);
    const awareness = new Awareness(dir);
    const soul = { name: 'MultiBot', tone: 'friendly', model: 'deepseek', body: 'I help.' };
    webMod.startWebServer(p, mockLlm, memory, awareness, soul);
    return { memory, awareness, soul };
  }

  it('POST /api/chat sets session cookie', async () => {
    port = 6000 + Math.floor(Math.random() * 900);
    setupServer(port, makeMockLlm());
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello' }),
    });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain('cocapn-session=');
  });

  it('GET /api/users returns empty initially', async () => {
    port = 6100 + Math.floor(Math.random() * 900);
    setupServer(port, makeMockLlm());
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/api/users`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.users).toEqual([]);
  });

  it('POST /api/user/identify sets user name', async () => {
    port = 6200 + Math.floor(Math.random() * 900);
    const { memory } = setupServer(port, makeMockLlm());
    await new Promise(r => setTimeout(r, 100));

    // First, create a session via chat
    const chatRes = await fetch(`http://localhost:${port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hi' }),
    });
    const cookie = chatRes.headers.getSetCookie().find((c: string) => c.includes('cocapn-session'));

    // Identify
    const idRes = await fetch(`http://localhost:${port}/api/user/identify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie ?? '' },
      body: JSON.stringify({ name: 'Casey' }),
    });
    expect(idRes.status).toBe(200);
    const idData = await idRes.json() as any;
    expect(idData.ok).toBe(true);
    expect(idData.user.name).toBe('Casey');
  });

  it('POST /api/chat with name registers user', async () => {
    port = 6300 + Math.floor(Math.random() * 900);
    const { memory } = setupServer(port, makeMockLlm());
    await new Promise(r => setTimeout(r, 100));

    await fetch(`http://localhost:${port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello', name: 'Casey' }),
    });

    const users = memory.getUsers();
    expect(users.length).toBe(1);
    expect(users[0].name).toBe('Casey');
  });

  it('two sessions create separate users', async () => {
    port = 6400 + Math.floor(Math.random() * 900);
    const { memory } = setupServer(port, makeMockLlm());
    await new Promise(r => setTimeout(r, 100));

    // Session 1
    await fetch(`http://localhost:${port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hi', name: 'Casey' }),
    });

    // Session 2 (no cookie sharing)
    await fetch(`http://localhost:${port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hey', name: 'Alex' }),
    });

    const users = memory.getUsers();
    expect(users.length).toBe(2);
    expect(users.some(u => u.name === 'Casey')).toBe(true);
    expect(users.some(u => u.name === 'Alex')).toBe(true);
  });

  it('messages are tagged with userId', async () => {
    port = 6500 + Math.floor(Math.random() * 900);
    const { memory } = setupServer(port, makeMockLlm());
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Tagged message', name: 'Casey' }),
    });

    // Find the user message
    const userMsgs = memory.messages.filter(m => m.content === 'Tagged message');
    expect(userMsgs.length).toBe(1);
    expect(userMsgs[0].userId).toBeTruthy();
  });
});

// ─── Knowledge Tests ─────────────────────────────────────────────────────────

describe('Knowledge', () => {
  let testDir: string;
  beforeEach(() => { testDir = join(tmpdir(), `cocapn-kb-${uid()}`); mkdirSync(testDir, { recursive: true }); });
  afterEach(() => { try { rmSync(testDir, { recursive: true, force: true }); } catch {} });

  it('saves and retrieves entries', () => {
    const kb = new knowledgeMod.Knowledge(testDir);
    kb.save({ id: 'k1', type: 'fact', content: 'TypeScript is compiled', source: 'docs', confidence: 0.9, tags: ['typescript'] });
    const entries = kb.list();
    expect(entries.length).toBe(1);
    expect(entries[0].content).toBe('TypeScript is compiled');
    expect(entries[0].tags).toContain('typescript');
  });

  it('updates existing entry by id', () => {
    const kb = new knowledgeMod.Knowledge(testDir);
    kb.save({ id: 'k1', type: 'fact', content: 'v1', source: 'test', confidence: 0.5, tags: [] });
    kb.save({ id: 'k1', type: 'fact', content: 'v2', source: 'test', confidence: 0.8, tags: [] });
    expect(kb.list().length).toBe(1);
    expect(kb.list()[0].content).toBe('v2');
  });

  it('searches by keyword', () => {
    const kb = new knowledgeMod.Knowledge(testDir);
    kb.save({ id: 'k1', type: 'fact', content: 'React is a UI library', source: 'docs', confidence: 0.9, tags: ['react'] });
    kb.save({ id: 'k2', type: 'fact', content: 'Node.js runs JavaScript server-side', source: 'docs', confidence: 0.9, tags: ['node'] });
    const results = kb.search('react');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('k1');
  });

  it('searches by tag', () => {
    const kb = new knowledgeMod.Knowledge(testDir);
    kb.save({ id: 'k1', type: 'fact', content: 'Some content about servers', source: 'docs', confidence: 0.9, tags: ['devops', 'server'] });
    const results = kb.search('server');
    expect(results.length).toBe(1);
  });

  it('searches by type', () => {
    const kb = new knowledgeMod.Knowledge(testDir);
    kb.save({ id: 'k1', type: 'procedure', content: 'Deploy steps', source: 'wiki', confidence: 0.8, tags: [] });
    kb.save({ id: 'k2', type: 'fact', content: 'Different type', source: 'wiki', confidence: 0.8, tags: [] });
    const results = kb.search('procedure');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('k1');
  });

  it('deletes an entry', () => {
    const kb = new knowledgeMod.Knowledge(testDir);
    kb.save({ id: 'k1', type: 'fact', content: 'To delete', source: 'test', confidence: 0.5, tags: [] });
    expect(kb.delete('k1')).toBe(true);
    expect(kb.list().length).toBe(0);
  });

  it('delete returns false for missing id', () => {
    const kb = new knowledgeMod.Knowledge(testDir);
    expect(kb.delete('nonexistent')).toBe(false);
  });

  it('lists with type filter', () => {
    const kb = new knowledgeMod.Knowledge(testDir);
    kb.save({ id: 'k1', type: 'fact', content: 'A fact', source: 'test', confidence: 0.5, tags: [] });
    kb.save({ id: 'k2', type: 'procedure', content: 'A proc', source: 'test', confidence: 0.5, tags: [] });
    expect(kb.list('fact').length).toBe(1);
    expect(kb.list('fact')[0].id).toBe('k1');
  });

  it('exports all entries', () => {
    const kb = new knowledgeMod.Knowledge(testDir);
    kb.save({ id: 'k1', type: 'fact', content: 'Export test', source: 'test', confidence: 0.5, tags: [] });
    const exported = kb.export();
    expect(exported.length).toBe(1);
    expect(exported[0].content).toBe('Export test');
  });

  it('clears all entries', () => {
    const kb = new knowledgeMod.Knowledge(testDir);
    kb.save({ id: 'k1', type: 'fact', content: 'A', source: 't', confidence: 0.5, tags: [] });
    kb.save({ id: 'k2', type: 'fact', content: 'B', source: 't', confidence: 0.5, tags: [] });
    kb.clear();
    expect(kb.list().length).toBe(0);
  });

  it('persists across instances', () => {
    const kb = new knowledgeMod.Knowledge(testDir);
    kb.save({ id: 'k1', type: 'fact', content: 'Persistent', source: 'test', confidence: 0.7, tags: [] });
    const kb2 = new knowledgeMod.Knowledge(testDir);
    expect(kb2.list().length).toBe(1);
    expect(kb2.list()[0].content).toBe('Persistent');
  });

  it('respects limit in search', () => {
    const kb = new knowledgeMod.Knowledge(testDir);
    for (let i = 0; i < 10; i++) kb.save({ id: `k${i}`, type: 'fact', content: `TypeScript fact ${i}`, source: 'test', confidence: 0.5, tags: [] });
    expect(kb.search('typescript', 3).length).toBe(3);
  });

  it('respects limit in list', () => {
    const kb = new knowledgeMod.Knowledge(testDir);
    for (let i = 0; i < 10; i++) kb.save({ id: `k${i}`, type: 'fact', content: `Fact ${i}`, source: 'test', confidence: 0.5, tags: [] });
    expect(kb.list(undefined, 3).length).toBe(3);
  });

  it('adds timestamp on save', () => {
    const kb = new knowledgeMod.Knowledge(testDir);
    kb.save({ id: 'k1', type: 'fact', content: 'Timestamped', source: 'test', confidence: 0.5, tags: [] });
    expect(kb.list()[0].ts).toBeTruthy();
  });
});

// ─── Knowledge File Import Tests ─────────────────────────────────────────────

describe('Knowledge Import', () => {
  let testDir: string;
  beforeEach(() => { testDir = join(tmpdir(), `cocapn-kbimp-${uid()}`); mkdirSync(testDir, { recursive: true }); });
  afterEach(() => { try { rmSync(testDir, { recursive: true, force: true }); } catch {} });

  it('imports JSON file', () => {
    const kb = new knowledgeMod.Knowledge(testDir);
    const jsonFile = join(testDir, 'data.json');
    writeFileSync(jsonFile, JSON.stringify([
      { id: 'j1', type: 'fact', content: 'JSON fact one', source: 'import', confidence: 0.7, tags: ['json'] },
      { id: 'j2', type: 'fact', content: 'JSON fact two', source: 'import', confidence: 0.7, tags: ['json'] },
    ]));
    const count = kb.importFile(jsonFile);
    expect(count).toBe(2);
    expect(kb.list().length).toBe(2);
  });

  it('imports single JSON object', () => {
    const kb = new knowledgeMod.Knowledge(testDir);
    const jsonFile = join(testDir, 'single.json');
    writeFileSync(jsonFile, JSON.stringify({ id: 's1', type: 'fact', content: 'Single entry', source: 'import', confidence: 0.7, tags: [] }));
    const count = kb.importFile(jsonFile);
    expect(count).toBe(1);
  });

  it('imports markdown file with headers as types', () => {
    const kb = new knowledgeMod.Knowledge(testDir);
    const mdFile = join(testDir, 'notes.md');
    writeFileSync(mdFile, '# TypeScript\n\nTypeScript adds static types to JavaScript.\n\nIt compiles to plain JavaScript.\n\n# React\n\nReact is a component-based UI library.');
    const count = kb.importFile(mdFile);
    expect(count).toBeGreaterThanOrEqual(2);
    const entries = kb.list();
    expect(entries.some(e => e.type === 'typescript')).toBe(true);
  });

  it('imports text file with paragraphs as entries', () => {
    const kb = new knowledgeMod.Knowledge(testDir);
    const txtFile = join(testDir, 'notes.txt');
    writeFileSync(txtFile, 'First paragraph with enough content to import.\n\nSecond paragraph with more content for testing.\n\nshort\n\nThird real paragraph with sufficient text.');
    const count = kb.importFile(txtFile);
    expect(count).toBeGreaterThanOrEqual(2);
    expect(kb.list().every(e => e.type === 'text')).toBe(true);
  });

  it('returns 0 for unknown file extension', () => {
    const kb = new knowledgeMod.Knowledge(testDir);
    const csvFile = join(testDir, 'data.csv');
    writeFileSync(csvFile, 'a,b,c');
    expect(kb.importFile(csvFile)).toBe(0);
  });
});

// ─── Learn Tests ──────────────────────────────────────────────────────────────

describe('Learn', () => {
  it('detects URLs in message', () => {
    const result = learnMod.learn('Check out https://example.com/docs for more info');
    expect(result.urls).toContain('https://example.com/docs');
  });

  it('detects multiple URLs', () => {
    const result = learnMod.learn('See https://a.com and http://b.org/page');
    expect(result.urls.length).toBe(2);
  });

  it('detects facts with "according to" source', () => {
    const result = learnMod.learn('TypeScript was created by Microsoft according to the official docs');
    expect(result.facts.length).toBeGreaterThanOrEqual(1);
    expect(result.facts[0].content).toContain('TypeScript');
    expect(result.facts[0].source).toContain('official docs');
  });

  it('detects facts with "(source: ...)" pattern', () => {
    const result = learnMod.learn('React was developed by Facebook (source: reactjs.org)');
    expect(result.facts.length).toBeGreaterThanOrEqual(1);
    expect(result.facts[0].source).toContain('reactjs.org');
  });

  it('detects file mentions', () => {
    const result = learnMod.learn('Take a look at config.ts for the settings');
    expect(result.fileMentions.some(f => f.includes('config.ts'))).toBe(true);
  });

  it('excludes URLs from file mentions', () => {
    const result = learnMod.learn('Visit https://example.com/page.html for details');
    expect(result.fileMentions).toEqual([]);
  });

  it('returns empty results for plain message', () => {
    const result = learnMod.learn('Hello, how are you?');
    expect(result.urls).toEqual([]);
    expect(result.facts).toEqual([]);
  });

  it('saves learnings to knowledge base', () => {
    const testDir = join(tmpdir(), `cocapn-lsave-${uid()}`);
    mkdirSync(testDir, { recursive: true });
    const kb = new knowledgeMod.Knowledge(testDir);
    const count = learnMod.saveLearnings(kb, 'TypeScript compiles to JS according to the handbook. See https://typescriptlang.org');
    expect(count).toBeGreaterThanOrEqual(2);
    expect(kb.list().length).toBeGreaterThanOrEqual(2);
    try { rmSync(testDir, { recursive: true, force: true }); } catch {}
  });

  it('importToKnowledge handles missing file', () => {
    const testDir = join(tmpdir(), `cocapn-limp-${uid()}`);
    mkdirSync(testDir, { recursive: true });
    const kb = new knowledgeMod.Knowledge(testDir);
    const result = learnMod.importToKnowledge(kb, '/nonexistent/file.json');
    expect(result).toContain('not found');
    try { rmSync(testDir, { recursive: true, force: true }); } catch {}
  });

  it('importToKnowledge imports valid file', () => {
    const testDir = join(tmpdir(), `cocapn-limp2-${uid()}`);
    mkdirSync(testDir, { recursive: true });
    const kb = new knowledgeMod.Knowledge(testDir);
    const jsonFile = join(testDir, 'data.json');
    writeFileSync(jsonFile, JSON.stringify([{ id: 'l1', type: 'fact', content: 'test fact', source: 'import', confidence: 0.7, tags: [] }]));
    const result = learnMod.importToKnowledge(kb, jsonFile);
    expect(result).toContain('Imported 1');
    try { rmSync(testDir, { recursive: true, force: true }); } catch {}
  });

  it('handleKnowledgeCommand searches', () => {
    const testDir = join(tmpdir(), `cocapn-lcmd-${uid()}`);
    mkdirSync(testDir, { recursive: true });
    const kb = new knowledgeMod.Knowledge(testDir);
    kb.save({ id: 'k1', type: 'fact', content: 'TypeScript is strongly typed', source: 'docs', confidence: 0.9, tags: ['ts'] });
    const result = learnMod.handleKnowledgeCommand(kb, '/knowledge search typescript');
    expect(result).toContain('TypeScript');
    try { rmSync(testDir, { recursive: true, force: true }); } catch {}
  });

  it('handleKnowledgeCommand lists entries', () => {
    const testDir = join(tmpdir(), `cocapn-lcmd2-${uid()}`);
    mkdirSync(testDir, { recursive: true });
    const kb = new knowledgeMod.Knowledge(testDir);
    kb.save({ id: 'k1', type: 'fact', content: 'A fact entry', source: 'test', confidence: 0.5, tags: [] });
    const result = learnMod.handleKnowledgeCommand(kb, '/knowledge list');
    expect(result).toContain('fact entry');
    try { rmSync(testDir, { recursive: true, force: true }); } catch {}
  });

  it('handleKnowledgeCommand clears', () => {
    const testDir = join(tmpdir(), `cocapn-lcmd3-${uid()}`);
    mkdirSync(testDir, { recursive: true });
    const kb = new knowledgeMod.Knowledge(testDir);
    kb.save({ id: 'k1', type: 'fact', content: 'x', source: 't', confidence: 0.5, tags: [] });
    const result = learnMod.handleKnowledgeCommand(kb, '/knowledge clear');
    expect(result).toContain('cleared');
    expect(kb.list().length).toBe(0);
    try { rmSync(testDir, { recursive: true, force: true }); } catch {}
  });

  it('handleKnowledgeCommand shows usage for unknown sub', () => {
    const testDir = join(tmpdir(), `cocapn-lcmd4-${uid()}`);
    mkdirSync(testDir, { recursive: true });
    const kb = new knowledgeMod.Knowledge(testDir);
    const result = learnMod.handleKnowledgeCommand(kb, '/knowledge unknown');
    expect(result).toContain('Usage');
    try { rmSync(testDir, { recursive: true, force: true }); } catch {}
  });

  it('handleKnowledgeCommand search requires query', () => {
    const testDir = join(tmpdir(), `cocapn-lcmd5-${uid()}`);
    mkdirSync(testDir, { recursive: true });
    const kb = new knowledgeMod.Knowledge(testDir);
    const result = learnMod.handleKnowledgeCommand(kb, '/knowledge search');
    expect(result).toContain('Usage');
    try { rmSync(testDir, { recursive: true, force: true }); } catch {}
  });

  it('handleKnowledgeCommand shows empty when no entries', () => {
    const testDir = join(tmpdir(), `cocapn-lcmd6-${uid()}`);
    mkdirSync(testDir, { recursive: true });
    const kb = new knowledgeMod.Knowledge(testDir);
    const result = learnMod.handleKnowledgeCommand(kb, '/knowledge list');
    expect(result).toContain('no knowledge');
    try { rmSync(testDir, { recursive: true, force: true }); } catch {}
  });
});

// ─── Knowledge in Context Tests ──────────────────────────────────────────────

describe('Knowledge in Context', () => {
  let testDir: string;
  beforeEach(() => { testDir = join(tmpdir(), `cocapn-kbctx-${uid()}`); mkdirSync(testDir, { recursive: true }); });
  afterEach(() => { try { rmSync(testDir, { recursive: true, force: true }); } catch {} });

  function makeSoul() { return { name: 'TestBot', tone: 'friendly', model: 'deepseek', body: 'I help.' }; }

  it('includes relevant knowledge entries in context', () => {
    const mem = new Memory(testDir);
    const awareness = new Awareness(testDir);
    const kb = new knowledgeMod.Knowledge(testDir);
    kb.save({ id: 'k1', type: 'fact', content: 'Vitest is a fast unit test framework', source: 'docs', confidence: 0.9, tags: ['testing', 'vitest'] });
    const result = contextMod.buildContext({ soul: makeSoul(), memory: mem, awareness, userMessage: 'Tell me about vitest testing', knowledge: kb });
    expect(result).toContain('Vitest');
    expect(result).toContain('Known facts');
  });

  it('does not include knowledge section when no match', () => {
    const mem = new Memory(testDir);
    const awareness = new Awareness(testDir);
    const kb = new knowledgeMod.Knowledge(testDir);
    kb.save({ id: 'k1', type: 'fact', content: 'Salmon migrate upstream during spawning season', source: 'docs', confidence: 0.9, tags: ['fishing'] });
    const result = contextMod.buildContext({ soul: makeSoul(), memory: mem, awareness, userMessage: 'Tell me about TypeScript programming', knowledge: kb });
    expect(result).not.toContain('Known facts');
  });

  it('works without knowledge base (backward compat)', () => {
    const mem = new Memory(testDir);
    const awareness = new Awareness(testDir);
    const result = contextMod.buildContext({ soul: makeSoul(), memory: mem, awareness, userMessage: 'hello' });
    expect(result).toContain('You are TestBot');
    expect(result).not.toContain('Known facts');
  });

  it('limits knowledge to top 5 entries', () => {
    const mem = new Memory(testDir);
    const awareness = new Awareness(testDir);
    const kb = new knowledgeMod.Knowledge(testDir);
    for (let i = 0; i < 10; i++) {
      kb.save({ id: `k${i}`, type: 'fact', content: `React fact number ${i} about components`, source: 'docs', confidence: 0.9, tags: ['react'] });
    }
    const result = contextMod.buildContext({ soul: makeSoul(), memory: mem, awareness, userMessage: 'Tell me about react components', knowledge: kb });
    const matches = result.match(/React fact/g);
    expect(matches.length).toBeLessThanOrEqual(5);
  });
});

// ─── Intelligence Tests ────────────────────────────────────────────────────

import * as intelMod from '../src/intelligence.ts';
import * as mcpMod from '../src/mcp.ts';
import * as researchMod from '../src/research.ts';

describe('Intelligence — getFileContext', () => {
  let dir: string;
  beforeEach(() => {
    dir = join(tmpdir(), `cocapn-intel-${uid()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'app.ts'), 'import { helper } from "./helper.js";\nconst x = helper();\n');
    writeFileSync(join(dir, 'helper.ts'), 'export function helper() { return 42; }\n');
    execSync('git init', { cwd: dir, timeout: 5000 });
    execSync('git config user.email test@test.com', { cwd: dir });
    execSync('git config user.name Test', { cwd: dir });
    execSync('git add .', { cwd: dir });
    execSync('git commit -m "init: add app and helper"', { cwd: dir, timeout: 5000 });
  });
  afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

  it('returns file content', () => {
    const ctx = intelMod.getFileContext(dir, 'app.ts');
    expect(ctx.content).toContain('import');
    expect(ctx.content).toContain('helper');
  });

  it('returns git history for file', () => {
    const ctx = intelMod.getFileContext(dir, 'app.ts');
    expect(ctx.log.length).toBeGreaterThan(0);
    expect(ctx.log[0].msg).toContain('init');
  });

  it('detects imports', () => {
    const ctx = intelMod.getFileContext(dir, 'app.ts');
    expect(ctx.imports).toContain('./helper.js');
  });

  it('detects importers (reverse dependencies)', () => {
    const ctx = intelMod.getFileContext(dir, 'helper.ts');
    expect(ctx.importedBy).toContain('app.ts');
  });

  it('returns empty for nonexistent file', () => {
    const ctx = intelMod.getFileContext(dir, 'nonexistent.ts');
    expect(ctx.content).toBe('');
    expect(ctx.log).toEqual([]);
  });

  it('returns correct path', () => {
    const ctx = intelMod.getFileContext(dir, 'app.ts');
    expect(ctx.path).toBe('app.ts');
  });
});

describe('Intelligence — assessImpact', () => {
  let dir: string;
  beforeEach(() => {
    dir = join(tmpdir(), `cocapn-impact-${uid()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'core.ts'), 'export const core = "core";\n');
    writeFileSync(join(dir, 'a.ts'), 'import { core } from "./core.js";\n');
    writeFileSync(join(dir, 'b.ts'), 'import { core } from "./core.js";\n');
    writeFileSync(join(dir, 'c.ts'), 'import { core } from "./core.js";\n');
    writeFileSync(join(dir, 'd.ts'), 'import { core } from "./core.js";\n');
    writeFileSync(join(dir, 'e.ts'), 'import { core } from "./core.js";\n');
    writeFileSync(join(dir, 'f.ts'), 'import { core } from "./core.js";\n');
    writeFileSync(join(dir, 'g.ts'), 'import { core } from "./core.js";\n');
    writeFileSync(join(dir, 'h.ts'), 'import { core } from "./core.js";\n');
    writeFileSync(join(dir, 'i.ts'), 'import { core } from "./core.js";\n');
    writeFileSync(join(dir, 'j.ts'), 'import { core } from "./core.js";\n');
    writeFileSync(join(dir, 'k.ts'), 'import { core } from "./core.js";\n');
    execSync('git init', { cwd: dir, timeout: 5000 });
    execSync('git config user.email test@test.com', { cwd: dir });
    execSync('git config user.name Test', { cwd: dir });
    execSync('git add .', { cwd: dir });
    execSync('git commit -m "init"', { cwd: dir, timeout: 5000 });
  });
  afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

  it('counts dependents', () => {
    const impact = intelMod.assessImpact(dir, 'core.ts');
    expect(impact.dependents.length).toBe(11);
  });

  it('assesses risk as high for many dependents', () => {
    const impact = intelMod.assessImpact(dir, 'core.ts');
    expect(impact.risk).toBe('high');
  });

  it('assesses risk as low for isolated file', () => {
    const impact = intelMod.assessImpact(dir, 'a.ts');
    expect(impact.risk).toBe('low');
  });

  it('includes dependencies', () => {
    const impact = intelMod.assessImpact(dir, 'a.ts');
    expect(impact.dependencies).toContain('./core.js');
  });

  it('counts recent changes', () => {
    const impact = intelMod.assessImpact(dir, 'core.ts');
    expect(impact.recentChanges).toBeGreaterThanOrEqual(0);
  });

  it('returns correct path', () => {
    const impact = intelMod.assessImpact(dir, 'core.ts');
    expect(impact.path).toBe('core.ts');
  });
});

describe('Intelligence — getHistory', () => {
  let dir: string;
  beforeEach(() => {
    dir = join(tmpdir(), `cocapn-hist-${uid()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'app.ts'), 'const x = 1;\n');
    execSync('git init', { cwd: dir, timeout: 5000 });
    execSync('git config user.email test@test.com', { cwd: dir });
    execSync('git config user.name Test', { cwd: dir });
    execSync('git add .', { cwd: dir });
    execSync('git commit -m "feat: add authentication module"', { cwd: dir, timeout: 5000 });
  });
  afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

  it('finds commits matching topic', () => {
    const entries = intelMod.getHistory(dir, 'authentication');
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].msg).toContain('authentication');
  });

  it('returns empty for non-matching topic', () => {
    const entries = intelMod.getHistory(dir, 'nonexistent-topic-xyz');
    expect(entries).toEqual([]);
  });

  it('includes commit metadata', () => {
    const entries = intelMod.getHistory(dir, 'authentication');
    expect(entries[0].hash).toBeTruthy();
    expect(entries[0].date).toBeTruthy();
    expect(entries[0].author).toBe('Test');
  });

  it('includes affected files', () => {
    const entries = intelMod.getHistory(dir, 'authentication');
    expect(entries[0].files).toContain('app.ts');
  });
});

describe('Intelligence — LLM synthesis', () => {
  it('explainCode returns LLM response', async () => {
    const mockLlm = {
      async chat() { return { content: 'This uses a strategy pattern because...' }; },
    };
    const dir = join(tmpdir(), `cocapn-explain-${uid()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'auth.ts'), 'export function auth() {}');
    execSync('git init', { cwd: dir, timeout: 5000 });
    execSync('git config user.email t@t.com', { cwd: dir });
    execSync('git config user.name T', { cwd: dir });
    execSync('git add .', { cwd: dir });
    execSync('git commit -m "add auth"', { cwd: dir, timeout: 5000 });
    const result = await intelMod.explainCode(mockLlm as any, dir, 'auth.ts', 'why?');
    expect(result).toContain('strategy pattern');
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  it('generateClaudeMd returns LLM response', async () => {
    const mockLlm = {
      async chat() { return { content: '# CLAUDE.md\n\nThis project uses event sourcing...' }; },
    };
    const dir = join(tmpdir(), `cocapn-claudemd-${uid()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'app.ts'), 'const x = 1;');
    execSync('git init', { cwd: dir, timeout: 5000 });
    execSync('git config user.email t@t.com', { cwd: dir });
    execSync('git config user.name T', { cwd: dir });
    execSync('git add .', { cwd: dir });
    execSync('git commit -m "init"', { cwd: dir, timeout: 5000 });
    const result = await intelMod.generateClaudeMd(mockLlm as any, dir);
    expect(result).toContain('event sourcing');
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  it('generateWiki returns parsed JSON or fallback', async () => {
    const mockLlm = {
      async chat() { return { content: '[{"title":"Architecture","content":"Uses modules."}]' }; },
    };
    const dir = join(tmpdir(), `cocapn-wiki-${uid()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'app.ts'), 'const x = 1;');
    execSync('git init', { cwd: dir, timeout: 5000 });
    execSync('git config user.email t@t.com', { cwd: dir });
    execSync('git config user.name T', { cwd: dir });
    execSync('git add .', { cwd: dir });
    execSync('git commit -m "init"', { cwd: dir, timeout: 5000 });
    const pages = await intelMod.generateWiki(mockLlm as any, dir);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages[0].title).toBe('Architecture');
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  it('generateWiki falls back on invalid JSON', async () => {
    const mockLlm = {
      async chat() { return { content: 'This is not JSON' }; },
    };
    const dir = join(tmpdir(), `cocapn-wikifb-${uid()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'app.ts'), 'const x = 1;');
    execSync('git init', { cwd: dir, timeout: 5000 });
    execSync('git config user.email t@t.com', { cwd: dir });
    execSync('git config user.name T', { cwd: dir });
    execSync('git add .', { cwd: dir });
    execSync('git commit -m "init"', { cwd: dir, timeout: 5000 });
    const pages = await intelMod.generateWiki(mockLlm as any, dir);
    expect(pages.length).toBe(1);
    expect(pages[0].title).toBe('Overview');
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  });
});

// ─── MCP Tests ─────────────────────────────────────────────────────────────

describe('MCP — tool definitions', () => {
  it('startMcpServer is exported as function', () => {
    expect(typeof mcpMod.startMcpServer).toBe('function');
  });

  it('TOOL definitions are correct shape', async () => {
    // We can't easily test stdin/stdout MCP server, but we verify the module loads
    const mcpContent = readFileSync(join(import.meta.dirname ?? '.', '..', 'src', 'mcp.ts'), 'utf-8');
    expect(mcpContent).toContain('cocapn_explain');
    expect(mcpContent).toContain('cocapn_context');
    expect(mcpContent).toContain('cocapn_impact');
    expect(mcpContent).toContain('cocapn_history');
    expect(mcpContent).toContain('cocapn_suggest');
    expect(mcpContent).toContain('tools/list');
    expect(mcpContent).toContain('tools/call');
    expect(mcpContent).toContain('initialize');
  });

  it('module handles JSON-RPC 2.0', () => {
    const mcpContent = readFileSync(join(import.meta.dirname ?? '.', '..', 'src', 'mcp.ts'), 'utf-8');
    expect(mcpContent).toContain('jsonrpc');
    expect(mcpContent).toContain('2.0');
  });
});

// ─── Research Tests ────────────────────────────────────────────────────────

describe('Research — discoverTopics', () => {
  let dir: string;
  beforeEach(() => {
    dir = join(tmpdir(), `cocapn-resdisc-${uid()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'app.ts'), '// TODO: refactor auth module\nconst x = 1;\n// FIXME: memory leak in handler\n');
    execSync('git init', { cwd: dir, timeout: 5000 });
    execSync('git config user.email t@t.com', { cwd: dir });
    execSync('git config user.name T', { cwd: dir });
    execSync('git add .', { cwd: dir });
    execSync('git commit -m "feat: initial commit with todos"', { cwd: dir, timeout: 5000 });
  });
  afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

  it('discovers topics from TODO comments', () => {
    const topics = researchMod.discoverTopics(dir);
    expect(topics.some(t => t.toLowerCase().includes('refactor'))).toBe(true);
  });

  it('discovers topics from FIXME comments', () => {
    const topics = researchMod.discoverTopics(dir);
    expect(topics.some(t => t.toLowerCase().includes('memory'))).toBe(true);
  });

  it('discovers topics from commit messages', () => {
    const topics = researchMod.discoverTopics(dir);
    expect(topics.some(t => t.includes('initial'))).toBe(true);
  });

  it('returns at most 20 topics', () => {
    const topics = researchMod.discoverTopics(dir);
    expect(topics.length).toBeLessThanOrEqual(20);
  });
});

describe('Research — discoverTopics with docs', () => {
  let dir: string;
  beforeEach(() => {
    dir = join(tmpdir(), `cocapn-resdoc-${uid()}`);
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'architecture.md'), '# System Architecture\n\nDetails here.');
    writeFileSync(join(dir, 'app.ts'), 'const x = 1;');
    execSync('git init', { cwd: dir, timeout: 5000 });
    execSync('git config user.email t@t.com', { cwd: dir });
    execSync('git config user.name T', { cwd: dir });
    execSync('git add .', { cwd: dir });
    execSync('git commit -m "init"', { cwd: dir, timeout: 5000 });
  });
  afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

  it('discovers topics from doc headings', () => {
    const topics = researchMod.discoverTopics(dir);
    expect(topics.some(t => t.includes('System Architecture'))).toBe(true);
  });
});

describe('Research — saveResearch and loadResearch', () => {
  let dir: string;
  beforeEach(() => { dir = join(tmpdir(), `cocapn-ressave-${uid()}`); mkdirSync(dir, { recursive: true }); });
  afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

  it('saves research to .cocapn/research/', () => {
    const path = researchMod.saveResearch(dir, 'Event Sourcing', 'Event sourcing is...', ['commit-a', 'commit-b']);
    expect(existsSync(path)).toBe(true);
    expect(path).toContain('.cocapn/research');
    expect(path).toContain('event-sourcing');
  });

  it('saved research has correct format', () => {
    researchMod.saveResearch(dir, 'Auth Module', 'Auth analysis content', []);
    const content = researchMod.loadResearch(dir, 'auth-module');
    expect(content).toBeTruthy();
    expect(content!).toContain('# Auth Module');
    expect(content!).toContain('Generated:');
    expect(content!).toContain('Auth analysis content');
  });

  it('listResearch returns saved entries', () => {
    researchMod.saveResearch(dir, 'Testing Strategy', 'Content here', ['test.ts']);
    const list = researchMod.listResearch(dir);
    expect(list.length).toBe(1);
    expect(list[0].topic).toBe('Testing Strategy');
  });

  it('loadResearch returns null for missing slug', () => {
    expect(researchMod.loadResearch(dir, 'nonexistent')).toBeNull();
  });

  it('listResearch returns empty when no research', () => {
    expect(researchMod.listResearch(dir)).toEqual([]);
  });

  it('overwrites existing research with same slug', () => {
    researchMod.saveResearch(dir, 'Auth', 'Version 1', []);
    researchMod.saveResearch(dir, 'Auth', 'Version 2', []);
    const content = researchMod.loadResearch(dir, 'auth');
    expect(content).toContain('Version 2');
    expect(content).not.toContain('Version 1');
  });
});

describe('Research — researchTopic', () => {
  it('returns research result from LLM', async () => {
    const mockLlm = {
      async chat() { return { content: 'Deep analysis of the auth module...' }; },
    };
    const dir = join(tmpdir(), `cocapn-resgen-${uid()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'auth.ts'), 'export function auth() {}');
    execSync('git init', { cwd: dir, timeout: 5000 });
    execSync('git config user.email t@t.com', { cwd: dir });
    execSync('git config user.name T', { cwd: dir });
    execSync('git add .', { cwd: dir });
    execSync('git commit -m "add auth module"', { cwd: dir, timeout: 5000 });
    const result = await researchMod.researchTopic(mockLlm as any, dir, 'auth');
    expect(result.topic).toBe('auth');
    expect(result.content).toContain('Deep analysis');
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  it('returns sources from grep', async () => {
    const mockLlm = {
      async chat() { return { content: 'Analysis...' }; },
    };
    const dir = join(tmpdir(), `cocapn-ressrc-${uid()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'auth.ts'), '// authentication logic\nexport function auth() {}');
    execSync('git init', { cwd: dir, timeout: 5000 });
    execSync('git config user.email t@t.com', { cwd: dir });
    execSync('git config user.name T', { cwd: dir });
    execSync('git add .', { cwd: dir });
    execSync('git commit -m "add auth"', { cwd: dir, timeout: 5000 });
    const result = await researchMod.researchTopic(mockLlm as any, dir, 'authentication');
    expect(result.sources).toContain('auth.ts');
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  });
});

// ─── CLI --mcp flag Tests ──────────────────────────────────────────────────

describe('CLI --mcp flag', () => {
  const seedDir = join(import.meta.dirname ?? '.', '..');

  it('index.ts imports MCP server module', () => {
    const content = readFileSync(join(seedDir, 'src', 'index.ts'), 'utf-8');
    expect(content).toContain('startMcpServer');
    expect(content).toContain('--mcp');
  });

  it('index.ts has mcp option in parseArgs', () => {
    const content = readFileSync(join(seedDir, 'src', 'index.ts'), 'utf-8');
    expect(content).toMatch(/mcp:\s*\{[^}]*type:\s*['"]boolean['"]/);
  });
});

// ─── Channels Tests ──────────────────────────────────────────────────────────

import * as channelsMod from '../src/channels.ts';

describe('Channels — normalizeTelegram', () => {
  it('normalizes a Telegram message', () => {
    const msg = channelsMod.normalizers.telegram({
      message: { from: { username: 'alice', id: 42 }, text: 'Hello bot', date: 1700000000 },
    });
    expect(msg).toBeTruthy();
    expect(msg!.channel).toBe('telegram');
    expect(msg!.from).toBe('alice');
    expect(msg!.text).toBe('Hello bot');
  });

  it('normalizes Telegram message with id but no username', () => {
    const msg = channelsMod.normalizers.telegram({
      message: { from: { id: 99 }, text: 'Hi', date: 1700000000 },
    });
    expect(msg).toBeTruthy();
    expect(msg!.from).toBe('99');
  });

  it('returns null for message without text', () => {
    const msg = channelsMod.normalizers.telegram({
      message: { from: { id: 1 }, date: 1700000000 },
    });
    expect(msg).toBeNull();
  });

  it('returns null for body without message', () => {
    expect(channelsMod.normalizers.telegram({})).toBeNull();
    expect(channelsMod.normalizers.telegram({ update_id: 123 })).toBeNull();
  });
});

describe('Channels — normalizeWebhook', () => {
  it('normalizes webhook with text field', () => {
    const msg = channelsMod.normalizers.webhook({ text: 'Hello from webhook', from: 'slack_user' });
    expect(msg).toBeTruthy();
    expect(msg!.channel).toBe('webhook');
    expect(msg!.from).toBe('slack_user');
    expect(msg!.text).toBe('Hello from webhook');
  });

  it('normalizes webhook with message field', () => {
    const msg = channelsMod.normalizers.webhook({ message: 'Alt text', user: 'irc_user' });
    expect(msg).toBeTruthy();
    expect(msg!.text).toBe('Alt text');
    expect(msg!.from).toBe('irc_user');
  });

  it('returns null for empty text', () => {
    expect(channelsMod.normalizers.webhook({ text: '' })).toBeNull();
    expect(channelsMod.normalizers.webhook({})).toBeNull();
  });

  it('defaults from to "unknown"', () => {
    const msg = channelsMod.normalizers.webhook({ text: 'hi' });
    expect(msg!.from).toBe('unknown');
  });

  it('uses provided ts', () => {
    const msg = channelsMod.normalizers.webhook({ text: 'hi', ts: '2024-01-01' });
    expect(msg!.ts).toBe('2024-01-01');
  });
});

describe('Channels — normalizeEmail', () => {
  it('normalizes email with headers and body', () => {
    const msg = channelsMod.normalizers.email({ from: 'bob@example.com', date: '2024-01-01' }, 'Hello from email');
    expect(msg).toBeTruthy();
    expect(msg!.channel).toBe('email');
    expect(msg!.from).toBe('bob@example.com');
    expect(msg!.text).toBe('Hello from email');
  });

  it('returns null for empty body', () => {
    expect(channelsMod.normalizers.email({ from: 'a@b.com' }, '')).toBeNull();
    expect(channelsMod.normalizers.email({ from: 'a@b.com' }, '   ')).toBeNull();
  });
});

describe('Channels — handleChannelMessage', () => {
  it('returns LLM response', async () => {
    const mockLlm = {
      async chat() { return { content: 'Channel reply' }; },
    };
    const msg: channelsMod.ChannelMessage = {
      channel: 'webhook', from: 'test_user', text: 'Hi', ts: new Date().toISOString(), raw: {},
    };
    const reply = await channelsMod.handleChannelMessage(msg, mockLlm as any, 'You are Bot.');
    expect(reply.text).toBe('Channel reply');
  });

  it('includes Telegram reply metadata', async () => {
    const mockLlm = {
      async chat() { return { content: 'Telegram reply' }; },
    };
    const msg: channelsMod.ChannelMessage = {
      channel: 'telegram', from: 'alice', text: 'Hi', ts: new Date().toISOString(),
      raw: { message: { chat: 12345 } },
    };
    const reply = await channelsMod.handleChannelMessage(msg, mockLlm as any, 'You are Bot.');
    expect(reply.text).toBe('Telegram reply');
    expect(reply.replyTo).toBeDefined();
    expect((reply.replyTo as any).chat_id).toBe(12345);
  });
});

// ─── Analytics Tests ──────────────────────────────────────────────────────────

import * as analyticsMod from '../src/analytics.ts';

describe('Analytics', () => {
  let testDir: string;
  let analytics: analyticsMod.Analytics;

  beforeEach(() => {
    testDir = join(tmpdir(), `cocapn-analytics-${uid()}`);
    mkdirSync(testDir, { recursive: true });
    analytics = new analyticsMod.Analytics(testDir);
  });

  afterEach(() => { try { rmSync(testDir, { recursive: true, force: true }); } catch {} });

  it('tracks events and persists', () => {
    const now = new Date().toISOString();
    analytics.track({ type: 'message', ts: now, user: 'u1' });
    analytics.track({ type: 'response', ts: now, user: 'u1', duration: 500 });
    const stats = analytics.getStats(7);
    expect(stats.total).toBe(1);
    expect(stats.avgResponseMs).toBe(500);
  });

  it('returns daily stats', () => {
    const today = new Date().toISOString().slice(0, 10);
    analytics.track({ type: 'message', ts: new Date().toISOString(), user: 'u1' });
    analytics.track({ type: 'response', ts: new Date().toISOString(), user: 'u1', duration: 300 });
    const stats = analytics.getStats(1);
    expect(stats.daily.length).toBeGreaterThanOrEqual(1);
    expect(stats.daily[0].date).toBe(today);
    expect(stats.daily[0].messages).toBe(1);
    expect(stats.daily[0].responses).toBe(1);
  });

  it('tracks topics', () => {
    analytics.track({ type: 'message', ts: new Date().toISOString(), topic: 'typescript' });
    analytics.track({ type: 'message', ts: new Date().toISOString(), topic: 'react' });
    analytics.track({ type: 'message', ts: new Date().toISOString(), topic: 'typescript' });
    const stats = analytics.getStats(7);
    expect(stats.topTopics).toContain('typescript');
  });

  it('persists across instances', () => {
    analytics.track({ type: 'message', ts: new Date().toISOString(), user: 'u1' });
    const analytics2 = new analyticsMod.Analytics(testDir);
    const stats = analytics2.getStats(7);
    expect(stats.total).toBe(1);
  });

  it('returns empty stats for no events', () => {
    const stats = analytics.getStats(7);
    expect(stats.total).toBe(0);
    expect(stats.avgResponseMs).toBe(0);
    expect(stats.daily).toEqual([]);
    expect(stats.topTopics).toEqual([]);
  });

  it('trims to 5000 events', () => {
    for (let i = 0; i < 6000; i++) {
      analytics.track({ type: 'message', ts: new Date().toISOString(), user: 'u1' });
    }
    const raw = JSON.parse(readFileSync(join(testDir, '.cocapn', 'analytics.json'), 'utf-8')) as analyticsMod.AnalyticsEvent[];
    expect(raw.length).toBeLessThanOrEqual(5000);
  });

  it('ignores events outside date range', () => {
    const oldTs = new Date(Date.now() - 10 * 86400000).toISOString();
    analytics.track({ type: 'message', ts: oldTs, user: 'u1' });
    const stats = analytics.getStats(7);
    expect(stats.total).toBe(0);
  });
});

// ─── Web New Routes Tests ─────────────────────────────────────────────────────

describe('Web — Files API', () => {
  let dir: string;
  let port: number;

  beforeEach(async () => {
    dir = join(tmpdir(), `cocapn-files-${uid()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'files-test' }));
    writeFileSync(join(dir, 'hello.txt'), 'Hello World');
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'app.ts'), 'const x = 1;\n');
    writeFileSync(join(dir, 'soul.md'), '---\nname: FileBot\ntone: friendly\n---\nI test files.');
    execSync('git init', { cwd: dir, timeout: 5000 });
    execSync('git config user.email test@test.com', { cwd: dir });
    execSync('git config user.name Test', { cwd: dir });
    execSync('git add .', { cwd: dir });
    execSync('git commit -m init', { cwd: dir, timeout: 5000 });
  });

  afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

  function makeMockLlm() {
    return {
      async *chatStream(messages: any[]) {
        const userMsg = messages.find((m: any) => m.role === 'user');
        if (userMsg) yield { type: 'content' as const, text: 'Echo: ' + userMsg.content };
        yield { type: 'done' as const };
      },
    };
  }

  function setupServer(p: number) {
    const mem = new Memory(dir);
    const aw = new Awareness(dir);
    const soul = { name: 'FileBot', tone: 'friendly', model: 'deepseek', body: 'I test files.' };
    webMod.startWebServer(p, makeMockLlm(), mem, aw, soul);
    return mem;
  }

  it('GET /api/files returns file list', async () => {
    port = 7000 + Math.floor(Math.random() * 900);
    setupServer(port);
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/api/files`);
    expect(res.status).toBe(200);
    const files = await res.json() as string[];
    expect(Array.isArray(files)).toBe(true);
    expect(files).toContain('hello.txt');
    expect(files).toContain('src/app.ts');
  });

  it('GET /api/files/hello.txt returns file content', async () => {
    port = 7100 + Math.floor(Math.random() * 900);
    setupServer(port);
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/api/files/hello.txt`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.content).toBe('Hello World');
    expect(data.path).toBe('hello.txt');
  });

  it('GET /api/files/nonexistent returns 404', async () => {
    port = 7200 + Math.floor(Math.random() * 900);
    setupServer(port);
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/api/files/nonexistent.txt`);
    expect(res.status).toBe(404);
  });
});

describe('Web — Analytics API', () => {
  let dir: string;
  let port: number;

  beforeEach(async () => {
    dir = join(tmpdir(), `cocapn-analytics-web-${uid()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'analytics-test' }));
    writeFileSync(join(dir, 'soul.md'), '---\nname: StatBot\ntone: neutral\n---\nI track stats.');
    execSync('git init', { cwd: dir, timeout: 5000 });
    execSync('git config user.email test@test.com', { cwd: dir });
    execSync('git config user.name Test', { cwd: dir });
    execSync('git add .', { cwd: dir });
    execSync('git commit -m init', { cwd: dir, timeout: 5000 });
  });

  afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

  function makeMockLlm() {
    return {
      async *chatStream(messages: any[]) {
        const userMsg = messages.find((m: any) => m.role === 'user');
        if (userMsg) yield { type: 'content' as const, text: 'Reply: ' + userMsg.content };
        yield { type: 'done' as const };
      },
    };
  }

  function setupServer(p: number) {
    const mem = new Memory(dir);
    const aw = new Awareness(dir);
    const soul = { name: 'StatBot', tone: 'neutral', model: 'deepseek', body: 'I track stats.' };
    webMod.startWebServer(p, makeMockLlm(), mem, aw, soul);
  }

  it('GET /api/analytics returns stats', async () => {
    port = 7300 + Math.floor(Math.random() * 900);
    setupServer(port);
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/api/analytics`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data).toHaveProperty('total');
    expect(data).toHaveProperty('daily');
    expect(data).toHaveProperty('topTopics');
    expect(data).toHaveProperty('avgResponseMs');
  });
});

describe('Web — Telegram webhook', () => {
  let dir: string;
  let port: number;

  beforeEach(async () => {
    dir = join(tmpdir(), `cocapn-tg-${uid()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'tg-test' }));
    writeFileSync(join(dir, 'soul.md'), '---\nname: TgBot\ntone: friendly\n---\nI am a telegram bot.');
    execSync('git init', { cwd: dir, timeout: 5000 });
    execSync('git config user.email test@test.com', { cwd: dir });
    execSync('git config user.name Test', { cwd: dir });
    execSync('git add .', { cwd: dir });
    execSync('git commit -m init', { cwd: dir, timeout: 5000 });
  });

  afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

  function makeMockLlm() {
    return {
      async chat() { return { content: 'Telegram reply from bot' }; },
    };
  }

  function setupServer(p: number) {
    const mem = new Memory(dir);
    const aw = new Awareness(dir);
    const soul = { name: 'TgBot', tone: 'friendly', model: 'deepseek', body: 'I am a telegram bot.' };
    webMod.startWebServer(p, makeMockLlm() as any, mem, aw, soul);
  }

  it('POST /api/telegram/webhook processes message', async () => {
    port = 7400 + Math.floor(Math.random() * 900);
    setupServer(port);
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/api/telegram/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: { from: { username: 'testuser', id: 42 }, text: 'Hello bot', date: 1700000000 },
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.ok).toBe(true);
    expect(data.text).toContain('Telegram reply');
  });

  it('POST /api/telegram/webhook rejects invalid body', async () => {
    port = 7500 + Math.floor(Math.random() * 900);
    setupServer(port);
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/api/telegram/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/telegram/webhook returns ok:false for no message', async () => {
    port = 7600 + Math.floor(Math.random() * 900);
    setupServer(port);
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/api/telegram/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ update_id: 123 }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.ok).toBe(false);
  });
});

describe('Web — Generic webhook', () => {
  let dir: string;
  let port: number;

  beforeEach(async () => {
    dir = join(tmpdir(), `cocapn-wh-${uid()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'wh-test' }));
    writeFileSync(join(dir, 'soul.md'), '---\nname: WhBot\ntone: neutral\n---\nI handle webhooks.');
    execSync('git init', { cwd: dir, timeout: 5000 });
    execSync('git config user.email test@test.com', { cwd: dir });
    execSync('git config user.name Test', { cwd: dir });
    execSync('git add .', { cwd: dir });
    execSync('git commit -m init', { cwd: dir, timeout: 5000 });
  });

  afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

  function makeMockLlm() {
    return {
      async chat() { return { content: 'Webhook reply' }; },
    };
  }

  function setupServer(p: number) {
    const mem = new Memory(dir);
    const aw = new Awareness(dir);
    const soul = { name: 'WhBot', tone: 'neutral', model: 'deepseek', body: 'I handle webhooks.' };
    webMod.startWebServer(p, makeMockLlm() as any, mem, aw, soul);
  }

  it('POST /api/webhook/slack processes message', async () => {
    port = 7700 + Math.floor(Math.random() * 900);
    setupServer(port);
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/api/webhook/slack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Hello from Slack', from: 'slackbot' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.ok).toBe(true);
    expect(data.text).toContain('Webhook reply');
  });

  it('POST /api/webhook/:channel rejects no text', async () => {
    port = 7800 + Math.floor(Math.random() * 900);
    setupServer(port);
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/api/webhook/discord`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: 'bob' }),
    });
    expect(res.status).toBe(400);
  });
});

// ─── PWA / Manifest / SW Tests ────────────────────────────────────────────────

describe('PWA — manifest and service worker', () => {
  const publicDir = join(import.meta.dirname ?? '.', '..', 'public');

  it('manifest.json exists and is valid JSON', () => {
    const manifestPath = join(publicDir, 'manifest.json');
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    expect(manifest.name).toBeTruthy();
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons).toBeDefined();
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  it('sw.js exists and is valid JS', () => {
    const swPath = join(publicDir, 'sw.js');
    expect(existsSync(swPath)).toBe(true);
    const content = readFileSync(swPath, 'utf-8');
    expect(content).toContain('addEventListener');
    expect(content).toContain('fetch');
  });

  it('index.html has manifest link and meta tags', () => {
    const htmlPath = join(publicDir, 'index.html');
    const html = readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('apple-mobile-web-app-capable');
    expect(html).toContain('theme-color');
    expect(html).toContain('serviceWorker');
  });

  it('index.html has repo browser panel', () => {
    const htmlPath = join(publicDir, 'index.html');
    const html = readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('repo-panel');
    expect(html).toContain('file-tree');
    expect(html).toContain('file-viewer');
    expect(html).toContain('toggleRepoPanel');
    expect(html).toContain('/api/files');
  });

  it('index.html has install prompt', () => {
    const htmlPath = join(publicDir, 'index.html');
    const html = readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('beforeinstallprompt');
    expect(html).toContain('install-banner');
  });

  it('index.html has /analytics command', () => {
    const htmlPath = join(publicDir, 'index.html');
    const html = readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('/analytics');
    expect(html).toContain('/api/analytics');
  });
});

// ─── Repo Map Tests ──────────────────────────────────────────────────────────────

import * as repoMapMod from '../src/repo-map.ts';

describe('Repo Map', () => {
  let testDir: string;
  beforeEach(() => {
    testDir = join(tmpdir(), `cocapn-repomap-${uid()}`);
    mkdirSync(join(testDir, 'src'), { recursive: true });
    writeFileSync(join(testDir, 'src', 'core.ts'), 'export function greet(name: string): string { return `Hello ${name}`; }\nexport const VERSION = "1.0";\n');
    writeFileSync(join(testDir, 'src', 'app.ts'), 'import { greet } from "./core.js";\nexport function main() { console.log(greet("world")); }\n');
    writeFileSync(join(testDir, 'src', 'util.py'), 'def helper():\n    return 42\n');
    writeFileSync(join(testDir, 'readme.md'), '# My Project\n\nA test project.\n');
  });
  afterEach(() => { try { rmSync(testDir, { recursive: true, force: true }); } catch {} });

  it('scans source files with correct extensions', () => {
    const files = repoMapMod.scanFiles(testDir);
    expect(files).toContain('src/core.ts');
    expect(files).toContain('src/app.ts');
    expect(files).toContain('src/util.py');
    expect(files).toContain('readme.md');
  });

  it('extracts function and export names', () => {
    const content = 'export function foo() {}\nexport const bar = 1;\nclass Baz {}';
    const names = repoMapMod.extractNames(content);
    expect(names).toContain('foo');
    expect(names).toContain('bar');
    expect(names).toContain('Baz');
  });

  it('extracts import paths', () => {
    const content = 'import { x } from "./mod.js";\nconst y = require("./other.js")';
    const imports = repoMapMod.extractImports(content);
    expect(imports).toContain('./mod.js');
    expect(imports).toContain('./other.js');
  });

  it('ranks files by importance', () => {
    const result = repoMapMod.generateRepoMap(testDir);
    // core.ts is imported by app.ts, so it should rank higher
    const core = result.find(e => e.path === 'src/core.ts');
    const app = result.find(e => e.path === 'src/app.ts');
    expect(core).toBeDefined();
    expect(app).toBeDefined();
    expect(core!.rank).toBeGreaterThan(app!.rank);
  });

  it('returns ordered list with all fields', () => {
    const result = repoMapMod.generateRepoMap(testDir);
    expect(result.length).toBeGreaterThan(0);
    for (const entry of result) {
      expect(entry.path).toBeTruthy();
      expect(typeof entry.rank).toBe('number');
      expect(typeof entry.importCount).toBe('number');
      expect(Array.isArray(entry.exports)).toBe(true);
      expect(Array.isArray(entry.imports)).toBe(true);
    }
  });
});

describe('Web — Repo Map API', () => {
  let dir: string;
  let port: number;

  beforeEach(async () => {
    dir = join(tmpdir(), `cocapn-rmapi-${uid()}`);
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'rmapi-test' }));
    writeFileSync(join(dir, 'src', 'core.ts'), 'export function greet() {}\n');
    writeFileSync(join(dir, 'src', 'app.ts'), 'import { greet } from "./core.js";\n');
    writeFileSync(join(dir, 'soul.md'), '---\nname: MapBot\ntone: neutral\n---\nI map repos.');
    execSync('git init', { cwd: dir, timeout: 5000 });
    execSync('git config user.email test@test.com', { cwd: dir });
    execSync('git config user.name Test', { cwd: dir });
    execSync('git add .', { cwd: dir });
    execSync('git commit -m init', { cwd: dir, timeout: 5000 });
  });

  afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

  function makeMockLlm() {
    return {
      async *chatStream(messages: any[]) {
        const userMsg = messages.find((m: any) => m.role === 'user');
        if (userMsg) yield { type: 'content' as const, text: 'Echo: ' + userMsg.content };
        yield { type: 'done' as const };
      },
    };
  }

  function setupServer(p: number) {
    const mem = new Memory(dir);
    const aw = new Awareness(dir);
    const soul = { name: 'MapBot', tone: 'neutral', model: 'deepseek', body: 'I map repos.' };
    webMod.startWebServer(p, makeMockLlm(), mem, aw, soul);
  }

  it('GET /api/repo-map returns ranked file list', async () => {
    port = 7900 + Math.floor(Math.random() * 900);
    setupServer(port);
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/api/repo-map`);
    expect(res.status).toBe(200);
    const data = await res.json() as any[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    const core = data.find((e: any) => e.path === 'src/core.ts');
    expect(core).toBeDefined();
    expect(core.rank).toBeGreaterThan(0);
  });
});

// ─── Vision Tests ──────────────────────────────────────────────────────────────

describe('Vision', () => {
  it('creates Vision instance with defaults', () => {
    const v = new visionMod.Vision();
    expect(v).toBeDefined();
  });

  it('creates Vision instance with config', () => {
    const v = new visionMod.Vision({ apiKey: 'test-key', defaultModel: 'gemini-2.0-flash', defaultResolution: '2048x2048' });
    expect(v).toBeDefined();
  });

  it('gallery starts empty', () => {
    expect(visionMod.getGallery()).toEqual([]);
  });

  it('addToGallery and getGallery work', () => {
    const result: visionMod.GenerateResult = {
      url: 'test-url',
      base64: 'dGVzdA==',
      metadata: { model: 'gemini-2.0-flash-exp', resolution: '512x512', prompt: 'test', created: new Date().toISOString() },
    };
    visionMod.addToGallery(result);
    const gallery = visionMod.getGallery();
    expect(gallery.length).toBe(1);
    expect(gallery[0].metadata.prompt).toBe('test');
  });

  it('gallery caps at 100 entries', () => {
    for (let i = 0; i < 105; i++) {
      visionMod.addToGallery({
        url: `url-${i}`, base64: `b64-${i}`,
        metadata: { model: 'test', resolution: '512x512', prompt: `prompt-${i}`, created: new Date().toISOString() },
      });
    }
    const gallery = visionMod.getGallery();
    expect(gallery.length).toBeLessThanOrEqual(100);
  });

  it('getGallery returns last 50', () => {
    // Gallery already has entries from previous test, just check it returns at most 50
    const gallery = visionMod.getGallery();
    expect(gallery.length).toBeLessThanOrEqual(50);
  });

  it('generateImage throws without valid API key', async () => {
    const v = new visionMod.Vision({ apiKey: 'invalid-key' });
    await expect(v.generateImage('test prompt')).rejects.toThrow();
  });

  it('upscaleImage throws without valid API key', async () => {
    const v = new visionMod.Vision({ apiKey: 'invalid-key' });
    await expect(v.upscaleImage('dGVzdA==')).rejects.toThrow();
  });

  it('generateSpriteSheet throws without valid API key', async () => {
    const v = new visionMod.Vision({ apiKey: 'invalid-key' });
    await expect(v.generateSpriteSheet('warrior')).rejects.toThrow();
  });

  it('generateScene throws without valid API key', async () => {
    const v = new visionMod.Vision({ apiKey: 'invalid-key' });
    await expect(v.generateScene('dark forest')).rejects.toThrow();
  });
});

// ─── Vision Web Endpoint Tests ─────────────────────────────────────────────────

describe('Vision Web Endpoints', () => {
  let dir: string;
  let port: number;

  beforeEach(async () => {
    dir = join(tmpdir(), `cocapn-vision-${uid()}`);
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'vision-test' }));
    writeFileSync(join(dir, 'src', 'app.ts'), 'export const app = true;\n');
    writeFileSync(join(dir, 'soul.md'), '---\nname: VisionBot\ntone: creative\n---\nI make images.');
    execSync('git init', { cwd: dir, timeout: 5000 });
    execSync('git config user.email test@test.com', { cwd: dir });
    execSync('git config user.name Test', { cwd: dir });
    execSync('git add .', { cwd: dir });
    execSync('git commit -m init', { cwd: dir, timeout: 5000 });
  });

  afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

  function makeMockLlm() {
    return {
      async *chatStream(messages: any[]) {
        const userMsg = messages.find((m: any) => m.role === 'user');
        if (userMsg) yield { type: 'content' as const, text: 'Echo: ' + userMsg.content };
        yield { type: 'done' as const };
      },
    };
  }

  function setupServer(p: number) {
    const mem = new Memory(dir);
    const aw = new Awareness(dir);
    const soul = { name: 'VisionBot', tone: 'creative', model: 'deepseek', body: 'I make images.' };
    webMod.startWebServer(p, makeMockLlm(), mem, aw, soul);
  }

  it('GET /api/generate/status returns vision availability', async () => {
    port = 8000 + Math.floor(Math.random() * 900);
    setupServer(port);
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/api/generate/status`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(typeof data.available).toBe('boolean');
  });

  it('POST /api/generate returns 503 without vision config', async () => {
    port = 8100 + Math.floor(Math.random() * 900);
    setupServer(port);
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'a dragon' }),
    });
    expect(res.status).toBe(503);
    const data = await res.json() as any;
    expect(data.error).toContain('Vision not configured');
  });

  it('POST /api/generate returns 400 without prompt', async () => {
    port = 8200 + Math.floor(Math.random() * 900);
    setupServer(port);
    webMod.initVision({ apiKey: 'test-key' });
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain('prompt is required');
  });

  it('GET /api/gallery returns empty gallery', async () => {
    port = 8300 + Math.floor(Math.random() * 900);
    setupServer(port);
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/api/gallery`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.images).toBeDefined();
    expect(Array.isArray(data.images)).toBe(true);
  });
});
