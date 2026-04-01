/**
 * DMLog Vision — TTRPG-specific image generation using cocapn Vision module.
 *
 * Generates character portraits, scene illustrations, monster art,
 * maps, item illustrations, and SNES-style sprites.
 */

import { Vision, type GenerateResult, type GenerateOptions } from '../../../../seed/src/vision.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CharacterDesc { name: string; race: string; charClass: string; description: string }
export interface SceneDesc { location: string; mood: string; events: string }
export interface MonsterDesc { name: string; description: string; cr: string }
export interface MapDesc { locations: string[]; connections: string }
export interface ItemDesc { name: string; rarity: string; description: string }

// ─── DM Vision ─────────────────────────────────────────────────────────────────

export class DMVision {
  private vision: Vision;

  constructor(apiKey?: string) {
    this.vision = new Vision({ apiKey });
  }

  /** Generate a character portrait */
  async generateCharacter(c: CharacterDesc, style = 'fantasy portrait'): Promise<GenerateResult> {
    const prompt = `Character portrait: ${c.name}, ${c.race} ${c.charClass}. ${c.description}. Detailed face, expressive eyes, RPG character art.`;
    return this.vision.generateImage(prompt, { model: 'gemini-2.0-flash', resolution: '1024x1024', style });
  }

  /** Generate a scene illustration */
  async generateScene(s: SceneDesc, style = 'fantasy illustration'): Promise<GenerateResult> {
    const prompt = `Scene: ${s.location}. Mood: ${s.mood}. Events: ${s.events}. Atmospheric, cinematic lighting, fantasy RPG.`;
    return this.vision.generateImage(prompt, { model: 'imagen-3.0-generate-002', resolution: '2048x2048', style });
  }

  /** Generate a monster/NPC illustration */
  async generateMonster(m: MonsterDesc, style = 'fantasy monster manual'): Promise<GenerateResult> {
    const prompt = `Monster illustration: ${m.name} (CR ${m.cr}). ${m.description}. D&D monster manual style, detailed, dramatic pose.`;
    return this.vision.generateImage(prompt, { model: 'gemini-2.0-flash', resolution: '1024x1024', style });
  }

  /** Generate a simple map */
  async generateMap(m: MapDesc, style = 'fantasy map'): Promise<GenerateResult> {
    const prompt = `Fantasy map with locations: ${m.locations.join(', ')}. ${m.connections}. Top-down view, parchment style, labeled locations, RPG map.`;
    return this.vision.generateImage(prompt, { model: 'imagen-3.0-generate-002', resolution: '2048x2048', style });
  }

  /** Generate an item illustration */
  async generateItem(i: ItemDesc, style = 'fantasy item illustration'): Promise<GenerateResult> {
    const prompt = `Magic item: ${i.name} (${i.rarity}). ${i.description}. Detailed object, centered, dark background, D&D item card style.`;
    return this.vision.generateImage(prompt, { model: 'gemini-2.0-flash', resolution: '512x512', style });
  }

  /** Generate a SNES-style sprite */
  async generateSprite(type: string, palette = '16-color fantasy'): Promise<GenerateResult> {
    return this.vision.generateSpriteSheet(type, { size: '32x32', palette });
  }
}
