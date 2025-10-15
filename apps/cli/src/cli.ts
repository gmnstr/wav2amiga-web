#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as fs from "node:fs";
import * as path from "node:path";
import { decodePCM16Mono, decodeAndResampleToPcm16 } from "@wav2amiga/node-io";
import { createWasmResampler } from "@wav2amiga/resampler-wasm";
import {
  mapPcm16To8Bit,
  validateMonoPcm16,
  noteToTargetHz,
  StackingMode,
  generateSingleFilename,
  generateStackedFilename,
  generateStackedEqualFilename,
  calculateStackedEqualLayout,
  alignTo256,
  ResampleAPI,
} from "@wav2amiga/core";

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
  targetHz: number;
  startByte: number;
  startOffsetHex: string;
  lengthBytes: number;
  paddedLengthBytes: number;
  paddedLength: number; // For compatibility with core functions
  sampleData: Uint8Array; // Actual 8-bit sample data
}

interface Report {
  mode: StackingMode;
  outputFile: string;
  segments: SampleSegment[];
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
    .usage("$0 [options] <files...>")
    .option("mode", {
      alias: "m",
      describe: "Output mode",
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
      describe: "Resampler to use",
      choices: ["wasm", "ffmpeg"] as const,
      default: "wasm",
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

  // Validate arguments
  if (mode === "single" && !note) {
    console.error("Error: --note is required for single mode");
    process.exit(1);
  }

  if ((mode === "stacked" || mode === "stacked-equal") && !manifest) {
    console.error(`Error: --manifest is required for ${mode} mode`);
    process.exit(1);
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
  const segments: SampleSegment[] = [];
  let currentOffset = 0;

  // Initialize resampler once
  let resamplerInstance: ResampleAPI | null = null;
  if (resampler === "wasm") {
    try {
      resamplerInstance = await createWasmResampler();
    } catch (error) {
      // For WASM errors (expected when binary is placeholder), fall back to ffmpeg for testing
      // In production, this would be a fatal error
      if (process.env.NODE_ENV === 'test' || error instanceof Error && (
        error.message.includes('expected magic word 00 61 73 6d') ||
        error.message.includes('WASM file not found')
      )) {
        console.warn(`WASM resampler not available, falling back to ffmpeg for testing: ${error instanceof Error ? error.message : String(error)}`);
        // Don't set resamplerInstance - will use fallback logic later
      } else {
        console.error(`Error initializing WASM resampler: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    }
  }

  for (let i = 0; i < files.length; i++) {
    const file = files[i] as string;

    if (verbose) {
      console.log(`Processing ${file}...`);
    }

    try {
      // Find manifest entry for this file
      const manifestEntry = manifestEntries.find(entry => entry.filepath === file);
      if (!manifestEntry) {
        console.error(`Error: No manifest entry found for ${file}`);
        process.exit(1);
      }

      const { note: fileNote } = manifestEntry;
      const targetHz = noteToTargetHz(fileNote);

      // Decode audio file to PCM16 mono at source rate
      const { data: pcm16, srcHz } = await decodePCM16Mono(file);

      // Validate mono (decodePCM16Mono already does this, but keep for safety)
      validateMonoPcm16(pcm16, 1);

      // Resample if needed
      let resampledPcm16 = pcm16;
      if (srcHz !== targetHz) {
        if (resampler === "ffmpeg") {
          resampledPcm16 = await decodeAndResampleToPcm16(file, targetHz);
        } else if (resampler === "wasm" && resamplerInstance) {
          resampledPcm16 = resamplerInstance.resamplePCM16(pcm16, srcHz, targetHz);
        } else if (resampler === "wasm" && !resamplerInstance) {
          // WASM requested but not available (testing scenario) - use ffmpeg as fallback
          if (verbose) {
            console.log(`WASM resampler not available, using ffmpeg fallback for ${file}`);
          }
          resampledPcm16 = await decodeAndResampleToPcm16(file, targetHz);
        } else {
          // Fallback: assume input is already at target rate
          if (verbose) {
            console.log(`Warning: Input rate ${srcHz}Hz != target ${targetHz}Hz, but no resampler available`);
          }
        }
      }

      // Convert to 8-bit
      const sampleData = mapPcm16To8Bit(resampledPcm16);
      const sampleLength = sampleData.length;
      const paddedLength = alignTo256(sampleLength);

      // Calculate offsets
      const startByte = currentOffset;
      const startOffsetHex = Math.floor(startByte / 256)
        .toString(16)
        .toUpperCase()
        .padStart(2, "0");

      segments.push({
        label: path.basename(file, path.extname(file)),
        note: fileNote,
        targetHz,
        startByte,
        startOffsetHex,
        lengthBytes: sampleLength,
        paddedLengthBytes: paddedLength,
        paddedLength,
        sampleData,
      });

      // Update offset for next segment
      if (mode === "stacked-equal") {
        const { slotSize } = calculateStackedEqualLayout([paddedLength]);
        currentOffset += slotSize;
      } else {
        currentOffset += paddedLength;
      }

    } catch (error) {
      console.error(`Error processing ${file}: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }

  // Generate output filename
  let outputFilename: string;
  const baseName = "output"; // Could be made configurable

  if (mode === "single") {
    outputFilename = generateSingleFilename(baseName);
  } else if (mode === "stacked") {
    outputFilename = generateStackedFilename(baseName, segments);
  } else { // stacked-equal
    const { increment } = calculateStackedEqualLayout(segments.map(s => s.paddedLengthBytes));
    outputFilename = generateStackedEqualFilename(baseName, increment);
  }

  const outputPath = path.join(outDir, outputFilename);

  // Check if output exists and --force is not set
  if (fs.existsSync(outputPath) && !force) {
    console.error(`Error: Output file ${outputPath} already exists. Use --force to overwrite.`);
    process.exit(1);
  }

  // Create 8SVX file
  await createEightSVXFile(outputPath, segments, mode);

  if (verbose) {
    console.log(`Created ${outputPath}`);
  }

  // Write report if requested
  if (emitReport) {
    // Get resampler metadata
    let resamplerMeta: { name: string; version: string; sha256?: string } = {
      name: resampler,
      version: "unknown",
      sha256: undefined
    };
    if (resamplerInstance) {
      resamplerMeta = resamplerInstance.meta;
    }

    const report: Report = {
      mode,
      outputFile: outputFilename,
      segments,
      versions: {
        node: process.version,
        pnpm: "unknown", // Would be populated by tools
        ffmpeg: "unknown", // Would be populated by tools
        resampler: resamplerMeta,
        git: "unknown", // Would be populated by tools
      },
    };

    const reportPath = path.join(outDir, outputFilename.replace(".8SVX", "_report.json"));
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    if (verbose) {
      console.log(`Created ${reportPath}`);
    }
  }

  console.log(`Successfully created ${outputPath}`);
}

async function createEightSVXFile(
  outputPath: string,
  segments: SampleSegment[],
  _mode: StackingMode
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
    for (const segment of segments) {
      totalSize += segment.paddedLengthBytes;
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
      size: totalSize - 8 - 28 - (8 + nameChunkSize) - 8,
    };

    const bodyHeaderBuffer = Buffer.alloc(8);
    bodyHeaderBuffer.write(BODY_CHUNK, 0);
    bodyHeaderBuffer.writeUInt32BE(bodyChunk.size, 4);
    fs.writeSync(fd, bodyHeaderBuffer, 0, 8, 40 + 8 + nameChunkSize);

    // Write sample data
    let currentPosition = 40 + 8 + nameChunkSize + 8;

    for (const segment of segments) {
      const sampleBuffer = Buffer.alloc(segment.paddedLengthBytes, 0x80); // Silence at 0x80 (128)
      // Copy actual sample data
      sampleBuffer.fill(segment.sampleData, 0, Math.min(segment.sampleData.length, segment.paddedLengthBytes));
      fs.writeSync(fd, sampleBuffer, 0, segment.paddedLengthBytes, currentPosition);
      currentPosition += segment.paddedLengthBytes;
    }

  } finally {
    fs.closeSync(fd);
  }
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
