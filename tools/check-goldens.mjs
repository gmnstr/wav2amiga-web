#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { OUT_DIR, OUT_DIFF } from "./lib/paths.mjs";

const BYTES_CONTEXT = 32; // 32 bytes on each side => 64 byte window

function stableSort(value) {
  if (Array.isArray(value)) {
    return value.map(stableSort);
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b));
    return entries.reduce((acc, [key, val]) => {
      acc[key] = stableSort(val);
      return acc;
    }, {});
  }
  return value;
}

function formatHex(buffer) {
  return Array.from(buffer)
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"))
    .join(" ");
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function removeDirContents(target) {
  if (!fs.existsSync(target)) {
    return;
  }
  for (const entry of fs.readdirSync(target)) {
    fs.rmSync(path.join(target, entry), { recursive: true, force: true });
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  let resampler = "zoh";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--resampler") {
      const next = args[i + 1];
      if (!next) {
        console.error("Error: --resampler requires a value");
        process.exit(1);
      }
      resampler = next;
      i++;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: node tools/check-goldens.mjs [--resampler <name>]");
      console.log("");
      console.log("Re-runs CLI conversion for all golden cases and verifies byte-identical outputs.");
      console.log("Use --resampler <name> to override the CLI resampler (default: zoh).");
      process.exit(0);
    }
    console.error(`Unknown argument: ${arg}`);
    process.exit(1);
  }

  return { resampler };
}

function diffBuffers(expected, actual) {
  const minLength = Math.min(expected.length, actual.length);
  for (let i = 0; i < minLength; i++) {
    if (expected[i] !== actual[i]) {
      return { offset: i, expectedByte: expected[i], actualByte: actual[i] };
    }
  }
  if (expected.length !== actual.length) {
    return {
      offset: minLength,
      expectedByte: expected[minLength] ?? null,
      actualByte: actual[minLength] ?? null,
    };
  }
  return null;
}

function sliceWindow(buffer, offset) {
  const start = Math.max(0, offset - BYTES_CONTEXT);
  const end = Math.min(buffer.length, offset + BYTES_CONTEXT);
  return buffer.slice(start, end);
}

function buildCliArgs(caseInfo, options) {
  const args = [
    "--mode",
    caseInfo.mode,
    "--out-dir",
    options.outputDir,
    "--resampler",
    options.resampler,
    "--emit-report",
    "--force",
  ];

  if (caseInfo.note) {
    args.push("--note", caseInfo.note);
  }

  if (caseInfo.manifest) {
    args.push("--manifest", options.manifestPath);
  }

  if (caseInfo.extraFlags) {
    args.push(...caseInfo.extraFlags);
  }

  args.push(...options.inputFiles);
  return args;
}

