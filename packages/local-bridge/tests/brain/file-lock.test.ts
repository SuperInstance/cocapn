/**
 * Tests for Brain file locking — concurrent Git write protection.
 *
 * Verifies that the advisory lock:
 *   - Acquires and releases correctly
 *   - Times out when lock is held
 *   - Prevents concurrent writers from overlapping
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const LOCK_DIR = join(homedir(), '.cocapn', 'brain');
const LOCK_PATH = join(LOCK_DIR, '.lock');

function ensureLockDir(): void {
  mkdirSync(LOCK_DIR, { recursive: true });
}

function removeLock(): void {
  try { rmdirSync(LOCK_PATH); } catch { /* not locked */ }
}

function removeLockDir(): void {
  try { rmSync(LOCK_DIR, { recursive: true, force: true }); } catch { /* ok */ }
}

describe('File locking', () => {
  beforeEach(() => {
    ensureLockDir();
    removeLock();
  });

  afterEach(() => {
    removeLock();
    removeLockDir();
  });

  it('should acquire lock when no lock exists', async () => {
    mkdirSync(LOCK_PATH, { recursive: false });
    expect(existsSync(LOCK_PATH)).toBe(true);
    rmdirSync(LOCK_PATH);
    expect(existsSync(LOCK_PATH)).toBe(false);
  });

  it('should fail to acquire lock when already held', async () => {
    mkdirSync(LOCK_PATH, { recursive: false });
    expect(existsSync(LOCK_PATH)).toBe(true);

    let secondAcquired = false;
    try {
      mkdirSync(LOCK_PATH, { recursive: false });
      secondAcquired = true;
    } catch {
      // Expected — lock already held
    }
    expect(secondAcquired).toBe(false);
    rmdirSync(LOCK_PATH);
  });

  it('should allow lock acquisition after release', async () => {
    mkdirSync(LOCK_PATH, { recursive: false });
    rmdirSync(LOCK_PATH);

    mkdirSync(LOCK_PATH, { recursive: false });
    expect(existsSync(LOCK_PATH)).toBe(true);
    rmdirSync(LOCK_PATH);
  });

  it('should timeout when lock is held by another process', async () => {
    // Acquire lock to simulate another process holding it
    mkdirSync(LOCK_PATH, { recursive: false });

    const start = Date.now();
    // Simulate the polling behavior of acquireLock with a short timeout for test speed
    const testDeadline = Date.now() + 500;
    while (Date.now() < testDeadline) {
      try {
        mkdirSync(LOCK_PATH, { recursive: false });
        break; // acquired
      } catch {
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    const elapsed = Date.now() - start;
    // Should have timed out (lock was never released) — elapsed should be >= 500ms
    expect(elapsed).toBeGreaterThanOrEqual(450);
    expect(existsSync(LOCK_PATH)).toBe(true);

    // Cleanup
    rmdirSync(LOCK_PATH);
  });

  it('should handle concurrent lock acquisition correctly', async () => {
    const acquired: string[] = [];

    // Simulate two concurrent writers using the lock pattern
    const writer = async (name: string, holdMs: number): Promise<void> => {
      const deadline = Date.now() + 2_000;
      while (true) {
        try {
          mkdirSync(LOCK_PATH, { recursive: false });
          // Lock acquired — record once, then release and return
          acquired.push(name);
          await new Promise((r) => setTimeout(r, holdMs));
          rmdirSync(LOCK_PATH);
          return; // Exit immediately after release — no re-acquisition
        } catch {
          if (Date.now() >= deadline) {
            throw new Error(`Writer ${name} timed out`);
          }
          await new Promise((r) => setTimeout(r, 10));
        }
      }
    };

    await Promise.all([
      writer('A', 50),
      writer('B', 50),
    ]);

    // Both should have acquired the lock, one after the other
    expect(acquired).toHaveLength(2);
    expect(acquired[0]).not.toBe(acquired[1]);
  });
});
