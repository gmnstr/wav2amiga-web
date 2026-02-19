import { writeRaw8 } from "./formats/raw8svx.js";

export interface BuiltStack {
  output: Uint8Array;
  starts: number[];
}

export interface BuiltStackEqual extends BuiltStack {
  slot: number;
}

export function buildStacked(parts: Uint8Array[]): BuiltStack {
  const { bytes, starts } = writeRaw8(parts, "stacked");
  return { output: bytes, starts };
}

export function buildStackedEqual(parts: Uint8Array[]): BuiltStackEqual {
  const { bytes, starts, slot = 0 } = writeRaw8(parts, "stacked-equal");
  return { output: bytes, starts, slot };
}