function runCli(commandArgs, cwd) {
  const cliExe = path.join(process.cwd(), "apps", "cli", "dist", "cli.js");
  if (!fs.existsSync(cliExe)) {
    console.error("CLI binary not found at apps/cli/dist/cli.js. Run pnpm build first.");
    process.exit(1);
  }

  const result = spawnSync(
    process.execPath,
    [cliExe, ...commandArgs],
    {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  return result;
}

function writeHexdumpDiff(caseId, filename, expectedBuffer, actualBuffer, diff) {
  const diffDir = path.join(process.cwd(), OUT_DIFF);
  ensureDir(diffDir);
  
  const diffPath = path.join(diffDir, `${caseId}-${filename}.txt`);
  const contextExpected = sliceWindow(expectedBuffer, diff.offset);
  const contextActual = sliceWindow(actualBuffer, diff.offset);
  
  const diffContent = [
    `Golden drift detected for ${caseId}/${filename}`,
    `First difference @ byte ${diff.offset} (0x${diff.offset.toString(16).toUpperCase()})`,
    `Expected byte: ${diff.expectedByte === null ? "EOF" : `0x${diff.expectedByte.toString(16).toUpperCase().padStart(2, "0")}`}`,
    `Actual   byte: ${diff.actualByte === null ? "EOF" : `0x${diff.actualByte.toString(16).toUpperCase().padStart(2, "0")}`}`,
    `Expected snippet: ${formatHex(contextExpected)}`,
    `Actual snippet:   ${formatHex(contextActual)}`,
    "",
    "Full file comparison:",
    `Expected length: ${expectedBuffer.length} bytes`,
    `Actual length:   ${actualBuffer.length} bytes`,
  ].join("\n");
  
  fs.writeFileSync(diffPath, diffContent);
  console.log(`  Hexdump diff written to: ${diffPath}`);
}

async function checkGoldenDrift(resampler) {
  const repoRoot = process.cwd();
  const goldensDir = path.join(repoRoot, "goldens");
  const indexPath = path.join(goldensDir, "index.json");

  if (!fs.existsSync(indexPath)) {
    console.error("Error: goldens/index.json not found");
    process.exit(1);
  }

  let index;
  try {
    index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
  } catch (error) {
    console.error(`Error reading ${indexPath}:`, error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  console.log(`Running golden drift check with resampler=${resampler}`);

  let failedCases = 0;
  let passedCases = 0;
  const perCaseOutputDir = path.join(repoRoot, OUT_DIR, "golden-drift");
  ensureDir(perCaseOutputDir);

  for (const caseInfo of index.cases) {
    console.log(`\n=== ${caseInfo.id} ===`);

    const caseOutputDir = path.join(perCaseOutputDir, caseInfo.id);
    ensureDir(caseOutputDir);
    removeDirContents(caseOutputDir);

    const inputEntries = caseInfo.inputs ?? [];
    const resolvedInputs = inputEntries.map((entry) => {
      const relPath = typeof entry === "string" ? entry : entry.path;
      const repoRelative = path.join("goldens", relPath);
      return {
        relPath,
        repoRelative,
        absolute: path.join(repoRoot, repoRelative),
        sha256: typeof entry === "object" ? entry.sha256 : undefined,
      };
    });

    if (resolvedInputs.length === 0) {
      console.error("❌ No inputs configured for case");
      failedCases += 1;
      continue;
    }

    // Verify inputs exist and match expected SHAs
    let inputsValid = true;
    resolvedInputs.forEach((entry) => {
      if (!fs.existsSync(entry.absolute)) {
        console.error(`❌ Input missing: ${entry.absolute}`);
        inputsValid = false;
        return;
      }
      if (entry.sha256) {
        const actualInputSha = crypto.createHash("sha256")
          .update(fs.readFileSync(entry.absolute))
          .digest("hex");
        if (actualInputSha !== entry.sha256) {
          console.error(`❌ Input SHA mismatch for ${entry.relPath}`);
          console.error(`  Expected: ${entry.sha256}`);
          console.error(`  Actual:   ${actualInputSha}`);
          inputsValid = false;
        }
      }
    });

    if (!inputsValid) {
      failedCases += 1;
      continue;
    }

    const manifestRelative = caseInfo.manifest ? path.join("goldens", caseInfo.manifest) : undefined;
    const manifestPath = manifestRelative ? path.join(repoRoot, manifestRelative) : undefined;
    if (caseInfo.manifest && !fs.existsSync(manifestPath)) {
      console.error(`❌ Manifest not found: ${manifestPath}`);
      failedCases += 1;
      continue;
    }

    const cliArgs = buildCliArgs(caseInfo, {
      outputDir: caseOutputDir,
      resampler,
      manifestPath: manifestRelative,
      inputFiles: resolvedInputs.map((entry) => entry.repoRelative),
    });

    const result = runCli(cliArgs, repoRoot);

    if (result.error) {
      console.error(`❌ CLI failed: ${result.error.message}`);
      failedCases += 1;
      continue;
    }

    if (result.status !== 0) {
      console.error("❌ CLI exited with non-zero status");
      if (result.stdout) {
        console.error(result.stdout.trim());
      }
      if (result.stderr) {
        console.error(result.stderr.trim());
      }
      failedCases += 1;
      continue;
    }

    const expectedOutput = caseInfo.expect?.output;
    const expectedReport = caseInfo.expect?.report;
    if (!expectedOutput) {
      console.error("❌ Missing expected output metadata");
      failedCases += 1;
      continue;
    }

    const expectedOutputPath = path.join(goldensDir, expectedOutput.path);
    const actualOutputPath = path.join(caseOutputDir, path.basename(expectedOutput.path));

    if (!fs.existsSync(actualOutputPath)) {
      console.error(`❌ Output file not created: ${actualOutputPath}`);
      failedCases += 1;
      continue;
    }

    if (!fs.existsSync(expectedOutputPath)) {
      console.error(`❌ Expected output missing: ${expectedOutputPath}`);
      failedCases += 1;
      continue;
    }

    const actualBuffer = fs.readFileSync(actualOutputPath);
    const expectedBuffer = fs.readFileSync(expectedOutputPath);
    const actualSha = crypto.createHash("sha256").update(actualBuffer).digest("hex");
    const expectedSha = expectedOutput.sha256;

    let caseFailed = false;

    if (!expectedSha) {
      console.error("❌ Expected SHA256 missing in index.json");
      caseFailed = true;
    } else if (actualSha !== expectedSha) {
      console.error(`❌ Byte mismatch for ${path.basename(expectedOutput.path)}`);
      console.error(`  Expected SHA256: ${expectedSha}`);
      console.error(`  Actual   SHA256: ${actualSha}`);
      
      const diff = diffBuffers(expectedBuffer, actualBuffer);
      if (diff) {
        writeHexdumpDiff(caseInfo.id, path.basename(expectedOutput.path), expectedBuffer, actualBuffer, diff);
      }
      caseFailed = true;
    } else {
      console.log(`✅ Byte-identical: ${path.basename(expectedOutput.path)}`);
    }

    // Check report if expected
    if (expectedReport) {
      const reportBase = path.basename(expectedOutput.path, ".8SVX");
      const actualReportPath = path.join(caseOutputDir, `${reportBase}_report.json`);
      const expectedReportPath = path.join(goldensDir, expectedReport.path);

      if (!fs.existsSync(actualReportPath)) {
        console.error(`❌ Report missing: ${actualReportPath}`);
        caseFailed = true;
      } else if (!fs.existsSync(expectedReportPath)) {
        console.error(`❌ Expected report missing: ${expectedReportPath}`);
        caseFailed = true;
      } else {
        // Calculate SHA of report without versions section to match golden test logic
        const actualReportContent = JSON.parse(fs.readFileSync(actualReportPath, "utf-8"));
        const actualReportForSha = { ...actualReportContent };
        delete actualReportForSha.versions;
        const actualReportSha = crypto.createHash("sha256")
          .update(JSON.stringify(stableSort(actualReportForSha)))
          .digest("hex");

        if (!expectedReport.sha256) {
          console.error("❌ Expected report SHA256 missing in index.json");
          caseFailed = true;
        } else if (actualReportSha !== expectedReport.sha256) {
          console.error(`❌ Report SHA mismatch for ${path.basename(expectedReport.path)}`);
          console.error(`  Expected SHA256: ${expectedReport.sha256}`);
          console.error(`  Actual   SHA256: ${actualReportSha}`);
          
          const actualReportBuffer = fs.readFileSync(actualReportPath);
          const expectedReportBuffer = fs.readFileSync(expectedReportPath);
          const reportDiff = diffBuffers(expectedReportBuffer, actualReportBuffer);
          if (reportDiff) {
            writeHexdumpDiff(caseInfo.id, path.basename(expectedReport.path), expectedReportBuffer, actualReportBuffer, reportDiff);
          }
          caseFailed = true;
        } else {
          console.log(`✅ Report match: ${path.basename(expectedReport.path)}`);
        }
      }
    }

    if (caseFailed) {
      failedCases += 1;
    } else {
      passedCases += 1;
    }
  }

  console.log(`\nGolden drift check: ${index.cases.length} cases, ${passedCases} passed, ${failedCases} failed`);

  if (failedCases > 0) {
    process.exit(1);
  }
}

async function main() {
  const { resampler } = parseArgs();
  await checkGoldenDrift(resampler);
}

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
