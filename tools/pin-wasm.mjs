#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

/**
 * Pins the libsamplerate-wasm binary SHA256
 * Finds the WASM file and computes its SHA256 hash
 */
async function pinWasm() {
  const nodeModulesDir = path.join(process.cwd(), "node_modules");
  const wasmPath = path.join(nodeModulesDir, "libsamplerate-wasm", "*.wasm");

  // Find WASM file
  let wasmFilePath;
  try {
    const { execSync } = await import("node:child_process");
    const findResult = execSync(`find "${nodeModulesDir}" -name "*.wasm" -path "*libsamplerate-wasm*" | head -1`, {
      encoding: "utf-8"
    }).trim();

    if (!findResult) {
      throw new Error("No WASM file found in libsamplerate-wasm package");
    }

    wasmFilePath = findResult;
  } catch (error) {
    console.error("Error finding WASM file:", error.message);
    process.exit(1);
  }

  // Read WASM file
  let wasmBuffer;
  try {
    wasmBuffer = fs.readFileSync(wasmFilePath);
  } catch (error) {
    console.error(`Error reading WASM file ${wasmFilePath}:`, error.message);
    process.exit(1);
  }

  // Compute SHA256
  const sha256 = crypto.createHash('sha256').update(wasmBuffer).digest('hex');

  // Get package version
  let packageVersion = "unknown";
  try {
    const packagePath = path.join(nodeModulesDir, "libsamplerate-wasm", "package.json");
    if (fs.existsSync(packagePath)) {
      const packageInfo = JSON.parse(fs.readFileSync(packagePath, "utf-8"));
      packageVersion = packageInfo.version;
    }
  } catch (error) {
    console.warn("Could not read libsamplerate-wasm package.json:", error.message);
  }

  // Write wasm.json
  const wasmInfo = {
    package: `libsamplerate-wasm@${packageVersion}`,
    sha256: sha256,
    pinnedAt: new Date().toISOString(),
  };

  const toolsDir = path.join(process.cwd(), "tools");
  if (!fs.existsSync(toolsDir)) {
    fs.mkdirSync(toolsDir, { recursive: true });
  }

  const wasmJsonPath = path.join(toolsDir, "wasm.json");
  fs.writeFileSync(wasmJsonPath, JSON.stringify(wasmInfo, null, 2));

  console.log(`✅ Pinned libsamplerate-wasm@${packageVersion}`);
  console.log(`SHA256: ${sha256}`);
  console.log(`WASM info written to ${wasmJsonPath}`);
}

/**
 * Main function
 */
async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log("Usage: node tools/pin-wasm.mjs");
    console.log("");
    console.log("Pins the libsamplerate-wasm binary by computing its SHA256 hash");
    console.log("and storing the result in tools/wasm.json for golden test validation.");
    console.log("");
    console.log("This should be run after installing dependencies to record the exact");
    console.log("WASM binary that will be used for resampling.");
    process.exit(0);
  }

  await pinWasm();
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
