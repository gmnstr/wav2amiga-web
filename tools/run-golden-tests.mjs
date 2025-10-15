#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { execSync } from "node:child_process";

/**
 * Golden test runner
 * Reads goldens/index.json and validates outputs against expected SHA256s
 */
async function runGoldenTests(structureOnly = false) {
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

  console.log(`Running golden tests with resampler: ${structureOnly ? 'ffmpeg (structure only)' : 'wasm'}`);

  let passed = 0;
  let failed = 0;

  for (const caseInfo of index.cases) {
    console.log(`\nTesting case: ${caseInfo.id}`);

    try {
      // Run the CLI tool
      const outputDir = path.join(process.cwd(), "out");
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const resampler = structureOnly ? 'ffmpeg' : 'wasm';
      const cmd = `node apps/cli/dist/cli.js --mode ${caseInfo.mode} --note ${caseInfo.note} --out-dir ${outputDir} --resampler ${resampler} --emit-report --force ${path.join(goldensDir, caseInfo.inputs[0])}`;

      console.log(`Running: ${cmd}`);
      execSync(cmd, { stdio: 'inherit' });

      // Check output file
      const expectedOutput = caseInfo.expect.output;
      const outputPath = path.join(outputDir, path.basename(expectedOutput.path));

      if (!fs.existsSync(outputPath)) {
        console.error(`❌ Output file not created: ${outputPath}`);
        failed++;
        continue;
      }

      // Validate SHA256 unless placeholder
      const actualBuffer = fs.readFileSync(outputPath);
      const actualSha256 = crypto.createHash('sha256').update(actualBuffer).digest('hex');
      if (expectedOutput.sha256 && expectedOutput.sha256 !== 'placeholder') {
        if (actualSha256 !== expectedOutput.sha256) {
          console.error(`❌ SHA256 mismatch for ${path.basename(expectedOutput.path)}`);
          console.error(`  Expected: ${expectedOutput.sha256}`);
          console.error(`  Actual:   ${actualSha256}`);
          failed++;
        } else {
          console.log(`✅ SHA256 match for ${path.basename(expectedOutput.path)}`);
          passed++;
        }
      } else {
        console.log(`ℹ️  Skipping SHA256 compare for ${path.basename(expectedOutput.path)} (placeholder)`);
        passed++;
      }

      // Validate report structure if present
      const expectedReport = caseInfo.expect.report;
      if (expectedReport) {
        // Generate expected report filename based on output filename
        const outputBasename = path.basename(expectedOutput.path, '.8SVX');
        const reportPath = path.join(outputDir, `${outputBasename}_report.json`);

        if (fs.existsSync(reportPath)) {
          try {
            const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));

            // Validate required fields
            if (!report.mode || !report.outputFile || !report.segments || !report.versions) {
              console.error(`❌ Invalid report structure in ${path.basename(expectedReport.path)}`);
              failed++;
            } else {
              console.log(`✅ Valid report structure for ${path.basename(expectedReport.path)}`);

              // Validate SHA256 of report
              const reportBuffer = fs.readFileSync(reportPath);
              const reportSha256 = crypto.createHash('sha256').update(reportBuffer).digest('hex');
              if (expectedReport.sha256 && expectedReport.sha256 !== 'placeholder') {
                if (reportSha256 !== expectedReport.sha256) {
                  console.error(`❌ Report SHA256 mismatch for ${path.basename(expectedReport.path)}`);
                  console.error(`  Expected: ${expectedReport.sha256}`);
                  console.error(`  Actual:   ${reportSha256}`);
                  failed++;
                } else {
                  console.log(`✅ Report SHA256 match for ${path.basename(expectedReport.path)}`);
                  passed++;
                }
              } else {
                console.log(`ℹ️  Skipping SHA256 compare for ${path.basename(expectedReport.path)} (placeholder)`);
                passed++;
              }
            }
          } catch (error) {
            console.error(`❌ Error reading report ${reportPath}:`, error.message);
            failed++;
          }
        } else {
          console.error(`❌ Report file not created: ${reportPath}`);
          failed++;
        }
      }

    } catch (error) {
      console.error(`❌ Error running test for ${caseInfo.id}:`, error.message);
      failed++;
    }
  }

  console.log(`\nTest results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const structureOnly = args.includes('--structure-only');

  await runGoldenTests(structureOnly);
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
