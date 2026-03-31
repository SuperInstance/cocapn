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

const { loadSoul, soulToSystemPrompt } = soulMod;
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

  it('stores and retrieves facts', () => {
    const mem = new Memory(testDir);
    mem.setFact('user', 'Alice');
    expect(mem.getFact('user')).toBe('Alice');
    expect(mem.getFact('nope')).toBeUndefined();

    const mem2 = new Memory(testDir);
    expect(mem2.getFact('user')).toBe('Alice');
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
    mem.setFact('name', 'Bob');
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
    mem.setFact('key', 'value');
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
    mem.setFact('language', 'TypeScript');

    const results = mem.search('typescript');
    expect(results.messages.length).toBe(2);
    expect(results.facts.length).toBe(1);
    expect(results.facts[0].key).toBe('language');
  });

  it('search returns empty on no match', () => {
    const mem = new Memory(testDir);
    mem.addMessage('user', 'Hello world');
    const results = mem.search('xyz');
    expect(results.messages.length).toBe(0);
    expect(results.facts.length).toBe(0);
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
  it('initializes', () => {
    expect(new DeepSeek({ apiKey: 'test' })).toBeDefined();
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
