import { mapPcm16To8Bit } from "./map.js";
import { ALIGN, alignTo256, writeRaw8 } from "./formats/raw8svx.js";
import { PAL_PERIODS, noteToTargetHz } from "./notes.js";
import {
  calculateStackedEqualLayout,
  filenameForStacked,
  filenameForStackedEqual,
  formatOffsetHex,
  generateSingleFilename,
  generateStackedEqualFilename,
  generateStackedFilename,
  type StackingMode,
} from "./naming.js";
import {
  buildStacked,
  buildStackedEqual,
  type BuiltStack,
  type BuiltStackEqual,
} from "./layout.js";

export { mapPcm16To8Bit };
export { ALIGN, alignTo256, writeRaw8 };
export { PAL_PERIODS, noteToTargetHz };
export {
  calculateStackedEqualLayout,
  filenameForStacked,
  filenameForStackedEqual,
  formatOffsetHex,
  generateSingleFilename,
  generateStackedEqualFilename,
  generateStackedFilename,
};
export { buildStacked, buildStackedEqual };
export type { BuiltStack, BuiltStackEqual };
export type { StackingMode };
export { getResamplerInfo } from "./resamplerInfo.js";

export function isAligned256(n: number): boolean {
  return (n & (ALIGN - 1)) === 0;
}

export function validateMonoPcm16(_input: Int16Array, channels: number): void {
  if (channels !== 1) {
    throw new Error(`${channels} channels detected, expected 1 (mono)`);
  }
}

export type { ResampleAPI, ResamplerMeta } from "./resampler.js";
export { convert } from "./convert.js";
export type {
  AudioInput,
  ConvertOptions,
  ConvertResult,
  Mode,
  SegmentInfo,
} from "./convert.js";
export { ConversionError } from "./types.js";
export type { W2AError, Report, ReportSegment } from "./types.js";
