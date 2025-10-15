#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { fileURLToPath } from "node:url";

// ESM equivalent of __dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const wasmPath = path.resolve(rootDir, "packages/resampler-wasm/assets/libsamplerate.wasm");
const versionPath = path.resolve(rootDir, "packages/resampler-wasm/VERSION.json");

// URL for libsamplerate WASM binary
// This is a placeholder - in a real implementation, this would point to a CDN or build artifact
const WASM_URL = "https://example.com/libsamplerate.wasm";

async function downloadWasm(url) {
  console.log(`Downloading WASM binary from ${url}...`);

  // For now, we'll create a placeholder since we don't have a real WASM URL
  // In practice, this would use fetch or curl to download the actual binary
  throw new Error(
    "WASM binary download not implemented. " +
    "Please manually place the libsamplerate.wasm binary in packages/resampler-wasm/assets/ " +
    "and run this script to compute SHA256."
  );
}

function computeSha256(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash("sha256");
  hashSum.update(fileBuffer);
  return hashSum.digest("hex");
}

function readPackageVersion() {
  const packagePath = path.resolve(rootDir, "packages/resampler-wasm/package.json");
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf-8"));
  return packageJson.version;
}

function updateVersionJson(sha256) {
  const version = readPackageVersion();
  const versionInfo = {
    version,
    sha256,
    flags: "SINC_BEST_QUALITY"
  };

  fs.writeFileSync(versionPath, JSON.stringify(versionInfo, null, 2));
  console.log(`Updated ${versionPath} with SHA256: ${sha256}`);
}

async function main() {
  try {
    // Check if WASM file already exists
    if (fs.existsSync(wasmPath)) {
      console.log(`WASM file already exists at ${wasmPath}`);

      // Compute SHA256 of existing file
      const sha256 = computeSha256(wasmPath);
      updateVersionJson(sha256);

      console.log("WASM binary is pinned successfully!");
    } else {
      console.log(`WASM file not found at ${wasmPath}`);

      // For now, we'll skip the download and just create a placeholder VERSION.json
      // In a real implementation, we would download from WASM_URL
      console.log("Creating placeholder VERSION.json (WASM binary needs to be provided separately)");

      const version = readPackageVersion();
      const versionInfo = {
        version,
        sha256: "placeholder-sha256",
        flags: "SINC_BEST_QUALITY"
      };

      fs.writeFileSync(versionPath, JSON.stringify(versionInfo, null, 2));
      console.log(`Created placeholder ${versionPath}`);
      console.log("Please manually place the libsamplerate.wasm binary in packages/resampler-wasm/assets/");
      console.log("Then run this script again to compute the SHA256.");
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
