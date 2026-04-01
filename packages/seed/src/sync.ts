/**
 * Sync — fork synchronization for cocapn verticals.
 *
 * Solves the #1 problem: 5 product repos forked from same source.
 * - detectUpstream(): Check if there's an upstream repo
 * - mergeUpstream(): Merge upstream changes, preserving local customizations
 * - conflictReport(): Show what conflicts exist
 *
 * Zero dependencies. Uses only Node.js built-ins.
 */

import { execSync } from 'node:child_process';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface UpstreamInfo {
  hasUpstream: boolean;
  remote: string;
  url: string;
  branch: string;
  behind: number;
  ahead: number;
}

export interface ConflictEntry {
  file: string;
  status: 'both-modified' | 'both-added' | 'both-deleted' | 'deleted-by-them' | 'deleted-by-us';
}

export interface MergeResult {
  success: boolean;
  conflicts: ConflictEntry[];
  mergedFiles: string[];
  message: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function git(args: string, dir: string, opts?: { timeout?: number }): string {
  try {
    return execSync(`git ${args}`, {
      cwd: dir,
      encoding: 'utf-8',
      timeout: opts?.timeout ?? 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Detect if this repo has an upstream remote and return info about it.
 * Checks 'upstream' first, then 'origin' (in case of same-fork detection).
 */
export function detectUpstream(repoDir: string): UpstreamInfo {
  const remotes = git('remote', repoDir);
  const hasUpstream = remotes.split('\n').includes('upstream');
  const remote = hasUpstream ? 'upstream' : remotes.split('\n').includes('origin') ? 'origin' : '';

  if (!remote) {
    return { hasUpstream: false, remote: '', url: '', branch: '', behind: 0, ahead: 0 };
  }

  const url = git(`remote get-url ${remote}`, repoDir);
  const branch = git('rev-parse --abbrev-ref HEAD', repoDir) || 'main';

  // Fetch to get accurate counts
  git(`fetch ${remote} --quiet`, repoDir, { timeout: 30000 });

  let behind = 0;
  let ahead = 0;

  const upstreamBranch = `${remote}/${branch}`;
  const hasUpstreamBranch = git(`rev-parse --verify ${upstreamBranch}`, repoDir);
  if (hasUpstreamBranch) {
    const revList = git(`rev-list --left-right --count ${upstreamBranch}...HEAD`, repoDir);
    const parts = revList.split(/\s+/);
    if (parts.length === 2) {
      behind = parseInt(parts[0], 10) || 0;
      ahead = parseInt(parts[1], 10) || 0;
    }
  }

  return { hasUpstream: hasUpstream || remote === 'origin', remote, url, branch, behind, ahead };
}

/**
 * Merge upstream changes into the current branch.
 * Preserves local customizations by using a merge strategy that favors
 * local changes on conflict (can be overridden).
 */
export function mergeUpstream(
  repoDir: string,
  opts?: { remote?: string; branch?: string; strategy?: 'merge' | 'rebase' | 'ours' | 'theirs' },
): MergeResult {
  const info = detectUpstream(repoDir);
  if (!info.remote) {
    return { success: false, conflicts: [], mergedFiles: [], message: 'No upstream remote detected' };
  }

  const remote = opts?.remote ?? info.remote;
  const branch = opts?.branch ?? info.branch;
  const strategy = opts?.strategy ?? 'merge';
  const upstreamRef = `${remote}/${branch}`;

  // Ensure we have latest
  git(`fetch ${remote} --quiet`, repoDir, { timeout: 30000 });

  const hasUpstreamBranch = git(`rev-parse --verify ${upstreamRef}`, repoDir);
  if (!hasUpstreamBranch) {
    return { success: false, conflicts: [], mergedFiles: [], message: `No upstream branch ${upstreamRef}` };
  }

  if (strategy === 'rebase') {
    const result = git(`rebase ${upstreamRef}`, repoDir, { timeout: 60000 });
    if (!result && git('diff --name-only --diff-filter=U', repoDir)) {
      // Rebase conflict — abort and report
      git('rebase --abort', repoDir);
      return { success: false, conflicts: conflictReport(repoDir).conflicts, mergedFiles: [], message: 'Rebase had conflicts, aborted' };
    }
    const mergedFiles = git(`diff --name-only HEAD@{1}..HEAD`, repoDir).split('\n').filter(Boolean);
    return { success: true, conflicts: [], mergedFiles, message: `Rebased onto ${upstreamRef}` };
  }

  // Merge with conflict strategy
  let mergeArg = `${upstreamRef}`;
  if (strategy === 'ours') mergeArg += ' --strategy-option ours';
  else if (strategy === 'theirs') mergeArg += ' --strategy-option theirs';

  const result = git(`merge ${mergeArg} --no-edit`, repoDir, { timeout: 60000 });
  const conflicts = conflictReport(repoDir);

  if (conflicts.conflicts.length > 0) {
    return { success: false, ...conflicts, mergedFiles: [], message: `Merge has ${conflicts.conflicts.length} conflicts` };
  }

  const mergedFiles = git('diff --name-only HEAD@{1}..HEAD', repoDir).split('\n').filter(Boolean);
  return { success: true, conflicts: [], mergedFiles, message: `Merged ${upstreamRef} (${mergedFiles.length} files changed)` };
}

/**
 * Report conflicts in the current working tree / index.
 */
export function conflictReport(repoDir: string): { conflicts: ConflictEntry[]; clean: boolean } {
  const raw = git('diff --name-only --diff-filter=U', repoDir);
  if (!raw) return { conflicts: [], clean: true };

  const files = raw.split('\n').filter(Boolean);
  const conflicts: ConflictEntry[] = files.map(file => {
    // Determine conflict type from git ls-files -u
    const stageInfo = git(`ls-files -u ${file}`, repoDir);
    let status: ConflictEntry['status'] = 'both-modified';
    if (stageInfo.includes('1\t') && stageInfo.includes('3\t') && !stageInfo.includes('2\t')) {
      status = 'deleted-by-them';
    } else if (stageInfo.includes('1\t') && stageInfo.includes('2\t') && !stageInfo.includes('3\t')) {
      status = 'deleted-by-us';
    }
    return { file, status };
  });

  return { conflicts, clean: conflicts.length === 0 };
}

/**
 * Generate a sync status summary for display.
 */
export function syncStatus(repoDir: string): string {
  const info = detectUpstream(repoDir);
  const lines: string[] = [];

  if (!info.hasUpstream) {
    return 'No upstream remote detected. Configure one with:\n  git remote add upstream <url>';
  }

  lines.push(`Upstream: ${info.remote} (${info.url})`);
  lines.push(`Branch:   ${info.branch}`);

  if (info.behind > 0) lines.push(`Behind:   ${info.behind} commits`);
  if (info.ahead > 0) lines.push(`Ahead:    ${info.ahead} commits`);
  if (info.behind === 0 && info.ahead === 0) lines.push('Status:   Up to date');

  const report = conflictReport(repoDir);
  if (report.conflicts.length > 0) {
    lines.push(`Conflicts: ${report.conflicts.length}`);
    for (const c of report.conflicts) lines.push(`  ${c.status}: ${c.file}`);
  }

  return lines.join('\n');
}
