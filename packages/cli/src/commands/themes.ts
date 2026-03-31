/**
 * cocapn themes — Theme management commands
 *
 * Usage:
 *   cocapn themes list              — List available themes
 *   cocapn themes apply <name>      — Apply a theme
 *   cocapn themes create --name <n> — Create custom theme interactively
 *   cocapn themes preview <name>    — Show theme colors in terminal
 */

import { Command } from "commander";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { createInterface } from "readline";
import {
  BUILT_IN_THEMES,
  listThemes,
  getTheme,
  type ThemeColors,
} from "../../local-bridge/src/themes/themes.js";
import { generateThemeCSS, generateThemeCSSFile } from "../../local-bridge/src/themes/generator.js";
import {
  resolveCocapnDir,
  applyTheme,
  saveCustomTheme,
  listCustomThemes,
  loadCustomTheme,
  getAllThemes,
} from "../../local-bridge/src/themes/loader.js";

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  dim: "\x1b[2m",
  bgWhite: "\x1b[107m",
  bgBlack: "\x1b[40m",
};

const bold = (s: string) => `${colors.bold}${s}${colors.reset}`;
const green = (s: string) => `${colors.green}${s}${colors.reset}`;
const cyan = (s: string) => `${colors.cyan}${s}${colors.reset}`;
const yellow = (s: string) => `${colors.yellow}${s}${colors.reset}`;
const dim = (s: string) => `${colors.dim}${s}${colors.reset}`;

