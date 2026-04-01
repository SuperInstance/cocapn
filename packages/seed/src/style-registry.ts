/**
 * Style Registry — reusable art style presets for cocapn apps.
 *
 * Shared across all apps — sprites, sketches, paintings, photos.
 * Zero dependencies.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ResolutionPreset {
  width: number;
  height: number;
  style: string;
}

// ─── Resolution Presets ────────────────────────────────────────────────────────

export const RESOLUTIONS: Record<string, ResolutionPreset> = {
  'sprite-16': { width: 16, height: 16, style: 'pixel art, 16x16 sprite, limited palette, retro game' },
  'sprite-32': { width: 32, height: 32, style: 'pixel art, 32x32 sprite, SNES style, 16 colors' },
  'sprite-64': { width: 64, height: 64, style: 'pixel art, 64x64 sprite, detailed pixel art' },
  'sketch': { width: 512, height: 512, style: 'pencil sketch, hand drawn, rough lines' },
  'watercolor': { width: 1024, height: 1024, style: 'watercolor painting, soft edges, wet media' },
  'oil': { width: 1024, height: 1024, style: 'oil painting, rich colors, textured brush strokes' },
  'photorealistic': { width: 2048, height: 2048, style: 'photorealistic, detailed, high quality, 8k' },
};

// ─── Functions ─────────────────────────────────────────────────────────────────

export function buildPrompt(subject: string, resolution: string, style?: string, extras?: string): string {
  const preset = RESOLUTIONS[resolution];
  const parts = [subject];
  if (preset) parts.push(preset.style);
  if (style) parts.push(style);
  if (extras) parts.push(extras);
  return parts.join(', ');
}

export function getResolution(id: string): ResolutionPreset | undefined {
  return RESOLUTIONS[id];
}

export function getAllResolutions(): Record<string, ResolutionPreset> {
  return { ...RESOLUTIONS };
}
