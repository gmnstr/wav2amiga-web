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
    // Use ffmpeg to decode, convert to mono, resample with soxr, and output raw PCM16
    // -af aresample=resampler=soxr:precision=33:dither_method=none -ar <Hz> -ac 1 -sample_fmt s16
    const { stdout } = await execa(ffmpegStatic as string, [
      "-i", filePath,
      "-af", `aresample=resampler=soxr:precision=33:dither_method=none`,
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
