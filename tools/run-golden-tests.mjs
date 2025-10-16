#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { OUT_DIR } from "./lib/paths.mjs";

const BYTES_CONTEXT = 32; // 32 bytes on each side => 64 byte window

function formatHex(buffer) {
  return Array.from(buffer)
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"))
    .join(" ");
}

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
  let structureOnly = false;
  let resampler = "zoh";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--structure-only") {
      structureOnly = true;
      continue;
    }
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
      console.log("Usage: node tools/run-golden-tests.mjs [--structure-only] [--resampler <name>]");
      console.log("");
      console.log("Default mode enforces byte-identical outputs with the ZOH resampler.");
      console.log("Use --structure-only to skip byte comparisons (for optional ffmpeg sanity runs).");
      console.log("Use --resampler <name> to override the CLI resampler (default: zoh).");
      process.exit(0);
    }
    console.error(`Unknown argument: ${arg}`);
    process.exit(1);
  }

  if (!structureOnly && resampler !== "zoh") {
    console.error("Byte-equal verification requires the ZOH resampler. Re-run without overriding --resampler.");
    process.exit(1);
  }

  return { structureOnly, resampler };
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

function compareReports(expectedReportPath, actualReportPath) {
  const expected = JSON.parse(fs.readFileSync(expectedReportPath, "utf-8"));
  const actual = JSON.parse(fs.readFileSync(actualReportPath, "utf-8"));

  const expectedStable = JSON.stringify(stableSort(expected));
  const actualStable = JSON.stringify(stableSort(actual));

  if (expectedStable !== actualStable) {
    throw new Error("Report JSON mismatch");
  }
}

function validateReportShape(report) {
  if (!report || typeof report !== "object") {
    throw new Error("Report is not an object");
  }
  const requiredKeys = ["mode", "outputFile", "segments", "versions"];
  for (const key of requiredKeys) {
    if (!(key in report)) {
      throw new Error(`Report missing required field "${key}"`);
    }
  }
  if (!Array.isArray(report.segments)) {
    throw new Error("Report segments must be an array");
  }
  if (typeof report.versions !== "object" || report.versions === null) {
    throw new Error("Report versions must be an object");
  }
}

