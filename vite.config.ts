import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: "src/frontend",
  publicDir: resolve(import.meta.dirname, "public"),
  plugins: [react()],
  build: { outDir: resolve(import.meta.dirname, "dist/view"), emptyOutDir: true },
  server: {
    host: "127.0.0.1", port: 5180, strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:47129", ws: true } },
  },
});
