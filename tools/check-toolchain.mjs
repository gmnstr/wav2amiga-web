#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

/**
 * Simple semver satisfies check without external dependencies
 * Handles common patterns: >=, <, ^, ~, x, ranges like 1.2.3 - 2.3.4
 */
function semverSatisfies(version, range) {
  // Remove 'v' prefix if present
  const cleanVersion = version.replace(/^v/, "");
  const cleanRange = range.trim();
  
  // Handle x ranges (e.g., 20.x -> >=20.0.0 <21.0.0)
  if (cleanRange.includes(".x")) {
    const parts = cleanRange.split(".");
    if (parts.length === 2 && parts[1] === "x") {
      const major = parseInt(parts[0], 10);
      return semverSatisfies(cleanVersion, `>=${major}.0.0 <${major + 1}.0.0`);
    }
  }
  
  // Handle caret ranges (^1.2.3 -> >=1.2.3 <2.0.0)
  if (cleanRange.startsWith("^")) {
    const baseVersion = cleanRange.slice(1);
    const parts = baseVersion.split(".").map(p => parseInt(p, 10));
    if (parts.length >= 1) {
      const major = parts[0];
      return semverSatisfies(cleanVersion, `>=${baseVersion} <${major + 1}.0.0`);
    }
  }
  
  // Handle tilde ranges (~1.2.3 -> >=1.2.3 <1.3.0)
  if (cleanRange.startsWith("~")) {
    const baseVersion = cleanRange.slice(1);
    const parts = baseVersion.split(".").map(p => parseInt(p, 10));
    if (parts.length >= 2) {
      const major = parts[0];
      const minor = parts[1];
      return semverSatisfies(cleanVersion, `>=${baseVersion} <${major}.${minor + 1}.0`);
    }
  }
  
  // Handle range expressions (e.g., ">=20.11.0 <21.0.0")
  if (cleanRange.includes(" ")) {
    const conditions = cleanRange.split(/\s+/);
    return conditions.every(condition => semverSatisfies(cleanVersion, condition));
  }
  
  // Handle single conditions
  if (cleanRange.startsWith(">=")) {
    const targetVersion = cleanRange.slice(2);
    return compareVersions(cleanVersion, targetVersion) >= 0;
  }
  if (cleanRange.startsWith("<=")) {
    const targetVersion = cleanRange.slice(2);
    return compareVersions(cleanVersion, targetVersion) <= 0;
  }
  if (cleanRange.startsWith(">")) {
    const targetVersion = cleanRange.slice(1);
    return compareVersions(cleanVersion, targetVersion) > 0;
  }
  if (cleanRange.startsWith("<")) {
    const targetVersion = cleanRange.slice(1);
    return compareVersions(cleanVersion, targetVersion) < 0;
  }
  if (cleanRange.startsWith("=")) {
    const targetVersion = cleanRange.slice(1);
    return compareVersions(cleanVersion, targetVersion) === 0;
  }
  
  // Exact match (no operator)
  return compareVersions(cleanVersion, cleanRange) === 0;
}

/**
 * Compare two semantic versions
 * Returns: -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
 */
function compareVersions(v1, v2) {
  const parts1 = v1.split(".").map(p => parseInt(p, 10) || 0);
  const parts2 = v2.split(".").map(p => parseInt(p, 10) || 0);
  
  const maxLength = Math.max(parts1.length, parts2.length);
  
  for (let i = 0; i < maxLength; i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;
    
    if (part1 < part2) return -1;
    if (part1 > part2) return 1;
  }
  
  return 0;
}

/**
 * Parse package.json and extract toolchain requirements
 */
function loadPackageJson() {
  const packageJsonPath = path.join(process.cwd(), "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    console.error("Error: package.json not found in current directory");
    process.exit(1);
  }
  
  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  } catch (error) {
    console.error("Error reading package.json:", error.message);
    process.exit(1);
  }
}

/**
 * Get current toolchain versions
 */
function getCurrentVersions() {
  const versions = {
    node: process.version,
    pnpm: "unknown",
    volta: {
      node: "not set",
      pnpm: "not set"
    }
  };
  
  try {
    // Get pnpm version
    try {
      const pnpmVersion = execSync("pnpm --version", { encoding: "utf-8" }).trim();
      versions.pnpm = pnpmVersion;
    } catch (error) {
      console.warn("Could not get pnpm version:", error.message);
    }
  } catch (error) {
    console.warn("Error getting versions:", error.message);
  }
  
  return versions;
}

/**
 * Main function
 */
function main() {
  const pkg = loadPackageJson();
  const current = getCurrentVersions();
  
  console.log("Toolchain check:");
  console.log(`Current Node.js: ${current.node}`);
  console.log(`Current pnpm: ${current.pnpm}`);
  
  // Check Node.js version against engines.node
  const nodeRange = pkg.engines?.node;
  if (!nodeRange) {
    console.error("Error: engines.node not specified in package.json");
    process.exit(1);
  }
  
  console.log(`Required Node.js: ${nodeRange}`);
  
  if (!semverSatisfies(current.node, nodeRange)) {
    console.error("❌ Node.js version mismatch");
    console.error(`   Required: ${nodeRange}`);
    console.error(`   Current:  ${current.node}`);
    console.error("");
    console.error("To fix this:");
    console.error("1. Update your Node.js version to satisfy the range");
    console.error("2. Or update the engines.node field in package.json");
    process.exit(1);
  }
  
  // Check pnpm version against packageManager
  const packageManager = pkg.packageManager;
  if (packageManager) {
    const expectedPnpm = packageManager.split("@")[1];
    console.log(`Required pnpm: ${expectedPnpm}`);
    
    if (current.pnpm !== expectedPnpm) {
      console.error("❌ pnpm version mismatch");
      console.error(`   Required: ${expectedPnpm}`);
      console.error(`   Current:  ${current.pnpm}`);
      console.error("");
      console.error("To fix this:");
      console.error("1. Update pnpm: npm install -g pnpm@<version>");
      console.error("2. Or update the packageManager field in package.json");
      process.exit(1);
    }
  }
  
  // Log Volta pin for informational purposes (not enforced)
  if (pkg.volta) {
    current.volta.node = pkg.volta.node || "not set";
    current.volta.pnpm = pkg.volta.pnpm || "not set";
    console.log(`Volta pin (info only): Node ${current.volta.node}, pnpm ${current.volta.pnpm}`);
  }
  
  console.log("✅ Toolchain check passed");
}

main();
