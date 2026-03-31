import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface StarterMeta {
  slug: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  icon: string;
  vertical?: string;
}

export interface Starter extends StarterMeta {
  soul: string;
  config: string;
  readme: string;
  theme: string;
  plugins: string[];
  facts: string;
  memories: string;
}

const STARTER_META: StarterMeta[] = [
  {
    slug: 'fishing-buddy',
    name: 'Fishing Buddy',
    description: 'Alaska and Pacific Northwest fishing companion — species guides, technique tips, catch logging, tide and weather integration',
    category: 'outdoors',
    tags: ['fishing', 'alaska', 'halibut', 'salmon', 'outdoors', 'species', 'regulations'],
    icon: '🐟',
    vertical: 'fishinglog.ai',
  },
  {
    slug: 'dungeon-master',
    name: 'Dungeon Master',
    description: 'TTRPG game master for D&D 5e, Pathfinder, and Call of Cthulhu — encounters, NPCs, loot tables, campaign continuity',
    category: 'gaming',
    tags: ['ttrpg', 'dnd', 'pathfinder', 'rpg', 'dungeon-master', 'campaign', 'encounters'],
    icon: '🎲',
    vertical: 'dmlog.ai',
  },
  {
    slug: 'deck-boss',
    name: 'Deck Boss',
    description: 'Commercial fishing foreman — quota tracking, crew management, equipment maintenance, USCG compliance, Bering Sea operations',
    category: 'outdoors',
    tags: ['commercial-fishing', 'bering-sea', 'quota', 'crew', 'maritime', 'ifq', 'deckboss'],
    icon: '⚓',
    vertical: 'deckboss.ai',
  },
  {
    slug: 'study-buddy',
    name: 'Study Buddy',
    description: 'Patient academic tutor — Socratic method, spaced repetition, flashcards, quiz generation, progress tracking',
    category: 'education',
    tags: ['tutoring', 'study', 'flashcards', 'spaced-repetition', 'socratic', 'learning', 'exams'],
    icon: '📚',
  },
  {
    slug: 'dev-mate',
    name: 'Dev Mate',
    description: 'Software developer assistant — code review, Git workflows, CI/CD, testing patterns, architectural decisions',
    category: 'development',
    tags: ['coding', 'code-review', 'git', 'ci-cd', 'testing', 'architecture', 'developer'],
    icon: '💻',
  },
  {
    slug: 'life-admin',
    name: 'Life Admin',
    description: 'Personal assistant — calendar management, habits, bill tracking, travel planning, productivity systems',
    category: 'productivity',
    tags: ['personal', 'calendar', 'habits', 'budget', 'travel', 'productivity', 'gtd'],
    icon: '📋',
  },
  {
    slug: 'creative-writer',
    name: 'Creative Writer',
    description: 'Writing companion — plotting, character development, worldbuilding, dialogue, story structure, genre conventions',
    category: 'creative',
    tags: ['writing', 'fiction', 'novel', 'storytelling', 'worldbuilding', 'plot', 'characters'],
    icon: '✍️',
  },
  {
    slug: 'home-automation',
    name: 'Home Automation',
    description: 'Smart home manager — IoT device control, routine scheduling, energy monitoring, security alerts, automation recipes',
    category: 'iot',
    tags: ['smart-home', 'iot', 'automation', 'energy', 'security', 'devices', 'home-assistant'],
    icon: '🏠',
  },
];

function loadFile(slug: string, filename: string): string {
  const filepath = join(__dirname, slug, filename);
  if (!existsSync(filepath)) {
    throw new Error(`Starter file not found: ${filepath}`);
  }
  return readFileSync(filepath, 'utf-8');
}

function loadPlugins(slug: string): string[] {
  const pluginsDir = join(__dirname, slug, 'plugins');
  if (!existsSync(pluginsDir)) return [];
  return readdirSync(pluginsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

export function getStarter(slug: string): Starter | undefined {
  const meta = STARTER_META.find(
    (s) => s.slug === slug || s.slug === slug.replace(/_/g, '-')
  );
  if (!meta) return undefined;

  return {
    ...meta,
    soul: loadFile(meta.slug, 'soul.md'),
    config: loadFile(meta.slug, 'config.yml'),
    readme: loadFile(meta.slug, 'README.md'),
    theme: loadFile(meta.slug, 'theme.css'),
    plugins: loadPlugins(meta.slug),
    facts: loadFile(meta.slug, 'cocapn/memory/facts.json'),
    memories: loadFile(meta.slug, 'cocapn/memory/memories.json'),
  };
}

export function listStarters(): StarterMeta[] {
  return [...STARTER_META];
}

export function getStarterByCategory(category: string): StarterMeta[] {
  return STARTER_META.filter((s) => s.category === category);
}

export function getStarterByVertical(vertical: string): StarterMeta[] {
  return STARTER_META.filter((s) => s.vertical === vertical);
}

export function searchStarters(query: string): StarterMeta[] {
  const lower = query.toLowerCase();
  return STARTER_META.filter(
    (s) =>
      s.name.toLowerCase().includes(lower) ||
      s.description.toLowerCase().includes(lower) ||
      s.tags.some((tag) => tag.includes(lower))
  );
}

export const STARTERS = STARTER_META;
