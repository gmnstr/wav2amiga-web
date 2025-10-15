import { execa } from "execa";
import ffmpegStatic from "ffmpeg-static";
import * as fs from "node:fs";

/**
 * Decodes a WAV file to raw PCM16 data using ffmpeg.
 * @param filePath Path to input WAV file
 * @returns Promise<Int16Array> Raw PCM16 data (16-bit signed integers, little-endian)
 */
export async function decodeToPcm16(filePath: string): Promise<Int16Array> {
  try {
    // Use ffmpeg to decode WAV to raw PCM16
    // -i <file> -ac 1 -f s16le -
    const { stdout } = await execa(ffmpegStatic as string, [
      "-i", filePath,
      "-ac", "1",           // Convert to mono
      "-f", "s16le",        // Output format: signed 16-bit little-endian
      "-hide_banner",       // Suppress banner
      "-loglevel", "error", // Only show errors
      "pipe:1"              // Output to stdout
    ], { encoding: "buffer" as any });

    // Convert buffer to Int16Array
    const buffer = Buffer.from(stdout as Uint8Array);
    const samples = new Int16Array(buffer.length / 2);

    for (let i = 0; i < samples.length; i++) {
      // Read little-endian 16-bit signed integers
      samples[i] = buffer.readInt16LE(i * 2);
    }

    return samples;
  } catch (error) {
    throw new Error(`Failed to decode ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Decodes and resamples a WAV file to target sample rate using ffmpeg's soxr resampler.
 * Used only when --resampler ffmpeg is specified.
 * @param filePath Path to input WAV file
 * @param targetHz Target sample rate in Hz
 * @returns Promise<Int16Array> Resampled PCM16 data
 */
export async function decodeAndResampleToPcm16(
  filePath: string,
  targetHz: number
): Promise<Int16Array> {
  try {
    // Use ffmpeg to decode, convert to mono, resample, and output raw PCM16
    // Note: soxr resampler not available in static builds, using default resampler
    const { stdout } = await execa(ffmpegStatic as string, [
      "-i", filePath,
      "-ar", targetHz.toString(),
      "-ac", "1",
      "-sample_fmt", "s16",
      "-f", "s16le",
      "-hide_banner",
      "-loglevel", "error",
      "pipe:1"
    ], { encoding: "buffer" as any });

    // Convert buffer to Int16Array
    const buffer = Buffer.from(stdout as Uint8Array);
    const samples = new Int16Array(buffer.length / 2);

    for (let i = 0; i < samples.length; i++) {
      samples[i] = buffer.readInt16LE(i * 2);
    }

    return samples;
  } catch (error) {
    throw new Error(
      `Failed to decode and resample ${filePath} to ${targetHz}Hz: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Decodes a WAV file to PCM16 mono data and returns sample rate.
 * Uses ffmpeg to output WAV format to stdout, then parses the header.
 * @param filePath Path to input WAV file
 * @returns Promise<{ data: Int16Array; srcHz: number }> PCM16 data and source sample rate
 */
export async function decodePCM16Mono(filePath: string): Promise<{ data: Int16Array; srcHz: number }> {
  try {
    // Use ffmpeg to decode WAV to WAV format (preserves header)
    // -f wav -ac 1 ensures mono WAV output
    const { stdout } = await execa(ffmpegStatic as string, [
      "-i", filePath,
      "-ac", "1",           // Convert to mono
      "-f", "wav",          // Output as WAV format
      "-hide_banner",       // Suppress banner
      "-loglevel", "error", // Only show errors
      "pipe:1"              // Output to stdout
    ], { encoding: "buffer" as any });

    const buffer = Buffer.from(stdout as Uint8Array);

    // Parse WAV header to extract sample rate and data
    return parseWavBuffer(buffer);
  } catch (error) {
    throw new Error(`Failed to decode ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Parses a WAV buffer and extracts PCM16 mono data and sample rate.
 * @param buffer WAV file buffer
 * @returns { data: Int16Array; srcHz: number } PCM16 data and sample rate
 */
function parseWavBuffer(buffer: Buffer): { data: Int16Array; srcHz: number } {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  // Check RIFF header
  const riff = view.getUint32(0, true);
  if (riff !== 0x46464952) { // "RIFF" in little-endian
    throw new Error("Invalid WAV file: missing RIFF header");
  }

  const wave = view.getUint32(8, true);
  if (wave !== 0x45564157) { // "WAVE" in little-endian
    throw new Error("Invalid WAV file: missing WAVE header");
  }

  let pos = 12;
  let formatChunk = null;
  let dataChunk = null;

  // Parse chunks
  while (pos < buffer.length - 8) {
    const chunkId = view.getUint32(pos, true);
    const chunkSize = view.getUint32(pos + 4, true);

    pos += 8;

    if (chunkId === 0x20746d66) { // "fmt " in little-endian
      formatChunk = {
        audioFormat: view.getUint16(pos, true),
        numChannels: view.getUint16(pos + 2, true),
        sampleRate: view.getUint32(pos + 4, true),
        bitsPerSample: view.getUint16(pos + 14, true),
      };
      pos += chunkSize; // Skip the chunk data
    } else if (chunkId === 0x61746164) { // "data" in little-endian
      // FFmpeg sets data chunk size to 0xFFFFFFFF when piping
      // Calculate actual size from buffer length
      const actualSize = chunkSize === 0xFFFFFFFF 
        ? buffer.length - pos 
        : chunkSize;
      dataChunk = {
        size: actualSize,
        offset: pos,
      };
      pos += actualSize; // Skip the chunk data
      break; // Stop parsing after finding data chunk
    } else if (chunkId === 0x5453494c) { // "LIST" in little-endian
      // LIST chunks contain sub-chunks, skip the entire LIST chunk
      pos += chunkSize;
    } else {
      // Skip unknown chunks, padding to even boundary if needed
      pos += chunkSize + (chunkSize % 2);
    }
  }

  if (!formatChunk || !dataChunk) {
    throw new Error("Invalid WAV file: missing format or data chunk");
  }

  if (formatChunk.numChannels !== 1) {
    throw new Error(`Input must be mono (1 channel), got ${formatChunk.numChannels} channels`);
  }

  if (formatChunk.bitsPerSample !== 16) {
    throw new Error(`Input must be 16-bit, got ${formatChunk.bitsPerSample} bits per sample`);
  }

  // Extract PCM16 data
  const dataView = new DataView(buffer.buffer, dataChunk.offset, dataChunk.size);
  const samples = new Int16Array(dataChunk.size / 2);

  for (let i = 0; i < samples.length; i++) {
    samples[i] = dataView.getInt16(i * 2, true); // Little-endian
  }

  return {
    data: samples,
    srcHz: formatChunk.sampleRate
  };
}

/**
 * Gets ffmpeg version string for tooling.
 * @returns Promise<string> ffmpeg version output
 */
export async function getFfmpegVersion(): Promise<string> {
  try {
    const { stdout } = await execa(ffmpegStatic as string, ["-version"], { encoding: "utf8" });
    return stdout;
  } catch (error) {
    throw new Error(`Failed to get ffmpeg version: ${error instanceof Error ? error.message : String(error)}`);
  }
}
