#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { decodePCM16Mono, decodeAndResampleToPcm16 } from "@wav2amiga/node-io";
import {
  convert,
  getResamplerInfo,
  noteToTargetHz,
  type AudioInput,
  type Mode as ConvertMode,
  type StackingMode,
  ConversionError,
  type Report,
  type ReportSegment,
  generateSingleFilename,
  generateStackedFilename,
  generateStackedEqualFilename,
} from "@wav2amiga/core";
import { errors, warnings, EXIT_USAGE, EXIT_PROCESSING, CliError } from "./errors.js";

/**
 * Gets current versions of all toolchain components (matches tools/versions.mjs)
 */
function getVersions() {
  const versions = {
    node: process.version,
    pnpm: "unknown",
    ffmpeg: "unknown",
    resampler: {
      name: "zoh",
      version: "unknown"
    },
    git: "unknown",
  };

  try {
    // Get pnpm version
    try {
      const pnpmVersion = execSync("pnpm --version", { encoding: "utf-8" }).trim();
      versions.pnpm = pnpmVersion;
    } catch (error) {
      // Ignore pnpm version errors
    }

    // Get resampler metadata
    try {
      const info = getResamplerInfo();
      versions.resampler = {
        name: info.name.toLowerCase(),
        version: info.version ?? "unknown"
      };
    } catch {
      // Ignore resampler version errors
    }

    // Get git commit
    try {
      const gitCommit = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
      versions.git = gitCommit;
    } catch (error) {
      // Ignore git version errors
    }

  } catch (error) {
    // Ignore all version errors
  }

  return versions;
}

function handleConversionError(error: ConversionError): never {
  console.error(error.message);
  const exitCode = mapConversionErrorToExit(error.w2aError.code);
  process.exit(exitCode);
}

function mapConversionErrorToExit(code: string | undefined): number {
  switch (code) {
    case "w2a/invalid-note":
    case "w2a/no-inputs":
    case "w2a/no-mode":
    case "w2a/invalid-mode":
    case "w2a/single-multi-input":
      return EXIT_USAGE;
    default:
      return EXIT_PROCESSING;
  }
}

// 8SVX file format constants
const EIGHTSVX_HEADER = "8SVX";
const VHDR_CHUNK = "VHDR";
const NAME_CHUNK = "NAME";
const BODY_CHUNK = "BODY";

/**
 * 8SVX file header structure (big-endian)
 */
interface EightSVXHeader {
  magic: string;        // "FORM"
  size: number;         // Total file size - 8
  format: string;       // "8SVX"
}

/**
 * VHDR chunk structure (big-endian)
 */
interface VHDRChunk {
  magic: string;        // "VHDR"
  size: number;         // 20
  oneShotHiSamples: number;
  repeatHiSamples: number;
  samplesPerHiCycle: number;
  samplesPerSec: number;  // Sample rate
  ctOctave: number;
  sCompression: number;
  volume: number;
}

/**
 * NAME chunk structure
 */
interface NAMEChunk {
  magic: string;        // "NAME"
  size: number;
  name: string;
}

/**
 * BODY chunk structure
 */
interface BODYChunk {
  magic: string;        // "BODY"
  size: number;         // Sample data size (even number of bytes)
}

interface SampleSegment {
  label: string;
  note: string;
  sourceHz: number;
  targetHz: number;
  startByte: number;
  startOffsetHex: string;
  lengthBytes: number;
  paddedLengthBytes: number;
  paddedLength: number; // For compatibility with core functions
  sampleData: Uint8Array; // Actual 8-bit sample data
}

