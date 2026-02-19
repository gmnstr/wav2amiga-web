import { describe, it, expect } from "vitest";
import {
  convert,
  type AudioInput,
  noteToTargetHz,
  alignTo256,
  ConversionError,
} from "../index.js";

function makeInput(
  label: string,
  samples: Int16Array,
  note: string,
  sourceHz: number,
): AudioInput {
  return {
    label,
    pcm16: samples,
    note,
    sourceHz,
  };
}

describe("convert facade", () => {
  it("converts single input with padding", () => {
    const targetHz = noteToTargetHz("C-2");
    const input = makeInput(
      "single",
      new Int16Array([-32768, 0, 32767]),
      "C-2",
      targetHz,
    );

    const result = convert([input], { mode: "single" });

    expect(result.mode).toBe("single");
    expect(result.outputBytes.length).toBe(alignTo256(3));
    expect(Array.from(result.outputBytes.slice(0, 3))).toEqual([0, 128, 255]);
    expect(result.outputBytes[3]).toBe(0x80);
    expect(result.segments).toHaveLength(1);

    const segment = result.segments[0];
    expect(segment.label).toBe("single");
    expect(segment.startByte).toBe(0);
    expect(segment.startOffsetHex).toBe("00");
    expect(segment.lengthBytes).toBe(3);
    expect(segment.paddedLengthBytes).toBe(alignTo256(3));
    expect(result.suggestedFilename).toBe("single.8SVX");
    expect(result.resampler.name).toBe("ZOH");
    expect(result.totalInputSamples).toBe(3);
  });

  it("lays out stacked mode sequentially", () => {
    const targetHz = noteToTargetHz("C-2");
    const inputs: AudioInput[] = [
      makeInput("lead", new Int16Array([0, 1000]), "C-2", targetHz),
      makeInput("pad", new Int16Array([0, -1000, 1000]), "C-2", targetHz),
    ];

    const result = convert(inputs, { mode: "stacked" });

    expect(result.mode).toBe("stacked");
    expect(result.segments).toHaveLength(2);
    expect(result.outputBytes.length).toBe(alignTo256(2) + alignTo256(3));

    const [first, second] = result.segments;
    expect(first.startByte).toBe(0);
    expect(second.startByte).toBe(alignTo256(first.lengthBytes));
    expect(second.startOffsetHex).toBe("01");
    expect(result.suggestedFilename).toBe("kit_00_01.8SVX");
  });

  it("uses uniform slots for stacked-equal mode", () => {
    const targetHz = noteToTargetHz("C-2");
    const inputs: AudioInput[] = [
      makeInput("one", new Int16Array([0, 1000]), "C-2", targetHz),
      makeInput("two", new Int16Array([0, 1000, -1000, 2000]), "C-2", targetHz),
    ];

    const result = convert(inputs, { mode: "stacked-equal" });

    expect(result.mode).toBe("stacked-equal");
    expect(result.segments).toHaveLength(2);

    const firstPadded = alignTo256(inputs[0].pcm16.length);
    const secondPadded = alignTo256(inputs[1].pcm16.length);
    expect(result.segments[1].startByte).toBe(firstPadded);
    expect(result.outputBytes.length).toBe(firstPadded + secondPadded);
    expect(result.suggestedFilename).toBe("kit_01.8SVX");
  });

  it("resamples when source rate differs", () => {
    const srcHz = 48000;
    const targetHz = noteToTargetHz("C-2");
    const samples = new Int16Array([0, 1000, 2000, 3000, 4000, 5000]);
    const input = makeInput("resample", samples, "C-2", srcHz);

    const result = convert([input], { mode: "single" });

    const expectedLength = Math.round(samples.length * targetHz / srcHz);
    expect(result.segments[0].lengthBytes).toBe(expectedLength);
    expect(result.segments[0].sourceHz).toBe(srcHz);
  });

  it("throws ConversionError when no inputs provided", () => {
    expect(() => convert([], { mode: "single" })).toThrow(ConversionError);
    try {
      convert([], { mode: "single" });
    } catch (error) {
      if (error instanceof ConversionError) {
        expect(error.w2aError.code).toBe("w2a/no-inputs");
        expect(error.message).toBe("Error: convert() requires at least one audio input");
      } else {
        throw error;
      }
    }
  });

  it("throws ConversionError for invalid note", () => {
    const input = makeInput("sample", new Int16Array([0, 1, 2]), "Z-9", 44100);
    expect(() => convert([input], { mode: "single" })).toThrow(ConversionError);
    try {
      convert([input], { mode: "single" });
    } catch (error) {
      if (error instanceof ConversionError) {
        expect(error.w2aError.code).toBe("w2a/invalid-note");
        expect(error.message).toBe("Error: 'Z-9' is not a valid ProTracker note");
      } else {
        throw error;
      }
    }
  });

  it("throws ConversionError when single mode receives multiple inputs", () => {
    const targetHz = noteToTargetHz("C-2");
    const inputs: AudioInput[] = [
      makeInput("one", new Int16Array([0, 1]), "C-2", targetHz),
      makeInput("two", new Int16Array([0, 1]), "C-2", targetHz),
    ];

    expect(() => convert(inputs, { mode: "single" })).toThrow(ConversionError);
    try {
      convert(inputs, { mode: "single" });
    } catch (error) {
      if (error instanceof ConversionError) {
        expect(error.w2aError.code).toBe("w2a/single-multi-input");
        expect(error.message).toBe("Error: single mode requires exactly 1 input file");
      } else {
        throw error;
      }
    }
  });

  it("throws ConversionError for unsupported mode", () => {
    const targetHz = noteToTargetHz("C-2");
    const input = makeInput("sample", new Int16Array([0, 1, 2]), "C-2", targetHz);
    expect(() =>
      convert([input], { mode: "invalid" as "single" }),
    ).toThrow(ConversionError);
    try {
      convert([input], { mode: "invalid" as "single" });
    } catch (error) {
      if (error instanceof ConversionError) {
        expect(error.w2aError.code).toBe("w2a/invalid-mode");
        expect(error.message).toBe("Error: 'invalid' is not a supported conversion mode");
      } else {
        throw error;
      }
    }
  });
});
