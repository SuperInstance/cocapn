/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary:   "var(--color-primary)",
        secondary: "var(--color-secondary)",
        accent:    "var(--color-accent)",
        bg:        "var(--color-bg)",
        surface:   "var(--color-surface)",
        "surface-2": "var(--color-surface-2)",
        text:      "var(--color-text)",
        "text-muted": "var(--color-text-muted)",
        border:    "var(--color-border)",
        danger:    "var(--color-danger)",
        success:   "var(--color-success)",
      },
      fontFamily: {
        sans: "var(--font-sans)",
        mono: "var(--font-mono)",
      },
      borderRadius: {
        skin: "var(--radius)",
      },
    },
  },
  plugins: [],
};
