#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { getVersions } from "./versions.mjs";

const repoRoot = process.cwd();
const goldensDir = path.join(repoRoot, "goldens");
const indexPath = path.join(goldensDir, "index.json");
const tmpOutputRoot = path.join(repoRoot, "out", "goldens-regenerate");

function parseArgs() {
  const args = process.argv.slice(2);
  const caseIds = new Set();
  let resampler = "zoh";
  let skipToolchainCheck = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--case") {
      const value = args[++i];
      if (!value) {
        console.error("Error: --case requires a value");
        process.exit(1);
      }
      caseIds.add(value);
      continue;
    }
    if (arg === "--resampler") {
      const value = args[++i];
      if (!value) {
        console.error("Error: --resampler requires a value");
        process.exit(1);
      }
      resampler = value;
      continue;
    }
    if (arg === "--skip-toolchain-check") {
      skipToolchainCheck = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: node tools/regenerate-goldens.mjs [--case <id> ...] [--resampler <name>] [--skip-toolchain-check]");
      console.log("");
      console.log("Regenerates golden outputs for the selected cases using the wav2amiga CLI.");
      console.log("Defaults to the ZOH resampler. Pass multiple --case flags to limit regeneration.");
      process.exit(0);
    }
    console.error(`Unknown argument: ${arg}`);
    process.exit(1);
  }

  return { caseIds, resampler, skipToolchainCheck };
}

