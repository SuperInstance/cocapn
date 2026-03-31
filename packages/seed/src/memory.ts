/**
 * Memory — persistent JSON file memory for cocapn.
 *
 * Stores conversation history and learned facts in .cocapn/memory.json.
 * Zero dependencies. Uses only Node.js fs module.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  ts: string;
}

export interface MemoryStore {
  messages: Message[];
  facts: Record<string, string>;
}

// ─── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_MEMORY: MemoryStore = { messages: [], facts: {} };
const MAX_MESSAGES = 100;

// ─── Memory class ──────────────────────────────────────────────────────────────

export class Memory {
  private path: string;
  private data: MemoryStore;

  constructor(repoDir: string) {
    const dir = join(repoDir, '.cocapn');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.path = join(dir, 'memory.json');
    this.data = this.load();
  }

  get messages(): Message[] {
    return this.data.messages;
  }

  get facts(): Record<string, string> {
    return this.data.facts;
  }

  /** Get last N messages for LLM context */
  recent(n: number = 20): Message[] {
    return this.data.messages.slice(-n);
  }

  /** Add a message and persist */
  addMessage(role: Message['role'], content: string): void {
    this.data.messages.push({ role, content, ts: new Date().toISOString() });
    // Trim to max
    if (this.data.messages.length > MAX_MESSAGES) {
      this.data.messages = this.data.messages.slice(-MAX_MESSAGES);
    }
    this.save();
  }

  /** Set a fact (flat KV store) */
  setFact(key: string, value: string): void {
    this.data.facts[key] = value;
    this.save();
  }

  /** Get a fact */
  getFact(key: string): string | undefined {
    return this.data.facts[key];
  }

  /** Format recent messages as LLM context */
  formatContext(n: number = 20): string {
    const msgs = this.recent(n);
    if (msgs.length === 0) return '';
    return msgs
      .map(m => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
  }

  /** Format facts as LLM context */
  formatFacts(): string {
    const entries = Object.entries(this.data.facts);
    if (entries.length === 0) return '';
    return 'Known facts:\n' + entries.map(([k, v]) => `- ${k}: ${v}`).join('\n');
  }

  // ── Persistence ──────────────────────────────────────────────────────────────

  private load(): MemoryStore {
    if (!existsSync(this.path)) return { messages: [], facts: {} };
    try {
      const raw = readFileSync(this.path, 'utf-8');
      const parsed = JSON.parse(raw) as MemoryStore;
      return {
        messages: Array.isArray(parsed.messages) ? parsed.messages : [],
        facts: parsed.facts && typeof parsed.facts === 'object' ? parsed.facts : {},
      };
    } catch {
      return { messages: [], facts: {} };
    }
  }

  private save(): void {
    writeFileSync(this.path, JSON.stringify(this.data, null, 2), 'utf-8');
  }
}
