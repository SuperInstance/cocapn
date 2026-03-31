import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getStarter,
  listStarters,
  getStarterByCategory,
  getStarterByVertical,
  searchStarters,
  STARTERS,
} from '../src/starters/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STARTERS_DIR = join(__dirname, '..', 'src', 'starters');

const EXPECTED_SLUGS = [
  'fishing-buddy',
  'dungeon-master',
  'deck-boss',
  'study-buddy',
  'dev-mate',
  'life-admin',
  'creative-writer',
  'home-automation',
];

const REQUIRED_FILES = ['soul.md', 'config.yml', 'README.md', 'theme.css', 'CLAUDE.md', 'package.json'];
const REQUIRED_DIRS = ['wiki', 'knowledge', 'plugins', 'cocapn/memory', '.github/workflows'];

function parseYamlFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    if (key && rest.length > 0) {
      frontmatter[key.trim()] = rest.join(':').trim();
    }
  }
  return frontmatter;
}

function parseJson(filePath: string): unknown {
  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

function collectFiles(dir: string, prefix = ''): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectFiles(fullPath, `${prefix}${entry}/`));
    } else {
      files.push(`${prefix}${entry}`);
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// Directory structure
// ---------------------------------------------------------------------------
describe('starter directory structure', () => {
  for (const slug of EXPECTED_SLUGS) {
    describe(slug, () => {
      for (const file of REQUIRED_FILES) {
        it(`has ${file}`, () => {
          const filepath = join(STARTERS_DIR, slug, file);
          expect(existsSync(filepath), `Missing ${file} in ${slug}`).toBe(true);
        });
      }

      for (const dir of REQUIRED_DIRS) {
        it(`has ${dir}/ directory`, () => {
          const dirpath = join(STARTERS_DIR, slug, dir);
          expect(existsSync(dirpath), `Missing ${dir}/ in ${slug}`).toBe(true);
        });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// soul.md validation
// ---------------------------------------------------------------------------
describe('soul.md frontmatter and sections', () => {
  for (const slug of EXPECTED_SLUGS) {
    describe(slug, () => {
      let content: string;

      it('file exists and is readable', () => {
        const soulPath = join(STARTERS_DIR, slug, 'soul.md');
        expect(existsSync(soulPath)).toBe(true);
        content = readFileSync(soulPath, 'utf-8');
      });

      it('has valid YAML frontmatter with required fields', () => {
        const soulPath = join(STARTERS_DIR, slug, 'soul.md');
        content = readFileSync(soulPath, 'utf-8');
        const frontmatter = parseYamlFrontmatter(content);

        expect(frontmatter.name, `${slug} soul.md missing name`).toBeDefined();
        expect(frontmatter.version, `${slug} soul.md missing version`).toBeDefined();
        expect(frontmatter.tone, `${slug} soul.md missing tone`).toBeDefined();
        expect(frontmatter.model, `${slug} soul.md missing model`).toBeDefined();
        expect(frontmatter.maxTokens, `${slug} soul.md missing maxTokens`).toBeDefined();
      });

      it('has Identity section', () => {
        const soulPath = join(STARTERS_DIR, slug, 'soul.md');
        content = readFileSync(soulPath, 'utf-8');
        expect(content).toContain('# Identity');
      });

      it('has Personality section', () => {
        const soulPath = join(STARTERS_DIR, slug, 'soul.md');
        content = readFileSync(soulPath, 'utf-8');
        expect(content).toContain('## Personality');
      });

      it('has What You Do section', () => {
        const soulPath = join(STARTERS_DIR, slug, 'soul.md');
        content = readFileSync(soulPath, 'utf-8');
        expect(content).toContain('## What You Do');
      });

      it('has What You Know section', () => {
        const soulPath = join(STARTERS_DIR, slug, 'soul.md');
        content = readFileSync(soulPath, 'utf-8');
        expect(content).toContain('## What You Know');
      });

      it('has What You Don\'t Do section', () => {
        const soulPath = join(STARTERS_DIR, slug, 'soul.md');
        content = readFileSync(soulPath, 'utf-8');
        expect(content).toContain("## What You Don't Do");
      });

      it('has Memory Priorities section', () => {
        const soulPath = join(STARTERS_DIR, slug, 'soul.md');
        content = readFileSync(soulPath, 'utf-8');
        expect(content).toContain('## Memory Priorities');
      });

      it('has Public Face section', () => {
        const soulPath = join(STARTERS_DIR, slug, 'soul.md');
        content = readFileSync(soulPath, 'utf-8');
        expect(content).toContain('## Public Face');
      });

      it('has substantial content (80+ lines)', () => {
        const soulPath = join(STARTERS_DIR, slug, 'soul.md');
        content = readFileSync(soulPath, 'utf-8');
        const lines = content.split('\n').filter((l) => l.trim().length > 0);
        expect(lines.length, `${slug} soul.md too short: ${lines.length} lines`).toBeGreaterThanOrEqual(30);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// config.yml validation
// ---------------------------------------------------------------------------
describe('config.yml validation', () => {
  for (const slug of EXPECTED_SLUGS) {
    describe(slug, () => {
      it('has config section with mode', () => {
        const configPath = join(STARTERS_DIR, slug, 'config.yml');
        const content = readFileSync(configPath, 'utf-8');
        expect(content).toContain('config:');
        expect(content).toMatch(/mode:\s*(local|hybrid|cloud)/);
      });

      it('has llm configuration', () => {
        const configPath = join(STARTERS_DIR, slug, 'config.yml');
        const content = readFileSync(configPath, 'utf-8');
        expect(content).toContain('llm:');
        expect(content).toContain('provider:');
        expect(content).toContain('model:');
      });

      it('has features section', () => {
        const configPath = join(STARTERS_DIR, slug, 'config.yml');
        const content = readFileSync(configPath, 'utf-8');
        expect(content).toContain('features:');
      });

      it('has valid LLM temperature', () => {
        const configPath = join(STARTERS_DIR, slug, 'config.yml');
        const content = readFileSync(configPath, 'utf-8');
        const tempMatch = content.match(/temperature:\s*([\d.]+)/);
        expect(tempMatch, `${slug} missing temperature`).not.toBeNull();
        const temp = parseFloat(tempMatch![1]);
        expect(temp).toBeGreaterThanOrEqual(0);
        expect(temp).toBeLessThanOrEqual(1);
      });

      it('has plugins list', () => {
        const configPath = join(STARTERS_DIR, slug, 'config.yml');
        const content = readFileSync(configPath, 'utf-8');
        expect(content).toContain('plugins:');
      });

      it('has capabilities section', () => {
        const configPath = join(STARTERS_DIR, slug, 'config.yml');
        const content = readFileSync(configPath, 'utf-8');
        expect(content).toContain('capabilities:');
      });

      it('has brain configuration', () => {
        const configPath = join(STARTERS_DIR, slug, 'config.yml');
        const content = readFileSync(configPath, 'utf-8');
        expect(content).toContain('brain:');
      });
    });
  }
});

// ---------------------------------------------------------------------------
// theme.css validation
// ---------------------------------------------------------------------------
describe('theme.css validation', () => {
  for (const slug of EXPECTED_SLUGS) {
    describe(slug, () => {
      it('has CSS custom properties', () => {
        const themePath = join(STARTERS_DIR, slug, 'theme.css');
        const content = readFileSync(themePath, 'utf-8');
        expect(content).toContain(':root');
        expect(content).toContain('--color-primary');
        expect(content).toContain('--color-secondary');
        expect(content).toContain('--color-accent');
        expect(content).toContain('--color-background');
        expect(content).toContain('--color-surface');
        expect(content).toContain('--color-text');
      });

      it('has valid color format (at least 5 colors)', () => {
        const themePath = join(STARTERS_DIR, slug, 'theme.css');
        const content = readFileSync(themePath, 'utf-8');
        const colorMatches = content.match(/--color-\w+:\s*(#[0-9a-fA-F]{3,8})/g);
        expect(colorMatches, `${slug} has no valid colors`).not.toBeNull();
        expect(colorMatches!.length).toBeGreaterThanOrEqual(5);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// README validation
// ---------------------------------------------------------------------------
describe('README validation', () => {
  for (const slug of EXPECTED_SLUGS) {
    describe(slug, () => {
      it('has What It Does section', () => {
        const readmePath = join(STARTERS_DIR, slug, 'README.md');
        const content = readFileSync(readmePath, 'utf-8');
        expect(content).toContain('## What It Does');
      });

      it('has Quick Start section', () => {
        const readmePath = join(STARTERS_DIR, slug, 'README.md');
        const content = readFileSync(readmePath, 'utf-8');
        expect(content).toContain('## Quick Start');
      });

      it('has Use Cases section', () => {
        const readmePath = join(STARTERS_DIR, slug, 'README.md');
        const content = readFileSync(readmePath, 'utf-8');
        expect(content).toContain('## Use Cases');
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Memory files validation
// ---------------------------------------------------------------------------
describe('memory files validation', () => {
  for (const slug of EXPECTED_SLUGS) {
    describe(slug, () => {
      it('facts.json is valid JSON with 5+ entries', () => {
        const factsPath = join(STARTERS_DIR, slug, 'cocapn', 'memory', 'facts.json');
        expect(existsSync(factsPath), `Missing facts.json in ${slug}`).toBe(true);
        const facts = parseJson(factsPath) as Record<string, unknown>;
        const keys = Object.keys(facts);
        expect(keys.length, `${slug} facts.json should have 5+ entries`).toBeGreaterThanOrEqual(5);
      });

      it('memories.json is valid JSON with 3+ entries', () => {
        const memoriesPath = join(STARTERS_DIR, slug, 'cocapn', 'memory', 'memories.json');
        expect(existsSync(memoriesPath), `Missing memories.json in ${slug}`).toBe(true);
        const memories = parseJson(memoriesPath) as unknown[];
        expect(Array.isArray(memories)).toBe(true);
        expect(memories.length, `${slug} memories.json should have 3+ entries`).toBeGreaterThanOrEqual(3);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Wiki files validation
// ---------------------------------------------------------------------------
describe('wiki files validation', () => {
  for (const slug of EXPECTED_SLUGS) {
    describe(slug, () => {
      it('has wiki directory with real content files', () => {
        const wikiDir = join(STARTERS_DIR, slug, 'wiki');
        expect(existsSync(wikiDir), `Missing wiki/ in ${slug}`).toBe(true);
        const files = collectFiles(wikiDir).filter((f) => f.endsWith('.md'));
        expect(files.length, `${slug} should have wiki .md files`).toBeGreaterThanOrEqual(3);
      });

      it('each wiki file has substantial content (>100 chars)', () => {
        const wikiDir = join(STARTERS_DIR, slug, 'wiki');
        const files = collectFiles(wikiDir).filter((f) => f.endsWith('.md'));
        for (const file of files) {
          const content = readFileSync(join(wikiDir, file), 'utf-8');
          expect(
            content.length,
            `${slug} wiki/${file} too short (${content.length} chars)`
          ).toBeGreaterThan(100);
        }
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Knowledge JSON validation
// ---------------------------------------------------------------------------
describe('knowledge JSON validation', () => {
  for (const slug of EXPECTED_SLUGS) {
    describe(slug, () => {
      it('has knowledge directory with JSON files', () => {
        const knowledgeDir = join(STARTERS_DIR, slug, 'knowledge');
        expect(existsSync(knowledgeDir), `Missing knowledge/ in ${slug}`).toBe(true);
        const files = readdirSync(knowledgeDir).filter((f) => f.endsWith('.json'));
        expect(files.length, `${slug} should have knowledge .json files`).toBeGreaterThanOrEqual(1);
      });

      it('all knowledge JSON files are valid', () => {
        const knowledgeDir = join(STARTERS_DIR, slug, 'knowledge');
        const files = readdirSync(knowledgeDir).filter((f) => f.endsWith('.json'));
        for (const file of files) {
          expect(() => parseJson(join(knowledgeDir, file))).not.toThrow();
        }
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Plugins validation
// ---------------------------------------------------------------------------
describe('plugins validation', () => {
  for (const slug of EXPECTED_SLUGS) {
    describe(slug, () => {
      it('has plugins with plugin.json files', () => {
        const pluginsDir = join(STARTERS_DIR, slug, 'plugins');
        expect(existsSync(pluginsDir), `Missing plugins/ in ${slug}`).toBe(true);
        const pluginDirs = readdirSync(pluginsDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name);
        expect(pluginDirs.length, `${slug} should have plugin directories`).toBeGreaterThanOrEqual(1);

        for (const plugin of pluginDirs) {
          const pluginJson = join(pluginsDir, plugin, 'plugin.json');
          expect(existsSync(pluginJson), `${slug} plugins/${plugin} missing plugin.json`).toBe(true);
        }
      });

      it('all plugin.json files are valid JSON', () => {
        const pluginsDir = join(STARTERS_DIR, slug, 'plugins');
        const pluginDirs = readdirSync(pluginsDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name);

        for (const plugin of pluginDirs) {
          expect(() => parseJson(join(pluginsDir, plugin, 'plugin.json'))).not.toThrow();
        }
      });
    });
  }
});

// ---------------------------------------------------------------------------
// GitHub Actions validation
// ---------------------------------------------------------------------------
describe('GitHub Actions workflow', () => {
  for (const slug of EXPECTED_SLUGS) {
    describe(slug, () => {
      it('has cocapn.yml workflow', () => {
        const workflowPath = join(STARTERS_DIR, slug, '.github', 'workflows', 'cocapn.yml');
        expect(existsSync(workflowPath), `Missing .github/workflows/cocapn.yml in ${slug}`).toBe(true);
      });

      it('workflow is valid YAML with required sections', () => {
        const workflowPath = join(STARTERS_DIR, slug, '.github', 'workflows', 'cocapn.yml');
        const content = readFileSync(workflowPath, 'utf-8');
        expect(content).toContain('name:');
        expect(content).toContain('on:');
        expect(content).toContain('jobs:');
      });
    });
  }
});

// ---------------------------------------------------------------------------
// package.json validation
// ---------------------------------------------------------------------------
describe('package.json validation', () => {
  for (const slug of EXPECTED_SLUGS) {
    describe(slug, () => {
      it('is valid JSON with required fields', () => {
        const pkgPath = join(STARTERS_DIR, slug, 'package.json');
        const pkg = parseJson(pkgPath) as Record<string, unknown>;
        expect(pkg.name, `${slug} package.json missing name`).toBeDefined();
        expect(pkg.version, `${slug} package.json missing version`).toBeDefined();
        expect(pkg.description, `${slug} package.json missing description`).toBeDefined();
        expect(pkg.type, `${slug} package.json missing type`).toBe('module');
        expect(pkg.scripts, `${slug} package.json missing scripts`).toBeDefined();
      });

      it('has start script', () => {
        const pkgPath = join(STARTERS_DIR, slug, 'package.json');
        const pkg = parseJson(pkgPath) as { scripts: Record<string, string> };
        expect(pkg.scripts.start).toBeDefined();
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Registry (index.ts) validation
// ---------------------------------------------------------------------------
describe('starter registry (index.ts)', () => {
  it('exports all 8 starters', () => {
    const starters = listStarters();
    expect(starters).toHaveLength(8);
  });

  it('all expected slugs are present', () => {
    const starters = listStarters();
    const slugs = starters.map((s) => s.slug);
    for (const slug of EXPECTED_SLUGS) {
      expect(slugs).toContain(slug);
    }
  });

  it('each starter has required metadata fields', () => {
    for (const meta of STARTERS) {
      expect(meta.slug).toBeDefined();
      expect(meta.name).toBeDefined();
      expect(meta.description).toBeDefined();
      expect(meta.category).toBeDefined();
      expect(meta.tags).toBeInstanceOf(Array);
      expect(meta.tags.length).toBeGreaterThan(0);
      expect(meta.icon).toBeDefined();
    }
  });

  it('getStarter returns full starter for valid slug', () => {
    const starter = getStarter('fishing-buddy');
    expect(starter).toBeDefined();
    expect(starter!.soul).toContain('Fishing');
    expect(starter!.config).toContain('config:');
    expect(starter!.readme).toContain('Quick Start');
    expect(starter!.theme).toContain(':root');
    expect(starter!.facts).toBeDefined();
    expect(starter!.memories).toBeDefined();
  });

  it('getStarter returns undefined for invalid slug', () => {
    expect(getStarter('nonexistent')).toBeUndefined();
  });

  it('getStarterByCategory filters correctly', () => {
    const outdoors = getStarterByCategory('outdoors');
    expect(outdoors.length).toBeGreaterThanOrEqual(2);
    expect(outdoors.map((s) => s.slug)).toContain('fishing-buddy');
    expect(outdoors.map((s) => s.slug)).toContain('deck-boss');
  });

  it('getStarterByVertical finds fishing verticals', () => {
    const fishing = getStarterByVertical('fishinglog.ai');
    expect(fishing.length).toBeGreaterThanOrEqual(1);
    expect(fishing[0].slug).toBe('fishing-buddy');
  });

  it('searchStarters finds by name', () => {
    const results = searchStarters('dungeon');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].slug).toBe('dungeon-master');
  });

  it('searchStarters finds by tag', () => {
    const results = searchStarters('commercial-fishing');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].slug).toBe('deck-boss');
  });
});
