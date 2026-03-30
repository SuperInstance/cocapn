/**
 * Soul template registry — ready-to-use soul.md templates for each vertical.
 *
 * Each template is a string containing the full soul.md content (YAML frontmatter
 * + markdown sections) ready to be compiled by SoulCompiler.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Template loaders ─────────────────────────────────────────────────────

function loadTemplate(filename: string): string {
  return readFileSync(join(__dirname, filename), 'utf-8');
}

// ─── Templates ────────────────────────────────────────────────────────────

export const fishingBuddy: string = loadTemplate('fishing-buddy.md');
export const dungeonMaster: string = loadTemplate('dungeon-master.md');
export const deckboss: string = loadTemplate('deckboss.md');
export const developerAssistant: string = loadTemplate('developer-assistant.md');
export const studentTutor: string = loadTemplate('student-tutor.md');

// ─── Registry ─────────────────────────────────────────────────────────────

const SOUL_TEMPLATES = {
  fishingBuddy,
  dungeonMaster,
  deckboss,
  developerAssistant,
  studentTutor,
} as const;

export { SOUL_TEMPLATES };

/**
 * Get a soul template by name (kebab-case or camelCase).
 *
 * @example
 * getSoulTemplate('fishing-buddy')   // returns fishing buddy soul.md
 * getSoulTemplate('fishingBuddy')    // same, camelCase
 * getSoulTemplate('deckboss')        // returns deckboss soul.md
 */
export function getSoulTemplate(name: string): string | undefined {
  const key = name in SOUL_TEMPLATES
    ? name as keyof typeof SOUL_TEMPLATES
    : undefined;
  if (key) return SOUL_TEMPLATES[key];

  // Try kebab-case to camelCase conversion
  const camelCase = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) as keyof typeof SOUL_TEMPLATES;
  return SOUL_TEMPLATES[camelCase];
}

/**
 * List all available soul template names.
 */
export function listSoulTemplates(): string[] {
  return Object.keys(SOUL_TEMPLATES);
}
