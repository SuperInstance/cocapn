/**
 * Skill Loader — Hot/Cold Skill Management
 *
 * The SkillLoader manages skill cartridges with hot/cold splitting.
 * Hot skills are always loaded (frequently used). Cold skills are
 * loaded on-demand and evicted using LRU when limits are reached.
 */

import { readFile, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type {
  SkillCartridge,
  LoadedSkill,
  SkillLoaderOptions,
  SkillLoaderStats,
  SkillContext,
} from './types.js';

const DEFAULT_OPTIONS: Required<SkillLoaderOptions> = {
  maxColdSkills: 20,
  maxMemoryBytes: 50 * 1024, // 50KB
  skillPaths: [],
};

/**
 * Skill Loader with hot/cold management
 *
 * Manages skill cartridges with LRU eviction for cold skills.
 * Hot skills are always loaded in memory.
 */
export class SkillLoader {
  private skills: Map<string, LoadedSkill> = new Map();
  private hotSkills: Set<string> = new Set();
  private registry: Map<string, string> = new Map(); // name -> path
  private options: Required<SkillLoaderOptions>;

  constructor(options?: SkillLoaderOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Register a skill cartridge from a file path
   * @param path - Path to skill.json file
   * @returns The loaded cartridge
   * @throws Error if file doesn't exist or is invalid
   */
  async register(path: string): Promise<SkillCartridge> {
    if (!existsSync(path)) {
      throw new Error(`Skill file not found: ${path}`);
    }

    const content = await readFile(path, 'utf-8');
    const cartridge = JSON.parse(content) as SkillCartridge;

    this.validateCartridge(cartridge);
    this.registry.set(cartridge.name, path);

    // Load hot skills immediately
    if (cartridge.hot) {
      this.load(cartridge.name);
    }

    return cartridge;
  }

  /**
   * Register all skill cartridges in a directory
   * @param dir - Directory containing skill.json files
   * @returns Number of skills registered
   */
  async registerDirectory(dir: string): Promise<number> {
    if (!existsSync(dir)) {
      return 0;
    }

    const entries = await readdir(dir, { withFileTypes: true });
    let count = 0;

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = join(dir, entry.name, 'skill.json');
        if (existsSync(skillPath)) {
          await this.register(skillPath);
          count++;
        }
      }
    }

    return count;
  }

  /**
   * Load a skill by name
   * @param name - Skill name to load
   * @returns The loaded cartridge or null if not found
   */
  load(name: string): SkillCartridge | null {
    const path = this.registry.get(name);
    if (!path) {
      return null;
    }

    // Check if already loaded
    if (this.skills.has(name)) {
      const skill = this.skills.get(name)!;
      skill.lastUsedAt = Date.now();
      return skill.cartridge;
    }

    // Load the cartridge
    const cartridge = this.loadCartridgeSync(path);
    if (!cartridge) {
      return null;
    }

    // Check memory budget
    if (this.shouldEvict()) {
      this.evict();
    }

    // Create loaded skill
    const loadedSkill: LoadedSkill = {
      name,
      cartridge,
      loadedAt: Date.now(),
      useCount: 0,
      lastUsedAt: Date.now(),
    };

    this.skills.set(name, loadedSkill);

    if (cartridge.hot) {
      this.hotSkills.add(name);
    }

    return cartridge;
  }

  /**
   * Load skills by intent keywords
   * @param keywords - Keywords to search for
   * @returns Array of matching skill cartridges
   */
  loadByIntent(keywords: string[]): SkillCartridge[] {
    const matches: SkillCartridge[] = [];
    const loaded = new Set<string>();

    for (const keyword of keywords) {
      for (const [name, path] of this.registry) {
        if (loaded.has(name)) continue;

        const cartridge = this.loadCartridgeSync(path);
        if (!cartridge) continue;

        // Check if keyword matches any trigger
        const triggers = cartridge.triggers.map(t => t.toLowerCase());
        if (triggers.includes(keyword.toLowerCase())) {
          this.load(name);
          matches.push(cartridge);
          loaded.add(name);
        }
      }
    }

    return matches;
  }

  /**
   * Unload a skill
   * @param name - Skill name to unload
   * @returns True if skill was unloaded, false if not loaded
   */
  unload(name: string): boolean {
    if (!this.skills.has(name)) {
      return false;
    }

    this.skills.delete(name);
    this.hotSkills.delete(name);
    return true;
  }

  /**
   * Check if a skill is currently loaded
   * @param name - Skill name to check
   * @returns True if loaded
   */
  isLoaded(name: string): boolean {
    return this.skills.has(name);
  }

  /**
   * Get all registered skill cartridges
   * @returns Array of all cartridges
   */
  getAll(): SkillCartridge[] {
    const cartridges: SkillCartridge[] = [];
    for (const path of this.registry.values()) {
      const cartridge = this.loadCartridgeSync(path);
      if (cartridge) {
        cartridges.push(cartridge);
      }
    }
    return cartridges;
  }

  /**
   * Get all currently loaded skills
   * @returns Array of loaded skills with metadata
   */
  getLoaded(): LoadedSkill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get all hot skills (always loaded)
   * @returns Array of hot skill cartridges
   */
  getHot(): SkillCartridge[] {
    const hot: SkillCartridge[] = [];
    for (const name of this.hotSkills) {
      const skill = this.skills.get(name);
      if (skill) {
        hot.push(skill.cartridge);
      }
    }
    return hot;
  }

  /**
   * Build skill context for agent prompt
   * @param maxTokens - Maximum tokens to include (default: no limit)
   * @returns Context string with loaded skills
   */
  buildSkillContext(maxTokens?: number): SkillContext {
    const skills: string[] = [];
    let totalTokens = 0;
    const parts: string[] = [];

    // Add hot skills first
    for (const name of this.hotSkills) {
      const skill = this.skills.get(name);
      if (skill && (!maxTokens || totalTokens < maxTokens)) {
        const skillText = this.formatSkill(skill.cartridge);
        const skillTokens = skill.cartridge.tokenBudget || 500;

        if (!maxTokens || totalTokens + skillTokens <= maxTokens) {
          parts.push(skillText);
          skills.push(name);
          totalTokens += skillTokens;
        }
      }
    }

    // Add cold skills (sorted by use count)
    const coldSkills = Array.from(this.skills.entries())
      .filter(([name]) => !this.hotSkills.has(name))
      .sort(([, a], [, b]) => b.useCount - a.useCount);

    for (const [name, skill] of coldSkills) {
      if (!maxTokens || totalTokens < maxTokens) {
        const skillText = this.formatSkill(skill.cartridge);
        const skillTokens = skill.cartridge.tokenBudget || 500;

        if (!maxTokens || totalTokens + skillTokens <= maxTokens) {
          parts.push(skillText);
          skills.push(name);
          totalTokens += skillTokens;
        }
      }
    }

    return {
      context: parts.join('\n\n'),
      skills,
      tokens: totalTokens,
    };
  }

  /**
   * Promote a skill to hot (always loaded)
   * @param name - Skill name to promote
   */
  warm(name: string): void {
    if (this.skills.has(name)) {
      this.hotSkills.add(name);
      const skill = this.skills.get(name)!;
      skill.cartridge.hot = true;
    }
  }

  /**
   * Get statistics about loader state
   * @returns Loader statistics
   */
  stats(): SkillLoaderStats {
    const hot = this.hotSkills.size;
    const cold = this.skills.size - hot;
    let memoryBytes = 0;

    for (const skill of this.skills.values()) {
      memoryBytes += skill.cartridge.tokenBudget || 500;
    }

    return {
      total: this.registry.size,
      loaded: this.skills.size,
      hot,
      cold,
      memoryBytes,
    };
  }

  /**
   * Evict least recently used cold skills
   * @returns Number of skills evicted
   */
  private evict(): number {
    // Get cold skills sorted by last used time
    const coldSkills = Array.from(this.skills.entries())
      .filter(([name]) => !this.hotSkills.has(name))
      .sort(([, a], [, b]) => a.lastUsedAt - b.lastUsedAt);

    let evicted = 0;
    for (const [name] of coldSkills) {
      if (!this.shouldEvict()) {
        break;
      }
      this.unload(name);
      evicted++;
    }

    return evicted;
  }

  /**
   * Check if we should evict skills
   * @returns True if limits exceeded
   */
  private shouldEvict(): boolean {
    const stats = this.stats();
    const coldCount = stats.loaded - stats.hot;

    return (
      coldCount >= this.options.maxColdSkills ||
      stats.memoryBytes >= this.options.maxMemoryBytes
    );
  }

  /**
   * Validate a skill cartridge
   * @param cartridge - Cartridge to validate
   * @throws Error if invalid
   */
  private validateCartridge(cartridge: SkillCartridge): void {
    if (!cartridge.name || typeof cartridge.name !== 'string') {
      throw new Error('Invalid skill: missing or invalid name');
    }
    if (!cartridge.version || typeof cartridge.version !== 'string') {
      throw new Error('Invalid skill: missing or invalid version');
    }
    if (!Array.isArray(cartridge.triggers) || cartridge.triggers.length === 0) {
      throw new Error('Invalid skill: missing or empty triggers array');
    }
    if (!Array.isArray(cartridge.steps) || cartridge.steps.length === 0) {
      throw new Error('Invalid skill: missing or empty steps array');
    }
  }

  /**
   * Load a cartridge synchronously from cache or file
   * @param path - Path to skill.json
   * @returns Cartridge or null
   */
  private loadCartridgeSync(path: string): SkillCartridge | null {
    try {
      const content = readFileSync(path, 'utf-8');
      return JSON.parse(content) as SkillCartridge;
    } catch {
      return null;
    }
  }

  /**
   * Format a skill cartridge for context injection
   * @param cartridge - Cartridge to format
   * @returns Formatted string
   */
  private formatSkill(cartridge: SkillCartridge): string {
    const parts: string[] = [];

    parts.push(`## ${cartridge.name}`);
    if (cartridge.description) {
      parts.push(cartridge.description);
    }
    parts.push(`Triggers: ${cartridge.triggers.join(', ')}`);
    parts.push('');

    if (cartridge.steps.length > 0) {
      parts.push('Steps:');
      cartridge.steps.forEach((step, i) => {
        const fallback = step.fallback ? ` (fallback: ${step.fallback})` : '';
        parts.push(`  ${i + 1}. ${step.action}: ${step.description}${fallback}`);
      });
      parts.push('');
    }

    if (cartridge.tolerance) {
      parts.push(`Tolerance: ${JSON.stringify(cartridge.tolerance)}`);
    }

    return parts.join('\n');
  }
}