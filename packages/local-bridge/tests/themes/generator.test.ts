import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateThemeCSS, generateThemeCSSFile } from "../../src/themes/generator.js";
import { BUILT_IN_THEMES, getTheme, listThemes, type ThemeColors } from "../../src/themes/themes.js";
import {
  applyTheme,
  saveCustomTheme,
  listCustomThemes,
  loadCustomTheme,
  getAllThemes,
  resolveCocapnDir,
} from "../../src/themes/loader.js";
import { mkdirSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("themes", () => {
  describe("BUILT_IN_THEMES", () => {
    it("has 7 built-in themes", () => {
      expect(Object.keys(BUILT_IN_THEMES)).toHaveLength(7);
    });

    it("includes all required theme names", () => {
      const names = Object.keys(BUILT_IN_THEMES);
      expect(names).toContain("default");
      expect(names).toContain("fishing");
      expect(names).toContain("dungeon");
      expect(names).toContain("deckboss");
      expect(names).toContain("minimal");
      expect(names).toContain("forest");
      expect(names).toContain("sunset");
    });

    it("each theme has name, description, and colors", () => {
      for (const theme of Object.values(BUILT_IN_THEMES)) {
        expect(theme.name).toBeTruthy();
        expect(theme.description).toBeTruthy();
        expect(theme.colors).toBeTruthy();
        expect(theme.colors.bg).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(theme.colors.surface).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(theme.colors.border).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(theme.colors.text).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(theme.colors.muted).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(theme.colors.primary).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(theme.colors.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(theme.colors.success).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(theme.colors.danger).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(theme.colors.warn).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });
  });

  describe("getTheme", () => {
    it("returns a theme by name", () => {
      const theme = getTheme("default");
      expect(theme).toBeDefined();
      expect(theme!.name).toBe("default");
    });

    it("returns undefined for unknown themes", () => {
      expect(getTheme("nonexistent")).toBeUndefined();
    });
  });

  describe("listThemes", () => {
    it("returns all 7 built-in themes", () => {
      const themes = listThemes();
      expect(themes).toHaveLength(7);
    });
  });
});

describe("generator", () => {
  describe("generateThemeCSS", () => {
    it("generates valid CSS with custom properties", () => {
      const colors = BUILT_IN_THEMES.default.colors;
      const css = generateThemeCSS(colors);

      expect(css).toContain(":root {");
      expect(css).toContain("--bg:");
      expect(css).toContain("--surface:");
      expect(css).toContain("--primary:");
      expect(css).toContain("--text:");
      expect(css).toContain("--border:");
      expect(css).toContain("}");
    });

    it("generates rgba values for primary2, user-bg, user-bdr", () => {
      const colors = BUILT_IN_THEMES.default.colors;
      const css = generateThemeCSS(colors);

      expect(css).toContain("--primary2:");
      expect(css).toContain("rgba(");
      expect(css).toContain("--user-bg:");
      expect(css).toContain("--user-bdr:");
    });

    it("includes font and radius variables", () => {
      const colors = BUILT_IN_THEMES.default.colors;
      const css = generateThemeCSS(colors);

      expect(css).toContain("--radius:");
      expect(css).toContain("--font:");
      expect(css).toContain("--mono:");
    });

    it("generates different CSS for different themes", () => {
      const defaultCSS = generateThemeCSS(BUILT_IN_THEMES.default.colors);
      const fishingCSS = generateThemeCSS(BUILT_IN_THEMES.fishing.colors);

      expect(defaultCSS).not.toEqual(fishingCSS);
      expect(fishingCSS).toContain(BUILT_IN_THEMES.fishing.colors.primary);
    });
  });

  describe("generateThemeCSSFile", () => {
    it("includes theme name in output", () => {
      const css = generateThemeCSSFile(BUILT_IN_THEMES.default.colors, "test");
      expect(css).toContain("Theme: test");
    });
  });
});

describe("loader", () => {
  let testDir: string;
  let cocapnDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `cocapn-test-themes-${Date.now()}`);
    cocapnDir = join(testDir, "cocapn");
    mkdirSync(cocapnDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("resolveCocapnDir", () => {
    it("appends cocapn to repo root", () => {
      expect(resolveCocapnDir("/home/user/repo")).toBe("/home/user/repo/cocapn");
    });
  });

  describe("applyTheme", () => {
    it("applies a built-in theme and writes theme.css", () => {
      const result = applyTheme(cocapnDir, "fishing");
      expect(result.ok).toBe(true);

      const cssPath = join(cocapnDir, "theme.css");
      expect(existsSync(cssPath)).toBe(true);

      const content = readFileSync(cssPath, "utf-8");
      expect(content).toContain("--primary:");
      expect(content).toContain("Theme: fishing");
    });

    it("returns error for unknown theme with no custom theme", () => {
      const result = applyTheme(cocapnDir, "nonexistent");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("Unknown theme");
    });

    it("applies all 7 built-in themes", () => {
      for (const name of Object.keys(BUILT_IN_THEMES)) {
        const result = applyTheme(cocapnDir, name);
        expect(result.ok).toBe(true);

        const content = readFileSync(join(cocapnDir, "theme.css"), "utf-8");
        expect(content).toContain(`Theme: ${name}`);
      }
    });
  });

  describe("saveCustomTheme", () => {
    it("saves a custom theme to themes/ directory", () => {
      const colors = BUILT_IN_THEMES.default.colors;
      const result = saveCustomTheme(cocapnDir, "mytheme", colors);
      expect(result.ok).toBe(true);

      const themeFile = join(cocapnDir, "themes", "mytheme.css");
      expect(existsSync(themeFile)).toBe(true);
    });

    it("rejects overwriting built-in themes", () => {
      const colors = BUILT_IN_THEMES.default.colors;
      const result = saveCustomTheme(cocapnDir, "default", colors);
      expect(result.ok).toBe(false);
      expect(result.error).toContain("Cannot overwrite built-in");
    });
  });

  describe("listCustomThemes", () => {
    it("returns empty when no custom themes", () => {
      expect(listCustomThemes(cocapnDir)).toEqual([]);
    });

    it("lists saved custom themes", () => {
      const colors = BUILT_IN_THEMES.default.colors;
      saveCustomTheme(cocapnDir, "alpha", colors);
      saveCustomTheme(cocapnDir, "beta", colors);

      const custom = listCustomThemes(cocapnDir);
      expect(custom).toContain("alpha");
      expect(custom).toContain("beta");
    });
  });

  describe("loadCustomTheme", () => {
    it("returns null for non-existent theme", () => {
      expect(loadCustomTheme(cocapnDir, "nope")).toBeNull();
    });

    it("loads saved custom theme CSS", () => {
      const colors = BUILT_IN_THEMES.default.colors;
      saveCustomTheme(cocapnDir, "mine", colors);

      const css = loadCustomTheme(cocapnDir, "mine");
      expect(css).toBeTruthy();
      expect(css).toContain(":root {");
    });
  });

  describe("applyTheme with custom", () => {
    it("applies a custom theme by name", () => {
      const colors = BUILT_IN_THEMES.fishing.colors;
      saveCustomTheme(cocapnDir, "ocean", colors);

      const result = applyTheme(cocapnDir, "ocean");
      expect(result.ok).toBe(true);

      const content = readFileSync(join(cocapnDir, "theme.css"), "utf-8");
      expect(content).toContain(":root {");
    });
  });

  describe("getAllThemes", () => {
    it("returns built-in + custom themes", () => {
      const colors = BUILT_IN_THEMES.default.colors;
      saveCustomTheme(cocapnDir, "custom1", colors);

      const all = getAllThemes(cocapnDir);
      expect(all.length).toBeGreaterThanOrEqual(8); // 7 built-in + 1 custom

      const names = all.map((t) => t.name);
      expect(names).toContain("default");
      expect(names).toContain("custom1");
    });
  });
});