async function runGoldenTests(structureOnly, resampler) {
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

  console.log(`Running golden tests (${structureOnly ? "structure-only" : "byte-equal"}) with resampler=${resampler}`);

  let failedCases = 0;
  let passedCases = 0;
  const perCaseOutputDir = path.join(repoRoot, OUT_DIR, "goldens");
  ensureDir(perCaseOutputDir);

  for (const caseInfo of index.cases) {
    console.log(`\n=== ${caseInfo.id} ===`);

    const caseOutputDir = path.join(perCaseOutputDir, caseInfo.id);
    ensureDir(caseOutputDir);
    removeDirContents(caseOutputDir);
    const mismatchLog = [];
    const flushMismatchLog = () => {
      if (mismatchLog.length > 0) {
        const mismatchPath = path.join(caseOutputDir, "mismatch.txt");
        fs.writeFileSync(mismatchPath, mismatchLog.join("\n") + "\n");
      }
    };

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

    let inputsValid = true;
    resolvedInputs.forEach((entry) => {
      if (!fs.existsSync(entry.absolute)) {
        const msg = `Input missing: ${entry.absolute}`;
        console.error(`❌ ${msg}`);
        mismatchLog.push(msg);
        inputsValid = false;
        return;
      }
      if (entry.sha256) {
        const actualInputSha = crypto.createHash("sha256")
          .update(fs.readFileSync(entry.absolute))
          .digest("hex");
        if (actualInputSha !== entry.sha256) {
          const lines = [
            `Input SHA mismatch for ${entry.relPath}`,
            `  Expected: ${entry.sha256}`,
            `  Actual:   ${actualInputSha}`,
          ];
          console.error(`❌ ${lines[0]}`);
          mismatchLog.push(...lines);
          inputsValid = false;
        }
      }
    });

    if (!inputsValid) {
      failedCases += 1;
      flushMismatchLog();
      continue;
    }

    const manifestRelative = caseInfo.manifest ? path.join("goldens", caseInfo.manifest) : undefined;
    const manifestPath = manifestRelative ? path.join(repoRoot, manifestRelative) : undefined;
    if (caseInfo.manifest && !fs.existsSync(manifestPath)) {
      const msg = `Manifest not found: ${manifestPath}`;
      console.error(`❌ ${msg}`);
      mismatchLog.push(msg);
      failedCases += 1;
      flushMismatchLog();
      continue;
    }

    const cliArgs = buildCliArgs(caseInfo, {
      outputDir: caseOutputDir,
      resampler,
      manifestPath: manifestRelative,
      inputFiles: resolvedInputs.map((entry) => entry.repoRelative),
    });

    const result = runCli(cliArgs, repoRoot);
    let caseFailed = false;

    if (result.error) {
      const msg = `CLI failed: ${result.error.message}`;
      console.error(`❌ ${msg}`);
      mismatchLog.push(msg);
      failedCases += 1;
      flushMismatchLog();
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
      mismatchLog.push(
        "CLI exited with non-zero status",
        result.stdout.trim() || "(no stdout)",
        result.stderr.trim() || "(no stderr)"
      );
      failedCases += 1;
      flushMismatchLog();
      continue;
    }

    const expectedOutput = caseInfo.expect?.output;
    const expectedReport = caseInfo.expect?.report;
    if (!expectedOutput) {
      const msg = "Missing expected output metadata";
      console.error(`❌ ${msg}`);
      mismatchLog.push(msg);
      failedCases += 1;
      flushMismatchLog();
      continue;
    }

    const expectedOutputPath = path.join(goldensDir, expectedOutput.path);
    const actualOutputPath = path.join(caseOutputDir, path.basename(expectedOutput.path));

    if (!fs.existsSync(actualOutputPath)) {
      const msg = `Output file not created: ${actualOutputPath}`;
      console.error(`❌ ${msg}`);
      mismatchLog.push(msg);
      failedCases += 1;
      flushMismatchLog();
      continue;
    }

    if (!fs.existsSync(expectedOutputPath)) {
      const msg = `Expected output missing: ${expectedOutputPath}`;
      console.error(`❌ ${msg}`);
      mismatchLog.push(msg);
      failedCases += 1;
      flushMismatchLog();
      continue;
    }

    const actualBuffer = fs.readFileSync(actualOutputPath);
    const expectedBuffer = fs.readFileSync(expectedOutputPath);
    const actualSha = crypto.createHash("sha256").update(actualBuffer).digest("hex");
    const expectedSha = expectedOutput.sha256;

    if (!structureOnly) {
      if (!expectedSha) {
        const msg = "Expected SHA256 missing in index.json";
        console.error(`❌ ${msg}`);
        mismatchLog.push(msg);
        caseFailed = true;
      } else if (actualSha !== expectedSha) {
        const header = `Byte mismatch for ${path.basename(expectedOutput.path)}`;
        console.error(`❌ ${header}`);
        console.error(`  Expected SHA256: ${expectedSha}`);
        console.error(`  Actual   SHA256: ${actualSha}`);
        mismatchLog.push(
          header,
          `Expected SHA256: ${expectedSha}`,
          `Actual   SHA256: ${actualSha}`
        );
        const diff = diffBuffers(expectedBuffer, actualBuffer);
        if (diff) {
          const contextExpected = sliceWindow(expectedBuffer, diff.offset);
          const contextActual = sliceWindow(actualBuffer, diff.offset);
          const diffLines = [
            `First difference @ byte ${diff.offset} (0x${diff.offset.toString(16).toUpperCase()})`,
            `Expected byte: ${diff.expectedByte === null ? "EOF" : `0x${diff.expectedByte.toString(16).toUpperCase().padStart(2, "0")}`}`,
            `Actual   byte: ${diff.actualByte === null ? "EOF" : `0x${diff.actualByte.toString(16).toUpperCase().padStart(2, "0")}`}`,
            `Expected snippet: ${formatHex(contextExpected)}`,
            `Actual snippet:   ${formatHex(contextActual)}`,
          ];
          console.error(`  ${diffLines[0]}`);
          console.error(`    ${diffLines[1]}`);
          console.error(`    ${diffLines[2]}`);
          console.error("  Expected snippet:");
          console.error(`    ${formatHex(contextExpected)}`);
          console.error("  Actual snippet:");
          console.error(`    ${formatHex(contextActual)}`);
          mismatchLog.push(...diffLines);
        }
        caseFailed = true;
      } else {
        console.log(`✅ Byte-identical: ${path.basename(expectedOutput.path)}`);
      }
    } else {
      console.log(`ℹ️  Structure check only: ${path.basename(expectedOutput.path)}`);
    }

    const reportBase = path.basename(expectedOutput.path, ".8SVX");
    const actualReportPath = path.join(caseOutputDir, `${reportBase}_report.json`);
    if (expectedReport) {
      const expectedReportPath = path.join(goldensDir, expectedReport.path);

      if (!fs.existsSync(actualReportPath)) {
        const msg = `Report missing: ${actualReportPath}`;
        console.error(`❌ ${msg}`);
        mismatchLog.push(msg);
        caseFailed = true;
      } else if (!fs.existsSync(expectedReportPath)) {
        const msg = `Expected report missing: ${expectedReportPath}`;
        console.error(`❌ ${msg}`);
        mismatchLog.push(msg);
        caseFailed = true;
      } else {
        try {
          if (!structureOnly) {
            compareReports(expectedReportPath, actualReportPath);
            const actualReportSha = crypto.createHash("sha256")
              .update(fs.readFileSync(actualReportPath))
              .digest("hex");

            if (!expectedReport.sha256) {
              throw new Error("Expected report SHA256 missing in index.json");
            }
            if (actualReportSha !== expectedReport.sha256) {
              throw new Error(`Report SHA mismatch. Expected ${expectedReport.sha256}, got ${actualReportSha}`);
            }
          } else {
            const actualReport = JSON.parse(fs.readFileSync(actualReportPath, "utf-8"));
            validateReportShape(actualReport);
          }

          console.log(`✅ Report match: ${path.basename(expectedReport.path)}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`❌ Report comparison failed: ${message}`);
          mismatchLog.push(`Report comparison failed: ${message}`);
          caseFailed = true;
        }
      }
    }

    if (caseInfo.expect?.warnings) {
      const stderrCombined = `${result.stderr}${result.stdout}`.toLowerCase();
      for (const warning of caseInfo.expect.warnings) {
        if (!stderrCombined.includes(warning.toLowerCase())) {
          const msg = `Expected warning not found: "${warning}"`;
          console.error(`❌ ${msg}`);
          mismatchLog.push(msg);
          caseFailed = true;
        }
      }
    }

    if (caseFailed) {
      failedCases += 1;
    } else {
      passedCases += 1;
    }
    flushMismatchLog();
  }

  console.log(`\nGolden summary: ${passedCases} passed, ${failedCases} failed`);

  if (failedCases > 0) {
    process.exit(1);
  }
}

async function main() {
  const { structureOnly, resampler } = parseArgs();
  await runGoldenTests(structureOnly, resampler);
}

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
