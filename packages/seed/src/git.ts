import { execSync } from 'node:child_process';

export interface GitSelf {
  born: string; commits: number; files: number; lines: number;
  recent: Array<{ date: string; msg: string }>;
  authors: string[]; pulse: 'active' | 'resting' | 'dormant';
}

function git(cmd: string, dir: string): string {
  try { return execSync(`git ${cmd}`, { cwd: dir, encoding: 'utf-8', timeout: 5000 }).trim(); }
  catch { return ''; }
}

export function perceive(dir: string): GitSelf {
  const born = git('log --reverse --format=%ai --max-count=1', dir);
  const commits = parseInt(git('rev-list --count HEAD', dir)) || 0;
  const files = parseInt(git('ls-files | wc -l', dir)) || 0;
  const lines = parseInt(git("ls-files | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}'", dir)) || 0;

  const recentRaw = git('log -5 --format="%ai|%s"', dir);
  const recent = recentRaw ? recentRaw.split('\n').filter(Boolean).map(l => {
    const [date, ...msg] = l.split('|');
    return { date, msg: msg.join('|') };
  }) : [];

  const authorsRaw = git('shortlog -sn HEAD', dir);
  const authors = authorsRaw ? authorsRaw.split('\n').map(l => l.replace(/^\s*\d+\s+/, '')).filter(Boolean) : [];

  const lastDays = parseInt(git('log -1 --format=%ct', dir)) ?
    (Date.now() / 1000 - parseInt(git('log -1 --format=%ct', dir))) / 86400 : 999;
  const pulse = lastDays < 1 ? 'active' as const : lastDays < 30 ? 'resting' as const : 'dormant' as const;

  return { born, commits, files, lines, recent, authors, pulse };
}

export function narrate(dir: string): string {
  const s = perceive(dir);
  const parts: string[] = [];
  if (s.born) parts.push(`I was born ${s.born}.`);
  parts.push(`I have ${s.commits} memories, ${s.files} files, ${s.lines} lines.`);
  if (s.authors.length) parts.push(`My creators: ${s.authors.join(', ')}.`);
  parts.push(`I feel ${s.pulse}.`);
  if (s.recent.length) {
    parts.push('Recent memories:');
    for (const r of s.recent.slice(0, 3))
      parts.push(`  - ${r.date}: ${r.msg}`);
  }
  return parts.join('\n');
}