interface CliReport extends Report {
  versions: {
    node: string;
    pnpm: string;
    ffmpeg: string;
    resampler: {
      name: string;
      version: string;
      sha256?: string;
    };
    git: string;
  };
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .usage("Usage: $0 [options] <files...>")
    .epilogue(
      `Modes:
  single        - One sample per file, direct conversion
  stacked       - Multiple samples with variable offsets (offset₁, offset₂, ...)
  stacked-equal - Multiple samples with uniform slot spacing

Notes:
  • PAL Amiga only (3546895Hz base clock)
  • Mono input required (stereo will be rejected)
  • Output format: headerless .8SVX (IFF/8SVX container)
  • Default resampler: ZOH (zero-order hold, preserves transients)

Examples:
  # Single mode
  $0 --mode single --note C-2 kick.wav

  # Stacked mode with manifest
  $0 --mode stacked --manifest drumkit.json input_*.wav

  # Stacked-equal with FFmpeg resampler
  $0 --mode stacked-equal --manifest kit.json --resampler ffmpeg *.wav

For more information, see README.md`
    )
    .option("mode", {
      alias: "m",
      describe: "Output mode (single | stacked | stacked-equal)",
      choices: ["single", "stacked", "stacked-equal"] as const,
      demandOption: true,
    })
    .option("note", {
      alias: "n",
      describe: "Note for single mode (e.g., C-2)",
      type: "string",
    })
    .option("manifest", {
      describe: "JSON manifest file with {filepath, note} entries for stacked modes",
      type: "string",
    })
    .option("out-dir", {
      alias: "o",
      describe: "Output directory",
      type: "string",
      default: "./out",
    })
    .option("emit-report", {
      describe: "Write _report.json file",
      type: "boolean",
      default: false,
    })
    .option("resampler", {
      describe:
        "Resampler to use (zoh=deterministic zero-order hold; ffmpeg=interpolated via external tooling)",
      choices: ["ffmpeg", "zoh"] as const,
      default: "zoh",
    })
    .option("force", {
      alias: "f",
      describe: "Overwrite existing output files",
      type: "boolean",
      default: false,
    })
    .option("verbose", {
      alias: "v",
      describe: "Verbose output",
      type: "boolean",
      default: false,
    })
    .demandCommand(1, "At least one input file is required")
    .help()
    .argv;

  const {
    mode,
    note,
    manifest,
    outDir,
    emitReport,
    resampler,
    force,
    verbose,
    _: files
  } = argv;

  // Validate flag combinations
  if (manifest && note && (mode === "stacked" || mode === "stacked-equal")) {
    throw errors.flagConflict();
  }

  if (mode === "single" && !note) {
    throw errors.missingNoteSingle();
  }

  if ((mode === "stacked" || mode === "stacked-equal") && !manifest) {
    console.error(`Error: --manifest is required for ${mode} mode`);
    process.exit(EXIT_USAGE);
  }

