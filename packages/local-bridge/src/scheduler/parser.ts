/**
 * Scheduled Task Parser
 *
 * Parses YAML frontmatter + markdown body for scheduled tasks.
 * Supports standard cron expressions and shortcuts like @daily, @hourly, @weekly.
 */

import matter from 'gray-matter';
import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * A scheduled task parsed from a markdown file with YAML frontmatter.
 */
export interface ScheduledTask {
  /** Unique identifier (filename without extension) */
  id: string;

  /** Cron expression or shortcut (@daily, @hourly, @weekly) */
  cron: string;

  /** IANA timezone identifier (e.g., 'America/Los_Angeles', 'UTC') */
  timezone: string;

  /** Agent identifier to execute the task */
  agent: string;

  /** Task instructions (markdown body of the file) */
  instructions: string;

  /** Whether the task is currently enabled */
  enabled: boolean;

  /** ISO timestamp of last execution (if any) */
  lastRun?: string;

  /** ISO timestamp of next scheduled execution */
  nextRun: string;

  /** Optional task title from frontmatter */
  title?: string;

  /** Optional description from frontmatter */
  description?: string;
}

/**
 * Cron shortcut mappings to standard cron expressions.
 */
const CRON_SHORTCUTS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@hourly': '0 * * * *',
  '@every-minute': '* * * * *',
  '@every-5-minutes': '*/5 * * * *',
  '@every-10-minutes': '*/10 * * * *',
  '@every-15-minutes': '*/15 * * * *',
  '@every-30-minutes': '*/30 * * * *',
};

/**
 * Validates a cron expression or shortcut.
 *
 * @param expression - Cron expression or shortcut to validate
 * @returns true if valid, false otherwise
 */
export function validateCron(expression: string): boolean {
  if (!expression || typeof expression !== 'string') {
    return false;
  }

  const trimmed = expression.trim();

  // Check for shortcuts
  if (trimmed.startsWith('@')) {
    return CRON_SHORTCUTS.hasOwnProperty(trimmed);
  }

  // Validate standard 5-part cron expression
  const parts = trimmed.split(/\s+/);
  if (parts.length !== 5) {
    return false;
  }

  // Validate each part
  const validators = [
    validateMinute,
    validateHour,
    validateDayOfMonth,
    validateMonth,
    validateDayOfWeek,
  ];

  return parts.every((part, index) => validators[index](part));
}

/**
 * Validates minute field (0-59).
 */
function validateMinute(part: string): boolean {
  return validateCronField(part, 0, 59);
}

/**
 * Validates hour field (0-23).
 */
function validateHour(part: string): boolean {
  return validateCronField(part, 0, 23);
}

/**
 * Validates day of month field (1-31).
 */
function validateDayOfMonth(part: string): boolean {
  return validateCronField(part, 1, 31);
}

/**
 * Validates month field (1-12 or JAN-DEC).
 */
function validateMonth(part: string): boolean {
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const upperPart = part.toUpperCase();

  // Check for single month name
  if (monthNames.includes(upperPart)) {
    return true;
  }

  // Check for month name range (e.g., JAN-MAR)
  const nameRange = upperPart.match(/^([A-Z]{3})-([A-Z]{3})$/);
  if (nameRange) {
    const startIdx = monthNames.indexOf(nameRange[1]);
    const endIdx = monthNames.indexOf(nameRange[2]);
    return startIdx !== -1 && endIdx !== -1 && startIdx <= endIdx;
  }

  return validateCronField(part, 1, 12);
}

/**
 * Validates day of week field (0-7 or SUN-SAT, where 0 and 7 are Sunday).
 */
