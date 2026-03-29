import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@cocapn/protocols": resolve(__dirname, "../protocols/src"),
    },
    // Ensure .ts files are resolved in tests
    extensions: [".js", ".ts"],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
