/**
 * Theme loader — reads/writes theme files from disk.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { getTheme, BUILT_IN_THEMES, type ThemeColors, type ThemeDefinition } from "./themes.js";
import { generateThemeCSSFile } from "./generator.js";

const THEME_CSS_FILE = "theme.css";
const THEMES_DIR = "themes";

export function resolveCocapnDir(repoRoot: string): string {
  return join(repoRoot, "cocapn");
}

export function loadThemeCSS(cocapnDir: string): string | null {
  const filePath = join(cocapnDir, THEME_CSS_FILE);
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, "utf-8");
}

export function applyTheme(cocapnDir: string, themeName: string): { ok: boolean; error?: string } {
  const theme = getTheme(themeName);
  if (!theme) {
    // Check for custom theme
    const customCSS = loadCustomTheme(cocapnDir, themeName);
    if (!customCSS) {
      return { ok: false, error: `Unknown theme: ${themeName}` };
    }
    writeFileSync(join(cocapnDir, THEME_CSS_FILE), customCSS, "utf-8");
    return { ok: true };
  }

  const css = generateThemeCSSFile(theme.colors, themeName);
  writeFileSync(join(cocapnDir, THEME_CSS_FILE), css, "utf-8");
  return { ok: true };
}

export function saveCustomTheme(
  cocapnDir: string,
  name: string,
  colors: ThemeColors
): { ok: boolean; error?: string } {
  if (BUILT_IN_THEMES[name]) {
    return { ok: false, error: `Cannot overwrite built-in theme: ${name}` };
  }

  const themesDir = join(cocapnDir, THEMES_DIR);
  if (!existsSync(themesDir)) {
    mkdirSync(themesDir, { recursive: true });
  }

  const css = generateThemeCSSFile(colors, name);
  writeFileSync(join(themesDir, `${name}.css`), css, "utf-8");
  return { ok: true };
}

export function loadCustomTheme(cocapnDir: string, name: string): string | null {
  const filePath = join(cocapnDir, THEMES_DIR, `${name}.css`);
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, "utf-8");
}

export function listCustomThemes(cocapnDir: string): string[] {
  const themesDir = join(cocapnDir, THEMES_DIR);
  if (!existsSync(themesDir)) return [];
  return readdirSync(themesDir)
    .filter((f) => f.endsWith(".css"))
    .map((f) => f.replace(/\.css$/, ""));
}

export function getAllThemes(cocapnDir: string): ThemeDefinition[] {
  const builtIn = Object.values(BUILT_IN_THEMES);
  const custom = listCustomThemes(cocapnDir).map((name) => {
    const css = loadCustomTheme(cocapnDir, name);
    return {
      name,
      description: `Custom theme: ${name}`,
      colors: css ? parseColorsFromCSS(css) : BUILT_IN_THEMES.default.colors,
    };
  });
  return [...builtIn, ...custom];
}

function parseColorsFromCSS(css: string): ThemeColors {
  const defaults = BUILT_IN_THEMES.default.colors;
  const extract = (varName: string): string | undefined => {
    const match = css.match(new RegExp(`--${varName}:\\s*([^;]+);`));
    return match ? match[1].trim() : undefined;
  };
  return {
    bg: extract("bg") ?? defaults.bg,
    surface: extract("surface") ?? defaults.surface,
    surface2: extract("surface2") ?? defaults.surface2,
    border: extract("border") ?? defaults.border,
    text: extract("text") ?? defaults.text,
    muted: extract("muted") ?? defaults.muted,
    primary: extract("primary") ?? defaults.primary,
    accent: extract("primary") ?? defaults.accent,
    success: extract("success") ?? defaults.success,
    danger: extract("danger") ?? defaults.danger,
    warn: extract("warn") ?? defaults.warn,
  };
}