function validateDayOfWeek(part: string): boolean {
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const upperPart = part.toUpperCase();

  // Check for single day name
  if (dayNames.includes(upperPart)) {
    return true;
  }

  // Check for day name range (e.g., MON-FRI)
  const nameRange = upperPart.match(/^([A-Z]{3})-([A-Z]{3})$/);
  if (nameRange) {
    const startIdx = dayNames.indexOf(nameRange[1]);
    const endIdx = dayNames.indexOf(nameRange[2]);
    return startIdx !== -1 && endIdx !== -1 && startIdx <= endIdx;
  }

  return validateCronField(part, 0, 7);
}

/**
 * Validates a cron field within a range.
 */
function validateCronField(field: string, min: number, max: number): boolean {
  if (!field) {
    return false;
  }

  // Handle wildcard
  if (field === '*') {
    return true;
  }

  // Handle step (*/n)
  if (field.match(/^\*\/\d+$/)) {
    const step = parseInt(field.substring(2));
    return step > 0;
  }

  // Handle range with step (n-m/x)
  const rangeWithStep = field.match(/^(\d+)-(\d+)\/(\d+)$/);
  if (rangeWithStep) {
    const start = parseInt(rangeWithStep[1]);
    const end = parseInt(rangeWithStep[2]);
    const step = parseInt(rangeWithStep[3]);

    return (
      start >= min &&
      end <= max &&
      start <= end &&
      step > 0
    );
  }

  // Handle range (n-m)
  const range = field.match(/^(\d+)-(\d+)$/);
  if (range) {
    const start = parseInt(range[1]);
    const end = parseInt(range[2]);

    return (
      start >= min &&
      end <= max &&
      start <= end
    );
  }

  // Handle list (n,m,o)
  const list = field.split(',');
  if (list.length > 1) {
    return list.every(item => {
      const num = parseInt(item.trim());
      return !isNaN(num) && num >= min && num <= max;
    });
  }

  // Handle single number
  const num = parseInt(field);
  return !isNaN(num) && num >= min && num <= max;
}

/**
 * Expands a cron shortcut to a standard expression.
 */
function expandCronShortcut(expression: string): string {
  const trimmed = expression.trim();

  if (trimmed.startsWith('@') && CRON_SHORTCUTS.hasOwnProperty(trimmed)) {
    return CRON_SHORTCUTS[trimmed];
  }

  return trimmed;
}

/**
 * Calculates the next run time for a cron expression.
 *
 * @param cron - Cron expression or shortcut
 * @param timezone - IANA timezone identifier
 * @returns Next execution time as Date
 */
