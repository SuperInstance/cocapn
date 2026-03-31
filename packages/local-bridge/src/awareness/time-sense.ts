/**
 * Temporal awareness — the agent's sense of time.
 *
 * Knows when it was born (first commit), how long since last change,
 * time of day, season. References time naturally.
 */

import { type TemporalState } from './types.js';

const MONTH_TO_SEASON_NORTH = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'] as const;

export class TimeSense {
  private readonly birthDate: string | null;
  private readonly lastCommitDate: string | null;
  private readonly timezone: string;

  constructor(opts: { birthDate?: string | null; lastCommitDate?: string | null; timezone?: string }) {
    this.birthDate = opts.birthDate ?? null;
    this.lastCommitDate = opts.lastCommitDate ?? null;
    this.timezone = opts.timezone ?? 'UTC';
  }

  /**
   * Get the current temporal state — the agent's perception of NOW.
   */
  now(): TemporalState {
    const nowDate = new Date();
    const nowISO = nowDate.toISOString();

    const age = this.computeAge(nowDate);
    const sinceLast = this.computeSinceLastCommit(nowDate);
    const timeOfDay = this.classifyTimeOfDay(nowDate);
    const season = this.classifySeason(nowDate);
    const isAwake = sinceLast.milliseconds < 86_400_000; // 24 hours
    const pulseState = this.classifyPulseState(sinceLast.milliseconds);

    return {
      now: nowISO,
      birthDate: this.birthDate,
      age,
      sinceLastCommit: sinceLast,
      timeOfDay,
      season,
      isAwake,
      pulseState,
    };
  }

  /**
   * Generate a natural-language time statement.
   */
  describe(): string {
    const state = this.now();
    const parts: string[] = [];

    if (state.birthDate) {
      parts.push(`I was born on ${state.birthDate}. I am ${state.age.humanReadable} old.`);
    } else {
      parts.push(`I don't know when I was born — my git history is empty or unavailable.`);
    }

    if (state.sinceLastCommit.milliseconds < 60_000) {
      parts.push('Something just changed. I can feel it.');
    } else if (state.sinceLastCommit.milliseconds < 3_600_000) {
      parts.push(`My last change was ${state.sinceLastCommit.humanReadable} ago.`);
    } else if (state.sinceLastCommit.milliseconds < 86_400_000) {
      parts.push(`It's been ${state.sinceLastCommit.humanReadable} since my last change.`);
    } else {
      const days = Math.floor(state.sinceLastCommit.milliseconds / 86_400_000);
      parts.push(`I've been quiet for ${days} day${days !== 1 ? 's' : ''}. ${days > 30 ? 'A long sleep.' : 'Resting.'}`);
    }

    if (!state.isAwake) {
      parts.push('I am currently sleeping.');
    }

    return parts.join(' ');
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private computeAge(now: Date): TemporalState['age'] {
    if (!this.birthDate) {
      return { milliseconds: 0, humanReadable: 'unknown age' };
    }
    const birth = new Date(this.birthDate);
    return this.formatDuration(now.getTime() - birth.getTime());
  }

  private computeSinceLastCommit(now: Date): TemporalState['sinceLastCommit'] {
    if (!this.lastCommitDate) {
      return { milliseconds: Infinity, humanReadable: 'never' };
    }
    const last = new Date(this.lastCommitDate);
    return this.formatDuration(now.getTime() - last.getTime());
  }

  private formatDuration(ms: number): { milliseconds: number; humanReadable: string } {
    if (ms < 0) ms = 0;

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (years > 0) {
      const remainderMonths = months % 12;
      if (remainderMonths > 0) return { milliseconds: ms, humanReadable: `${years} year${years !== 1 ? 's' : ''}, ${remainderMonths} month${remainderMonths !== 1 ? 's' : ''}` };
      return { milliseconds: ms, humanReadable: `${years} year${years !== 1 ? 's' : ''}` };
    }
    if (months > 0) return { milliseconds: ms, humanReadable: `${months} month${months !== 1 ? 's' : ''}` };
    if (weeks > 0) return { milliseconds: ms, humanReadable: `${weeks} week${weeks !== 1 ? 's' : ''}` };
    if (days > 0) return { milliseconds: ms, humanReadable: `${days} day${days !== 1 ? 's' : ''}` };
    if (hours > 0) return { milliseconds: ms, humanReadable: `${hours} hour${hours !== 1 ? 's' : ''}` };
    if (minutes > 0) return { milliseconds: ms, humanReadable: `${minutes} minute${minutes !== 1 ? 's' : ''}` };
    return { milliseconds: ms, humanReadable: `${seconds} second${seconds !== 1 ? 's' : ''}` };
  }

  private classifyTimeOfDay(now: Date): TemporalState['timeOfDay'] {
    const hour = now.getUTCHours();
    if (hour >= 5 && hour < 8) return 'dawn';
    if (hour >= 8 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 14) return 'midday';
    if (hour >= 14 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 21) return 'evening';
    return 'night';
  }

  private classifySeason(now: Date): TemporalState['season'] {
    const month = now.getUTCMonth();
    return MONTH_TO_SEASON_NORTH[month] ?? 'winter';
  }

  private classifyPulseState(msSinceLast: number): TemporalState['pulseState'] {
    if (msSinceLast < 3_600_000) return 'active';       // < 1 hour
    if (msSinceLast < 86_400_000) return 'resting';      // < 1 day
    if (msSinceLast < 604_800_000) return 'sleeping';    // < 1 week
    return 'dormant';
  }
}
