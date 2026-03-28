/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Map CSS custom properties (set by the active skin) to Tailwind utilities
      colors: {
        primary:      "var(--color-primary)",
        secondary:    "var(--color-secondary)",
        accent:       "var(--color-accent)",
        surface:      "var(--color-surface)",
        "surface-2":  "var(--color-surface-2)",
        text:         "var(--color-text)",
        "text-muted": "var(--color-text-muted)",
        border:       "var(--color-border)",
        danger:       "var(--color-danger)",
        success:      "var(--color-success)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        skin: "var(--radius)",
      },
    },
  },
  plugins: [],
};
