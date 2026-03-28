import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Output to dist/ for GitHub Pages
  build: {
    outDir: "dist",
    // Inline small assets so Pages serves fewer requests
    assetsInlineLimit: 4096,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
      },
    },
  },

  // Resolve skin CSS and layout from the skin directory
  resolve: {
    alias: {
      "@skin": resolve(__dirname, "skin"),
      "@": resolve(__dirname, "src"),
    },
  },

  // Dev server proxies the bridge WebSocket so the UI works without CORS
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
