import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  build: {
    outDir: "dist",
    assetsDir: "assets",
    assetsInlineLimit: 0, // Ensure WASM files are emitted as separate assets
  },
  server: {
    port: 3000,
  },
});
