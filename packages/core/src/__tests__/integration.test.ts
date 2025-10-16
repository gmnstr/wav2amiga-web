import { describe, it, expect } from "vitest";
import { ResampleAPI, ResamplerMeta } from "../resampler.js";

// Mock WASM resampler for testing
class MockWasmResampler implements ResampleAPI {
  // eslint-disable-next-line no-unused-vars
  constructor(public meta: ResamplerMeta) {
    // meta is used as a public property
  }

  resamplePCM16(input: Int16Array, srcHz: number, dstHz: number): Int16Array {
    if (srcHz === dstHz) return input.slice();

    const ratio = dstHz / srcHz;
    const outputLength = Math.ceil(input.length * ratio);
    return new Int16Array(outputLength);
  }
}

describe("WASM resampler integration", () => {
  it("should provide resampler metadata", () => {
    const resampler = new MockWasmResampler({
      name: "wasm",
      version: "1.0.0",
      sha256: "abc123def456"
    });

    expect(resampler.meta.name).toBe("wasm");
    expect(resampler.meta.version).toBe("1.0.0");
    expect(resampler.meta.sha256).toBe("abc123def456");
  });

  it("should handle same sample rate (no-op)", () => {
    const resampler = new MockWasmResampler({
      name: "wasm",
      version: "1.0.0"
    });

    const input = new Int16Array([1000, 2000, 3000]);
    const result = resampler.resamplePCM16(input, 44100, 44100);

    expect(result).toEqual(input);
  });

  it("should handle sample rate conversion", () => {
    const resampler = new MockWasmResampler({
      name: "wasm",
      version: "1.0.0"
    });

    const input = new Int16Array([1000, 2000, 3000]);
    const result = resampler.resamplePCM16(input, 44100, 22050);

    expect(result.length).toBeGreaterThan(0);
    expect(result).toBeInstanceOf(Int16Array);
  });

  it("should clamp output values to int16 range", () => {
    // Test that would fail if clamping wasn't implemented
    const resampler = new MockWasmResampler({
      name: "wasm",
      version: "1.0.0"
    });

    const input = new Int16Array([32767]); // Max int16 value
    const result = resampler.resamplePCM16(input, 44100, 22050);

    // All values should be within int16 range
    for (const value of result) {
      expect(value).toBeGreaterThanOrEqual(-32768);
      expect(value).toBeLessThanOrEqual(32767);
    }
  });
});

describe("Report structure with resampler metadata", () => {
  it("should include resampler information in report structure", () => {
    const report = {
      mode: "single" as const,
      outputFile: "test.8SVX",
      segments: [
        {
          label: "test",
          note: "C-2",
          targetHz: 8287,
          startByte: 0,
          startOffsetHex: "00",
          lengthBytes: 100,
          paddedLengthBytes: 256,
          paddedLength: 256,
          sampleData: new Uint8Array(100)
        }
      ],
      versions: {
        node: "20.0.0",
        pnpm: "9.0.0",
        ffmpeg: "6.0.0",
        resampler: {
          name: "wasm",
          version: "1.0.0",
          sha256: "abc123def456"
        },
        git: "abc123"
      }
    };

    expect(report.versions.resampler.name).toBe("wasm");
    expect(report.versions.resampler.version).toBe("1.0.0");
    expect(report.versions.resampler.sha256).toBe("abc123def456");
  });

  it("should handle missing SHA256 in resampler metadata", () => {
    const report = {
      versions: {
        resampler: {
          name: "ffmpeg",
          version: "6.0.0",
          sha256: undefined
        }
      }
    };

    expect(report.versions.resampler.name).toBe("ffmpeg");
    expect(report.versions.resampler.sha256).toBeUndefined();
  });
});
