/**
 * Entity extractor — regex-based extraction of names, dates, numbers, and locations.
 * No NLP library needed. Used by the learn command to enrich knowledge entries.
 */

import type { KnowledgeType } from "./pipeline.js";

// ─── Extracted entity types ────────────────────────────────────────────────────

export interface ExtractedEntity {
  kind: "name" | "date" | "number" | "location";
  value: string;
  context?: string; // surrounding ~40 chars for disambiguation
}

export interface ExtractionResult {
  entities: ExtractedEntity[];
  suggestedType: KnowledgeType | "general";
  tags: string[];
  summary: string;
}

// ─── Regex patterns ────────────────────────────────────────────────────────────

const DATE_PATTERNS = [
  /\b(\d{4}-\d{2}-\d{2})\b/g,                                           // ISO dates
  /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/g,                                   // US dates
  /\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})\b/gi, // 15 March 2024
  /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/g,  // March 15, 2024
  /\b(yesterday|today|last\s+(?:week|month|year)|next\s+(?:week|month|year))\b/gi,           // relative dates
];

const NUMBER_PATTERN = /\b(\d+(?:\.\d+)?)\s*(kg|lbs?|pounds?|ft|meters?|m|cm|mm|inches?|in|oz|ounces?|tons?|celsius|fahrenheit|°[FC]|km|mi|miles?|mph|knots?|km\/h)\b/gi;

const LOCATION_KEYWORDS = /\b((?:Lake|River|Bay|Gulf|Ocean|Sea|Harbor|Port|Island|Cape|Point|Beach|Coast|Strait|Channel|Reef|Shoal|Bank|Creek|Pond|Reservoir|Spring|Falls?)\s+[A-Z][\w'-]*(?:\s+[A-Z][\w'-]*)*)\b/g;

const NAME_PATTERN = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;

// ─── Type-detection keywords ───────────────────────────────────────────────────

const TYPE_KEYWORDS: Record<KnowledgeType, RegExp> = {
  species: /\b(?:species|fish|animal|plant|bird|mammal|insect|scientific name|genus|habitat|diet|lifespan|breeding|spawn|migrate)\b/i,
  regulation: /\b(?:regulation|law|rule|permit|license|quota|limit|season|closed|open|prohibited|restricted|legal|required|compliance|violation|enforcement|jurisdiction)\b/i,
  technique: /\b(?:technique|method|procedure|approach|strategy|tactic|skill|how\s+to|step|process|drill|practice|cast|reel|bait|lure|trolling|jigging)\b/i,
  location: /\b(?:location|spot|area|zone|region|coordinates|latitude|longitude|depth|elevation|terrain|habitat|water|lake|river|bay|ocean|coast|GPS)\b/i,
  equipment: /\b(?:equipment|gear|rod|reel|line|hook|bait|lure|boat|motor|net|trap|waders|tackle|rig|swivel|sinker|float|brand|model|manufacturer|specification)\b/i,
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function excerpt(text: string, index: number, len: number): string {
  const start = Math.max(0, index - 20);
  const end = Math.min(text.length, index + len + 20);
  return text.slice(start, end).replace(/\n/g, " ");
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Extract entities and suggest a knowledge type from raw text.
 */
export function extract(text: string): ExtractionResult {
  const entities: ExtractedEntity[] = [];
  const seen = new Set<string>();

  // Dates
  for (const re of DATE_PATTERNS) {
    let match: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((match = re.exec(text)) !== null) {
      const val = match[1] ?? match[0];
      const key = `date:${val}`;
      if (!seen.has(key)) {
        seen.add(key);
        entities.push({ kind: "date", value: val, context: excerpt(text, match.index, val.length) });
      }
    }
  }

  // Numbers with units
  NUMBER_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = NUMBER_PATTERN.exec(text)) !== null) {
    const val = `${match[1]} ${match[2]}`;
    const key = `number:${val}`;
    if (!seen.has(key)) {
      seen.add(key);
      entities.push({ kind: "number", value: val, context: excerpt(text, match.index, val.length) });
    }
  }

  // Locations
  LOCATION_KEYWORDS.lastIndex = 0;
  while ((match = LOCATION_KEYWORDS.exec(text)) !== null) {
    const val = match[1];
    const key = `location:${val}`;
    if (!seen.has(key)) {
      seen.add(key);
      entities.push({ kind: "location", value: val, context: excerpt(text, match.index, val.length) });
    }
  }

  // Names (multi-word capitalized, filter common false positives)
  const STOP_NAMES = new Set(["The United", "New York", "San Francisco", "Los Angeles", "Las Vegas", "New Orleans"]);
  NAME_PATTERN.lastIndex = 0;
  while ((match = NAME_PATTERN.exec(text)) !== null) {
    const val = match[1];
    if (STOP_NAMES.has(val)) {
      // these are locations, not names
      continue;
    }
    const key = `name:${val}`;
    if (!seen.has(key)) {
      seen.add(key);
      entities.push({ kind: "name", value: val, context: excerpt(text, match.index, val.length) });
    }
  }

  // Suggest type
  const suggestedType = suggestType(text);

  // Generate tags
  const tags = generateTags(text, entities);

  // Summary: first ~200 chars of cleaned text
  const clean = text.replace(/\s+/g, " ").trim();
  const summary = clean.length > 200 ? clean.slice(0, 197) + "..." : clean;

  return { entities, suggestedType, tags, summary };
}

/**
 * Suggest a knowledge type based on keyword frequency in the text.
 */
export function suggestType(text: string): KnowledgeType | "general" {
  let best: KnowledgeType | "general" = "general";
  let bestScore = 0;

  for (const [type, re] of Object.entries(TYPE_KEYWORDS) as [KnowledgeType, RegExp][]) {
    const matches = text.match(re);
    const score = matches ? matches.length : 0;
    if (score > bestScore) {
      bestScore = score;
      best = type;
    }
  }

  return best;
}

/**
 * Generate tags from extracted entities and content.
 */
function generateTags(text: string, entities: ExtractedEntity[]): string[] {
  const tags = new Set<string>();

  for (const entity of entities) {
    if (entity.kind === "location") tags.add(entity.value.toLowerCase().replace(/\s+/g, "-"));
    if (entity.kind === "name") tags.add(entity.value.toLowerCase().replace(/\s+/g, "-"));
  }

  // Extract hash-style keywords from text
  const keywordMatch = text.match(/\b([A-Z][a-z]{3,}(?:[A-Z][a-z]+)+)\b/g); // CamelCase terms
  if (keywordMatch) {
    for (const kw of keywordMatch.slice(0, 5)) {
      tags.add(kw.toLowerCase());
    }
  }

  return Array.from(tags).slice(0, 20);
}
