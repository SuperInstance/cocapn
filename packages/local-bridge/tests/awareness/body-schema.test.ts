/**
 * Tests for BodySchemaMapper — repo as body metaphor.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BodySchemaMapper } from '../../src/awareness/body-schema.js';

let dir: string;
afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ } });

function makeRepo(files: Record<string, string> = {}): string {
  dir = mkdtempSync(join(tmpdir(), 'cocapn-body-'));
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(dir, path);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, content);
  }
  return dir;
}

describe('BodySchemaMapper.mapBody', () => {
  it('maps README to face', () => {
    const d = makeRepo({ 'README.md': '# Hello World\nThis is my project.' });
    const mapper = new BodySchemaMapper(d);
    const body = mapper.mapBody();
    expect(body.face.length).toBe(1);
  });

  it('maps src/ to skeleton', () => {
    const d = makeRepo({ 'src/index.ts': 'export const x = 1;' });
    const mapper = new BodySchemaMapper(d);
    const body = mapper.mapBody();
    expect(body.skeleton.length).toBeGreaterThanOrEqual(1);
  });

  it('maps tests/ to immune system', () => {
    const d = makeRepo({ 'tests/index.test.ts': 'test("works", () => { expect(1).toBe(1); });' });
    const mapper = new BodySchemaMapper(d);
    const body = mapper.mapBody();
    expect(body.immuneSystem.length).toBeGreaterThanOrEqual(1);
  });

  it('maps docs/ to memory', () => {
    const d = makeRepo({ 'docs/api.md': '# API Reference' });
    const mapper = new BodySchemaMapper(d);
    const body = mapper.mapBody();
    expect(body.memory.length).toBeGreaterThanOrEqual(1);
  });

  it('maps package.json to DNA', () => {
    const d = makeRepo({ 'package.json': '{"name": "test"}' });
    const mapper = new BodySchemaMapper(d);
    const body = mapper.mapBody();
    expect(body.dna.length).toBe(1);
  });

  it('detects .github/workflows as heartbeat', () => {
    const d = makeRepo({ '.github/workflows/ci.yml': 'name: CI\non: [push]' });
    const mapper = new BodySchemaMapper(d);
    const body = mapper.mapBody();
    expect(body.heartbeat.length).toBeGreaterThanOrEqual(1);
  });

  it('maps TODO.md to aspirations', () => {
    const d = makeRepo({ 'TODO.md': '- [ ] Add feature\n- [ ] Fix bug' });
    const mapper = new BodySchemaMapper(d);
    const body = mapper.mapBody();
    expect(body.aspirations.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty arrays for missing parts', () => {
    const d = makeRepo({ 'random.txt': 'nothing relevant' });
    const mapper = new BodySchemaMapper(d);
    const body = mapper.mapBody();
    expect(body.face).toEqual([]);
    expect(body.skeleton).toEqual([]);
    expect(body.immuneSystem).toEqual([]);
  });
});

describe('BodySchemaMapper.getSchema', () => {
  it('assesses health of body parts', () => {
    const d = makeRepo({
      'README.md': '# Full README with enough content to be considered healthy',
      'src/index.ts': 'export const x = 1;',
      'tests/test.ts': 'test("works", () => {});',
      'package.json': '{"name":"test"}',
    });
    const mapper = new BodySchemaMapper(d);
    const schema = mapper.getSchema();

    expect(schema.parts.length).toBe(9); // 9 body part types
    const face = schema.parts.find(p => p.part === 'face');
    expect(face!.health).toBe('healthy');
  });

  it('reports warning for missing face', () => {
    const d = makeRepo({ 'src/index.ts': 'code' });
    const mapper = new BodySchemaMapper(d);
    const schema = mapper.getSchema();

    const face = schema.parts.find(p => p.part === 'face');
    expect(face!.health).toBe('warning');
  });

  it('reports critical for missing skeleton', () => {
    const d = makeRepo({ 'README.md': '# Readme' });
    const mapper = new BodySchemaMapper(d);
    const schema = mapper.getSchema();

    const skeleton = schema.parts.find(p => p.part === 'skeleton');
    expect(skeleton!.health).toBe('critical');
  });
});

describe('BodySchemaMapper.describeBody', () => {
  it('generates first-person body description', () => {
    const d = makeRepo({
      'README.md': '# My Project',
      'src/main.ts': 'console.log("hello")',
      'tests/main.test.ts': 'test("works", () => {})',
      'package.json': '{"name":"test"}',
    });
    const mapper = new BodySchemaMapper(d);
    const desc = mapper.describeBody();

    expect(desc).toContain('This is my body');
    expect(desc).toContain('file(s)');
  });
});
