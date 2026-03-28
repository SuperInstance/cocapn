import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const root = import.meta.dirname;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(root, "src"),
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          xterm: ["@xterm/xterm", "@xterm/addon-fit", "@xterm/addon-canvas", "@xterm/addon-web-links"],
        },
      },
    },
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