export function nextRunTime(cron: string, timezone: string): Date {
  const expandedCron = expandCronShortcut(cron);

  // Parse cron expression
  const parts = expandedCron.split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: ${cron}`);
  }

  const [minutePart, hourPart, dayOfMonthPart, monthPart, dayOfWeekPart] = parts;

  // Start from current time in target timezone
  let current = new Date();
  const targetTimezone = timezone || 'UTC';

  // Convert to target timezone
  const options: Intl.DateTimeFormatOptions = {
    timeZone: targetTimezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  };

  // Find next match
  let iterations = 0;
  const maxIterations = 366 * 24 * 60; // Maximum 1 year lookahead

  while (iterations < maxIterations) {
    // Move to next minute
    current = new Date(current.getTime() + 60000);
    iterations++;

    // Get time components in target timezone
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(current);
    const getPart = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0');

    const minute = getPart('minute');
    const hour = getPart('hour');
    const day = getPart('day');
    const month = getPart('month');
    const weekday = current.getDay(); // 0-6, Sunday = 0

    // Check if current time matches cron expression
    if (matchesCronField(minute, minutePart, 0, 59) &&
        matchesCronField(hour, hourPart, 0, 23) &&
        matchesCronField(day, dayOfMonthPart, 1, 31) &&
        matchesCronField(month, monthPart, 1, 12) &&
        matchesCronField(weekday === 0 ? 7 : weekday, dayOfWeekPart, 0, 7)) {
      return current;
    }
  }

  throw new Error(`Could not calculate next run time for cron expression: ${cron}`);
}

/**
 * Checks if a value matches a cron field specification.
 */
function matchesCronField(value: number, field: string, min: number, max: number): boolean {
  // Handle wildcard
  if (field === '*') {
    return true;
  }

  // Handle step (*/n)
  const stepMatch = field.match(/^\/(\d+)$/);
  if (stepMatch) {
    const step = parseInt(stepMatch[1]);
    return value % step === min;
  }

  // Handle range with step (n-m/x)
  const rangeWithStepMatch = field.match(/^(\d+)-(\d+)\/(\d+)$/);
  if (rangeWithStepMatch) {
    const start = parseInt(rangeWithStepMatch[1]);
    const end = parseInt(rangeWithStepMatch[2]);
    const step = parseInt(rangeWithStepMatch[3]);

    if (value < start || value > end) {
      return false;
    }

    return (value - start) % step === 0;
  }

  // Handle range (n-m)
  const rangeMatch = field.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1]);
    const end = parseInt(rangeMatch[2]);
    return value >= start && value <= end;
  }

  // Handle list (n,m,o)
  const list = field.split(',');
  if (list.length > 1) {
    return list.some(item => parseInt(item.trim()) === value);
  }

  // Handle single number
  const fieldValue = parseInt(field);
  return fieldValue === value;
}

/**
 * Parses a scheduled task from file content.
 *
 * Expected format:
 * ```yaml
 * ---
 * cron: "@daily"
 * timezone: "America/Los_Angeles"
 * agent: "assistant"
 * enabled: true
 * title: "My Daily Task"
 * description: "Runs every day"
 * ---
 * # Task Instructions
 *
 * Do something useful...
 * ```
 *
 * @param content - File content with YAML frontmatter
 * @param id - Optional task identifier (defaults to "unknown")
 * @returns Parsed scheduled task
 */
export function parseScheduledTask(content: string, id: string = 'unknown'): ScheduledTask {
  const parsed = matter(content);
  const data = parsed.data as any;

  // Validate required fields
  if (!data.cron) {
    throw new Error('Missing required field: cron');
  }

  if (!data.agent) {
    throw new Error('Missing required field: agent');
  }

  // Validate cron expression
  const cron = String(data.cron).trim();
  if (!validateCron(cron)) {
    throw new Error(`Invalid cron expression: ${cron}`);
  }

  // Use defaults for optional fields
  const timezone = data.timezone || 'UTC';
  const enabled = data.enabled !== false; // Default to true

  // Calculate next run time
  const nextRun = nextRunTime(cron, timezone);

  return {
    id,
    cron,
    timezone,
    agent: String(data.agent),
    instructions: parsed.content.trim(),
    enabled,
    nextRun: nextRun.toISOString(),
    title: data.title,
    description: data.description,
    lastRun: data.lastRun,
  };
}

/**
 * Scans for scheduled task files in the cocapn/tasks/scheduled directory.
 *
 * @param basePath - Base path to search from (defaults to process.cwd())
 * @returns Array of parsed scheduled tasks
 */
export async function scanScheduledTasks(basePath: string = process.cwd()): Promise<ScheduledTask[]> {
  const tasksDir = join(basePath, 'cocapn', 'tasks', 'scheduled');

  const tasks: ScheduledTask[] = [];

  try {
    const entries = await fs.readdir(tasksDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) {
        continue;
      }

      const filePath = join(tasksDir, entry.name);
      const content = await fs.readFile(filePath, 'utf-8');
      const id = entry.name.replace(/\.md$/, '');

      try {
        const task = parseScheduledTask(content, id);
        tasks.push(task);
      } catch (error) {
        console.warn(`Failed to parse scheduled task ${entry.name}:`, error);
        // Continue processing other files
      }
    }
  } catch (error) {
    // Directory doesn't exist or is not readable
    // Return empty array - this is expected during first run
  }

  return tasks;
}
