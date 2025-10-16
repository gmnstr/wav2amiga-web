import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/wav2amiga-web/app/",
  build: {
    outDir: "dist",
    assetsDir: "assets",
    assetsInlineLimit: 0, // Ensure WASM files are emitted as separate assets
  },
  worker: {
    format: 'es'  // ES module workers
  },
  server: {
    port: 3000,
  },
});
