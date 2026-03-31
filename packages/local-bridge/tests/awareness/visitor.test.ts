/**
 * Tests for VisitorAwareness — visitor detection and greeting.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { VisitorAwareness } from '../../src/awareness/visitor.js';
import type { Visitor, VisitorType } from '../../src/awareness/types.js';

let dataDir: string;
afterEach(() => { try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* ok */ } });

describe('VisitorAwareness.identify', () => {
  beforeEach(() => { dataDir = mkdtempSync(join(tmpdir(), 'cocapn-visitor-')); });

  it('classifies CI visitors', () => {
    const va = new VisitorAwareness(dataDir);
    const visitor = va.identify({ name: 'github-actions', isCI: true });
    expect(visitor.type).toBe('ci');
  });

  it('classifies agent visitors by user agent', () => {
    const va = new VisitorAwareness(dataDir);
    const visitor = va.identify({ userAgent: 'cocapn-fleet/1.0' });
    expect(visitor.type).toBe('agent');
  });

  it('classifies creator by auth method', () => {
    const va = new VisitorAwareness(dataDir);
    const visitor = va.identify({ name: 'Alice', authMethod: 'creator' });
    expect(visitor.type).toBe('creator');
  });

  it('classifies strangers by default', () => {
    const va = new VisitorAwareness(dataDir);
    const visitor = va.identify({ ip: '1.2.3.4' });
    expect(visitor.type).toBe('stranger');
  });

  it('tracks returning visitors', () => {
    const va = new VisitorAwareness(dataDir);
    const v1 = va.identify({ name: 'Bob', email: 'bob@test.com' });
    expect(v1.isReturning).toBe(false);

    const v2 = va.identify({ name: 'Bob', email: 'bob@test.com' });
    expect(v2.isReturning).toBe(true);
    expect(v2.visitCount).toBe(2);
  });

  it('persists visitors across instances', () => {
    const va1 = new VisitorAwareness(dataDir);
    va1.identify({ name: 'Carol', email: 'carol@test.com' });

    const va2 = new VisitorAwareness(dataDir);
    const visitor = va2.identify({ name: 'Carol', email: 'carol@test.com' });
    expect(visitor.visitCount).toBe(2);
  });
});

describe('VisitorAwareness.greet', () => {
  beforeEach(() => { dataDir = mkdtempSync(join(tmpdir(), 'cocapn-visitor-')); });

  function makeVisitor(overrides: Partial<Visitor> = {}): Visitor {
    return {
      id: 'test-id',
      type: 'stranger',
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      visitCount: 1,
      isReturning: false,
      ...overrides,
    };
  }

  it('greets strangers with curiosity', () => {
    const va = new VisitorAwareness(dataDir);
    const greeting = va.greet(makeVisitor({ type: 'stranger' }), 'my-repo');
    expect(greeting.tone).toBe('curious');
    expect(greeting.text).toContain('my-repo');
  });

  it('greets creators warmly', () => {
    const va = new VisitorAwareness(dataDir);
    const greeting = va.greet(makeVisitor({ type: 'creator' }), 'my-repo');
    expect(greeting.tone).toBe('warm');
  });

  it('greets returning creators with familiarity', () => {
    const va = new VisitorAwareness(dataDir);
    const greeting = va.greet(makeVisitor({ type: 'creator', isReturning: true }), 'my-repo');
    expect(greeting.text).toContain('Welcome back');
  });

  it('greets agents professionally', () => {
    const va = new VisitorAwareness(dataDir);
    const greeting = va.greet(makeVisitor({ type: 'agent' }), 'my-repo');
    expect(greeting.tone).toBe('professional');
    expect(greeting.text).toContain('fellow agent');
  });

  it('greets CI neutrally', () => {
    const va = new VisitorAwareness(dataDir);
    const greeting = va.greet(makeVisitor({ type: 'ci' }), 'my-repo');
    expect(greeting.tone).toBe('neutral');
    expect(greeting.text).toContain('heartbeat');
  });
});

describe('VisitorAwareness.getVisitors', () => {
  beforeEach(() => { dataDir = mkdtempSync(join(tmpdir(), 'cocapn-visitor-')); });

  it('returns all known visitors', () => {
    const va = new VisitorAwareness(dataDir);
    va.identify({ name: 'Alice', authMethod: 'creator' });
    va.identify({ name: 'Bot', userAgent: 'some-agent/1.0' });

    const all = va.getVisitors();
    expect(all.length).toBe(2);
  });
});
