/**
 * Context — smart context window builder for cocapn.
 *
 * Builds the LLM system prompt with prioritized sections:
 *   1. soul.md personality (always)
 *   2. recent 5 messages (always)
 *   3. relevant facts (keyword match against user message)
 *   4. git awareness (if asked about repo)
 *   5. older messages (fill remaining budget)
 *
 * Max budget: ~4000 tokens (~6 chars/token → ~24000 chars).
 */

import type { Soul } from './soul.js';
import type { Memory, Message } from './memory.js';
import type { Awareness } from './awareness.js';

// ─── Config ────────────────────────────────────────────────────────────────────

const MAX_CHARS = 24000; // ~4000 tokens at ~6 chars/token
const RECENT_MESSAGES = 5;

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ContextOptions {
  soul: Soul;
  memory: Memory;
  awareness: Awareness;
  userMessage: string;
  reflectionSummary?: string;
  userId?: string;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/** Build a smart, budget-aware system prompt. */
export function buildContext(opts: ContextOptions): string {
  const { soul, memory, awareness, userMessage, reflectionSummary, userId } = opts;
  const sections: string[] = [];
  let used = 0;

  // 1. Soul personality — always included
  const soulPrompt = `You are ${soul.name}. Your tone is ${soul.tone}.\n\n${soul.body}`;
  sections.push(soulPrompt);
  used += soulPrompt.length;

  // 1b. User greeting context
  if (userId) {
    const user = memory.getOrCreateUser(userId);
    const greet = `\nYou are talking to ${user.name}.`;
    sections.push(greet);
    used += greet.length;
  }

  // 2. Git awareness — always include (compact)
  const awarenessText = awareness.narrate();
  sections.push(`## Who I Am\n${awarenessText}`);
  used += awarenessText.length + 12;

  // 3. Reflection summary — if available
  if (reflectionSummary) {
    const ref = `## Recent Reflection\n${reflectionSummary}`;
    sections.push(ref);
    used += ref.length;
  }

  // 4. Relevant facts — keyword match against user message (user-scoped)
  const relevantFacts = findRelevantFacts(memory, userMessage, userId);
  if (relevantFacts.length > 0) {
    const factsText = `## What I Remember\n${relevantFacts.map(([k, v]) => `- ${k}: ${v}`).join('\n')}`;
    sections.push(factsText);
    used += factsText.length;
  }

  // 5. Recent messages (user-scoped if userId provided)
  const recent = userId
    ? memory.recentForUser(userId, RECENT_MESSAGES)
    : memory.recent(RECENT_MESSAGES);
  const recentText = formatMessages(recent);
  if (recentText) {
    sections.push(`## Recent Conversation\n${recentText}`);
    used += recentText.length + 24;
  }

  // 6. Fill remaining budget with older messages (user-scoped)
  const allUserMsgs = userId
    ? memory.recentForUser(userId, 100)
    : memory.messages;
  const remaining = MAX_CHARS - used;
  if (remaining > 200 && allUserMsgs.length > RECENT_MESSAGES) {
    const older = allUserMsgs.slice(0, -RECENT_MESSAGES);
    const olderText = fillBudget(older, remaining);
    if (olderText) sections.push(`## Earlier Context\n${olderText}`);
  }

  return sections.join('\n\n');
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function findRelevantFacts(memory: Memory, message: string, userId?: string): Array<[string, string]> {
  const words = message.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  const facts = userId ? memory.getFactsForUser(userId) : memory.facts;
  return Object.entries(facts).filter(([, v]) =>
    words.some(w => v.toLowerCase().includes(w) || w.includes(v.toLowerCase().split(/\s+/)[0])),
  );
}

function formatMessages(msgs: Message[]): string {
  if (msgs.length === 0) return '';
  return msgs
    .map(m => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`)
    .join('\n\n');
}

function fillBudget(msgs: Message[], maxChars: number): string {
  const lines: string[] = [];
  let used = 0;
  // Walk backwards from most recent older messages
  for (let i = msgs.length - 1; i >= 0; i--) {
    const line = `${msgs[i].role === 'user' ? 'Human' : 'Assistant'}: ${msgs[i].content}`;
    if (used + line.length > maxChars) break;
    lines.unshift(line);
    used += line.length + 2;
  }
  return lines.join('\n\n');
}
