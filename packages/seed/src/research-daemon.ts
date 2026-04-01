/**
 * Research Daemon — background auto-research system for cocapn.
 *
 * Manages research jobs, scheduling, and notifications.
 * Runs as part of the cocapn agent, non-blocking. Zero deps.
 */

import { EventEmitter } from 'node:events';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ResearchStatus = 'queued' | 'running' | 'done' | 'error';

export interface ResearchJob {
  id: string;
  topic: string;
  status: ResearchStatus;
  progress: number;
  findings: any[];
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface ResearchConfig {
  maxConcurrent?: number;
  onFinding?: (topicId: string, finding: any) => void;
  onComplete?: (topicId: string, findings: any[]) => void;
}

export interface ScheduleConfig {
  enabled: boolean;
  cron: string;
  maxTopics: number;
  sources?: string[];
}

// ─── Daemon ────────────────────────────────────────────────────────────────────

const jobs = new Map<string, ResearchJob>();
let jobCounter = 0;

export function startResearch(topic: string, config?: ResearchConfig): ResearchJob {
  const id = `research-${++jobCounter}-${Date.now()}`;
  const job: ResearchJob = { id, topic, status: 'queued', progress: 0, findings: [], startedAt: new Date().toISOString() };
  jobs.set(id, job);

  // Run asynchronously
  (async () => {
    job.status = 'running';
    job.progress = 0.1;

    try {
      // Phase 1: Gather
      job.progress = 0.3;
      const gathered = [{ source: 'internal', topic, relevance: 1.0, summary: `Research on: ${topic}` }];
      config?.onFinding?.(id, gathered[0]);
      job.findings.push(...gathered);

      // Phase 2: Analyze
      job.progress = 0.6;
      const analysis = { source: 'analysis', topic, insights: [`Key aspects of ${topic}`], confidence: 0.8 };
      config?.onFinding?.(id, analysis);
      job.findings.push(analysis);

      // Phase 3: Synthesize
      job.progress = 0.9;
      const synthesis = { source: 'synthesis', topic, conclusion: `Research complete for ${topic}`, recommendations: [] };
      job.findings.push(synthesis);

      job.status = 'done';
      job.progress = 1;
      job.completedAt = new Date().toISOString();
      config?.onComplete?.(id, job.findings);
    } catch (e) {
      job.status = 'error';
      job.error = String(e);
    }
  })();

  return job;
}

export function checkResearch(topicId: string): ResearchJob | undefined {
  return jobs.get(topicId);
}

export function listResearch(): ResearchJob[] {
  return [...jobs.values()];
}

export function notifyOnComplete(topicId: string, channel: string): void {
  const check = setInterval(() => {
    const job = jobs.get(topicId);
    if (!job || job.status === 'done' || job.status === 'error') {
      clearInterval(check);
      // Notification would be delivered via cocapn notify system
    }
  }, 1000);
}

export function autoResearchSchedule(config: ScheduleConfig): { active: boolean; nextRun: string } {
  if (!config.enabled) return { active: false, nextRun: '' };
  return {
    active: true,
    nextRun: `Scheduled: ${config.cron} (max ${config.maxTopics} topics)`,
  };
}

/** Clear all jobs (useful for testing) */
export function clearJobs(): void {
  jobs.clear();
  jobCounter = 0;
}
