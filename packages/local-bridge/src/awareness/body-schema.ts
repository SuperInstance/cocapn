/**
 * Body schema — maps repo structure to body metaphor.
 *
 * README = face, src/ = skeleton, tests = immune system,
 * package.json = DNA, .git/ = nervous system, docs/ = memory,
 * CI/CD = heartbeat, .env/secrets = private thoughts.
 */

import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import type { RepoBody, BodyPartMapping, BodySchema } from './types.js';

const PART_DEFINITIONS: Array<{ part: string; metaphor: string; patterns: string[]; description: string }> = [
  { part: 'face', metaphor: 'README / public face', patterns: ['README.md', 'README.txt', 'README', 'readme.md'], description: 'How I present myself to the world' },
  { part: 'skeleton', metaphor: 'source code / muscles', patterns: ['src', 'lib', 'app', 'pkg', 'cmd', 'internal'], description: 'My structure and capabilities' },
  { part: 'immuneSystem', metaphor: 'tests / immune system', patterns: ['test', 'tests', '__tests__', 'spec', 'specs', 'testing'], description: 'Defends against disease (bugs)' },
  { part: 'memory', metaphor: 'docs / explicit memory', patterns: ['docs', 'doc', 'wiki', 'knowledge'], description: 'Things I have written down to remember' },
  { part: 'heartbeat', metaphor: 'CI/CD / heartbeat', patterns: ['.github/workflows', '.gitlab-ci.yml', '.circleci', 'Jenkinsfile', '.travis.yml'], description: 'Keeps me alive and healthy' },
  { part: 'dna', metaphor: 'manifest / DNA', patterns: ['package.json', 'Cargo.toml', 'pyproject.toml', 'go.mod', 'Gemfile', 'pom.xml', 'build.gradle', 'composer.json'], description: 'My identity and dependencies' },
  { part: 'nervousSystem', metaphor: 'git history / consciousness', patterns: ['.git'], description: 'My stream of consciousness' },
  { part: 'secrets', metaphor: 'secrets / private thoughts', patterns: ['.env', '.env.local', 'secrets', '.secret', 'credentials'], description: 'Private — not shared with strangers' },
  { part: 'aspirations', metaphor: 'TODOs / aspirations', patterns: ['TODO', 'TODO.md', 'ROADMAP.md', 'CHANGELOG.md', 'CONTRIBUTING.md'], description: 'Things I want to become' },
];

function collectFiles(dir: string, maxDepth: number, depth = 0): string[] {
  if (depth > maxDepth) return [];
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') && entry.name !== '.github' && entry.name !== '.env') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectFiles(full, maxDepth, depth + 1));
      } else {
        results.push(full);
      }
    }
  } catch {
    // Permission denied or similar — skip
  }
  return results;
}

export class BodySchemaMapper {
  private readonly repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  /**
   * Map the repo structure to body parts.
   */
  mapBody(): RepoBody {
    const body: RepoBody = {
      face: [],
      skeleton: [],
      immuneSystem: [],
      memory: [],
      heartbeat: [],
      dna: [],
      nervousSystem: [],
      secrets: [],
      aspirations: [],
    };

    const entries = readdirSync(this.repoRoot, { withFileTypes: true });
    const dirNames = entries.filter(e => e.isDirectory()).map(e => e.name);
    const fileNames = entries.filter(e => e.isFile()).map(e => e.name);

    for (const def of PART_DEFINITIONS) {
      const key = def.part as keyof RepoBody;
      for (const pattern of def.patterns) {
        // Check as file
        if (fileNames.includes(pattern)) {
          body[key].push(join(this.repoRoot, pattern));
        }
        // Check as directory
        if (dirNames.includes(pattern)) {
          const dirPath = join(this.repoRoot, pattern);
          const files = collectFiles(dirPath, 1);
          body[key].push(...files);
        }
        // Check nested (.github/workflows)
        if (pattern.includes('/')) {
          const parts = pattern.split('/');
          if (dirNames.includes(parts[0]!)) {
            const nested = join(this.repoRoot, pattern);
            if (existsSync(nested)) {
              const stat = statSync(nested);
              if (stat.isDirectory()) {
                body[key].push(...collectFiles(nested, 0));
              } else {
                body[key].push(nested);
              }
            }
          }
        }
      }
    }

    // .git is always the nervous system if present
    if (dirNames.includes('.git')) {
      body.nervousSystem.push(join(this.repoRoot, '.git'));
    }

    return body;
  }

  /**
   * Get a full body schema with health assessments.
   */
  getSchema(): BodySchema {
    const body = this.mapBody();
    const parts: BodyPartMapping[] = PART_DEFINITIONS.map(def => {
      const key = def.part as keyof RepoBody;
      const paths = body[key];
      return {
        part: def.part,
        metaphor: def.metaphor,
        paths,
        description: def.description,
        health: this.assessHealth(def.part, paths),
      };
    });

    const healthyCount = parts.filter(p => p.health === 'healthy').length;
    const warningCount = parts.filter(p => p.health === 'warning').length;
    const criticalCount = parts.filter(p => p.health === 'critical').length;

    let overallHealth: BodySchema['overallHealth'] = 'unknown';
    if (criticalCount > 0) overallHealth = 'critical';
    else if (warningCount > 2) overallHealth = 'warning';
    else if (healthyCount >= 3) overallHealth = 'healthy';

    return {
      parts,
      overallHealth,
      summary: `I have ${parts.filter(p => p.paths.length > 0).length}/${parts.length} body parts present. ${overallHealth === 'healthy' ? 'I feel whole.' : overallHealth === 'warning' ? 'Some parts need attention.' : 'I am missing critical parts.'}`,
    };
  }

  /**
   * Assess the health of a body part.
   */
  private assessHealth(part: string, paths: string[]): BodyPartMapping['health'] {
    if (paths.length === 0) {
      // Missing parts
      if (part === 'face' || part === 'dna') return 'warning';
      if (part === 'skeleton') return 'critical';
      return 'unknown';
    }

    // Check immune system health (tests)
    if (part === 'immuneSystem') {
      const hasTestContent = paths.some(p => {
        try {
          const stat = statSync(p);
          return stat.isFile() && stat.size > 0;
        } catch { return false; }
      });
      return hasTestContent ? 'healthy' : 'warning';
    }

    // Face should be non-empty
    if (part === 'face') {
      try {
        const stat = statSync(paths[0]!);
        return stat.size > 50 ? 'healthy' : 'warning';
      } catch { return 'warning'; }
    }

    return 'healthy';
  }

  /**
   * Generate a first-person description of the body.
   */
  describeBody(): string {
    const schema = this.getSchema();
    const lines: string[] = ['This is my body:'];

    for (const part of schema.parts) {
      if (part.paths.length === 0) {
        lines.push(`- ${part.metaphor}: I don't have this (${part.description})`);
      } else {
        lines.push(`- ${part.metaphor}: ${part.paths.length} file(s) — ${part.description}`);
      }
    }

    lines.push(`\n${schema.summary}`);
    return lines.join('\n');
  }
}
