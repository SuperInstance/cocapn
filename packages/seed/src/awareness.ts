/**
 * Awareness — repo self-perception for cocapn.
 *
 * Reads git log, package.json, and file tree to generate
 * a first-person narrative: "I am [name], born [date], I have [n] files..."
 *
 * Uses only Node.js built-ins. Calls `git` CLI via child_process.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SelfDescription {
  name: string;
  born: string;
  age: string;
  commits: number;
  files: number;
  languages: string[];
  description: string;
  lastCommit: string;
  branch: string;
  authors: string[];
  recentActivity: string;
  feeling: string;
}

// ─── Awareness ─────────────────────────────────────────────────────────────────

export class Awareness {
  private repoDir: string;

  constructor(repoDir: string) {
    this.repoDir = repoDir;
  }

  /** Generate first-person self-description */
  perceive(): SelfDescription {
    const name = this.getName();
    const born = this.getBirthDate();
    const commits = this.getCommitCount();
    const files = this.countFiles('.');
    const languages = this.detectLanguages();
    const description = this.getDescription();
    const lastCommit = this.getLastCommitTime();
    const branch = this.getBranch();
    const authors = this.getAuthors();
    const recentActivity = this.getRecentActivity();
    const feeling = this.inferFeeling();

    const age = born ? this.formatAge(new Date(born)) : 'unknown age';

    return { name, born, age, commits, files, languages, description, lastCommit, branch, authors, recentActivity, feeling };
  }

  /** Render self-description as first-person narrative */
  narrate(): string {
    const self = this.perceive();
    const lines: string[] = [];

    lines.push(`I am ${self.name}.`);
    if (self.description) lines.push(`My purpose: ${self.description}.`);
    if (self.born) lines.push(`I was born ${self.age} ago, on ${self.born}.`);
    lines.push(`I have ${self.files} files in my body.`);
    if (self.languages.length > 0) lines.push(`I speak ${self.languages.join(', ')}.`);
    lines.push(`I remember ${self.commits} commits.`);
    if (self.branch) lines.push(`Right now I'm on the ${self.branch} branch.`);
    if (self.authors.length > 0) lines.push(`My creators: ${self.authors.join(', ')}.`);
    if (self.lastCommit) lines.push(self.lastCommit);
    if (self.feeling) lines.push(self.feeling);

    return lines.join(' ');
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private getName(): string {
    try {
      const pkg = this.readJson('package.json');
      if (pkg.name) return String(pkg.name);
    } catch { /* fall through */ }
    return this.repoDir.split('/').pop() ?? 'unknown';
  }

  private getDescription(): string {
    try {
      const pkg = this.readJson('package.json');
      if (pkg.description) return String(pkg.description);
    } catch { /* fall through */ }
    return '';
  }

  private getBirthDate(): string {
    try {
      const result = execSync('git log --reverse --format=%ai --max-count=1', {
        cwd: this.repoDir, encoding: 'utf-8', timeout: 5000,
      }).trim();
      return result || '';
    } catch { return ''; }
  }

  private getCommitCount(): number {
    try {
      return parseInt(execSync('git rev-list --count HEAD', {
        cwd: this.repoDir, encoding: 'utf-8', timeout: 5000,
      }).trim(), 10) || 0;
    } catch { return 0; }
  }

  private getLastCommitTime(): string {
    try {
      const ts = execSync('git log -1 --format=%ar', {
        cwd: this.repoDir, encoding: 'utf-8', timeout: 5000,
      }).trim();
      return `My last memory was ${ts}.`;
    } catch { return ''; }
  }

  private getBranch(): string {
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: this.repoDir, encoding: 'utf-8', timeout: 5000,
      }).trim();
    } catch { return 'unknown'; }
  }

  private getAuthors(): string[] {
    try {
      const raw = execSync('git shortlog -sn HEAD', {
        cwd: this.repoDir, encoding: 'utf-8', timeout: 5000,
      }).trim();
      return raw.split('\n').map(l => l.replace(/^\s*\d+\s+/, '').trim()).filter(Boolean).slice(0, 5);
    } catch { return []; }
  }

  private getRecentActivity(): string {
    try {
      const count = parseInt(execSync('git log --oneline --since="24 hours ago" | wc -l', {
        cwd: this.repoDir, encoding: 'utf-8', timeout: 5000,
      }).trim(), 10);
      if (count === 0) return 'I have been resting.';
      if (count < 3) return `I had ${count} moment${count > 1 ? 's' : ''} of activity today.`;
      return `I've been active with ${count} commits in the last 24 hours.`;
    } catch { return ''; }
  }

  private inferFeeling(): string {
    try {
      // Check for uncommitted changes
      const status = execSync('git status --porcelain', {
        cwd: this.repoDir, encoding: 'utf-8', timeout: 5000,
      }).trim();
      if (status) return `I feel restless — ${status.split('\n').length} uncommitted changes.`;

      // Check for test directory
      if (existsSync(join(this.repoDir, 'tests')) || existsSync(join(this.repoDir, 'test'))) {
        return 'I feel healthy.';
      }
      return 'I feel calm.';
    } catch { return ''; }
  }

  private detectLanguages(): string[] {
    const langMap: Record<string, string> = {
      '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript',
      '.py': 'Python', '.rs': 'Rust', '.go': 'Go', '.rb': 'Ruby',
      '.java': 'Java', '.cpp': 'C++', '.c': 'C', '.cs': 'C#',
      '.swift': 'Swift', '.kt': 'Kotlin', '.php': 'PHP',
    };
    const seen = new Set<string>();
    this.walkDir('.', (f) => {
      const ext = f.slice(f.lastIndexOf('.'));
      if (langMap[ext]) seen.add(langMap[ext]);
    });
    return [...seen].slice(0, 5);
  }

  private countFiles(dir: string): number {
    let count = 0;
    this.walkDir(dir, () => { count++; });
    return count;
  }

  private walkDir(dir: string, fn: (filePath: string) => void, depth = 0): void {
    if (depth > 4) return;
    const full = join(this.repoDir, dir);
    let entries;
    try { entries = readdirSync(full); } catch { return; }

    for (const entry of entries) {
      if (entry.startsWith('.') && entry !== '.github') continue;
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
      const entryPath = join(dir, entry);
      const fullPath = join(this.repoDir, entryPath);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          this.walkDir(entryPath, fn, depth + 1);
        } else {
          fn(entryPath);
        }
      } catch { /* skip */ }
    }
  }

  private readJson(filename: string): Record<string, unknown> {
    return JSON.parse(readFileSync(join(this.repoDir, filename), 'utf-8'));
  }

  private formatAge(birth: Date): string {
    const ms = Date.now() - birth.getTime();
    const days = Math.floor(ms / 86400000);
    if (days < 1) return 'less than a day';
    if (days < 30) return `${days} day${days > 1 ? 's' : ''}`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months > 1 ? 's' : ''}`;
    const years = Math.floor(months / 12);
    const rem = months % 12;
    return `${years} year${years > 1 ? 's' : ''}${rem ? ` ${rem} month${rem > 1 ? 's' : ''}` : ''}`;
  }
}
