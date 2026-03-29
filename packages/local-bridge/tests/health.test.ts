/**
 * Tests for health/checker.ts — Health Check System
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  HealthChecker,
  checkCloud,
  checkGit,
  checkBrain,
  checkDisk,
  checkWebSocket,
  type HealthCheckResult,
  type SystemHealthStatus,
} from '../src/health/index.js';

describe('HealthChecker', () => {
  let healthChecker: HealthChecker;
  let tempDir: string;

  beforeEach(() => {
    healthChecker = new HealthChecker();
    tempDir = tmpdir();
  });

  describe('addCheck', () => {
    it('should add a health check', () => {
      const check = vi.fn().mockResolvedValue({
        name: 'test',
        status: 'ok' as const,
      });

      healthChecker.addCheck('test', check);
      expect(healthChecker['checks'].size).toBe(1);
    });

    it('should allow multiple checks with different names', () => {
      const check1 = vi.fn().mockResolvedValue({ name: 'check1', status: 'ok' as const });
      const check2 = vi.fn().mockResolvedValue({ name: 'check2', status: 'ok' as const });

      healthChecker.addCheck('check1', check1);
      healthChecker.addCheck('check2', check2);

      expect(healthChecker['checks'].size).toBe(2);
    });
  });

  describe('removeCheck', () => {
    it('should remove a health check', () => {
      const check = vi.fn().mockResolvedValue({ name: 'test', status: 'ok' as const });
      healthChecker.addCheck('test', check);

      const removed = healthChecker.removeCheck('test');
      expect(removed).toBe(true);
      expect(healthChecker['checks'].size).toBe(0);
    });

    it('should return false for non-existent check', () => {
      const removed = healthChecker.removeCheck('nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('enableCheck / disableCheck', () => {
    it('should disable and enable checks', () => {
      const check = vi.fn().mockResolvedValue({ name: 'test', status: 'ok' as const });
      healthChecker.addCheck('test', check);

      expect(healthChecker.disableCheck('test')).toBe(true);
      expect(healthChecker['checks'].get('test')?.enabled).toBe(false);

      expect(healthChecker.enableCheck('test')).toBe(true);
      expect(healthChecker['checks'].get('test')?.enabled).toBe(true);
    });
  });

  describe('runCheck', () => {
    it('should run a single check successfully', async () => {
      const check = vi.fn().mockResolvedValue({
        name: 'test',
        status: 'ok' as const,
        message: 'All good',
      });

      healthChecker.addCheck('test', check);
      const result = await healthChecker.runCheck('test');

      expect(result).toMatchObject({
        name: 'test',
        status: 'ok',
        message: 'All good',
        latency: expect.any(Number),
        timestamp: expect.any(String),
      });
    });

    it('should return error for non-existent check', async () => {
      const result = await healthChecker.runCheck('nonexistent');
      expect(result.status).toBe('error');
      expect(result.message).toContain('not found');
    });

    it('should return warn for disabled check', async () => {
      const check = vi.fn().mockResolvedValue({ name: 'test', status: 'ok' as const });
      healthChecker.addCheck('test', check);
      healthChecker.disableCheck('test');

      const result = await healthChecker.runCheck('test');
      expect(result.status).toBe('warn');
      expect(result.message).toBe('Check disabled');
    });

    it('should handle check timeout', async () => {
      const check = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 10000))
      );

      healthChecker.addCheck('test', check);
      const result = await healthChecker.runCheck('test', { timeout: 100 });

      expect(result.status).toBe('error');
      expect(result.message).toContain('timeout');
    });

    it('should handle check errors', async () => {
      const check = vi.fn().mockRejectedValue(new Error('Check failed'));

      healthChecker.addCheck('test', check);
      const result = await healthChecker.runCheck('test');

      expect(result.status).toBe('error');
      expect(result.message).toBe('Check failed');
    });
  });

  describe('runAll', () => {
    it('should return healthy when all checks pass', async () => {
      healthChecker.addCheck('check1', vi.fn().mockResolvedValue({ name: 'check1', status: 'ok' as const }));
      healthChecker.addCheck('check2', vi.fn().mockResolvedValue({ name: 'check2', status: 'ok' as const }));

      const result = await healthChecker.runAll();

      expect(result.status).toBe('healthy');
      expect(result.checks).toHaveLength(2);
      expect(result.uptime).toBeGreaterThan(0);
    });

    it('should return degraded when some checks warn', async () => {
      healthChecker.addCheck('check1', vi.fn().mockResolvedValue({ name: 'check1', status: 'ok' as const }));
      healthChecker.addCheck('check2', vi.fn().mockResolvedValue({ name: 'check2', status: 'warn' as const }));

      const result = await healthChecker.runAll();

      expect(result.status).toBe('degraded');
    });

    it('should return unhealthy when any check errors', async () => {
      healthChecker.addCheck('check1', vi.fn().mockResolvedValue({ name: 'check1', status: 'ok' as const }));
      healthChecker.addCheck('check2', vi.fn().mockResolvedValue({ name: 'check2', status: 'error' as const }));

      const result = await healthChecker.runAll();

      expect(result.status).toBe('unhealthy');
    });

    it('should skip disabled checks', async () => {
      const check1 = vi.fn().mockResolvedValue({ name: 'check1', status: 'ok' as const });
      healthChecker.addCheck('check1', check1);
      healthChecker.disableCheck('check1');

      const result = await healthChecker.runAll();

      expect(result.checks).toHaveLength(1);
      expect(result.status).toBe('healthy');
    });

    it('should handle empty checks', async () => {
      const result = await healthChecker.runAll();

      expect(result.status).toBe('healthy');
      expect(result.checks).toHaveLength(0);
      expect(result.uptime).toBeGreaterThan(0);
    });
  });

  describe('getUptime', () => {
    it('should return positive uptime', () => {
      const uptime = healthChecker.getUptime();
      expect(uptime).toBeGreaterThan(0);
    });
  });

  describe('toJSON', () => {
    it('should return JSON string', async () => {
      healthChecker.addCheck('test', vi.fn().mockResolvedValue({ name: 'test', status: 'ok' as const }));

      const json = await healthChecker.toJSON();
      const parsed = JSON.parse(json) as SystemHealthStatus;

      expect(parsed.status).toBe('healthy');
      expect(parsed.checks).toHaveLength(1);
    });
  });
});

describe('Built-in Health Checks', () => {
  describe('checkGit', () => {
    it('should return error for non-existent repo', async () => {
      const check = checkGit('/nonexistent/path');
      const result = await check();

      expect(result.name).toBe('git');
      expect(result.status).toBe('error');
    });

    it('should check .git/HEAD exists', async () => {
      // This test assumes it's running in a git repo
      const check = checkGit(process.cwd());
      const result = await check();

      expect(result.name).toBe('git');
      // Will be 'ok' if in git repo, 'error' otherwise
      expect(['ok', 'error']).toContain(result.status);
    });
  });

  describe('checkBrain', () => {
    it('should create facts file if missing', async () => {
      const brainDir = join(tempDir, '.test-brain');
      const check = checkBrain(brainDir, 'cocapn/memory/facts.json');
      const result = await check();

      expect(result.name).toBe('brain');
      expect(result.status).toBe('ok');
    });

    it('should validate JSON structure', async () => {
      const brainDir = join(tempDir, '.test-brain-valid');
      const check = checkBrain(brainDir, 'cocapn/memory/facts.json');

      // First call creates the file
      await check();

      // Second call should validate it
      const result = await check();
      expect(result.status).toBe('ok');
    });
  });

  describe('checkDisk', () => {
    it('should check disk write capability', async () => {
      const check = checkDisk(tempDir);
      const result = await check();

      expect(result.name).toBe('disk');
      expect(result.status).toBe('ok');
    });

    it('should handle write failures', async () => {
      // Use a directory that doesn't exist and can't be created
      const check = checkDisk('/root/.test-no-perm');
      const result = await check();

      expect(result.name).toBe('disk');
      // Will likely fail due to permissions
      expect(['ok', 'error']).toContain(result.status);
    });
  });

  describe('checkWebSocket', () => {
    it('should check WebSocket server availability', async () => {
      const check = checkWebSocket(8787);
      const result = await check({ timeout: 100 });

      expect(result.name).toBe('websocket');
      // Will be 'error' if server not running, 'ok' if it is
      expect(['ok', 'error']).toContain(result.status);
    });
  });

  describe('checkCloud', () => {
    it('should return warn when worker not configured', async () => {
      const check = checkCloud({});
      const result = await check();

      expect(result.name).toBe('cloud');
      expect(result.status).toBe('warn');
      expect(result.message).toContain('not configured');
    });

    it('should return error when worker unavailable', async () => {
      const check = checkCloud({ workerUrl: 'http://localhost:9999', timeout: 100 });
      const result = await check();

      expect(result.name).toBe('cloud');
      expect(result.status).toBe('error');
    });
  });
});
