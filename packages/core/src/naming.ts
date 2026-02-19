import { ALIGN, alignTo256 } from "./formats/raw8svx.js";

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
    const pageNumber = Math.floor(seg.startByte / ALIGN);
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
  const increment = slotSize >> 8;
  return { slotSize, increment };
}

/**
 * Formats a byte offset as uppercase hexadecimal string, minimum 2 characters.
 */
export function formatOffsetHex(n: number): string {
  const safe = Math.max(0, n);
  const h = safe.toString(16).toUpperCase();
  return h.length < 2 ? h.padStart(2, "0") : h;
}

/**
 * Generates filename for stacked mode output using new builder API.
 * Format: basename_00_05_09.8SVX where 00, 05, 09 are hex byte offsets
 */
export function filenameForStacked(base: string, starts: number[]): string {
  const off = starts.map((b) => formatOffsetHex(b >> 8)).join("_");
  return `${base}_${off}.8SVX`;
}

/**
 * Generates filename for stacked-equal mode output using new builder API.
 * Format: basename_XX.8SVX where XX is the uniform slot increment in hex
 */
export function filenameForStackedEqual(base: string, slot: number): string {
  return `${base}_${formatOffsetHex(slot >> 8)}.8SVX`;
}
