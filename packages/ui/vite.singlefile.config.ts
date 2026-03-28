import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { resolve } from "node:path";

// Single-file build: inlines all JS/CSS into index.html for zero-dependency distribution.
// Usage: npm run build:singlefile
const root = import.meta.dirname;

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: {
      "@": resolve(root, "src"),
    },
  },
  build: {
    outDir: "dist-single",
    assetsInlineLimit: Infinity,
    cssCodeSplit: false,
  },
  server: {
    proxy: {
      "/ws": {
        target: "ws://localhost:8787",
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ws/, ""),
      },
    },
  },
});
