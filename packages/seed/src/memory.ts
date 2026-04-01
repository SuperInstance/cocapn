/**
 * Memory — scalable three-tier persistent memory for cocapn.
 *
 * Hot tier:   JSON file for recent facts and messages (last 100)
 * Archive:    Archived conversations in .cocapn/archive/ when count > threshold
 * Cold tier:  git log for long-term recall
 *
 * Index file (.cocapn/index.json) enables fast binary search across archives
 * without loading everything into memory.
 *
 * Zero dependencies. Uses only Node.js built-ins.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  ts: string;
  userId?: string;
}

export interface UserRecord {
  name: string;
  lastSeen: string;
  messageCount: number;
  preferences: Record<string, string>;
}

export interface MemoryStore {
  messages: Message[];
  facts: Record<string, string>;
  users: Record<string, UserRecord>;
  userFacts: Record<string, Record<string, string>>;
}

export interface ArchiveEntry {
  id: string;
  startTs: string;
  endTs: string;
  messageCount: number;
  keywords: string[];
  file: string;
}

export interface MemoryIndex {
  archives: ArchiveEntry[];
  totalArchivedMessages: number;
  lastArchived: string | null;
}

// ─── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_MEMORY: MemoryStore = { messages: [], facts: {}, users: {}, userFacts: {} };
const MAX_MESSAGES = 100;
const ARCHIVE_THRESHOLD = 500;
const MESSAGES_PER_ARCHIVE = 200;

// ─── Memory class ──────────────────────────────────────────────────────────────

export class Memory {
  private path: string;
  private data: MemoryStore;
  private repoDir: string;
  private archiveDir: string;
  private indexPath: string;

  constructor(repoDir: string) {
    this.repoDir = repoDir;
    const dir = join(repoDir, '.cocapn');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.path = join(dir, 'memory.json');
    this.archiveDir = join(dir, 'archive');
    this.indexPath = join(dir, 'index.json');
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

  /** Add a message and persist. Triggers archival when threshold is reached. */
  addMessage(role: Message['role'], content: string, userId?: string): void {
    this.data.messages.push({ role, content, ts: new Date().toISOString(), userId });

    // Archive old messages when we exceed threshold
    if (this.data.messages.length > ARCHIVE_THRESHOLD) {
      this.archiveOldMessages();
    }

    // Trim to max (after archival, keep the most recent)
    if (this.data.messages.length > MAX_MESSAGES) {
      this.data.messages = this.data.messages.slice(-MAX_MESSAGES);
    }

    // Update user stats
    if (userId && this.data.users[userId]) {
      this.data.users[userId].messageCount++;
      this.data.users[userId].lastSeen = new Date().toISOString();
    }
    this.save();
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

  /** Clear all messages, facts, and archives */
  clear(): void {
    this.data = { messages: [], facts: {}, users: {}, userFacts: {} };
    this.save();
    // Clear archives
    if (existsSync(this.archiveDir)) {
      const files = readdirSync(this.archiveDir);
      for (const f of files) {
        try { writeFileSync(join(this.archiveDir, f), '', 'utf-8'); } catch { /* skip */ }
      }
    }
    this.saveIndex({ archives: [], totalArchivedMessages: 0, lastArchived: null });
  }

  /** Search hot (JSON) + archive + cold (git) memory for a query */
  search(query: string): { messages: Message[]; facts: Array<{ key: string; value: string }>; gitLog: string[] } {
    const q = query.toLowerCase();
    // Hot messages
    const hotMessages = this.data.messages.filter(m => m.content.toLowerCase().includes(q));
    // Archive messages (binary search on index)
    const archiveMessages = this.searchArchives(query);
    // Facts
    const facts = Object.entries(this.data.facts)
      .filter(([, v]) => v.toLowerCase().includes(q))
      .map(([key, value]) => ({ key, value }));

    return {
      messages: [...archiveMessages, ...hotMessages],
      facts,
      gitLog: this.searchGit(query),
    };
  }

  /** Cold tier: search git log for keywords */
  searchGit(query: string): string[] {
    try {
      const raw = execSync(`git log --grep=${JSON.stringify(query)} --oneline -20`, {
        cwd: this.repoDir, encoding: 'utf-8', timeout: 5000,
      }).trim();
      return raw ? raw.split('\n').filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  /** Get the archive index (for inspection/testing) */
  getIndex(): MemoryIndex {
    return this.loadIndex();
  }

  /** Get total message count including archives */
  totalMessageCount(): number {
    const index = this.loadIndex();
    return index.totalArchivedMessages + this.data.messages.length;
  }

  // ── Multi-user methods ──────────────────────────────────────────────────────

  /** Get or create a user record */
  getOrCreateUser(userId: string, name?: string): UserRecord {
    if (!this.data.users[userId]) {
      this.data.users[userId] = {
        name: name ?? userId,
        lastSeen: new Date().toISOString(),
        messageCount: 0,
        preferences: {},
      };
      this.save();
    }
    return this.data.users[userId];
  }

  /** List all known users */
  getUsers(): Array<UserRecord & { id: string }> {
    return Object.entries(this.data.users).map(([id, u]) => ({ id, ...u }));
  }

  /** Get messages visible to a specific user (their own + system/assistant) */
  recentForUser(userId: string, n: number = 20): Message[] {
    return this.data.messages
      .filter(m => !m.userId || m.userId === userId)
      .slice(-n);
  }

  /** Get facts for a user: global + user-specific merged */
  getFactsForUser(userId: string): Record<string, string> {
    const userFacts = this.data.userFacts[userId] ?? {};
    return { ...this.data.facts, ...userFacts };
  }

  /** Set a user-specific fact */
  setUserFact(userId: string, key: string, value: string): void {
    if (!this.data.userFacts[userId]) this.data.userFacts[userId] = {};
    this.data.userFacts[userId][key] = value;
    this.save();
  }

  /** Format facts for a specific user (global + user-specific) */
  formatFactsForUser(userId: string): string {
    const facts = this.getFactsForUser(userId);
    const entries = Object.entries(facts);
    if (entries.length === 0) return '';
    return 'Known facts:\n' + entries.map(([k, v]) => `- ${k}: ${v}`).join('\n');
  }

  // ── Archival ────────────────────────────────────────────────────────────────

  /** Archive old messages to individual files, updating the index */
  private archiveOldMessages(): void {
    const messages = this.data.messages;
    if (messages.length <= MAX_MESSAGES) return;

    // Archive messages from the beginning up to (length - MAX_MESSAGES)
    const toArchive = messages.slice(0, messages.length - MAX_MESSAGES);
    if (toArchive.length === 0) return;

    // Split into batches for manageable archive files
    let offset = 0;
    const index = this.loadIndex();

    while (offset < toArchive.length) {
      const batch = toArchive.slice(offset, offset + MESSAGES_PER_ARCHIVE);
      if (batch.length === 0) break;

      const archiveId = `archive-${Date.now()}-${offset}`;
      const archiveFile = `${archiveId}.json`;

      // Extract keywords from messages for the index
      const keywords = this.extractKeywords(batch);

      const entry: ArchiveEntry = {
        id: archiveId,
        startTs: batch[0].ts,
        endTs: batch[batch.length - 1].ts,
        messageCount: batch.length,
        keywords,
        file: archiveFile,
      };

      // Write archive file
      if (!existsSync(this.archiveDir)) mkdirSync(this.archiveDir, { recursive: true });
      writeFileSync(
        join(this.archiveDir, archiveFile),
        JSON.stringify({ id: archiveId, messages: batch }, null, 2),
        'utf-8',
      );

      index.archives.push(entry);
      index.totalArchivedMessages += batch.length;
      index.lastArchived = new Date().toISOString();

      offset += MESSAGES_PER_ARCHIVE;
    }

    // Keep only the most recent messages
    this.data.messages = messages.slice(-MAX_MESSAGES);
    this.saveIndex(index);
  }

  /** Search archives using the index for efficient lookup */
  private searchArchives(query: string): Message[] {
    const q = query.toLowerCase();
    const index = this.loadIndex();
    const results: Message[] = [];

    // Binary-search-like approach: check index keywords first
    const relevantArchives = index.archives.filter(a =>
      a.keywords.some(k => k.includes(q)),
    );

    for (const entry of relevantArchives) {
      const archivePath = join(this.archiveDir, entry.file);
      if (!existsSync(archivePath)) continue;
      try {
        const data = JSON.parse(readFileSync(archivePath, 'utf-8')) as { messages: Message[] };
        results.push(...data.messages.filter(m => m.content.toLowerCase().includes(q)));
      } catch { /* skip corrupt archive */ }
    }

    return results;
  }

  /** Extract top keywords from a batch of messages for index entries */
  private extractKeywords(messages: Message[]): string[] {
    const wordFreq = new Map<string, number>();
    for (const m of messages) {
      const words = m.content.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
      for (const w of words) {
        if (w.length < 3) continue; // skip short words
        wordFreq.set(w, (wordFreq.get(w) ?? 0) + 1);
      }
    }
    return [...wordFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([w]) => w);
  }

  // ── Index persistence ───────────────────────────────────────────────────────

  private loadIndex(): MemoryIndex {
    if (!existsSync(this.indexPath)) {
      return { archives: [], totalArchivedMessages: 0, lastArchived: null };
    }
    try {
      return JSON.parse(readFileSync(this.indexPath, 'utf-8')) as MemoryIndex;
    } catch {
      return { archives: [], totalArchivedMessages: 0, lastArchived: null };
    }
  }

  private saveIndex(index: MemoryIndex): void {
    writeFileSync(this.indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  // ── Persistence ──────────────────────────────────────────────────────────────

  private load(): MemoryStore {
    if (!existsSync(this.path)) return { messages: [], facts: {}, users: {}, userFacts: {} };
    try {
      const raw = readFileSync(this.path, 'utf-8');
      const parsed = JSON.parse(raw) as MemoryStore;
      return {
        messages: Array.isArray(parsed.messages) ? parsed.messages : [],
        facts: parsed.facts && typeof parsed.facts === 'object' ? parsed.facts : {},
        users: parsed.users && typeof parsed.users === 'object' ? parsed.users : {},
        userFacts: parsed.userFacts && typeof parsed.userFacts === 'object' ? parsed.userFacts : {},
      };
    } catch {
      return { messages: [], facts: {}, users: {}, userFacts: {} };
    }
  }

  private save(): void {
    writeFileSync(this.path, JSON.stringify(this.data, null, 2), 'utf-8');
  }
}
