/**
 * Tests for TimeSense — temporal awareness.
 */

import { describe, it, expect } from 'vitest';
import { TimeSense } from '../../src/awareness/time-sense.js';

describe('TimeSense.now', () => {
  it('computes age from birth date', () => {
    const birth = new Date(Date.now() - 45 * 86_400_000).toISOString(); // 45 days ago
    const ts = new TimeSense({ birthDate: birth, lastCommitDate: new Date().toISOString() });
    const state = ts.now();

    expect(state.birthDate).toBe(birth);
    expect(state.age.milliseconds).toBeGreaterThan(44 * 86_400_000);
    // 45 days = 1 month (duration formatter uses months >= 30 days)
    expect(state.age.humanReadable).toContain('month');
  });

  it('handles missing birth date', () => {
    const ts = new TimeSense({});
    const state = ts.now();

    expect(state.birthDate).toBeNull();
    expect(state.age.humanReadable).toBe('unknown age');
  });

  it('detects isAwake when last commit is recent', () => {
    const ts = new TimeSense({ lastCommitDate: new Date().toISOString() });
    const state = ts.now();

    expect(state.isAwake).toBe(true);
    expect(state.pulseState).toBe('active');
  });

  it('detects sleeping when last commit is old', () => {
    const old = new Date(Date.now() - 3 * 86_400_000).toISOString(); // 3 days ago
    const ts = new TimeSense({ lastCommitDate: old });
    const state = ts.now();

    expect(state.isAwake).toBe(false);
    expect(state.pulseState).toBe('sleeping');
  });

  it('classifies time of day', () => {
    const ts = new TimeSense({});
    const state = ts.now();

    const validTimes = ['dawn', 'morning', 'midday', 'afternoon', 'evening', 'night'];
    expect(validTimes).toContain(state.timeOfDay);
  });

  it('classifies season', () => {
    const ts = new TimeSense({});
    const state = ts.now();

    const validSeasons = ['spring', 'summer', 'autumn', 'winter'];
    expect(validSeasons).toContain(state.season);
  });

  it('handles never having a commit', () => {
    const ts = new TimeSense({});
    const state = ts.now();

    expect(state.sinceLastCommit.humanReadable).toBe('never');
    expect(state.sinceLastCommit.milliseconds).toBe(Infinity);
    expect(state.pulseState).toBe('dormant');
  });
});

describe('TimeSense.describe', () => {
  it('describes age and recent activity', () => {
    const birth = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const last = new Date(Date.now() - 2 * 3_600_000).toISOString(); // 2 hours ago
    const ts = new TimeSense({ birthDate: birth, lastCommitDate: last });
    const desc = ts.describe();

    expect(desc).toContain('born');
    expect(desc).toContain('month');
  });

  it('describes long silence', () => {
    const last = new Date(Date.now() - 60 * 86_400_000).toISOString(); // 60 days ago
    const ts = new TimeSense({ lastCommitDate: last });
    const desc = ts.describe();

    expect(desc).toContain('quiet');
    expect(desc).toContain('long sleep');
  });

  it('describes unknown birth', () => {
    const ts = new TimeSense({});
    const desc = ts.describe();

    expect(desc).toContain("don't know");
  });
});

describe('TimeSense duration formatting', () => {
  it('formats years and months', () => {
    const birth = new Date(Date.now() - 400 * 86_400_000).toISOString(); // ~13 months
    const ts = new TimeSense({ birthDate: birth });
    const state = ts.now();

    expect(state.age.humanReadable).toContain('year');
  });

  it('formats hours', () => {
    const last = new Date(Date.now() - 5 * 3_600_000).toISOString(); // 5 hours ago
    const ts = new TimeSense({ lastCommitDate: last });
    const state = ts.now();

    expect(state.sinceLastCommit.humanReadable).toContain('hour');
  });

  it('formats minutes', () => {
    const last = new Date(Date.now() - 30 * 60_000).toISOString(); // 30 minutes ago
    const ts = new TimeSense({ lastCommitDate: last });
    const state = ts.now();

    expect(state.sinceLastCommit.humanReadable).toContain('minute');
  });
});
