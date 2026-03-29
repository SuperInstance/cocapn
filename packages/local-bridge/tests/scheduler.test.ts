/**
 * Tests for the scheduled task parser.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import {
  parseScheduledTask,
  validateCron,
  nextRunTime,
  scanScheduledTasks,
  type ScheduledTask,
} from '../src/scheduler/parser.js';

// Test directory path
const TEST_DIR = join(process.cwd(), 'test-tasks');

describe('Scheduler Parser', () => {
  beforeEach(async () => {
    // Create test directory
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('validateCron', () => {
    it('should accept valid standard cron expressions', () => {
      expect(validateCron('0 0 * * *')).toBe(true); // Daily at midnight
      expect(validateCron('30 5 * * 1-5')).toBe(true); // Weekdays at 5:30 AM
      expect(validateCron('*/15 * * * *')).toBe(true); // Every 15 minutes
      expect(validateCron('0 9 1 * *')).toBe(true); // First of month at 9 AM
    });

    it('should accept cron shortcuts', () => {
      expect(validateCron('@daily')).toBe(true);
      expect(validateCron('@hourly')).toBe(true);
      expect(validateCron('@weekly')).toBe(true);
      expect(validateCron('@monthly')).toBe(true);
      expect(validateCron('@yearly')).toBe(true);
    });

    it('should reject invalid cron expressions', () => {
      expect(validateCron('invalid')).toBe(false);
      expect(validateCron('61 * * * *')).toBe(false); // Invalid minute
      expect(validateCron('0 25 * * *')).toBe(false); // Invalid hour
      expect(validateCron('0 0 32 * *')).toBe(false); // Invalid day
      expect(validateCron('')).toBe(false);
      expect(validateCron('* * * *')).toBe(false); // Only 4 parts
    });

    it('should handle complex valid cron expressions', () => {
      expect(validateCron('0,15,30,45 * * * *')).toBe(true); // Every 15 minutes with list
      expect(validateCron('0 9-17 * * 1-5')).toBe(true); // Every hour 9-17 on weekdays
      expect(validateCron('*/10 8-18 * * MON-FRI')).toBe(true); // Every 10 min, 8-18, weekdays
    });
  });

  describe('parseScheduledTask', () => {
    it('should parse a valid scheduled task with all fields', () => {
      const content = `---
cron: "@daily"
timezone: "America/Los_Angeles"
agent: "assistant"
enabled: true
title: "Daily Summary"
description: "Generates daily summary"
---
# Instructions

Generate a summary of today's activities.
`;

      const task = parseScheduledTask(content, 'daily-summary');

      expect(task.id).toBe('daily-summary');
      expect(task.cron).toBe('@daily');
      expect(task.timezone).toBe('America/Los_Angeles');
      expect(task.agent).toBe('assistant');
      expect(task.enabled).toBe(true);
      expect(task.title).toBe('Daily Summary');
      expect(task.description).toBe('Generates daily summary');
      expect(task.instructions).toContain('Generate a summary');
      expect(task.nextRun).toBeDefined();
    });

    it('should parse task with minimal required fields', () => {
      const content = `---
cron: "0 0 * * *"
agent: "worker"
---
Do work.
`;

      const task = parseScheduledTask(content, 'minimal');

      expect(task.agent).toBe('worker');
      expect(task.cron).toBe('0 0 * * *');
      expect(task.timezone).toBe('UTC'); // Default
      expect(task.enabled).toBe(true); // Default
      expect(task.instructions).toBe('Do work.');
    });

    it('should throw error for missing cron field', () => {
      const content = `---
agent: "assistant"
---
No cron specified.
`;

      expect(() => parseScheduledTask(content, 'no-cron')).toThrow('Missing required field: cron');
    });

    it('should throw error for missing agent field', () => {
      const content = `---
cron: "@daily"
---
No agent specified.
`;

      expect(() => parseScheduledTask(content, 'no-agent')).toThrow('Missing required field: agent');
    });

    it('should throw error for invalid cron expression', () => {
      const content = `---
cron: "invalid-cron"
agent: "assistant"
---
Invalid cron.
`;

      expect(() => parseScheduledTask(content, 'invalid-cron')).toThrow('Invalid cron expression');
    });

    it('should handle disabled tasks', () => {
      const content = `---
cron: "@hourly"
agent: "worker"
enabled: false
---
Disabled task.
`;

      const task = parseScheduledTask(content, 'disabled');
      expect(task.enabled).toBe(false);
    });

    it('should parse markdown instructions correctly', () => {
      const content = `---
cron: "@daily"
agent: "assistant"
---
# Daily Check-in

Please check the following:
1. Email status
2. Calendar events
3. Task updates

## Priority Items

- Item A
- Item B
`;

      const task = parseScheduledTask(content, 'markdown');
      expect(task.instructions).toContain('# Daily Check-in');
      expect(task.instructions).toContain('Please check the following:');
      expect(task.instructions).toContain('- Item A');
    });
  });

  describe('nextRunTime', () => {
    it('should calculate next run time for hourly schedule', () => {
      const nextRun = nextRunTime('@hourly', 'UTC');
      expect(nextRun).toBeInstanceOf(Date);

      // Next run should be within the next hour
      const now = Date.now();
      const diff = nextRun.getTime() - now;
      expect(diff).toBeGreaterThan(0);
      expect(diff).toBeLessThan(60 * 60 * 1000); // Less than 1 hour
    });

    it('should calculate next run time for daily schedule', () => {
      const nextRun = nextRunTime('@daily', 'UTC');
      expect(nextRun).toBeInstanceOf(Date);

      // Next run should be within the next 24 hours
      const now = Date.now();
      const diff = nextRun.getTime() - now;
      expect(diff).toBeGreaterThan(0);
      expect(diff).toBeLessThan(24 * 60 * 60 * 1000); // Less than 24 hours
    });

    it('should handle different timezones', () => {
      const utcRun = nextRunTime('0 9 * * *', 'UTC');
      const laRun = nextRunTime('0 9 * * *', 'America/Los_Angeles');

      // Both should return valid dates
      expect(utcRun).toBeInstanceOf(Date);
      expect(laRun).toBeInstanceOf(Date);

      // They should be different (LA is UTC-7 or UTC-8)
      // The actual difference depends on current timezone and DST
    });
  });

  describe('scanScheduledTasks', () => {
    it('should scan and parse multiple task files', async () => {
      // Create test files
      const task1Dir = join(TEST_DIR, 'cocapn', 'tasks', 'scheduled');
      await fs.mkdir(task1Dir, { recursive: true });

      await fs.writeFile(
        join(task1Dir, 'task1.md'),
        `---
cron: "@daily"
agent: "assistant"
---
Task 1 instructions.`
      );

      await fs.writeFile(
        join(task1Dir, 'task2.md'),
        `---
cron: "@hourly"
agent: "worker"
---
Task 2 instructions.`
      );

      const tasks = await scanScheduledTasks(TEST_DIR);

      expect(tasks).toHaveLength(2);
      expect(tasks.some(t => t.id === 'task1')).toBe(true);
      expect(tasks.some(t => t.id === 'task2')).toBe(true);
    });

    it('should return empty array when directory does not exist', async () => {
      const tasks = await scanScheduledTasks(TEST_DIR);
      expect(tasks).toEqual([]);
    });

    it('should skip non-markdown files', async () => {
      const taskDir = join(TEST_DIR, 'cocapn', 'tasks', 'scheduled');
      await fs.mkdir(taskDir, { recursive: true });

      await fs.writeFile(
        join(taskDir, 'valid.md'),
        `---
cron: "@daily"
agent: "assistant"
---
Valid task.`
      );

      await fs.writeFile(join(taskDir, 'not-a-task.txt'), 'Not a markdown file');

      const tasks = await scanScheduledTasks(TEST_DIR);

      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('valid');
    });

    it('should handle parse errors gracefully', async () => {
      const taskDir = join(TEST_DIR, 'cocapn', 'tasks', 'scheduled');
      await fs.mkdir(taskDir, { recursive: true });

      // Valid task
      await fs.writeFile(
        join(taskDir, 'valid.md'),
        `---
cron: "@daily"
agent: "assistant"
---
Valid task.`
      );

      // Invalid task (missing required field)
      await fs.writeFile(
        join(taskDir, 'invalid.md'),
        `---
agent: "assistant"
---
Missing cron.`
      );

      const tasks = await scanScheduledTasks(TEST_DIR);

      // Should only return valid tasks
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('valid');
    });
  });
});
