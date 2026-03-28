import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@cocapn/protocols/mcp": resolve(__dirname, "../protocols/src/mcp/index.ts"),
      "@cocapn/protocols/a2a": resolve(__dirname, "../protocols/src/a2a/index.ts"),
      "@cocapn/protocols": resolve(__dirname, "../protocols/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
