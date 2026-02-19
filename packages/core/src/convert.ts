import { createZohResampler } from "@wav2amiga/resampler-zoh";
import { mapPcm16To8Bit } from "./map.js";
import { noteToTargetHz } from "./notes.js";
import {
  generateSingleFilename,
  generateStackedFilename,
  generateStackedEqualFilename,
  formatOffsetHex,
  type StackingMode,
} from "./naming.js";
import { writeRaw8, alignTo256 } from "./formats/raw8svx.js";
import { ConversionError } from "./types.js";

export type Mode = StackingMode;

export interface AudioInput {
  /** mono PCM16 LE samples */
  pcm16: Int16Array;
  /** filename/label for reporting */
  label: string;
  /** ProTracker note, e.g., 'C-2' */
  note: string;
  /** source sample rate (Hz), for metadata/tests */
  sourceHz: number;
}

export interface ConvertOptions {
  mode: Mode;
}

export interface SegmentInfo {
  label: string;
  note: string;
  sourceHz: number;
  targetHz: number;
  startByte: number;
  startOffsetHex: string;
  lengthBytes: number;
  paddedLengthBytes: number;
}

export interface ConvertResult {
  outputBytes: Uint8Array;
  segments: SegmentInfo[];
  suggestedFilename: string;
  resampler: { name: "ZOH"; version: string };
  mode: Mode;
  totalInputSamples?: number;
  totalOutputBytes?: number;
  processingTimeMs?: number;
}

export function convert(inputs: AudioInput[], opts: ConvertOptions): ConvertResult {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw conversionError("w2a/no-inputs", "Error: convert() requires at least one audio input");
  }

  if (!opts || typeof opts.mode !== "string") {
    throw conversionError("w2a/no-mode", "Error: conversion mode is required");
  }

  const mode = opts.mode;

  if (mode !== "single" && mode !== "stacked" && mode !== "stacked-equal") {
    throw conversionError(
      "w2a/invalid-mode",
      `Error: '${mode}' is not a supported conversion mode`,
      { mode },
    );
  }

  if (mode === "single" && inputs.length !== 1) {
    throw conversionError(
      "w2a/single-multi-input",
      "Error: single mode requires exactly 1 input file",
      { inputs: inputs.length },
    );
  }
  const startedAt = now();

  const zoh = createZohResampler();

  const segments: SegmentInfo[] = [];
  const parts: Uint8Array[] = [];

  let totalInputSamples = 0;
  let totalOutputBytes = 0;

  for (const input of inputs) {
    const { pcm16, note, sourceHz, label } = input;
    const targetHz = resolveTargetHz(note);

    const resampled =
      sourceHz === targetHz ? pcm16 : zoh.resamplePCM16(pcm16, sourceHz, targetHz);

    const part = mapPcm16To8Bit(resampled);

    totalInputSamples += pcm16.length;
    totalOutputBytes += part.length;

    parts.push(part);

    segments.push({
      label,
      note,
      sourceHz,
      targetHz,
      startByte: 0, // placeholders, filled after layout
      startOffsetHex: "00",
      lengthBytes: part.length,
      paddedLengthBytes: alignTo256(part.length),
    });
  }

  const layout =
    mode === "stacked-equal"
      ? writeRaw8(parts, "stacked-equal")
      : writeRaw8(parts, "stacked");

  const paddedLengths = segments.map((segment) => alignTo256(segment.lengthBytes));

  for (let i = 0; i < segments.length; i++) {
    const startByte = layout.starts[i] ?? 0;
    const paddedLength = paddedLengths[i] ?? 0;
    segments[i] = {
      ...segments[i],
      startByte,
      startOffsetHex: formatOffsetHex(startByte >> 8),
      paddedLengthBytes: paddedLength,
    };
  }

  const suggestedFilename = buildSuggestedFilename(mode, inputs, segments, layout.slot);

  const durationMs = now() - startedAt;

  return {
    outputBytes: layout.bytes,
    segments,
    suggestedFilename,
    resampler: { name: "ZOH", version: zoh.meta.version },
    mode,
    totalInputSamples,
    totalOutputBytes: layout.bytes.length,
    processingTimeMs: Number.isFinite(durationMs) ? durationMs : undefined,
  };
}

function buildSuggestedFilename(
  mode: Mode,
  inputs: AudioInput[],
  segments: SegmentInfo[],
  slot?: number,
): string {
  const baseName =
    inputs.length === 1 ? sanitizeBase(inputs[0].label) : sanitizeBase("kit");

  if (mode === "single") {
    return generateSingleFilename(baseName);
  }

  if (mode === "stacked") {
    const segmentSummaries = segments.map((segment) => ({
      startByte: segment.startByte,
      paddedLength: segment.paddedLengthBytes,
    }));
    return generateStackedFilename(baseName, segmentSummaries);
  }

  const slotIncrement = typeof slot === "number" ? slot >> 8 : 0;
  return generateStackedEqualFilename(baseName, slotIncrement);
}

function sanitizeBase(input: string): string {
  const trimmed = input.trim();
  const fallback = trimmed.length === 0 ? "kit" : trimmed;
  return fallback.replace(/[^A-Za-z0-9_-]/g, "_");
}

function resolveTargetHz(note: string): number {
  try {
    return noteToTargetHz(note);
  } catch {
    throw conversionError("w2a/invalid-note", `Error: '${note}' is not a valid ProTracker note`, {
      note,
    });
  }
}

function conversionError(
  code: string,
  message: string,
  context?: Record<string, unknown>,
): ConversionError {
  return new ConversionError({ code, message, context });
}

function now(): number {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  if (perf && typeof perf.now === "function") {
    return perf.now();
  }
  return Date.now();
}