function loadIndex() {
  if (!fs.existsSync(indexPath)) {
    console.error("Error: goldens/index.json not found");
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(indexPath, "utf-8"));
  } catch (error) {
    console.error(`Error reading ${indexPath}:`, error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function normalizeVersion(value) {
  return (value ?? "").toString().replace(/^v/, "");
}

function ensureToolchain(current, expected) {
  if (!expected) {
    return;
  }

  if (normalizeVersion(current.node) !== normalizeVersion(expected.node)) {
    console.error("❌ Node.js version mismatch");
    console.error(`    Expected: ${expected.node}`);
    console.error(`    Current:  ${current.node}`);
    process.exit(1);
  }

  if ((expected.pnpm ?? "") !== (current.pnpm ?? "")) {
    console.error("❌ pnpm version mismatch");
    console.error(`    Expected: ${expected.pnpm}`);
    console.error(`    Current:  ${current.pnpm}`);
    process.exit(1);
  }

  if (expected.resampler?.name && current.resampler?.name && expected.resampler.name !== current.resampler.name) {
    console.error("❌ Resampler mismatch");
    console.error(`    Expected: ${expected.resampler.name}`);
    console.error(`    Current:  ${current.resampler.name}`);
    process.exit(1);
  }
}

function ensureDir(target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
}

function computeSha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
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

  args.push(...options.inputFiles);
  return args;
}

function runCli(args) {
  const cliPath = path.join(repoRoot, "apps", "cli", "dist", "cli.js");
  if (!fs.existsSync(cliPath)) {
    console.error("CLI binary not found at apps/cli/dist/cli.js. Run pnpm build first.");
    process.exit(1);
  }

  const result = spawnSync(
    process.execPath,
    [cliPath, ...args],
    {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    console.error(result.stdout.trim());
    console.error(result.stderr.trim());
    throw new Error(`CLI exited with status ${result.status}`);
  }

  return result;
}

function updateInputShas(caseInfo) {
  caseInfo.inputs = (caseInfo.inputs ?? []).map((entry) => {
    const relPath = typeof entry === "string" ? entry : entry.path;
    const absolute = path.join(goldensDir, relPath);
    if (!fs.existsSync(absolute)) {
      throw new Error(`Missing input file ${relPath}`);
    }
    const sha256 = computeSha256(absolute);
    return { path: relPath, sha256 };
  });
}

function copyAndHash(source, destination) {
  ensureDir(path.dirname(destination));
  fs.copyFileSync(source, destination);
  return computeSha256(destination);
}

async function regenerate() {
  const { caseIds, resampler, skipToolchainCheck } = parseArgs();
  const index = loadIndex();
  const cases = index.cases ?? [];

  if (cases.length === 0) {
    console.warn("No golden cases defined.");
    return;
  }

  const selectedCases = caseIds.size > 0
    ? cases.filter((c) => caseIds.has(c.id))
    : cases;

  if (caseIds.size > 0 && selectedCases.length !== caseIds.size) {
    const missing = [...caseIds].filter((id) => !selectedCases.find((c) => c.id === id));
    console.error(`Error: Unknown case id(s): ${missing.join(", ")}`);
    process.exit(1);
  }

  const currentVersions = await getVersions();
  if (!skipToolchainCheck) {
    ensureToolchain(currentVersions, index.toolchain);
  } else {
    console.warn("⚠️  Skipping toolchain compatibility check");
  }

  ensureDir(tmpOutputRoot);

  for (const caseInfo of selectedCases) {
    console.log(`\nRegenerating ${caseInfo.id} with resampler=${resampler}...`);

    const caseTmpDir = path.join(tmpOutputRoot, caseInfo.id);
    ensureDir(caseTmpDir);
    for (const entry of fs.readdirSync(caseTmpDir)) {
      fs.rmSync(path.join(caseTmpDir, entry), { recursive: true, force: true });
    }

    const inputEntries = caseInfo.inputs ?? [];
    if (inputEntries.length === 0) {
      throw new Error(`Case ${caseInfo.id} has no inputs`);
    }

    const resolvedInputs = inputEntries.map((entry) => {
      const relPath = typeof entry === "string" ? entry : entry.path;
      const repoRelative = path.join("goldens", relPath);
      return {
        relPath,
        repoRelative,
        absolute: path.join(repoRoot, repoRelative),
      };
    });

    for (const resolved of resolvedInputs) {
      if (!fs.existsSync(resolved.absolute)) {
        throw new Error(`Input not found: ${resolved.relPath}`);
      }
    }

    const manifestRelative = caseInfo.manifest ? path.join("goldens", caseInfo.manifest) : undefined;
    const manifestPath = manifestRelative ? path.join(repoRoot, manifestRelative) : undefined;
    if (caseInfo.manifest && !fs.existsSync(manifestPath)) {
      throw new Error(`Manifest not found: ${caseInfo.manifest}`);
    }

    const cliArgs = buildCliArgs(caseInfo, {
      outputDir: caseTmpDir,
      resampler,
      manifestPath: manifestRelative,
      inputFiles: resolvedInputs.map((entry) => entry.repoRelative),
    });

    const result = runCli(cliArgs);

    if (result.stdout.trim()) {
      console.log(result.stdout.trim());
    }
    if (result.stderr.trim()) {
      console.error(result.stderr.trim());
    }

    const expectedOutput = caseInfo.expect?.output;
    if (!expectedOutput) {
      throw new Error(`Case ${caseInfo.id} missing expect.output`);
    }

    const outputFilename = path.basename(expectedOutput.path);
    const tmpOutput = path.join(caseTmpDir, outputFilename);
    if (!fs.existsSync(tmpOutput)) {
      throw new Error(`CLI did not produce ${outputFilename}`);
    }

    const destinationOutput = path.join(goldensDir, expectedOutput.path);
    const outputSha = copyAndHash(tmpOutput, destinationOutput);
    caseInfo.expect.output.sha256 = outputSha;
    console.log(`  Updated output SHA256: ${outputSha}`);

    const expectedReport = caseInfo.expect.report;
    if (expectedReport) {
      const reportFilename = path.basename(expectedReport.path);
      const tmpReport = path.join(caseTmpDir, reportFilename);
      if (!fs.existsSync(tmpReport)) {
        throw new Error(`CLI did not produce ${reportFilename}`);
      }
      const destinationReport = path.join(goldensDir, expectedReport.path);
      const reportSha = copyAndHash(tmpReport, destinationReport);
      caseInfo.expect.report.sha256 = reportSha;
      console.log(`  Updated report SHA256: ${reportSha}`);
    }

    updateInputShas(caseInfo);
  }

  index.toolchain = currentVersions;
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  console.log(`\n✅ Updated ${indexPath}`);
}

regenerate().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
