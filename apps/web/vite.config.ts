import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "/wav2amiga-web/app/" : "/",
  build: {
    outDir: "dist",
    assetsDir: "assets",
    assetsInlineLimit: 0, // Keep binary assets out-of-line for predictable hashing
  },
  worker: {
    format: "es", // ES module workers
  },
  server: {
    port: 3000,
  },
}));
