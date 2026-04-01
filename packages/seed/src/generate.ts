/**
 * Generate — universal asset generation for cocapn apps.
 *
 * Wraps Vision with batch queuing, sprite generation, and CLI commands.
 * Zero dependencies — uses Vision (fetch-based) internally.
 */

import { Vision } from './vision.js';
import type { VisionConfig, GenerateOptions, GenerateResult } from './vision.js';
import { buildPrompt, getResolution } from './style-registry.js';
import { addToGallery, getGallery } from './vision.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface GenerateTask {
  prompt: string;
  options?: GenerateOptions & { width?: number; height?: number };
}

export interface BatchResult {
  results: GenerateResult[];
  errors: Array<{ prompt: string; error: string }>;
}

export interface BatchConfig {
  maxParallel?: number;
  onProgress?: (done: number, total: number) => void;
}

// ─── Generator ─────────────────────────────────────────────────────────────────

export class Generator {
  private vision: Vision;

  constructor(config?: VisionConfig) {
    this.vision = new Vision(config);
  }

  /** Generate an image with enhanced options */
  async generateImage(prompt: string, options?: GenerateOptions & { width?: number; height?: number }): Promise<GenerateResult> {
    const res = options?.width && options?.height ? `${options.width}x${options.height}` : options?.resolution;
    const result = await this.vision.generateImage(prompt, { ...options, resolution: res });
    addToGallery(result);
    return result;
  }

  /** Generate pixel art sprite at standard sizes */
  async generateSprite(prompt: string, options?: { size?: 16 | 32 | 64 | 128; style?: string; seed?: number }): Promise<GenerateResult> {
    const size = options?.size ?? 32;
    const spritePrompt = `${prompt}, pixel art, ${size}x${size} sprite, limited color palette, retro game style, transparent background`;
    const result = await this.vision.generateImage(spritePrompt, {
      resolution: `${size}x${size}`,
      style: options?.style ?? 'pixel-art',
      seed: options?.seed,
    });
    addToGallery(result);
    return result;
  }

  /** Batch generate with parallel queue */
  async batchGenerate(tasks: GenerateTask[], config?: BatchConfig): Promise<BatchResult> {
    const maxParallel = config?.maxParallel ?? 3;
    const results: GenerateResult[] = [];
    const errors: Array<{ prompt: string; error: string }> = [];
    let done = 0;

    const queue = [...tasks];
    const workers = Array.from({ length: Math.min(maxParallel, tasks.length) }, async () => {
      while (queue.length > 0) {
        const task = queue.shift();
        if (!task) break;
        try {
          const result = await this.generateImage(task.prompt, task.options);
          results.push(result);
        } catch (e) {
          errors.push({ prompt: task.prompt, error: String(e) });
        }
        done++;
        config?.onProgress?.(done, tasks.length);
      }
    });

    await Promise.all(workers);
    return { results, errors };
  }
}

// ─── CLI Commands ──────────────────────────────────────────────────────────────

export function cmdGenerate(prompt: string, config?: VisionConfig): string {
  const GR = '\x1b[90m', G = '\x1b[32m', R = '\x1b[0m';
  if (!prompt) return `${GR}Usage: /generate <prompt>${R}`;
  const gen = new Generator(config);
  gen.generateImage(prompt).then(r => {
    console.log(`${G}Generated:${R} ${r.metadata.resolution} via ${r.metadata.model}`);
  }).catch(e => console.log(`${GR}Error: ${e}${R}`));
  return `${GR}Generating...${R}`;
}

export function cmdGallery(): string {
  const GR = '\x1b[90m', G = '\x1b[32m', R = '\x1b[0m';
  const images = getGallery();
  if (images.length === 0) return `${GR}(no generated images yet)${R}`;
  return images.map((img, i) =>
    `${G}${i + 1}.${R} ${img.metadata.prompt.slice(0, 60)} ${GR}(${img.metadata.resolution}, ${img.metadata.model})${R}`
  ).join('\n');
}
