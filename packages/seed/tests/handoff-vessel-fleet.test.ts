import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { VesselManifest } from '../src/vessel.js';
import { HandoffProtocol } from '../src/handoff.js';
import { FleetManager } from '../src/fleet.js';
import { LogStore } from '../src/atomic-log.js';
import type { LogEntry, Task } from '../src/handoff.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'cocapn-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// VesselManifest
// ═══════════════════════════════════════════════════════════════════════════════

describe('VesselManifest', () => {
  it('constructs with defaults', () => {
    const vm = new VesselManifest({ name: 'test-vessel', type: 'fishing' });
    expect(vm.name).toBe('test-vessel');
    expect(vm.type).toBe('fishing');
    expect(vm.capabilities).toEqual([]);
    expect(vm.captain).toBe('unknown');
    expect(vm.cocapn).toBe('0.1.0');
    expect(vm.trustScores.size).toBe(0);
  });

  it('constructs with all fields', () => {
    const trust = new Map([['other-vessel', 0.9]]);
    const vm = new VesselManifest({
      name: 'alice',
      type: 'dm',
      capabilities: ['chat', 'dice-rolling'],
      captain: 'Alice',
      cocapn: '0.2.0',
      trustScores: trust,
    });
    expect(vm.capabilities).toEqual(['chat', 'dice-rolling']);
    expect(vm.captain).toBe('Alice');
    expect(vm.trustScores.get('other-vessel')).toBe(0.9);
  });

  it('manages trust scores', () => {
    const vm = new VesselManifest({ name: 'test', type: 'personal' });
    expect(vm.getTrust('x')).toBe(0.5); // default
    vm.setTrust('x', 0.8);
    expect(vm.getTrust('x')).toBe(0.8);
  });

  it('clamps trust scores to 0–1', () => {
    const vm = new VesselManifest({ name: 'test', type: 'personal' });
    vm.setTrust('x', -0.5);
    expect(vm.getTrust('x')).toBe(0);
    vm.setTrust('x', 1.5);
    expect(vm.getTrust('x')).toBe(1);
  });

  it('checks capabilities', () => {
    const vm = new VesselManifest({
      name: 'test', type: 'maker', capabilities: ['chat', 'git'],
    });
    expect(vm.can('chat')).toBe(true);
    expect(vm.can('fishing')).toBe(false);
  });

  it('adds and removes capabilities', () => {
    const vm = new VesselManifest({ name: 'test', type: 'personal' });
    vm.addCapability('chat');
    vm.addCapability('chat'); // no-op
    expect(vm.capabilities).toEqual(['chat']);
    vm.removeCapability('chat');
    expect(vm.capabilities).toEqual([]);
  });

  it('exports to JSON and back', () => {
    const vm = new VesselManifest({
      name: 'alice', type: 'fishing',
      capabilities: ['chat'], captain: 'Alice',
      trustScores: new Map([['bob', 0.7]]),
    });
    const json = vm.export();
    expect(json.name).toBe('alice');
    expect(json.trustScores['bob']).toBe(0.7);

    const restored = VesselManifest.fromJSON(json);
    expect(restored.name).toBe('alice');
    expect(restored.getTrust('bob')).toBe(0.7);
    expect(restored.capabilities).toEqual(['chat']);
  });

  it('reads from repo cocapn.json', () => {
    writeFileSync(
      join(testDir, 'cocapn.json'),
      JSON.stringify({
        vessel: {
          name: 'test-boat',
          type: 'fishing',
          capabilities: ['sonar', 'catch-log'],
          captain: 'Hank',
          cocapn: '0.3.0',
          trustScores: { 'other-boat': 0.6 },
        },
      }),
    );
    const vm = VesselManifest.fromRepo(testDir);
    expect(vm.name).toBe('test-boat');
    expect(vm.type).toBe('fishing');
    expect(vm.can('sonar')).toBe(true);
    expect(vm.getTrust('other-boat')).toBe(0.6);
  });

  it('returns default when cocapn.json missing', () => {
    const vm = VesselManifest.fromRepo(testDir);
    expect(vm.type).toBe('unknown');
    expect(vm.capabilities).toEqual([]);
  });

  it('returns default on malformed cocapn.json', () => {
    writeFileSync(join(testDir, 'cocapn.json'), 'not json');
    const vm = VesselManifest.fromRepo(testDir);
    expect(vm.type).toBe('unknown');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HandoffProtocol
// ═══════════════════════════════════════════════════════════════════════════════

describe('HandoffProtocol', () => {
  const makeEntries = (n: number): LogEntry[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `entry-${i}`,
      vessel: 'sender',
      timestamp: Date.now() - (n - i) * 1000,
      author: 'captain' as const,
      type: 'message' as const,
      channel: 'chat',
      content: `Message ${i}`,
    }));

  it('prepares a handoff package with correct fields', () => {
    const hp = new HandoffProtocol({
      vesselId: 'v1',
      agentName: 'agent1',
      secret: 'secret123',
      capabilities: ['chat'],
    });
    const entries = makeEntries(5);
    const pkg = hp.prepare('receiver-1', entries);

    expect(pkg.vesselId).toBe('v1');
    expect(pkg.senderAgent).toBe('agent1');
    expect(pkg.receiverAgent).toBe('receiver-1');
    expect(pkg.contextEntries).toHaveLength(5);
    expect(pkg.capabilities).toEqual(['chat']);
    expect(pkg.signature).toBeTruthy();
    expect(pkg.timestamp).toBeGreaterThan(0);
  });

  it('respects maxEntries option', () => {
    const hp = new HandoffProtocol({ vesselId: 'v1', agentName: 'a' });
    const entries = makeEntries(200);
    const pkg = hp.prepare('r1', entries, { maxEntries: 50 });
    expect(pkg.contextEntries).toHaveLength(50);
    // Should keep the last 50
    expect(pkg.contextEntries[0].content).toBe('Message 150');
  });

  it('strips entries matching privacy boundaries', () => {
    const hp = new HandoffProtocol({ vesselId: 'v1', agentName: 'a' });
    const entries: LogEntry[] = [
      { id: '1', vessel: 'v1', timestamp: 1, author: 'captain', type: 'message', channel: 'public.chat', content: 'hi' },
      { id: '2', vessel: 'v1', timestamp: 2, author: 'captain', type: 'message', channel: 'private.notes', content: 'secret' },
      { id: '3', vessel: 'v1', timestamp: 3, author: 'captain', type: 'message', channel: 'public', content: 'ok', tags: ['private.diary'] },
    ];
    const pkg = hp.prepare('r1', entries, { privacyBoundaries: ['private.'] });
    expect(pkg.contextEntries).toHaveLength(1);
    expect(pkg.contextEntries[0].id).toBe('1');
  });

  it('verifies a valid HMAC signature', () => {
    const hp = new HandoffProtocol({ vesselId: 'v1', agentName: 'a', secret: 's3cret' });
    const pkg = hp.prepare('r1', makeEntries(3));
    expect(hp.verify(pkg)).toBe(true);
  });

  it('rejects tampered signature', () => {
    const hp = new HandoffProtocol({ vesselId: 'v1', agentName: 'a', secret: 's3cret' });
    const pkg = hp.prepare('r1', makeEntries(3));
    pkg.signature = 'tampered';
    expect(hp.verify(pkg)).toBe(false);
  });

  it('accepts unsigned packages when no secret configured', () => {
    const hp = new HandoffProtocol({ vesselId: 'v1', agentName: 'a' });
    const pkg = hp.prepare('r1', makeEntries(2));
    expect(pkg.signature).toBe('');
    expect(hp.verify(pkg)).toBe(true);
  });

  it('sends a valid package and gets receipt', async () => {
    const hp = new HandoffProtocol({ vesselId: 'v1', agentName: 'a', secret: 'sec' });
    const pkg = hp.prepare('r1', makeEntries(10));
    const receipt = await hp.send(pkg);
    expect(receipt.accepted).toBe(true);
    expect(receipt.entriesReceived).toBe(10);
  });

  it('rejects send without signature when secret is set', async () => {
    const hp = new HandoffProtocol({ vesselId: 'v1', agentName: 'a', secret: 'sec' });
    const receipt = await hp.send({
      vesselId: 'v1', senderAgent: 'a', receiverAgent: 'r1',
      trustScore: 0.5, contextEntries: [], activeState: {},
      pendingTasks: [], capabilities: [], privacyBoundaries: [],
      timestamp: Date.now(), signature: '',
    });
    expect(receipt.accepted).toBe(false);
    expect(receipt.error).toContain('signature');
  });

  it('receives a valid package', async () => {
    const hp = new HandoffProtocol({ vesselId: 'v1', agentName: 'a', secret: 'sec' });
    const pkg = hp.prepare('r1', makeEntries(5));
    const acceptance = await hp.receive(pkg);
    expect(acceptance.ok).toBe(true);
    expect(acceptance.appliedEntries).toBe(5);
  });

  it('rejects receive with bad signature', async () => {
    const hp = new HandoffProtocol({ vesselId: 'v1', agentName: 'a', secret: 'sec' });
    const pkg = hp.prepare('r1', makeEntries(3));
    pkg.signature = 'bad';
    const acceptance = await hp.receive(pkg);
    expect(acceptance.ok).toBe(false);
  });

  it('warns on low trust score', async () => {
    const hp = new HandoffProtocol({
      vesselId: 'v1', agentName: 'a', secret: 'sec',
      trustFn: () => 0.1,
    });
    const pkg = hp.prepare('r1', makeEntries(1));
    const acceptance = await hp.receive(pkg);
    expect(acceptance.ok).toBe(true);
    expect(acceptance.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('Low trust')]),
    );
  });

  it('applies entries to a LogStore', () => {
    const hp = new HandoffProtocol({ vesselId: 'v1', agentName: 'a', secret: 'sec' });
    const store = new LogStore(testDir, 'receiver');
    const pkg = hp.prepare('r1', makeEntries(3));

    const applied = hp.apply(pkg, (partial) => store.append(partial));
    expect(applied).toHaveLength(3);
    expect(applied[0].author).toBe('a2a');
    expect(applied[0].type).toBe('handoff');
    expect(applied[0].tags).toContain('handoff');
    expect(applied[0].tags).toContain('from:a');
  });

  it('applies with custom tasks and state', () => {
    const hp = new HandoffProtocol({ vesselId: 'v1', agentName: 'a' });
    const tasks: Task[] = [
      { id: 't1', title: 'Review PR', status: 'pending', priority: 1 },
    ];
    const pkg = hp.prepare('r1', makeEntries(2), {
      state: { mode: 'active', branch: 'main' },
      tasks,
    });
    expect(pkg.activeState).toEqual({ mode: 'active', branch: 'main' });
    expect(pkg.pendingTasks).toEqual(tasks);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FleetManager
// ═══════════════════════════════════════════════════════════════════════════════

describe('FleetManager', () => {
  const vesselManifest = (name: string, type: string, caps: string[]) => ({
    name, type, capabilities: caps,
    captain: 'test', cocapn: '0.1.0', trustScores: {},
  });

  it('registers and retrieves vessels', () => {
    const fm = new FleetManager();
    fm.register('v1', vesselManifest('Alpha', 'fishing', ['sonar']));
    const info = fm.get('v1');
    expect(info).toBeDefined();
    expect(info!.manifest.name).toBe('Alpha');
    expect(info!.status).toBe('online');
  });

  it('unregisters vessels and cleans connections', () => {
    const fm = new FleetManager();
    fm.register('v1', vesselManifest('A', 'fishing', []));
    fm.register('v2', vesselManifest('B', 'dm', []));
    fm.connect('v1', 'v2');
    fm.unregister('v1');
    expect(fm.get('v1')).toBeUndefined();
    expect(fm.get('v2')!.connections).toEqual([]);
  });

  it('sets vessel status', () => {
    const fm = new FleetManager();
    fm.register('v1', vesselManifest('A', 'fishing', []));
    fm.setStatus('v1', 'busy');
    expect(fm.get('v1')!.status).toBe('busy');
  });

  it('connects vessels bidirectionally', () => {
    const fm = new FleetManager();
    fm.register('v1', vesselManifest('A', 'fishing', []));
    fm.register('v2', vesselManifest('B', 'dm', []));
    fm.connect('v1', 'v2');
    expect(fm.get('v1')!.connections).toContain('v2');
    expect(fm.get('v2')!.connections).toContain('v1');
  });

  it('disconnects vessels', () => {
    const fm = new FleetManager();
    fm.register('v1', vesselManifest('A', 'fishing', []));
    fm.register('v2', vesselManifest('B', 'dm', []));
    fm.connect('v1', 'v2');
    fm.disconnect('v1', 'v2');
    expect(fm.get('v1')!.connections).toEqual([]);
    expect(fm.get('v2')!.connections).toEqual([]);
  });

  it('discovers by capability', () => {
    const fm = new FleetManager();
    fm.register('v1', vesselManifest('A', 'fishing', ['sonar', 'catch-log']));
    fm.register('v2', vesselManifest('B', 'dm', ['dice-rolling']));
    fm.register('v3', vesselManifest('C', 'fishing', ['sonar']));

    const found = fm.discover({ capability: 'sonar' });
    expect(found).toHaveLength(2);
    expect(found.map(v => v.vesselId).sort()).toEqual(['v1', 'v3']);
  });

  it('discovers by type', () => {
    const fm = new FleetManager();
    fm.register('v1', vesselManifest('A', 'fishing', []));
    fm.register('v2', vesselManifest('B', 'dm', []));
    fm.register('v3', vesselManifest('C', 'fishing', []));

    const found = fm.discover({ type: 'fishing' });
    expect(found).toHaveLength(2);
  });

  it('discovers by status', () => {
    const fm = new FleetManager();
    fm.register('v1', vesselManifest('A', 'fishing', []));
    fm.register('v2', vesselManifest('B', 'dm', []));
    fm.setStatus('v2', 'offline');

    const found = fm.discover({ status: 'online' });
    expect(found).toHaveLength(1);
    expect(found[0].vesselId).toBe('v1');
  });

  it('discovers by name substring', () => {
    const fm = new FleetManager();
    fm.register('v1', vesselManifest('Alpha Boat', 'fishing', []));
    fm.register('v2', vesselManifest('Beta Boat', 'dm', []));
    fm.register('v3', vesselManifest('Gamma', 'personal', []));

    const found = fm.discover({ nameContains: 'boat' });
    expect(found).toHaveLength(2);
  });

  it('broadcasts with no filter reaches all online', () => {
    const fm = new FleetManager('self');
    fm.register('v1', vesselManifest('A', 'fishing', []));
    fm.register('v2', vesselManifest('B', 'dm', []));
    fm.setStatus('v2', 'offline');

    const receipts = fm.broadcast('hello');
    expect(receipts).toHaveLength(2);
    expect(receipts.find(r => r.vesselId === 'v1')!.delivered).toBe(true);
    expect(receipts.find(r => r.vesselId === 'v2')!.delivered).toBe(false);
  });

  it('broadcasts with capability filter', () => {
    const fm = new FleetManager('self');
    fm.register('v1', vesselManifest('A', 'fishing', ['sonar']));
    fm.register('v2', vesselManifest('B', 'dm', ['dice-rolling']));

    const receipts = fm.broadcast('ping', { capability: 'sonar' });
    expect(receipts).toHaveLength(1);
    expect(receipts[0].vesselId).toBe('v1');
  });

  it('broadcasts with exclude filter', () => {
    const fm = new FleetManager('self');
    fm.register('v1', vesselManifest('A', 'fishing', []));
    fm.register('v2', vesselManifest('B', 'dm', []));

    const receipts = fm.broadcast('ping', { exclude: ['v1'] });
    expect(receipts).toHaveLength(1);
    expect(receipts[0].vesselId).toBe('v2');
  });

  it('broadcasts with minTrust filter', () => {
    const fm = new FleetManager('self');
    fm.register('v1', { ...vesselManifest('A', 'fishing', []), trustScores: { self: 0.9 } });
    fm.register('v2', { ...vesselManifest('B', 'dm', []), trustScores: { self: 0.2 } });

    const receipts = fm.broadcast('ping', { minTrust: 0.5 });
    expect(receipts).toHaveLength(1);
    expect(receipts[0].vesselId).toBe('v1');
  });

  it('produces status report', () => {
    const fm = new FleetManager();
    fm.register('v1', vesselManifest('A', 'fishing', ['sonar']));
    fm.register('v2', vesselManifest('B', 'dm', ['dice-rolling']));
    fm.setStatus('v2', 'offline');

    const report = fm.status();
    expect(report.totalVessels).toBe(2);
    expect(report.onlineVessels).toBe(1);
    expect(report.offlineVessels).toBe(1);
    expect(report.capabilityIndex['sonar']).toBe(1);
    expect(report.typeDistribution['fishing']).toBe(1);
  });

  it('produces topology graph', () => {
    const fm = new FleetManager();
    fm.register('v1', vesselManifest('A', 'fishing', []));
    fm.register('v2', vesselManifest('B', 'dm', []));
    fm.register('v3', vesselManifest('C', 'personal', []));
    fm.connect('v1', 'v2');
    fm.connect('v1', 'v3');

    const topo = fm.topology();
    expect(topo.nodes).toHaveLength(3);
    expect(topo.edges).toHaveLength(2);
    expect(topo.adjacency['v1']).toContain('v2');
    expect(topo.adjacency['v1']).toContain('v3');
    expect(topo.adjacency['v2']).toContain('v1');
  });
});
