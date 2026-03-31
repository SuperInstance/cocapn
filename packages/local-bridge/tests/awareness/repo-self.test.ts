/**
 * Tests for RepoSelf — first-person repo perception.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { simpleGit } from 'simple-git';
import { RepoSelf } from '../../src/awareness/repo-self.js';

async function makeRepo(files: Record<string, string> = {}): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'cocapn-repo-self-'));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig('user.name', 'Test');
  await git.addConfig('user.email', 'test@test.com');

  // Default files
  writeFileSync(join(dir, 'README.md'), '# Test Repo\nA test repository.\n');
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'test-repo', description: 'A test project' }));

  // Extra files
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(dir, path);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, content);
  }

  await git.add('.');
  await git.commit('feat: initial commit');
  return dir;
}

describe('RepoSelf.whoAmI', () => {
  let dir: string;
  afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ } });

  it('identifies itself from package.json', async () => {
    dir = await makeRepo();
    const self = new RepoSelf(dir);
    await self.init();
    const desc = await self.whoAmI();

    expect(desc.name).toBe('test-repo');
    expect(desc.purpose).toBe('A test project');
    expect(desc.birthDate).toBeTruthy();
    expect(desc.age).toBeTruthy();
    expect(desc.size.files).toBeGreaterThanOrEqual(2);
  });

  it('detects languages from file extensions', async () => {
    dir = await makeRepo({
      'src/index.ts': 'export const x = 1;',
      'src/app.py': 'print("hello")',
    });
    const self = new RepoSelf(dir);
    await self.init();
    const desc = await self.whoAmI();

    expect(desc.languages).toContain('TypeScript');
    expect(desc.languages).toContain('Python');
  });

  it('falls back to directory name without package.json', async () => {
    dir = await makeRepo();
    rmSync(join(dir, 'package.json'));
    const git = simpleGit(dir);
    await git.add('.');
    await git.commit('chore: remove package.json');

    const self = new RepoSelf(dir);
    await self.init();
    const desc = await self.whoAmI();

    expect(desc.name).toBeTruthy();
    expect(desc.name).not.toBe('test-repo');
  });
});

describe('RepoSelf.myMemories', () => {
  let dir: string;
  afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ } });

  it('returns git commits as episodic memories', async () => {
    dir = await makeRepo();
    const git = simpleGit(dir);
    writeFileSync(join(dir, 'feature.ts'), 'export const x = 1;');
    await git.add('.');
    await git.commit('feat: add feature');
    writeFileSync(join(dir, 'bug.ts'), 'export const y = null;');
    await git.add('.');
    await git.commit('fix: fix bug');

    const self = new RepoSelf(dir);
    await self.init();
    const memories = await self.myMemories();

    expect(memories.length).toBeGreaterThanOrEqual(3);
    const featMemory = memories.find(m => m.message.includes('add feature'));
    expect(featMemory).toBeTruthy();
    expect(featMemory!.category).toBe('feature');
    expect(featMemory!.emotion).toBe('growth');

    const fixMemory = memories.find(m => m.message.includes('fix bug'));
    expect(fixMemory).toBeTruthy();
    expect(fixMemory!.category).toBe('fix');
    expect(fixMemory!.emotion).toBe('healing');
  });
});

describe('RepoSelf.myGrowth', () => {
  let dir: string;
  afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ } });

  it('calculates growth metrics', async () => {
    dir = await makeRepo();
    const self = new RepoSelf(dir);
    await self.init();
    const growth = await self.myGrowth();

    expect(growth.totalCommits).toBeGreaterThanOrEqual(1);
    expect(growth.periodDays).toBeGreaterThanOrEqual(0);
    expect(growth.phases.length).toBeGreaterThan(0);
  });
});

describe('RepoSelf.reflect', () => {
  let dir: string;
  afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ } });

  it('produces a self-reflection', async () => {
    dir = await makeRepo({
      'src/index.ts': 'export const x = 1;',
      'tests/index.test.ts': 'test("works", () => {});',
    });
    const self = new RepoSelf(dir);
    await self.init();
    const reflection = await self.reflect();

    expect(reflection.whatAmI).toContain('test-repo');
    expect(reflection.whatDoIKnow.length).toBeGreaterThan(0);
    expect(reflection.whatAmIBecoming).toBeTruthy();
  });
});

describe('RepoSelf.myBody', () => {
  let dir: string;
  afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ } });

  it('maps files to body parts', async () => {
    dir = await makeRepo({
      'src/index.ts': 'export const x = 1;',
      'tests/index.test.ts': 'test("works", () => {});',
      'docs/api.md': '# API Docs',
    });
    const self = new RepoSelf(dir);
    const body = self.myBody();

    expect(body.face.length).toBeGreaterThan(0);
    expect(body.dna.length).toBeGreaterThan(0);
    expect(body.nervousSystem.length).toBeGreaterThan(0);
    expect(body.skeleton.length).toBeGreaterThan(0);
    expect(body.immuneSystem.length).toBeGreaterThan(0);
    expect(body.memory.length).toBeGreaterThan(0);
  });
});
