import { describe, it, expect } from "vitest";
import { ConversionError } from "@wav2amiga/core";
import { createTestWav } from "./test-utils";
import { parseWavPcm16Mono } from "../wav";
import { convertFiles } from "../worker";

function buildFilePayload(name: string, durationMs: number, note: string) {
  const wavBuffer = createTestWav(44100, 1, 16, durationMs);
  const { pcm16, srcHz } = parseWavPcm16Mono(wavBuffer, name);
  return { name, pcm16, srcHz, note };
}

describe("worker convertFiles", () => {
  it("converts a single file", () => {
    const payload = [buildFilePayload("kick.wav", 100, "C-2")];
    const result = convertFiles(payload, "single");

    expect(result.filename).toBe("kick.8SVX");
    expect(result.output).toBeInstanceOf(Uint8Array);
    expect(result.report.mode).toBe("single");
    expect(result.report.resampler.name).toBe("ZOH");
    expect(result.report.segments).toHaveLength(1);

    const segment = result.report.segments[0];
    expect(segment.label).toBe("kick");
    expect(segment.startByte).toBe(0);
    expect(segment.paddedLengthBytes % 256).toBe(0);
    expect(Object.keys(segment.sampleData)).toHaveLength(segment.lengthBytes);
  });

  it("converts stacked mode with sequential offsets", () => {
    const files = [
      buildFilePayload("hat.wav", 50, "C-2"),
      buildFilePayload("snare.wav", 75, "C-2"),
      buildFilePayload("kick.wav", 100, "C-2"),
    ];

    const result = convertFiles(files, "stacked");

    expect(result.filename.startsWith("hat_")).toBe(true);
    expect(result.report.segments).toHaveLength(3);

    const starts = result.report.segments.map((segment) => segment.startByte);
    expect(starts[0]).toBe(0);
    expect(starts[1]).toBeGreaterThan(starts[0]);
    expect(starts[2]).toBeGreaterThan(starts[1]);

    expect(result.output.byteLength).toBeGreaterThan(0);
  });

  it("converts stacked-equal mode with uniform slots", () => {
    const files = [
      buildFilePayload("perc1.wav", 40, "C-2"),
      buildFilePayload("perc2.wav", 60, "C-2"),
      buildFilePayload("perc3.wav", 80, "C-2"),
    ];

    const result = convertFiles(files, "stacked-equal");
    expect(result.report.segments).toHaveLength(3);

    let cumulative = 0;
    for (const segment of result.report.segments) {
      expect(segment.startByte).toBe(cumulative);
      cumulative += segment.paddedLengthBytes;
    }
  });

  it("throws when single mode receives multiple files", () => {
    const files = [
      buildFilePayload("a.wav", 50, "C-2"),
      buildFilePayload("b.wav", 50, "C-2"),
    ];
    expect(() => convertFiles(files, "single")).toThrow(ConversionError);
    expect(() => convertFiles(files, "single")).toThrow(/requires exactly 1 input file/);
  });

  it("throws when no files provided", () => {
    expect(() => convertFiles([], "stacked")).toThrow(ConversionError);
    expect(() => convertFiles([], "stacked")).toThrow(/requires at least one audio input/);
  });
});
