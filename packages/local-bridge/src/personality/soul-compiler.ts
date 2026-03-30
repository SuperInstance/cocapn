/**
 * SoulCompiler — parses soul.md into a structured system prompt.
 *
 * soul.md defines the agent's personality via YAML frontmatter + markdown sections.
 * The compiler extracts identity, knowledge, constraints, and public/private faces
 * to produce both full and public-stripped system prompts.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompiledSoul {
  systemPrompt: string;
  publicSystemPrompt: string;
  traits: string[];
  constraints: string[];
  capabilities: string[];
  greeting: string;
  tone: 'formal' | 'casual' | 'professional' | 'friendly' | 'custom';
  version: string;
}

// ─── Frontmatter ──────────────────────────────────────────────────────────────

interface FrontmatterData {
  name?: string;
  version?: string;
  tone?: string;
  model?: string;
  maxTokens?: number;
  greeting?: string;
  [key: string]: unknown;
}

// ─── Compiler ─────────────────────────────────────────────────────────────────

export class SoulCompiler {
  compile(soulMd: string): CompiledSoul {
    const { data: frontmatter, body } = this.parseFrontmatter(soulMd);
    const traits = this.extractTraits(body);
    const constraints = this.extractConstraints(body);
    const capabilities = this.extractCapabilities(body);
    const tone = this.detectTone(frontmatter, body);
    const greeting = this.extractGreeting(frontmatter, body);

    const systemPrompt = this.buildSystemPrompt(frontmatter, body);
    const publicSystemPrompt = this.stripPrivateSections(systemPrompt, body);

    return {
      systemPrompt,
      publicSystemPrompt,
      traits,
      constraints,
      capabilities,
      greeting,
      tone,
      version: frontmatter.version ?? '0.0',
    };
  }

  // ─── Frontmatter parsing ──────────────────────────────────────────────────

  parseFrontmatter(content: string): { data: FrontmatterData; body: string } {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) {
      return { data: {}, body: content.trim() };
    }

    const data = this.parseYamlSimple(match[1]);
    return { data, body: match[2].trim() };
  }

  /**
   * Minimal YAML parser — handles string, number, boolean values and simple
   * key: value pairs. No nested objects or arrays needed for soul.md frontmatter.
   */
  private parseYamlSimple(raw: string): FrontmatterData {
    const data: FrontmatterData = {};
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) continue;

      const key = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();

      if (value === 'true') data[key] = true;
      else if (value === 'false') data[key] = false;
      // Keep all scalars as strings — version "1.2", maxTokens "4096", etc.
      else data[key] = value.replace(/^["']|["']$/g, '');
    }
    return data;
  }

  // ─── Section extraction ───────────────────────────────────────────────────

  /**
   * Extract the content of a markdown section by heading.
   * Returns lines until the next heading of equal or higher level.
   */
  private extractSection(body: string, headingPattern: RegExp): string {
    const lines = body.split('\n');
    let capturing = false;
    const captured: string[] = [];
    let headingLevel = 0;

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        if (capturing && level <= headingLevel) break;
        if (!capturing && headingPattern.test(headingMatch[2])) {
          capturing = true;
          headingLevel = level;
          continue;
        }
      }
      if (capturing) {
        captured.push(line);
      }
    }

    return captured.join('\n').trim();
  }

  private extractListItems(section: string): string[] {
    return section
      .split('\n')
      .map((l) => l.replace(/^[-*]\s+/, '').trim())
      .filter((l) => l.length > 0);
  }

  // ─── Trait extraction ─────────────────────────────────────────────────────

  /**
   * Extract traits from the Identity section.
   * Looks for bullet points and lines describing personality traits.
   */
  extractTraits(body: string): string[] {
    const identity = this.extractSection(body, /^identity$/i);
    if (!identity) return [];

    const items = this.extractListItems(identity);
    // Also pick up short descriptive phrases (lines under ~60 chars that read like traits)
    if (items.length === 0) {
      return identity
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && l.length < 80 && !l.startsWith('#'));
    }
    return items;
  }

  // ─── Constraint extraction ────────────────────────────────────────────────

  /**
   * Extract constraints from "What You Don't Do" / "Constraints" / "Rules" sections.
   */
  extractConstraints(body: string): string[] {
    const section = this.extractSection(
      body,
      /^(what you don'?t do|constraints|rules|boundaries|limitations)$/i,
    );
    if (!section) return [];

    return this.extractListItems(section);
  }

  // ─── Capability extraction ────────────────────────────────────────────────

  /**
   * Extract capabilities from "What You Know" / "Capabilities" / "Skills" sections.
   */
  extractCapabilities(body: string): string[] {
    const section = this.extractSection(
      body,
      /^(what you know|capabilities|skills|knowledge|expertise)$/i,
    );
    if (!section) return [];

    return this.extractListItems(section);
  }

  // ─── Greeting extraction ──────────────────────────────────────────────────

  private extractGreeting(frontmatter: FrontmatterData, body: string): string {
    if (typeof frontmatter.greeting === 'string' && frontmatter.greeting.trim()) {
      return frontmatter.greeting.trim();
    }

    const greetingSection = this.extractSection(body, /^(greeting|welcome|introduction)$/i);
    if (greetingSection) {
      // Return the first non-empty line
      return greetingSection.split('\n').map((l) => l.trim()).filter(Boolean)[0] ?? '';
    }

    return '';
  }

  // ─── Tone detection ───────────────────────────────────────────────────────

  private VALID_TONES = new Set<CompiledSoul['tone']>([
    'formal', 'casual', 'professional', 'friendly', 'custom',
  ]);

  detectTone(frontmatter: FrontmatterData, body: string): CompiledSoul['tone'] {
    // Explicit frontmatter takes priority
    if (typeof frontmatter.tone === 'string') {
      const normalized = frontmatter.tone.toLowerCase().trim();
      if (this.VALID_TONES.has(normalized as CompiledSoul['tone'])) {
        return normalized as CompiledSoul['tone'];
      }
      return 'custom';
    }

    // Content analysis — simple keyword scoring
    const lower = body.toLowerCase();
    const scores: Record<string, number> = {
      formal: 0,
      casual: 0,
      professional: 0,
      friendly: 0,
    };

    // Formal signals
    for (const w of ['formal', 'professional', 'respectful', 'proper', 'courteous', 'sir', 'madam']) {
      if (lower.includes(w)) scores.formal++;
    }

    // Casual signals
    for (const w of ['casual', 'chill', 'relaxed', 'hey', 'yo', 'dude', 'buddy', 'mate']) {
      if (lower.includes(w)) scores.casual++;
    }

    // Professional signals
    for (const w of ['professional', 'business', 'expert', 'reliable', 'competent', 'efficient']) {
      if (lower.includes(w)) scores.professional++;
    }

    // Friendly signals
    for (const w of ['friendly', 'warm', 'welcoming', 'helpful', 'kind', 'approachable', 'glad']) {
      if (lower.includes(w)) scores.friendly++;
    }

    const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    return best[1] > 0 ? (best[0] as CompiledSoul['tone']) : 'casual';
  }

  // ─── System prompt building ───────────────────────────────────────────────

  buildSystemPrompt(frontmatter: FrontmatterData, body: string): string {
    const parts: string[] = [];

    // Identity header
    if (frontmatter.name) {
      parts.push(`You are ${frontmatter.name}.`);
    }

    // Add the full body as the system prompt core
    if (body.trim()) {
      parts.push(body.trim());
    }

    return parts.join('\n\n');
  }

  // ─── Private section stripping ────────────────────────────────────────────

  /**
   * Build a public-safe system prompt: includes Identity + Public Face sections
   * only. Strips everything else (knowledge, constraints, private sections).
   */
  stripPrivateSections(systemPrompt: string, body: string): string {
    const identity = this.extractSectionDirect(body, /^identity$/i);
    const publicFace = this.extractSectionDirect(body, /^public face/i);

    const parts: string[] = [];

    if (identity) {
      parts.push(identity);
    }

    if (publicFace) {
      parts.push(publicFace);
    }

    // If neither section found, return an empty public prompt
    if (parts.length === 0) {
      return '';
    }

    return parts.join('\n\n');
  }

  /**
   * Extract section content stopping at any subsection (lower-level) heading.
   * Unlike extractSection which captures subsections, this stops at the first
   * heading of any level below the matched heading.
   */
  private extractSectionDirect(body: string, headingPattern: RegExp): string {
    const lines = body.split('\n');
    let capturing = false;
    const captured: string[] = [];

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch) {
        if (capturing) {
          // Any heading stops capture (subsections included)
          break;
        }
        if (headingPattern.test(headingMatch[2])) {
          capturing = true;
          continue;
        }
      }
      if (capturing) {
        captured.push(line);
      }
    }

    return captured.join('\n').trim();
  }
}
