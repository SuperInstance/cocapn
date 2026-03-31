/**
 * Built-in theme definitions for cocapn.
 * Each theme is a set of CSS custom properties that override the web UI's :root variables.
 */

export interface ThemeColors {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  muted: string;
  primary: string;
  accent: string;
  success: string;
  danger: string;
  warn: string;
}

export interface ThemeDefinition {
  name: string;
  description: string;
  colors: ThemeColors;
}

export const BUILT_IN_THEMES: Record<string, ThemeDefinition> = {
  default: {
    name: "default",
    description: "Classic blue — the default cocapn look",
    colors: {
      bg: "#1a1a2e",
      surface: "#16213e",
      surface2: "#1e2a45",
      border: "#2a3555",
      text: "#e0e0e0",
      muted: "#7a8ba8",
      primary: "#6c8cff",
      accent: "#6c8cff",
      success: "#4ade80",
      danger: "#f87171",
      warn: "#facc15",
    },
  },
  fishing: {
    name: "fishing",
    description: "Ocean blue with wave accents",
    colors: {
      bg: "#0a192f",
      surface: "#0d2137",
      surface2: "#112d4e",
      border: "#1a3a5c",
      text: "#cde6f5",
      muted: "#6ba3c2",
      primary: "#38bdf8",
      accent: "#06b6d4",
      success: "#34d399",
      danger: "#fb7185",
      warn: "#fbbf24",
    },
  },
  dungeon: {
    name: "dungeon",
    description: "Purple and gold — TTRPG campaign style",
    colors: {
      bg: "#1a1025",
      surface: "#221631",
      surface2: "#2d1f3d",
      border: "#3d2a52",
      text: "#e8dff0",
      muted: "#9b8ab8",
      primary: "#a78bfa",
      accent: "#fbbf24",
      success: "#86efac",
      danger: "#fca5a5",
      warn: "#fde68a",
    },
  },
  deckboss: {
    name: "deckboss",
    description: "Industrial dark with orange highlights",
    colors: {
      bg: "#1a1a1a",
      surface: "#242424",
      surface2: "#2e2e2e",
      border: "#3a3a3a",
      text: "#e5e5e5",
      muted: "#8a8a8a",
      primary: "#f97316",
      accent: "#fb923c",
      success: "#4ade80",
      danger: "#ef4444",
      warn: "#eab308",
    },
  },
  minimal: {
    name: "minimal",
    description: "Black and white — clean and stark",
    colors: {
      bg: "#000000",
      surface: "#0f0f0f",
      surface2: "#1a1a1a",
      border: "#2a2a2a",
      text: "#f5f5f5",
      muted: "#888888",
      primary: "#ffffff",
      accent: "#cccccc",
      success: "#22c55e",
      danger: "#ef4444",
      warn: "#eab308",
    },
  },
  forest: {
    name: "forest",
    description: "Deep green with brown earth tones",
    colors: {
      bg: "#0f1a14",
      surface: "#142019",
      surface2: "#1a2b21",
      border: "#2a3d31",
      text: "#d4e8dc",
      muted: "#7aab8e",
      primary: "#4ade80",
      accent: "#a3866a",
      success: "#6ee7b7",
      danger: "#f87171",
      warn: "#fbbf24",
    },
  },
  sunset: {
    name: "sunset",
    description: "Warm gradient — orange, pink, and gold",
    colors: {
      bg: "#1f0f0a",
      surface: "#2a1510",
      surface2: "#381e16",
      border: "#4d2e22",
      text: "#f5e6d8",
      muted: "#c09a80",
      primary: "#f97316",
      accent: "#ec4899",
      success: "#34d399",
      danger: "#f87171",
      warn: "#fbbf24",
    },
  },
};

export function getTheme(name: string): ThemeDefinition | undefined {
  return BUILT_IN_THEMES[name];
}

export function listThemes(): ThemeDefinition[] {
  return Object.values(BUILT_IN_THEMES);
}