export function createThemesCommand(): Command {
  const cmd = new Command("themes").description("Manage agent appearance themes");

  // cocapn themes list
  cmd
    .command("list")
    .description("List available themes")
    .option("--repo <path>", "Path to cocapn repo", process.cwd())
    .action(async (options) => {
      const cocapnDir = resolveCocapnDir(options.repo);
      const allThemes = getAllThemes(cocapnDir);
      const currentCSS = existsSync(join(cocapnDir, "theme.css"))
        ? readFileSync(join(cocapnDir, "theme.css"), "utf-8")
        : null;

      // Detect active theme
      let activeTheme = "default";
      if (currentCSS) {
        const match = currentCSS.match(/\/\* Theme: (\w+) \*\//);
        if (match) activeTheme = match[1];
      }

      console.log(cyan("🎨 Available Themes\n"));

      const nameWidth = Math.max(...allThemes.map((t) => t.name.length));

      for (const theme of allThemes) {
        const isActive = theme.name === activeTheme;
        const marker = isActive ? green("●") : dim("○");
        const name = isActive
          ? green(theme.name.padEnd(nameWidth))
          : theme.name.padEnd(nameWidth);
        const tag = isActive ? green("(active)") : "";

        console.log(`  ${marker}  ${name}  ${dim(theme.description)}  ${tag}`);
      }

      const customNames = listCustomThemes(cocapnDir);
      if (customNames.length > 0) {
        console.log();
        console.log(dim(`  ${customNames.length} custom theme(s) in cocapn/themes/`));
      }

      console.log();
      console.log(dim(`  Use ${bold("cocapn themes apply <name>")} to switch`));
    });

  // cocapn themes apply <name>
  cmd
    .command("apply <name>")
    .description("Apply a theme")
    .option("--repo <path>", "Path to cocapn repo", process.cwd())
    .action(async (name: string, options) => {
      const cocapnDir = resolveCocapnDir(options.repo);

      if (!existsSync(cocapnDir)) {
        console.error(yellow("No cocapn/ directory found. Run cocapn setup first."));
        process.exit(1);
      }

      const result = applyTheme(cocapnDir, name);
      if (!result.ok) {
        console.error(yellow(`✗ ${result.error}`));
        console.error(dim(`Run ${bold("cocapn themes list")} to see available themes`));
        process.exit(1);
      }

      console.log(green(`✓ Theme applied: ${name}`));
      console.log(dim(`  Written to cocapn/theme.css`));
      console.log(dim(`  Reload the web UI to see changes`));
    });

  // cocapn themes create --name <name>
  cmd
    .command("create")
    .description("Create a custom theme interactively")
    .option("--name <name>", "Theme name")
    .option("--repo <path>", "Path to cocapn repo", process.cwd())
    .action(async (options) => {
      const cocapnDir = resolveCocapnDir(options.repo);

      if (!existsSync(cocapnDir)) {
        console.error(yellow("No cocapn/ directory found. Run cocapn setup first."));
        process.exit(1);
      }

      let themeName = options.name;
      if (!themeName) {
        themeName = await prompt("Theme name: ");
        if (!themeName) {
          console.error(yellow("✗ Theme name is required"));
          process.exit(1);
        }
      }

      if (BUILT_IN_THEMES[themeName]) {
        console.error(yellow(`✗ Cannot overwrite built-in theme: ${themeName}`));
        process.exit(1);
      }

      console.log(cyan("\n🎨 Custom Theme Creator"));
      console.log(dim("  Enter hex colors (e.g., #1a1a2e) or press Enter for defaults\n"));

      const defaults = BUILT_IN_THEMES.default.colors;
      const colorKeys: (keyof ThemeColors)[] = [
        "bg",
        "surface",
        "border",
        "text",
        "muted",
        "primary",
        "accent",
        "success",
        "danger",
        "warn",
      ];

      const colorLabels: Record<string, string> = {
        bg: "Background",
        surface: "Surface",
        border: "Border",
        text: "Text",
        muted: "Muted text",
        primary: "Primary",
        accent: "Accent",
        success: "Success",
        danger: "Danger",
        warn: "Warning",
      };

      const picked: Partial<ThemeColors> = {};
      for (const key of colorKeys) {
        const label = colorLabels[key] ?? key;
        const answer = await prompt(`  ${label} [${defaults[key]}]: `);
        picked[key] = answer && isValidHex(answer) ? answer : defaults[key];
      }

      const themeColors: ThemeColors = {
        bg: picked.bg ?? defaults.bg,
        surface: picked.surface ?? defaults.surface,
        surface2: picked.surface ?? defaults.surface,
        border: picked.border ?? defaults.border,
        text: picked.text ?? defaults.text,
        muted: picked.muted ?? defaults.muted,
        primary: picked.primary ?? defaults.primary,
        accent: picked.accent ?? defaults.accent,
        success: picked.success ?? defaults.success,
        danger: picked.danger ?? defaults.danger,
        warn: picked.warn ?? defaults.warn,
      };

      const result = saveCustomTheme(cocapnDir, themeName, themeColors);
      if (!result.ok) {
        console.error(yellow(`✗ ${result.error}`));
        process.exit(1);
      }

      console.log();
      console.log(green(`✓ Custom theme created: ${themeName}`));
      console.log(dim(`  Saved to cocapn/themes/${themeName}.css`));
      console.log(dim(`  Apply with: ${bold(`cocapn themes apply ${themeName}`)}`));
    });

  // cocapn themes preview <name>
  cmd
    .command("preview <name>")
    .description("Show theme colors in terminal")
    .option("--repo <path>", "Path to cocapn repo", process.cwd())
    .action(async (name: string, options) => {
      const cocapnDir = resolveCocapnDir(options.repo);
      const theme = getTheme(name);

      let themeColors: ThemeColors | null = null;
      let desc = "";

      if (theme) {
        themeColors = theme.colors;
        desc = theme.description;
      } else {
        const customCSS = loadCustomTheme(cocapnDir, name);
        if (!customCSS) {
          console.error(yellow(`✗ Unknown theme: ${name}`));
          process.exit(1);
        }
        // Parse colors from CSS
        const defaults = BUILT_IN_THEMES.default.colors;
        const extract = (v: string): string => {
          const m = customCSS.match(new RegExp(`--${v}:\\s*([^;]+);`));
          return m ? m[1].trim() : defaults[v as keyof ThemeColors];
        };
        themeColors = {
          bg: extract("bg"),
          surface: extract("surface"),
          surface2: extract("surface2"),
          border: extract("border"),
          text: extract("text"),
          muted: extract("muted"),
          primary: extract("primary"),
          accent: extract("primary"),
          success: extract("success"),
          danger: extract("danger"),
          warn: extract("warn"),
        };
        desc = `Custom theme: ${name}`;
      }

      console.log(cyan(`🎨 ${bold(name)}`));
      console.log(dim(`  ${desc}\n`));

      // Render color swatches
      const swatch = (hex: string, label: string) => {
        const padded = label.padEnd(12);
        // Use truecolor foreground + inverted block to approximate the color
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const block = `\x1b[48;2;${r};${g};${b}m      \x1b[0m`;
        return `  ${padded} ${hex}  ${block}`;
      };

      console.log(swatch(themeColors.bg, "background"));
      console.log(swatch(themeColors.surface, "surface"));
      console.log(swatch(themeColors.border, "border"));
      console.log(swatch(themeColors.text, "text"));
      console.log(swatch(themeColors.muted, "muted"));
      console.log(swatch(themeColors.primary, "primary"));
      console.log(swatch(themeColors.accent, "accent"));
      console.log(swatch(themeColors.success, "success"));
      console.log(swatch(themeColors.danger, "danger"));
      console.log(swatch(themeColors.warn, "warning"));
    });

  return cmd;
}

function isValidHex(s: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(s);
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
