#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
let getFfmpegVersion;
try {
  ({ getFfmpegVersion } = await import("../packages/node-io/dist/index.js"));
} catch {
  // If not built yet, ignore ffmpeg version resolution for now
}

/**
 * Gets current versions of all toolchain components
 */
export async function getVersions() {
  const versions = {
    node: process.version,
    pnpm: "unknown",
    ffmpeg: "unknown",
    wasmSha256: "unknown",
    git: "unknown",
  };

  try {
    // Get pnpm version
    try {
      const pnpmVersion = execSync("pnpm --version", { encoding: "utf-8" }).trim();
      versions.pnpm = pnpmVersion;
    } catch (error) {
      console.warn("Could not get pnpm version:", error.message);
    }

    // Get ffmpeg version
    if (getFfmpegVersion) {
      try {
        versions.ffmpeg = await getFfmpegVersion();
      } catch (error) {
        console.warn("Could not get ffmpeg version:", error.message);
      }
    }

    // Get wasm SHA256
    const wasmJsonPath = path.join(process.cwd(), "tools", "wasm.json");
    if (fs.existsSync(wasmJsonPath)) {
      try {
        const wasmInfo = JSON.parse(fs.readFileSync(wasmJsonPath, "utf-8"));
        versions.wasmSha256 = wasmInfo.sha256 || "unknown";
      } catch (error) {
        console.warn("Could not read wasm.json:", error.message);
      }
    }

    // Get git commit
    try {
      const gitCommit = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
      versions.git = gitCommit;
    } catch (error) {
      console.warn("Could not get git commit:", error.message);
    }

  } catch (error) {
    console.warn("Error getting versions:", error.message);
  }

  return versions;
}

/**
 * Main function
 */
async function main() {
  const versions = await getVersions();

  // Print versions
  console.log("Toolchain versions:");
  console.log(`Node.js: ${versions.node}`);
  console.log(`pnpm: ${versions.pnpm}`);
  console.log(`FFmpeg: ${versions.ffmpeg.split('\n')[0] || 'unknown'}`);
  console.log(`WASM SHA256: ${versions.wasmSha256}`);
  console.log(`Git commit: ${versions.git}`);

  // Write to out/versions.json
  const outDir = path.join(process.cwd(), "out");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const versionsPath = path.join(outDir, "versions.json");
  fs.writeFileSync(versionsPath, JSON.stringify(versions, null, 2));

  console.log(`\nVersions written to ${versionsPath}`);
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