  // Parse manifest if provided
  let manifestEntries: Array<{ filepath: string; note: string }> = [];
  if (manifest) {
    try {
      const manifestContent = fs.readFileSync(manifest, "utf-8");
      manifestEntries = JSON.parse(manifestContent);
    } catch (error) {
      console.error(`Error reading manifest ${manifest}: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }
  // For single mode, allow direct file(s) without a manifest
  if (mode === "single" && files.length > 0 && manifestEntries.length === 0) {
    const targetNote = note as string;
    manifestEntries = (files as string[]).map((f) => ({ filepath: f, note: targetNote }));
  }

  // Create output directory
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Process files
  const convertInputs: AudioInput[] = [];
  const originalSources: number[] = [];
  const originalSampleCounts: number[] = [];
  const inputFiles = files as string[];

  let effectiveResampler = resampler;
  let resamplerMetaUsed: { name: string; version: string; sha256?: string } | null = null;

  if (resampler === "ffmpeg") {
    resamplerMetaUsed = { name: "ffmpeg", version: "unknown" };
  }

  for (let i = 0; i < inputFiles.length; i++) {
    const file = inputFiles[i];

    try {
      if (!fs.existsSync(file)) {
        throw errors.fileNotFound(file);
      }

      const normalizedFile = file.split(path.sep).join("/");
      const manifestEntry = manifestEntries.find((entry) => {
        const normalizedEntry = entry.filepath.split(path.sep).join("/");
        return normalizedEntry === normalizedFile;
      });
      if (!manifestEntry) {
        console.error(`Error: No manifest entry found for ${file}`);
        process.exit(EXIT_USAGE);
      }

      const { note: fileNote } = manifestEntry;

      let targetHz: number;
      try {
        targetHz = noteToTargetHz(fileNote);
      } catch {
        throw errors.invalidNote(fileNote);
      }

      let decoded: { data: Int16Array; srcHz: number };
      try {
        decoded = await decodePCM16Mono(file);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes("channels")) {
            const match = error.message.match(/(\d+) channels/);
            const channels = match ? parseInt(match[1]) : 2;
            throw errors.nonMono(file, channels);
          }
          if (error.message.includes("file not found")) {
            throw errors.fileNotFound(file);
          }
          throw errors.unsupportedAudio(file);
        }
        throw errors.unreadableFile(file);
      }

      const { data: pcm16, srcHz } = decoded;

      if (pcm16.length === 0) {
        throw errors.emptyAudio(file);
      }

      originalSources.push(srcHz);
      originalSampleCounts.push(pcm16.length);

      let pcmForConvert = pcm16;
      let sourceHzForConvert = srcHz;

      if (effectiveResampler === "ffmpeg") {
        pcmForConvert = await decodeAndResampleToPcm16(file, targetHz);
        sourceHzForConvert = targetHz;
      }

      convertInputs.push({
        pcm16: pcmForConvert,
        label: path.basename(file, path.extname(file)),
        note: fileNote,
        sourceHz: sourceHzForConvert,
      });
    } catch (error) {
      if (error instanceof CliError) {
        console.error(error.message);
        process.exit(error.exitCode);
      }
      if (error instanceof ConversionError) {
        handleConversionError(error);
      }
      throw error;
    }
  }

  let convertResult: ReturnType<typeof convert>;
  try {
    convertResult = convert(convertInputs, { mode: mode as ConvertMode });
  } catch (error) {
    if (error instanceof ConversionError) {
      handleConversionError(error);
    }
    throw error;
  }
  if (!resamplerMetaUsed) {
    resamplerMetaUsed = {
      name: convertResult.resampler.name.toLowerCase(),
      version: convertResult.resampler.version,
    };
  }

  convertResult.totalInputSamples = originalSampleCounts.reduce((sum, count) => sum + count, 0);
  convertResult.segments.forEach((segment, index) => {
    segment.sourceHz = originalSources[index];
  });

  const bodyBytes = convertResult.outputBytes;
  const cliSegments: SampleSegment[] = convertResult.segments.map((segment, index) => {
    const startByte = segment.startByte;
    const paddedLength = segment.paddedLengthBytes;
    const paddedView = bodyBytes.subarray(startByte, startByte + paddedLength);
    const sampleData = paddedView.slice(0, segment.lengthBytes);

    if (segment.lengthBytes > 0xFFFF) {
      console.warn(warnings.oversize(segment.label, segment.lengthBytes));
    }

    return {
      label: segment.label,
      note: segment.note,
      sourceHz: originalSources[index],
      targetHz: segment.targetHz,
      startByte: segment.startByte,
      startOffsetHex: segment.startOffsetHex,
      lengthBytes: segment.lengthBytes,
      paddedLengthBytes: segment.paddedLengthBytes,
      paddedLength: segment.paddedLengthBytes,
      sampleData,
    };
  });

  if (verbose) {
    cliSegments.forEach((segment, index) => {
      const file = inputFiles[index];
      console.error(`Processing ${file}...`);
      console.error(`  Source rate: ${originalSources[index]}Hz`);
      console.error(`  Target rate: ${segment.targetHz}Hz`);
      console.error(`  Samples: ${originalSampleCounts[index]} -> ${segment.lengthBytes}`);
      console.error(`  8-bit length: ${segment.lengthBytes} bytes`);
      console.error(`  Padded length: ${segment.paddedLengthBytes} bytes`);
      console.error(`  Start offset: 0x${segment.startOffsetHex}`);
      if (resamplerMetaUsed) {
        console.error(`  Resampler: ${resamplerMetaUsed.name} v${resamplerMetaUsed.version}`);
        if (resamplerMetaUsed.sha256) {
          console.error(`  Resampler SHA256: ${resamplerMetaUsed.sha256}`);
        }
      }
    });
  }

  // Generate output filename
  let outputFilename: string;
  const baseName = "output"; // Could be made configurable

  if (mode === "single") {
    outputFilename = generateSingleFilename(baseName);
  } else if (mode === "stacked") {
    const stackedSummary = cliSegments.map((segment) => ({
      startByte: segment.startByte,
      paddedLength: segment.paddedLengthBytes,
    }));
    outputFilename = generateStackedFilename(baseName, stackedSummary);
  } else {
    const slotIncrement =
      cliSegments.length > 0 ? cliSegments[0].paddedLengthBytes >> 8 : 0;
    outputFilename = generateStackedEqualFilename(baseName, slotIncrement);
  }

  const outputPath = path.join(outDir, outputFilename);

  // Check if output exists and --force is not set
  if (fs.existsSync(outputPath) && !force) {
    console.warn(warnings.overwrite(outputPath));
    process.exit(0);
  }

  // Create 8SVX file
  try {
    await createEightSVXFile(outputPath, cliSegments, mode, bodyBytes);
  } catch {
    throw errors.writeFailed(outputPath);
  }

  if (verbose) {
    console.error(`Created ${outputPath}`);
  }

  // Write report if requested
  if (emitReport) {
    // Get resampler metadata
    const resamplerMeta: { name: string; version: string; sha256?: string } =
      resamplerMetaUsed ?? { name: resampler, version: "unknown" };

    // Get versions using the same logic as tools/versions.mjs
    const versions = getVersions();

    const reportSegments: ReportSegment[] = convertResult.segments.map((segment) => ({
      ...segment,
    }));

    const report: CliReport = {
      mode,
      outputFile: outputFilename,
      segments: reportSegments,
      resampler: convertResult.resampler,
      versions: {
        node: versions.node,
        pnpm: versions.pnpm,
        ffmpeg: versions.ffmpeg,
        resampler: resamplerMeta,
        git: versions.git,
      },
    };

    const reportPath = path.join(outDir, outputFilename.replace(".8SVX", "_report.json"));
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    if (verbose) {
      console.error(`Created ${reportPath}`);
    }
  }

  console.log(`Successfully created ${outputPath}`);
}

async function createEightSVXFile(
  outputPath: string,
  segments: SampleSegment[],
  _mode: StackingMode,
  bodyBytes: Uint8Array
): Promise<void> {
  const fd = fs.openSync(outputPath, "w");

  try {
    // Calculate total file size
    let totalSize = 0;

    // FORM header (8 bytes)
    totalSize += 8;

    // VHDR chunk (28 bytes)
    totalSize += 4 + 4 + 20; // Chunk header + data

    // NAME chunk (variable, but we'll use a simple name)
    const name = "wav2amiga";
    const nameChunkSize = (name.length + 1) & ~1; // Round up to even
    totalSize += 4 + 4 + nameChunkSize;

    // BODY chunk header (8 bytes)
    totalSize += 8;

    // Sample data (padded to 256-byte boundaries)
    let bodySize = 0;
    for (const segment of segments) {
      totalSize += segment.paddedLengthBytes;
      bodySize += segment.paddedLengthBytes;
    }

    // Write FORM header
    const header: EightSVXHeader = {
      magic: "FORM",
      size: totalSize - 8,
      format: EIGHTSVX_HEADER,
    };

    const headerBuffer = Buffer.alloc(12);
    headerBuffer.write("FORM", 0);
    headerBuffer.writeUInt32BE(header.size, 4);
    headerBuffer.write(EIGHTSVX_HEADER, 8);
    fs.writeSync(fd, headerBuffer);

    // Write VHDR chunk
    const vhdrChunk: VHDRChunk = {
      magic: VHDR_CHUNK,
      size: 20,
      oneShotHiSamples: 0,
      repeatHiSamples: 0,
      samplesPerHiCycle: 0,
      samplesPerSec: segments[0]?.targetHz || 0,
      ctOctave: 1,
      sCompression: 0,
      volume: 0x10000,
    };

    const vhdrBuffer = Buffer.alloc(28);
    vhdrBuffer.write(VHDR_CHUNK, 0);
    vhdrBuffer.writeUInt32BE(vhdrChunk.size, 4);
    vhdrBuffer.writeUInt32BE(vhdrChunk.oneShotHiSamples, 8);
    vhdrBuffer.writeUInt32BE(vhdrChunk.repeatHiSamples, 12);
    vhdrBuffer.writeUInt32BE(vhdrChunk.samplesPerHiCycle, 16);
    vhdrBuffer.writeUInt32BE(vhdrChunk.samplesPerSec, 20);
    vhdrBuffer.writeUInt16BE(vhdrChunk.ctOctave, 24);
    vhdrBuffer.writeUInt16BE(vhdrChunk.sCompression, 26);
    fs.writeSync(fd, vhdrBuffer, 0, 28, 12);

    // Write NAME chunk
    const nameChunk: NAMEChunk = {
      magic: NAME_CHUNK,
      size: nameChunkSize,
      name,
    };

    const nameBuffer = Buffer.alloc(8 + nameChunkSize);
    nameBuffer.write(NAME_CHUNK, 0);
    nameBuffer.writeUInt32BE(nameChunk.size, 4);
    nameBuffer.write(name, 8);
    fs.writeSync(fd, nameBuffer, 0, 8 + nameChunkSize, 40);

    // Write BODY chunk header
    const bodyChunk: BODYChunk = {
      magic: BODY_CHUNK,
      size: bodySize,
    };

    const bodyHeaderBuffer = Buffer.alloc(8);
    bodyHeaderBuffer.write(BODY_CHUNK, 0);
    bodyHeaderBuffer.writeUInt32BE(bodyChunk.size, 4);
    fs.writeSync(fd, bodyHeaderBuffer, 0, 8, 40 + 8 + nameChunkSize);

    // Write sample data
    let currentPosition = 40 + 8 + nameChunkSize + 8;

    for (const segment of segments) {
      fs.writeSync(
        fd,
        bodyBytes,
        segment.startByte,
        segment.paddedLengthBytes,
        currentPosition
      );
      currentPosition += segment.paddedLengthBytes;
    }

  } finally {
    fs.closeSync(fd);
  }
}

main().catch((error) => {
  if (error instanceof CliError) {
    console.error(error.message);
    process.exit(error.exitCode);
  }
  if (error instanceof ConversionError) {
    handleConversionError(error);
  }
  console.error("Error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
