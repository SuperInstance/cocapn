/**
 * Shared types for the awareness module.
 * All four submodules use these interfaces.
 */

// ─── Repo Self ────────────────────────────────────────────────────────────────

export interface SelfDescription {
  name: string;
  birthDate: string | null;
  age: string;
  size: { files: number; bytes: number };
  purpose: string;
  languages: string[];
  recentGrowth: string;
}

export interface RepoBody {
  face: string[];        // README files
  skeleton: string[];    // src/ directories
  immuneSystem: string[];// test files
  memory: string[];      // docs/ and wiki/
  heartbeat: string[];   // CI/CD config files
  dna: string[];         // package.json, Cargo.toml, pyproject.toml, etc.
  nervousSystem: string[];// .git/ related
  secrets: string[];     // .env, secrets/
  aspirations: string[]; // TODO, ISSUE, ROADMAP files
}

export interface RepoMemory {
  hash: string;
  date: string;
  author: string;
  message: string;
  category: 'birth' | 'feature' | 'fix' | 'refactor' | 'docs' | 'test' | 'chore' | 'other';
  emotion: 'growth' | 'healing' | 'restructuring' | 'learning' | 'sleeping' | 'unknown';
}

export interface GrowthPattern {
  totalCommits: number;
  periodDays: number;
  commitsPerWeek: number;
  acceleration: 'growing' | 'steady' | 'declining' | 'stagnant';
  phases: GrowthPhase[];
}

export interface GrowthPhase {
  start: string;
  end: string;
  commits: number;
  label: string;
}

export interface Reflection {
  whatAmI: string;
  whatDoIKnow: string[];
  whatHaveILearned: string[];
  whatNeedsWork: string[];
  whatAmIBecoming: string;
}

// ─── Visitor ──────────────────────────────────────────────────────────────────

export type VisitorType = 'creator' | 'collaborator' | 'stranger' | 'agent' | 'ci';

export interface Visitor {
  id: string;
  type: VisitorType;
  name?: string;
  firstSeen: string;
  lastSeen: string;
  visitCount: number;
  isReturning: boolean;
}

export interface Greeting {
  text: string;
  tone: 'warm' | 'professional' | 'curious' | 'neutral';
  suggestedActions: string[];
}

export interface VisitorRecord {
  visitorId: string;
  type: VisitorType;
  name?: string;
  firstSeen: string;
  lastSeen: string;
  visitCount: number;
}

// ─── Time Sense ───────────────────────────────────────────────────────────────

export interface TemporalState {
  now: string;               // ISO timestamp
  birthDate: string | null;  // First commit date
  age: {
    milliseconds: number;
    humanReadable: string;
  };
  sinceLastCommit: {
    milliseconds: number;
    humanReadable: string;
  };
  timeOfDay: 'dawn' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  isAwake: boolean;          // Activity in last 24h
  pulseState: 'active' | 'resting' | 'sleeping' | 'dormant';
}

// ─── Body Schema ──────────────────────────────────────────────────────────────

export interface BodyPartMapping {
  part: string;
  metaphor: string;
  paths: string[];
  description: string;
  health: 'healthy' | 'warning' | 'critical' | 'unknown';
}

export interface BodySchema {
  parts: BodyPartMapping[];
  overallHealth: 'healthy' | 'warning' | 'critical' | 'unknown';
  summary: string;
}
