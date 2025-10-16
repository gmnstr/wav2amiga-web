// Pure TypeScript business logic for wav2amiga conversion
// No Node.js or browser APIs - works in both environments

export type { ResampleAPI, ResamplerMeta } from "./resampler.js";

/**
 * Maps 16-bit PCM samples to 8-bit values.
 * Input range: -32768 to 32767
 * Output range: 0 to 255
 */
export function mapPcm16To8Bit(input: Int16Array): Uint8Array {
  const output = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i++) {
    // Deterministic mapping: linear map then truncate by 8-bit shift.
    // This ensures 0 -> 128, 255 -> 128, 256 -> 129, 16384 -> 192, etc.
    const unsigned16 = input[i] + 32768; // 0..65535
    output[i] = (unsigned16 >>> 8) & 0xff; // 0..255
  }
  return output;
}

/**
 * Aligns length to next multiple of 256 bytes.
 * Used for 8SVX sample data alignment.
 */
export function alignTo256(length: number): number {
  return (length + 0xff) & ~0xff;
}

/**
 * Alignment boundary for 8SVX sample data (256 bytes).
 */
export const ALIGN = 0x100;

/**
 * Checks if a number is aligned to 256-byte boundary.
 */
export function isAligned256(n: number): boolean {
  return (n & 0xff) === 0;
}

/**
 * PAL period table for Amiga notes
 * Based on standard PAL Amiga periods
 */
export const PAL_PERIODS: Record<string, number> = {
  "C-1": 856, "C#1": 808, "D-1": 762, "D#1": 720, "E-1": 678, "F-1": 640, "F#1": 604, "G-1": 570,
  "G#1": 538, "A-1": 508, "A#1": 480, "B-1": 452,
  "C-2": 428, "C#2": 404, "D-2": 381, "D#2": 360, "E-2": 339, "F-2": 320, "F#2": 302, "G-2": 285,
  "G#2": 269, "A-2": 254, "A#2": 240, "B-2": 226,
  "C-3": 214, "C#3": 202, "D-3": 190, "D#3": 180, "E-3": 170, "F-3": 160, "F#3": 151, "G-3": 143,
  "G#3": 135, "A-3": 127, "A#3": 120, "B-3": 113,
  "C-4": 107, "C#4": 101, "D-4": 95, "D#4": 90, "E-4": 85, "F-4": 80, "F#4": 76, "G-4": 71,
  "G#4": 67, "A-4": 64, "A#4": 60, "B-4": 57,
  "C-5": 54, "C#5": 51, "D-5": 48, "D#5": 45, "E-5": 43, "F-5": 40, "F#5": 38, "G-5": 36,
  "G#5": 34, "A-5": 32, "A#5": 30, "B-5": 28,
  "C-6": 27, "C#6": 25, "D-6": 24, "D#6": 22, "E-6": 21, "F-6": 20, "F#6": 19, "G-6": 18,
  "G#6": 17, "A-6": 16, "A#6": 15, "B-6": 14,
  "C-7": 13, "C#7": 12, "D-7": 11, "D#7": 11, "E-7": 10, "F-7": 10, "F#7": 9, "G-7": 9,
  "G#7": 8, "A-7": 8, "A#7": 7, "B-7": 7,
  "C-8": 6, "C#8": 6, "D-8": 5, "D#8": 5, "E-8": 5, "F-8": 4, "F#8": 4, "G-8": 4,
  "G#8": 3, "A-8": 3, "A#8": 3, "B-8": 3,
};

/**
 * Converts note to target sample rate for resampling.
 * Uses floor division for consistent behavior.
 */
export function noteToTargetHz(note: string): number {
  const period = PAL_PERIODS[note];
  if (period === undefined) {
    throw new Error(`'${note}' is not a valid ProTracker note`);
  }
  // PAL clock is 3546895 Hz, target rate = clock / period
  // Using floor for deterministic behavior
  return Math.floor(3546895 / period);
}

/**
 * Stacking modes for sample output
 */
export type StackingMode = "single" | "stacked" | "stacked-equal";

/**
 * Generates filename for single mode output
 */
export function generateSingleFilename(baseName: string): string {
  return `${baseName}.8SVX`;
}

/**
 * Generates filename for stacked mode output
 * Format: basename_00_05_0A.8SVX where 00, 05, 0A are hex byte offsets
 */
