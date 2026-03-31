/* eslint-disable */
// @ts-nocheck
/**
 * Seed tests for cocapn.
 * Tests soul, memory, awareness, LLM, and web modules.
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
    // Verify the corrupted file is there
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

  it('GET / returns HTML chat UI', async () => {
    const memory = new Memory(dir);
    const awareness = new Awareness(dir);
    const soul = { name: 'WebBot', tone: 'friendly', model: 'deepseek', body: 'I am a test bot.' };
    const mockLlm = {
      async *chatStream(messages: any[]) {
        const userMsg = messages.find((m: any) => m.role === 'user');
        if (userMsg) yield { type: 'content' as const, text: 'Echo: ' + userMsg.content };
        yield { type: 'done' as const };
      },
    };
    port = 3100 + Math.floor(Math.random() * 900);
    webMod.startWebServer(port, mockLlm, memory, awareness, soul);
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('cocapn');
    expect(html).toContain('input');
  });

  it('GET /api/status returns agent info', async () => {
    const memory = new Memory(dir);
    const awareness = new Awareness(dir);
    const soul = { name: 'WebBot', tone: 'friendly', model: 'deepseek', body: 'Test.' };
    const mockLlm = { async *chatStream() { yield { type: 'done' as const }; } };
    port = 3200 + Math.floor(Math.random() * 900);
    webMod.startWebServer(port, mockLlm, memory, awareness, soul);
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/api/status`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.name).toBe('WebBot');
    expect(data.tone).toBe('friendly');
  });

  it('POST /api/chat streams and saves', async () => {
    const memory = new Memory(dir);
    const awareness = new Awareness(dir);
    const soul = { name: 'WebBot', tone: 'friendly', model: 'deepseek', body: 'Test.' };
    const mockLlm = {
      async *chatStream(messages: any[]) {
        const userMsg = messages.find((m: any) => m.role === 'user');
        if (userMsg) yield { type: 'content' as const, text: 'Echo: ' + userMsg.content };
        yield { type: 'done' as const };
      },
    };
    port = 3300 + Math.floor(Math.random() * 900);
    webMod.startWebServer(port, mockLlm, memory, awareness, soul);
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
    const memory = new Memory(dir);
    const awareness = new Awareness(dir);
    const soul = { name: 'WebBot', tone: 'friendly', model: 'deepseek', body: 'Test.' };
    const mockLlm = { async *chatStream() { yield { type: 'done' as const }; } };
    port = 3400 + Math.floor(Math.random() * 900);
    webMod.startWebServer(port, mockLlm, memory, awareness, soul);
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('GET /cocapn/soul.md returns public soul', async () => {
    const memory = new Memory(dir);
    const awareness = new Awareness(dir);
    const soul = { name: 'WebBot', tone: 'friendly', model: 'deepseek', body: 'I am a web test bot.' };
    const mockLlm = { async *chatStream() { yield { type: 'done' as const }; } };
    port = 3500 + Math.floor(Math.random() * 900);
    webMod.startWebServer(port, mockLlm, memory, awareness, soul);
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${port}/cocapn/soul.md`);
    expect(res.status).toBe(200);
    expect((await res.text())).toContain('WebBot');
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
