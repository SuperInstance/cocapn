/**
 * Vision — image generation via Google Generative AI API.
 *
 * Supports: gemini-2.0-flash-exp (fast), gemini-2.0-flash (medium),
 * imagen-3.0-generate-002 (high-res). Zero dependencies, uses fetch.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface VisionConfig {
  apiKey?: string;
  provider?: string;
  defaultModel?: string;
  defaultResolution?: string;
  spriteModel?: string;
  spriteResolution?: string;
}

export interface GenerateOptions {
  model?: string;
  resolution?: string;
  style?: string;
  seed?: number;
  count?: number;
}

export interface GenerateResult {
  url: string;
  base64: string;
  metadata: { model: string; resolution: string; prompt: string; created: string };
}

export interface SpriteOptions {
  size?: '16x16' | '32x32' | '64x64';
  palette?: string;
  style?: string;
}

export interface SceneOptions {
  perspective?: 'top-down' | 'side-scroll' | 'isometric';
  layers?: boolean;
}

type ProgressCB = (event: { stage: string; progress: number }) => void;

// ─── Constants ─────────────────────────────────────────────────────────────────

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const MODELS: Record<string, { res: string; type: string }> = {
  'gemini-2.0-flash-exp': { res: '512x512', type: 'gemini' },
  'gemini-2.0-flash': { res: '1024x1024', type: 'gemini' },
  'imagen-3.0-generate-002': { res: '2048x2048', type: 'imagen' },
};

// ─── Vision class ──────────────────────────────────────────────────────────────

export class Vision {
  private apiKey: string;
  private defaultModel: string;
  private defaultResolution: string;

  constructor(config: VisionConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.GOOGLE_API_KEY ?? '';
    this.defaultModel = config.defaultModel ?? 'gemini-2.0-flash-exp';
    this.defaultResolution = config.defaultResolution ?? '1024x1024';
  }

  /** Generate an image from a text prompt */
  async generateImage(prompt: string, opts: GenerateOptions = {}, onProgress?: ProgressCB): Promise<GenerateResult> {
    const model = opts.model ?? this.defaultModel;
    const resolution = opts.resolution ?? this.defaultResolution;
    const modelInfo = MODELS[model] ?? MODELS['gemini-2.0-flash-exp'];

    onProgress?.({ stage: 'preparing', progress: 0.1 });
    const enhancedPrompt = opts.style ? `${prompt}, ${opts.style} style` : prompt;

    let base64: string;
    if (modelInfo.type === 'gemini') {
      base64 = await this.callGemini(model, enhancedPrompt, resolution, onProgress);
    } else {
      base64 = await this.callImagen(model, enhancedPrompt, resolution, onProgress);
    }

    onProgress?.({ stage: 'done', progress: 1 });
    return {
      url: `data:image/png;base64,${base64.slice(0, 100)}...`,
      base64,
      metadata: { model, resolution, prompt, created: new Date().toISOString() },
    };
  }

  /** Upscale a low-res image through iterative refinement */
  async upscaleImage(imageBase64: string, targetRes: string = '2048x2048', onProgress?: ProgressCB): Promise<GenerateResult> {
    const steps = 3;
    let current = imageBase64;
    const resolutions = ['1024x1024', '1536x1536', targetRes];
    for (let i = 0; i < steps; i++) {
      onProgress?.({ stage: `upscale-step-${i + 1}`, progress: (i + 1) / steps * 0.9 });
      const res = await this.callGemini('gemini-2.0-flash',
        `Upscale and enhance this image to ${resolutions[i]}. Preserve all details.`, resolutions[i], undefined, current);
      current = res;
    }
    onProgress?.({ stage: 'done', progress: 1 });
    return {
      url: `data:image/png;base64,${current.slice(0, 100)}...`,
      base64: current,
      metadata: { model: 'gemini-2.0-flash', resolution: targetRes, prompt: 'upscale', created: new Date().toISOString() },
    };
  }

  /** Generate SNES-style pixel art sprite sheet */
  async generateSpriteSheet(prompt: string, opts: SpriteOptions = {}, onProgress?: ProgressCB): Promise<GenerateResult> {
    const size = opts.size ?? '32x32';
    const palette = opts.palette ?? '16-color SNES palette';
    const pixelPrompt = `Pixel art sprite: ${prompt}. Size: ${size} pixels. Style: SNES-era 16-bit pixel art, ${palette}, transparent background, sprite sheet with walk/idle/attack animations.`;
    return this.generateImage(pixelPrompt, { model: 'gemini-2.0-flash-exp', resolution: size, style: opts.style ?? 'pixel-art' }, onProgress);
  }

  /** Generate a full scene with layered composition */
  async generateScene(description: string, opts: SceneOptions = {}, onProgress?: ProgressCB): Promise<GenerateResult> {
    const perspective = opts.perspective ?? 'top-down';
    const scenePrompt = `Scene illustration: ${description}. Perspective: ${perspective}. High detail, fantasy RPG style.`;
    const layers = opts.layers ? '. Separate layers: background, characters, effects' : '';
    return this.generateImage(scenePrompt + layers, { model: 'imagen-3.0-generate-002', resolution: '2048x2048', style: 'fantasy illustration' }, onProgress);
  }

  // ── Internal API calls ───────────────────────────────────────────────────────

  private async callGemini(model: string, prompt: string, resolution: string, onProgress?: ProgressCB, imageInput?: string): Promise<string> {
    onProgress?.({ stage: 'generating', progress: 0.5 });
    const parts: any[] = [{ text: prompt }];
    if (imageInput) parts.push({ inlineData: { mimeType: 'image/png', data: imageInput } });

    const body = {
      contents: [{ role: 'user', parts }],
      generationConfig: { responseModalities: ['IMAGE'], ...this.resolutionToConfig(resolution) },
    };

    const res = await fetch(`${BASE_URL}/models/${model}:generateContent?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) throw new Error(`Vision API ${res.status}: ${await res.text().catch(() => 'unknown')}`);
    const data = await res.json() as any;
    const imgPart = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    if (!imgPart?.inlineData?.data) throw new Error('No image in response');
    return imgPart.inlineData.data;
  }

  private async callImagen(model: string, prompt: string, resolution: string, onProgress?: ProgressCB): Promise<string> {
    onProgress?.({ stage: 'generating', progress: 0.5 });
    const [w, h] = resolution.split('x').map(Number);
    const body = {
      instances: [{ prompt }],
      parameters: { sampleCount: 1, ...(w && h ? { aspectRatio: w >= h ? '1:1' : '1:1' } : {}) },
    };

    const res = await fetch(`${BASE_URL}/models/${model}:predict?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    });

    if (!res.ok) throw new Error(`Imagen API ${res.status}: ${await res.text().catch(() => 'unknown')}`);
    const data = await res.json() as any;
    const img = data.predictions?.[0]?.bytesBase64Encoded;
    if (!img) throw new Error('No image in Imagen response');
    return img;
  }

  private resolutionToConfig(res: string): Record<string, number> {
    const [w, h] = res.split('x').map(Number);
    return (w && h) ? { imageWidth: w, imageHeight: h } : {};
  }
}

/** In-memory gallery for generated images */
export const gallery: GenerateResult[] = [];

export function addToGallery(result: GenerateResult): void {
  gallery.push(result);
  if (gallery.length > 100) gallery.shift();
}

export function getGallery(): GenerateResult[] {
  return gallery.slice(-50);
}
