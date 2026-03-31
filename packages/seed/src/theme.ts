/**
 * Theme engine — loads presets, parses theme.css, generates CSS variables.
 * Zero dependencies.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

export interface Theme {
  accent: string; accent2: string; mode: 'dark' | 'light';
  font: 'monospace' | 'sans-serif' | 'serif'; customCSS?: string;
}

const PRESETS: Record<string, Theme> = {
  ocean:    { accent: '#1a73e8', accent2: '#1557b0', mode: 'dark', font: 'sans-serif' },
  forest:   { accent: '#2e7d32', accent2: '#1b5e20', mode: 'dark', font: 'sans-serif' },
  sunset:   { accent: '#e65100', accent2: '#bf360c', mode: 'dark', font: 'sans-serif' },
  midnight: { accent: '#6a1b9a', accent2: '#4a148c', mode: 'dark', font: 'sans-serif' },
  minimal:  { accent: '#000000', accent2: '#333333', mode: 'light', font: 'monospace' },
};

export function loadTheme(dir: string, preset?: string): Theme {
  const base: Theme = { accent: '#22c55e', accent2: '#16a34a', mode: 'dark', font: 'monospace' };
  if (preset && PRESETS[preset]) Object.assign(base, PRESETS[preset]);
  for (const name of ['theme.css', 'cocapn/theme.css']) {
    const fp = join(resolve(dir), name);
    if (!existsSync(fp)) continue;
    const css = readFileSync(fp, 'utf-8');
    const g = (n: string) => (css.match(new RegExp(`--${n}:\\s*([^;\\s}]+)`)) || [])[1]?.trim();
    if (g('accent') || g('color-primary')) base.accent = g('accent') || g('color-primary')!;
    if (g('color-secondary')) base.accent2 = g('color-secondary');
  }
  return base;
}

export function themeToCSS(t: Theme): string {
  const d = t.mode === 'dark';
  const f = t.font === 'monospace' ? "'SF Mono',SFMono-Regular,Consolas,monospace"
    : t.font === 'serif' ? 'Georgia,serif' : "system-ui,-apple-system,sans-serif";
  const v: Record<string, string> = {
    '--bg': d ? '#09090b' : '#ffffff', '--surface': d ? '#111113' : '#f5f5f5',
    '--border': d ? '#1e1e22' : '#e0e0e0', '--text': d ? '#d4d4d8' : '#1a1a1a',
    '--muted': d ? '#71717a' : '#888888', '--accent': t.accent, '--accent2': t.accent2,
    '--user-bg': d ? '#1e3a5f' : '#dbeafe', '--bot-bg': d ? '#16161a' : '#f0f0f0',
    '--font': f,
  };
  return `:root{${Object.entries(v).map(([k, v]) => `${k}:${v}`).join(';')}}`;
}
