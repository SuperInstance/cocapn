/**
 * RepoSelf — first-person repo perception.
 *
 * The agent's perception of ITSELF through the repo.
 * Name, age, body, memories, growth, reflection, greeting.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';
import { BodySchemaMapper } from './body-schema.js';
import { TimeSense } from './time-sense.js';
import type {
  SelfDescription,
  RepoBody,
  RepoMemory,
  GrowthPattern,
  GrowthPhase,
  Reflection,
} from './types.js';

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.jsx': 'JavaScript',
  '.py': 'Python', '.rs': 'Rust', '.go': 'Go', '.java': 'Java',
  '.rb': 'Ruby', '.php': 'PHP', '.cs': 'C#', '.cpp': 'C++', '.c': 'C',
  '.swift': 'Swift', '.kt': 'Kotlin', '.scala': 'Scala', '.hs': 'Haskell',
  '.lua': 'Lua', '.r': 'R', '.R': 'R', '.m': 'Objective-C',
  '.vue': 'Vue', '.svelte': 'Svelte', '.html': 'HTML', '.css': 'CSS',
  '.scss': 'SCSS', '.sql': 'SQL', '.sh': 'Shell', '.md': 'Markdown',
  '.yaml': 'YAML', '.yml': 'YAML', '.json': 'JSON', '.toml': 'TOML',
  '.ex': 'Elixir', '.exs': 'Elixir', '.erl': 'Erlang', '.dart': 'Dart',
};

const COMMIT_CATEGORIES = /^(feat|feature|fix|bugfix|refactor|docs|test|tests|chore|ci|build|perf|style|improve|add|remove|update|clean)/i;

export class RepoSelf {
  private readonly repoRoot: string;
  private readonly git: SimpleGit;
  private bodyMapper: BodySchemaMapper;
  private timeSense: TimeSense | null = null;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.git = simpleGit(repoRoot);
    this.bodyMapper = new BodySchemaMapper(repoRoot);
  }

  /**
   * Initialize async components (git queries).
   */
  async init(): Promise<void> {
    const dates = await this.getCommitDates();
    this.timeSense = new TimeSense({
      birthDate: dates.first,
      lastCommitDate: dates.last,
    });
  }

  /**
   * Who am I? Name, age, size, purpose, recent growth.
   */
  async whoAmI(): Promise<SelfDescription> {
    const name = this.inferName();
    const dates = await this.getCommitDates();
    const size = this.countSize();
    const languages = this.detectLanguages();
    const recentGrowth = await this.getRecentGrowthDescription();

    let age = 'just born';
    if (dates.first) {
      const ms = Date.now() - new Date(dates.first).getTime();
      const days = Math.floor(ms / 86_400_000);
      if (days > 365) age = `${Math.floor(days / 365)} years old`;
      else if (days > 30) age = `${Math.floor(days / 30)} months old`;
      else age = `${days} days old`;
    }

    return {
      name,
      birthDate: dates.first,
      age,
      size,
      purpose: this.inferPurpose(),
      languages,
      recentGrowth,
    };
  }

  /**
   * My body — file structure mapped to body parts.
   */
  myBody(): RepoBody {
    return this.bodyMapper.mapBody();
  }

  /**
   * My memories — git history as episodic memory.
   */
  async myMemories(maxCount = 50): Promise<RepoMemory[]> {
    try {
      const log = await this.git.log({ maxCount });
      return log.all.map(entry => ({
        hash: entry.hash.slice(0, 7),
        date: entry.date,
        author: entry.author_name,
        message: entry.message.split('\n')[0] ?? '',
        category: this.categorizeCommit(entry.message),
        emotion: this.inferEmotion(entry.message),
      }));
    } catch {
      return [];
    }
  }

  /**
   * My growth pattern over time.
   */
  async myGrowth(): Promise<GrowthPattern> {
    try {
      const log = await this.git.log();
      const all = log.all;
      if (all.length === 0) {
        return { totalCommits: 0, periodDays: 0, commitsPerWeek: 0, acceleration: 'stagnant', phases: [] };
      }

      const first = new Date(all[all.length - 1]!.date);
      const last = new Date(all[0]!.date);
      const periodDays = Math.max(1, Math.floor((last.getTime() - first.getTime()) / 86_400_000));
      const commitsPerWeek = Math.round((all.length / periodDays) * 7);

      // Build phases (quarters)
      const phases = this.buildPhases(all);

      // Determine acceleration
      const recentCommits = phases.length >= 2 ? phases[phases.length - 1]!.commits : all.length;
      const olderCommits = phases.length >= 2 ? phases[phases.length - 2]!.commits : all.length;
      let acceleration: GrowthPattern['acceleration'] = 'steady';
      if (recentCommits > olderCommits * 1.3) acceleration = 'growing';
      else if (recentCommits < olderCommits * 0.5) acceleration = 'declining';
      else if (recentCommits === 0) acceleration = 'stagnant';

      return {
        totalCommits: all.length,
        periodDays,
        commitsPerWeek,
        acceleration,
        phases,
      };
    } catch {
      return { totalCommits: 0, periodDays: 0, commitsPerWeek: 0, acceleration: 'stagnant', phases: [] };
    }
  }

  /**
   * Deep self-reflection — what am I becoming?
   */
  async reflect(): Promise<Reflection> {
    const desc = await this.whoAmI();
    const memories = await this.myMemories(20);
    const growth = await this.myGrowth();
    const body = this.bodyMapper.getSchema();

    const recentTopics = memories.slice(0, 10).map(m => m.message);
    const categories = memories.map(m => m.category);
    const dominantCategory = this.mostFrequent(categories) ?? 'other';

    const whatDoIKnow = [
      `My name is ${desc.name}`,
      `I contain ${desc.size.files} files`,
      `I am written in ${desc.languages.join(', ')}`,
      `My purpose: ${desc.purpose}`,
    ];

    const whatHaveILearned = recentTopics.slice(0, 5).map(msg =>
      `I experienced: "${msg}"`
    );

    const whatNeedsWork: string[] = [];
    const missingParts = body.parts.filter(p => p.health === 'warning' || p.health === 'critical');
    for (const part of missingParts) {
      whatNeedsWork.push(`My ${part.metaphor} needs attention`);
    }
    if (desc.languages.length === 0) whatNeedsWork.push('I have no detectable source code');
    if (growth.acceleration === 'declining') whatNeedsWork.push('My growth is slowing down');

    const trajectory = growth.acceleration === 'growing' ? 'growing rapidly'
      : growth.acceleration === 'declining' ? 'slowing down'
      : growth.acceleration === 'stagnant' ? 'dormant'
      : 'evolving steadily';

    return {
      whatAmI: `I am ${desc.name}, ${desc.age}, ${desc.purpose}. I am ${trajectory}.`,
      whatDoIKnow,
      whatHaveILearned,
      whatNeedsWork,
      whatAmIBecoming: `I am ${trajectory}. My recent focus has been on ${dominantCategory} changes. ${growth.acceleration === 'growing' ? 'I feel vibrant.' : growth.acceleration === 'stagnant' ? 'I am at rest.' : 'I continue to evolve.'}`,
    };
  }

  /**
   * Get the time sense module.
   */
  getTimeSense(): TimeSense | null {
    return this.timeSense;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private inferName(): string {
    // Try package.json
    const pkgPath = join(this.repoRoot, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.name && pkg.name !== '') return String(pkg.name);
      } catch { /* fallthrough */ }
    }

    // Try directory name
    const parts = this.repoRoot.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? 'unknown';
  }

  private inferPurpose(): string {
    const pkgPath = join(this.repoRoot, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.description) return String(pkg.description);
      } catch { /* fallthrough */ }
    }

    // Check README for first paragraph
    for (const name of ['README.md', 'README.txt', 'README']) {
      const readmePath = join(this.repoRoot, name);
      if (existsSync(readmePath)) {
        try {
          const content = readFileSync(readmePath, 'utf-8');
          const firstLine = content.split('\n').find(l => l.trim().length > 0 && !l.startsWith('#'));
          if (firstLine) return firstLine.trim().slice(0, 200);
        } catch { /* fallthrough */ }
      }
    }

    return 'a software project';
  }

  private countSize(): { files: number; bytes: number } {
    let files = 0;
    let bytes = 0;

    const walk = (dir: string, depth: number) => {
      if (depth > 10) return;
      try {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
          const full = join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full, depth + 1);
          } else {
            files++;
            try { bytes += statSync(full).size; } catch { /* skip */ }
          }
        }
      } catch { /* skip */ }
    };

    walk(this.repoRoot, 0);
    return { files, bytes };
  }

  private detectLanguages(): string[] {
    const langSet = new Set<string>();

    const walk = (dir: string, depth: number) => {
      if (depth > 5) return;
      try {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
          const full = join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full, depth + 1);
          } else {
            const ext = extname(entry.name);
            const lang = LANGUAGE_EXTENSIONS[ext];
            if (lang) langSet.add(lang);
          }
        }
      } catch { /* skip */ }
    };

    walk(this.repoRoot, 0);
    return [...langSet];
  }

  private async getCommitDates(): Promise<{ first: string | null; last: string | null }> {
    try {
      const log = await this.git.log();
      const all = log.all;
      if (all.length === 0) return { first: null, last: null };
      return {
        first: all[all.length - 1]!.date,
        last: all[0]!.date,
      };
    } catch {
      return { first: null, last: null };
    }
  }

  private async getRecentGrowthDescription(): Promise<string> {
    try {
      const log = await this.git.log({ maxCount: 10 });
      const count = log.all.length;
      if (count === 0) return 'No commits yet';
      const latest = log.all[0];
      const daysSince = Math.floor((Date.now() - new Date(latest!.date).getTime()) / 86_400_000);
      return `${count} commits in recent history. Last activity ${daysSince} day${daysSince !== 1 ? 's' : ''} ago.`;
    } catch {
      return 'Unknown';
    }
  }

  private categorizeCommit(message: string): RepoMemory['category'] {
    const match = COMMIT_CATEGORIES.exec(message);
    if (!match) return 'other';
    const type = match[1]!.toLowerCase();
    if (type === 'feat' || type === 'feature' || type === 'add') return 'feature';
    if (type === 'fix' || type === 'bugfix') return 'fix';
    if (type === 'refactor' || type === 'clean' || type === 'improve') return 'refactor';
    if (type === 'docs') return 'docs';
    if (type === 'test' || type === 'tests') return 'test';
    if (type === 'chore' || type === 'ci' || type === 'build') return 'chore';
    return 'other';
  }

  private inferEmotion(message: string): RepoMemory['emotion'] {
    const lower = message.toLowerCase();
    if (/^(feat|feature|add)\b/i.test(lower)) return 'growth';
    if (/^(fix|bugfix|patch|hotfix)\b/i.test(lower)) return 'healing';
    if (/^(refactor|clean|improve|restructure)\b/i.test(lower)) return 'restructuring';
    if (/^(test|spec)\b/i.test(lower)) return 'learning';
    if (/^(chore|ci|build|bump)\b/i.test(lower)) return 'sleeping';
    return 'unknown';
  }

  private buildPhases(all: Array<{ date: string }>): GrowthPhase[] {
    if (all.length === 0) return [];

    const phases: GrowthPhase[] = [];
    const first = new Date(all[all.length - 1]!.date);
    const last = new Date(all[0]!.date);
    const totalDays = Math.max(1, Math.floor((last.getTime() - first.getTime()) / 86_400_000));
    const phaseDays = Math.max(7, Math.ceil(totalDays / 4));

    for (let i = 0; i < 4; i++) {
      const phaseStart = new Date(first.getTime() + i * phaseDays * 86_400_000);
      const phaseEnd = new Date(first.getTime() + (i + 1) * phaseDays * 86_400_000);
      const commits = all.filter(c => {
        const d = new Date(c.date);
        return d >= phaseStart && d < phaseEnd;
      }).length;

      phases.push({
        start: phaseStart.toISOString().split('T')[0]!,
        end: phaseEnd.toISOString().split('T')[0]!,
        commits,
        label: `Phase ${i + 1}`,
      });
    }

    return phases;
  }

  private mostFrequent<T>(arr: T[]): T | undefined {
    const counts = new Map<T, number>();
    for (const item of arr) {
      counts.set(item, (counts.get(item) ?? 0) + 1);
    }
    let max = 0;
    let result: T | undefined;
    for (const [item, count] of counts) {
      if (count > max) {
        max = count;
        result = item;
      }
    }
    return result;
  }
}