export function generateStackedFilename(
  baseName: string,
  segments: Array<{ startByte: number; paddedLength: number }>
): string {
  const hexOffsets = segments.map((seg) => {
    // Use 256-byte pages for display (start >> 8), uppercase and zero-padded
    const pageNumber = Math.floor(seg.startByte / 256);
    const hex = pageNumber.toString(16).toUpperCase();
    return hex.padStart(2, "0");
  });
  return `${baseName}_${hexOffsets.join("_")}.8SVX`;
}

/**
 * Generates filename for stacked-equal mode output
 * Format: basename_XX.8SVX where XX is the uniform slot increment in hex
 */
export function generateStackedEqualFilename(baseName: string, slotIncrement: number): string {
  const hexIncrement = slotIncrement.toString(16).toUpperCase().padStart(2, "0");
  return `${baseName}_${hexIncrement}.8SVX`;
}

/**
 * Calculates stacked-equal slot size and increment
 */
export function calculateStackedEqualLayout(
  segmentLengths: number[]
): { slotSize: number; increment: number } {
  const maxLength = Math.max(...segmentLengths);
  const slotSize = alignTo256(maxLength);
  const increment = slotSize >> 8; // Convert bytes to 256-byte pages
  return { slotSize, increment };
}

/**
 * Validates that input is mono PCM16
 */
export function validateMonoPcm16(input: Int16Array, channels: number): void {
  if (channels !== 1) {
    throw new Error(`${channels} channels detected, expected 1 (mono)`);
  }
}

/**
 * Result of building stacked segments with sequential alignment.
 */
export interface BuiltStack {
  output: Uint8Array;      // concatenated data + per-segment padding
  starts: number[];        // byte offsets for segment starts
}

/**
 * Result of building stacked-equal segments with uniform slots.
 */
export interface BuiltStackEqual extends BuiltStack {
  slot: number;            // common slot size (largest aligned length)
}

/**
 * Builds segments in stacked mode: sequential with 0x100-aligned padding.
 * start(i) = sum_{k < i} alignTo256(len_k)
 */
export function buildStacked(parts: Uint8Array[]): BuiltStack {
  const starts: number[] = [];
  const segments: Uint8Array[] = [];

  let currentOffset = 0;
  for (const part of parts) {
    starts.push(currentOffset);
    segments.push(part);

    // Pad to next 256-byte boundary
    const alignedLength = alignTo256(part.length);
    currentOffset += alignedLength;
  }

  // Concatenate all segments with padding
  const totalLength = currentOffset;
  const output = new Uint8Array(totalLength);

  let offset = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const alignedLength = alignTo256(part.length);

    // Copy the actual data
    output.set(part, offset);

    // Padding is already zeros from new Uint8Array
    offset += alignedLength;
  }

  return { output, starts };
}

/**
 * Builds segments in stacked-equal mode: uniform slots with equal spacing.
 * slot = max_i alignTo256(len_i); start(i) = i * slot
 */
export function buildStackedEqual(parts: Uint8Array[]): BuiltStackEqual {
  if (parts.length === 0) {
    return { output: new Uint8Array(0), starts: [], slot: 0 };
  }

  // Find maximum aligned length for slot size
  const alignedLengths = parts.map(part => alignTo256(part.length));
  const slot = Math.max(...alignedLengths);

  const starts: number[] = [];
  const segments: Uint8Array[] = [];

  for (let i = 0; i < parts.length; i++) {
    starts.push(i * slot);
    segments.push(parts[i]);
  }

  // Create output array with uniform slot spacing
  const output = new Uint8Array(parts.length * slot);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const startOffset = i * slot;

    // Copy the actual data
    output.set(part, startOffset);

    // Padding is already zeros from new Uint8Array
  }

  return { output, starts, slot };
}

/**
 * Formats a byte offset as uppercase hexadecimal string, minimum 2 characters.
 */
export function formatOffsetHex(n: number): string {
  const h = Math.max(0, n).toString(16).toUpperCase();
  return h.length < 2 ? h.padStart(2, '0') : h;
}

/**
 * Generates filename for stacked mode output using new builder API.
 * Format: basename_00_05_09.8SVX where 00, 05, 09 are hex byte offsets
 */
export function filenameForStacked(base: string, starts: number[]): string {
  const off = starts.map(b => formatOffsetHex(b >> 8)).join('_');
  return `${base}_${off}.8SVX`;
}

/**
 * Generates filename for stacked-equal mode output using new builder API.
 * Format: basename_XX.8SVX where XX is the uniform slot increment in hex
 */
export function filenameForStackedEqual(base: string, slot: number): string {
  return `${base}_${formatOffsetHex(slot >> 8)}.8SVX`;
}
