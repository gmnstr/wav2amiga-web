#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { execSync } from "node:child_process";
import { getVersions } from "./versions.mjs";

/**
 * Regenerates golden test outputs and updates index.json
 * Includes guard to prevent regeneration with mismatched toolchain
 */
async function regenerateGoldens() {
  const goldensDir = path.join(process.cwd(), "goldens");
  const indexPath = path.join(goldensDir, "index.json");

  if (!fs.existsSync(indexPath)) {
    console.error("Error: goldens/index.json not found");
    process.exit(1);
  }

  let index;
  try {
    index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
  } catch (error) {
    console.error(`Error reading ${indexPath}:`, error.message);
    process.exit(1);
  }

  // Check toolchain compatibility
  const currentVersions = await getVersions();
  const expectedVersions = index.toolchain;

  console.log("Checking toolchain compatibility...");
  console.log(`Current Node.js: ${currentVersions.node} (expected: ${expectedVersions.node})`);
  console.log(`Current pnpm: ${currentVersions.pnpm} (expected: ${expectedVersions.pnpm})`);

  if (currentVersions.node !== expectedVersions.node) {
    console.error("❌ Node.js version mismatch!");
    console.error(`  Expected: ${expectedVersions.node}`);
    console.error(`  Current:  ${currentVersions.node}`);
    console.error("Refusing to regenerate goldens with different toolchain.");
    process.exit(1);
  }

  if (currentVersions.pnpm !== expectedVersions.pnpm) {
    console.error("❌ pnpm version mismatch!");
    console.error(`  Expected: ${expectedVersions.pnpm}`);
    console.error(`  Current:  ${currentVersions.pnpm}`);
    console.error("Refusing to regenerate goldens with different toolchain.");
    process.exit(1);
  }

  if (expectedVersions.ffmpeg && currentVersions.ffmpeg !== expectedVersions.ffmpeg) {
    console.warn("⚠️  FFmpeg version mismatch - this may affect results");
    console.warn(`  Expected: ${expectedVersions.ffmpeg}`);
    console.warn(`  Current:  ${currentVersions.ffmpeg}`);
  }

  if (expectedVersions.wasm?.sha256 && currentVersions.wasmSha256 !== expectedVersions.wasm.sha256) {
    console.error("❌ WASM SHA256 mismatch!");
    console.error(`  Expected: ${expectedVersions.wasm.sha256}`);
    console.error(`  Current:  ${currentVersions.wasmSha256}`);
    console.error("Refusing to regenerate goldens with different WASM binary.");
    process.exit(1);
  }

  console.log("✅ Toolchain compatibility check passed");

  // Regenerate outputs for each case
  const outputDir = path.join(process.cwd(), "out");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log("\nRegenerating golden outputs...");

  for (const caseInfo of index.cases) {
    console.log(`\nRegenerating case: ${caseInfo.id}`);

    try {
      // Run the CLI tool to generate output
      const inputPath = path.join(goldensDir, caseInfo.inputs[0]);
      const cmd = `node apps/cli/dist/cli.js --mode ${caseInfo.mode} --note ${caseInfo.note} --out-dir ${outputDir} --resampler wasm --emit-report ${inputPath}`;

      console.log(`Running: ${cmd}`);
      execSync(cmd, { stdio: 'inherit' });

      // Update SHA256s in index.json
      const expectedOutput = caseInfo.expect.output;
      const outputPath = path.join(outputDir, path.basename(expectedOutput.path));

      if (fs.existsSync(outputPath)) {
        const outputBuffer = fs.readFileSync(outputPath);
        const newSha256 = crypto.createHash('sha256').update(outputBuffer).digest('hex');
        expectedOutput.sha256 = newSha256;
        console.log(`Updated output SHA256: ${newSha256}`);
      } else {
        console.error(`❌ Output file not created: ${outputPath}`);
        continue;
      }

      // Update report SHA256 if present
      const expectedReport = caseInfo.expect.report;
      if (expectedReport) {
        const reportPath = path.join(outputDir, path.basename(expectedReport.path));

        if (fs.existsSync(reportPath)) {
          const reportBuffer = fs.readFileSync(reportPath);
          const newReportSha256 = crypto.createHash('sha256').update(reportBuffer).digest('hex');
          expectedReport.sha256 = newReportSha256;
          console.log(`Updated report SHA256: ${newReportSha256}`);
        } else {
          console.error(`❌ Report file not created: ${reportPath}`);
        }
      }

    } catch (error) {
      console.error(`❌ Error regenerating ${caseInfo.id}:`, error.message);
    }
  }

  // Update toolchain info in index.json
  index.toolchain = currentVersions;

  // Write updated index.json
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  console.log(`\n✅ Updated ${indexPath}`);

  console.log("\nGolden regeneration completed successfully!");
  console.log("Remember to commit the updated goldens/ directory.");
}

/**
 * Main function
 */
async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log("Usage: node tools/regenerate-goldens.mjs");
    console.log("");
    console.log("Regenerates golden test outputs and updates SHA256s.");
    console.log("Performs toolchain compatibility check before regeneration.");
    console.log("");
    console.log("Options:");
    console.log("  --help, -h    Show this help message");
    process.exit(0);
  }

  await regenerateGoldens();
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
