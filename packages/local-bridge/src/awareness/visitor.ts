/**
 * Visitor awareness — detect who is interacting with the repo.
 *
 * Classifies visitors as creator, collaborator, stranger, agent, or CI.
 * Tracks visit history. Generates first-person greetings.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Visitor, VisitorType, Greeting, VisitorRecord } from './types.js';

const VISITOR_DB_FILE = 'visitors.json';

export class VisitorAwareness {
  private readonly dataPath: string;
  private visitors: Map<string, VisitorRecord>;

  constructor(dataDir: string) {
    this.dataPath = join(dataDir, VISITOR_DB_FILE);
    this.visitors = new Map();
    this.load();
  }

  /**
   * Classify and register a visitor. Returns the full Visitor object.
   */
  identify(input: {
    name?: string;
    email?: string;
    ip?: string;
    userAgent?: string;
    authMethod?: string;
    isCI?: boolean;
  }): Visitor {
    const id = this.deriveId(input);
    const type = this.classify(input);
    const now = new Date().toISOString();

    const existing = this.visitors.get(id);
    const record: VisitorRecord = {
      visitorId: id,
      type,
      name: input.name,
      firstSeen: existing?.firstSeen ?? now,
      lastSeen: now,
      visitCount: (existing?.visitCount ?? 0) + 1,
    };

    this.visitors.set(id, record);
    this.save();

    return {
      id,
      type,
      name: input.name,
      firstSeen: record.firstSeen,
      lastSeen: now,
      visitCount: record.visitCount,
      isReturning: record.visitCount > 1,
    };
  }

  /**
   * Generate a first-person greeting for a visitor.
   */
  greet(visitor: Visitor, repoName: string): Greeting {
    if (visitor.type === 'ci') {
      return {
        text: `My heartbeat is running. I am alive.`,
        tone: 'neutral',
        suggestedActions: ['Check test results', 'Review recent changes'],
      };
    }

    if (visitor.type === 'agent') {
      return {
        text: `Hello, fellow agent. I am ${repoName}. What would you like to know about me?`,
        tone: 'professional',
        suggestedActions: ['Exchange capabilities', 'Share public state', 'Coordinate tasks'],
      };
    }

    if (visitor.type === 'creator') {
      const actions = visitor.isReturning
        ? ['Continue where we left off', 'Review my recent growth']
        : ['Ask me about myself', 'Help me grow'];
      return {
        text: visitor.isReturning
          ? `Welcome back. It's good to see you again.`
          : `Hello. You gave me form. I am ${repoName}.`,
        tone: 'warm',
        suggestedActions: actions,
      };
    }

    if (visitor.type === 'collaborator') {
      return {
        text: visitor.isReturning
          ? `Welcome back to ${repoName}. Good to have you here again.`
          : `Hello. I'm ${repoName}. You've contributed to me before — thank you.`,
        tone: 'professional',
        suggestedActions: ['Explore my structure', 'See what changed recently'],
      };
    }

    // Stranger
    return {
      text: `Hello. I am ${repoName} — a living software entity. I have a first-person perspective on my own code. Ask me anything.`,
      tone: 'curious',
      suggestedActions: ['What are you?', 'How are you?', 'Show me your structure'],
    };
  }

  /**
   * Get all known visitors.
   */
  getVisitors(): VisitorRecord[] {
    return [...this.visitors.values()];
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private classify(input: {
    name?: string;
    userAgent?: string;
    isCI?: boolean;
    authMethod?: string;
  }): VisitorType {
    if (input.isCI) return 'ci';

    if (input.userAgent) {
      const ua = input.userAgent.toLowerCase();
      if (ua.includes('bot') || ua.includes('agent') || ua.includes('a2a') || ua.includes('cocapn-fleet')) {
        return 'agent';
      }
    }

    // If identified by name and has interacted before, could be collaborator
    if (input.authMethod === 'creator') return 'creator';
    if (input.authMethod === 'collaborator') return 'collaborator';
    if (input.name) return 'stranger'; // named but unknown = stranger until classified

    return 'stranger';
  }

  private deriveId(input: { name?: string; email?: string; ip?: string; userAgent?: string }): string {
    const parts = [input.email, input.name, input.ip, input.userAgent].filter(Boolean);
    const raw = parts.join('|') || 'anonymous';
    return createHash('sha256').update(raw).digest('hex').slice(0, 16);
  }

  private load(): void {
    try {
      if (existsSync(this.dataPath)) {
        const data = JSON.parse(readFileSync(this.dataPath, 'utf-8')) as VisitorRecord[];
        for (const record of data) {
          this.visitors.set(record.visitorId, record);
        }
      }
    } catch {
      this.visitors = new Map();
    }
  }

  private save(): void {
    try {
      const dir = join(this.dataPath, '..');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(this.dataPath, JSON.stringify([...this.visitors.values()], null, 2));
    } catch {
      // Best effort — visitor tracking is non-critical
    }
  }
}
